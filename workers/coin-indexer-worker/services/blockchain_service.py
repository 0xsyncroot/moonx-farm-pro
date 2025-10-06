"""Blockchain service for coin indexer with round-robin and fallback support."""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import structlog
from web3 import Web3
from web3.exceptions import BlockNotFound, TransactionNotFound, Web3Exception
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential
import random
import time

from config.settings import ChainConfig


logger = structlog.get_logger(__name__)


class RPCEndpoint:
    """RPC endpoint with health tracking."""
    
    def __init__(self, url: str, is_backup: bool = False):
        self.url = url
        self.is_backup = is_backup
        self.failure_count = 0
        self.last_failure_time = None
        self.last_success_time = None
        self.total_requests = 0
        self.total_failures = 0
        self.is_healthy = True
        
    def record_success(self):
        """Record successful request."""
        self.total_requests += 1
        self.last_success_time = datetime.utcnow()
        self.failure_count = 0  # Reset failure count on success
        self.is_healthy = True
        
    def record_failure(self):
        """Record failed request."""
        self.total_requests += 1
        self.total_failures += 1
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()
        
        # Mark unhealthy if too many consecutive failures
        if self.failure_count >= 3:
            self.is_healthy = False
            
    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        if self.total_requests == 0:
            return 1.0
        return (self.total_requests - self.total_failures) / self.total_requests
    
    def should_retry(self) -> bool:
        """Check if this endpoint should be retried."""
        if self.is_healthy:
            return True
            
        # Allow retry after cooldown period
        if self.last_failure_time:
            cooldown_seconds = min(300, self.failure_count * 30)  # Max 5 min cooldown
            return datetime.utcnow() - self.last_failure_time > timedelta(seconds=cooldown_seconds)
            
        return True


class BlockchainService:
    """Blockchain service with round-robin RPC selection and automatic failover."""
    
    def __init__(self, chain_config: ChainConfig):
        self.chain_config = chain_config
        self.web3: Optional[Web3] = None
        
        # Initialize RPC endpoints
        self.primary_rpcs = []
        self.backup_rpcs = []
        self.current_rpc: Optional[RPCEndpoint] = None
        self.current_primary_index = 0
        
        # Initialize endpoint tracking
        self._initialize_rpc_endpoints()
        
        # Performance settings from config
        self.max_rpc_failures = chain_config.monitoring.get('max_rpc_failures', 5)
        self.rpc_switch_threshold = chain_config.monitoring.get('rpc_switch_threshold', 3)
        self.request_timeout = chain_config.performance.get('request_timeout', 30)
        
    def _initialize_rpc_endpoints(self):
        """Initialize RPC endpoint objects."""
        # Primary RPCs from config
        for url in self.chain_config.rpc_urls:
            if url:  # Skip empty URLs
                self.primary_rpcs.append(RPCEndpoint(url, is_backup=False))
                
        # Backup RPCs from config
        for url in self.chain_config.backup_rpc_urls:
            if url:  # Skip empty URLs
                self.backup_rpcs.append(RPCEndpoint(url, is_backup=True))
        
        # Validate we have at least one RPC
        if not self.primary_rpcs:
            raise ValueError(f"No valid primary RPC URLs found for chain {self.chain_config.chain_id}")
                
        # Shuffle primary RPCs for better load distribution
        random.shuffle(self.primary_rpcs)
        
        logger.info("Initialized RPC endpoints",
                   primary_count=len(self.primary_rpcs),
                   backup_count=len(self.backup_rpcs),
                   chain_id=self.chain_config.chain_id,
                   primary_rpcs=[rpc.url for rpc in self.primary_rpcs[:3]])  # Log first 3 for brevity
        
    async def connect(self) -> None:
        """Connect to blockchain RPC with round-robin and fallback."""
        try:
            logger.info("Connecting to blockchain with RPC failover",
                       chain_id=self.chain_config.chain_id,
                       primary_rpcs=len(self.primary_rpcs),
                       backup_rpcs=len(self.backup_rpcs))
            
            # Try primary RPCs first
            for rpc in self.primary_rpcs:
                if rpc.should_retry():
                    try:
                        if await self._try_connect_rpc(rpc):
                            self.current_rpc = rpc
                            logger.info("Connected to primary RPC",
                                       chain_id=self.chain_config.chain_id,
                                       rpc_url=rpc.url,
                                       is_backup=rpc.is_backup)
                            return
                    except Exception as e:
                        logger.warning("Primary RPC connection failed, trying next",
                                     rpc_url=rpc.url,
                                     error=str(e))
                        continue
            
            # If no primary RPC works, try backup RPCs
            logger.warning("All primary RPCs failed, trying backup RPCs",
                          chain_id=self.chain_config.chain_id)
            
            for rpc in self.backup_rpcs:
                if rpc.should_retry():
                    try:
                        if await self._try_connect_rpc(rpc):
                            self.current_rpc = rpc
                            logger.warning("Connected to backup RPC",
                                          chain_id=self.chain_config.chain_id,
                                          rpc_url=rpc.url,
                                          is_backup=rpc.is_backup)
                            return
                    except Exception as e:
                        logger.error("Backup RPC connection failed",
                                   rpc_url=rpc.url,
                                   error=str(e))
                        continue
            
            # If all RPCs failed
            raise Exception(f"Failed to connect to any RPC for chain {self.chain_config.chain_id}")
            
        except Exception as e:
            logger.error("Failed to connect to blockchain",
                        chain_id=self.chain_config.chain_id,
                        error=str(e))
            raise
    
    async def _try_connect_rpc(self, rpc: RPCEndpoint) -> bool:
        """Try to connect to a specific RPC endpoint."""
        try:
            # Create Web3 instance with timeout
            provider = Web3.HTTPProvider(
                rpc.url,
                request_kwargs={'timeout': self.request_timeout}
            )
            test_web3 = Web3(provider)
            
            # Test connection with actual Web3 call
            latest_block = await self._run_in_executor(test_web3.eth.get_block, 'latest')
            chain_id = await self._run_in_executor(lambda: test_web3.eth.chain_id)
            
            # Verify chain ID matches
            if chain_id != self.chain_config.chain_id:
                logger.error("Chain ID mismatch",
                           expected=self.chain_config.chain_id,
                           actual=chain_id,
                           rpc_url=rpc.url)
                rpc.record_failure()
                return False
            
            # Success - update web3 instance and record success
            self.web3 = test_web3
            rpc.record_success()
            
            logger.debug("RPC connection test successful",
                        rpc_url=rpc.url,
                        latest_block=latest_block['number'],
                        chain_id=chain_id)
            
            return True
            
        except Exception as e:
            rpc.record_failure()
            logger.debug("RPC connection test failed",
                        rpc_url=rpc.url,
                        error=str(e))
            return False
    
    async def _switch_rpc_if_needed(self) -> bool:
        """Switch to next available RPC if current one is failing."""
        if not self.current_rpc or self.current_rpc.failure_count < self.rpc_switch_threshold:
            return False
        
        logger.warning("Current RPC failing, attempting to switch",
                      current_rpc=self.current_rpc.url,
                      failure_count=self.current_rpc.failure_count)
        
        # Try to find a healthy primary RPC
        for rpc in self.primary_rpcs:
            if rpc != self.current_rpc and rpc.should_retry():
                if await self._try_connect_rpc(rpc):
                    old_rpc = self.current_rpc.url
                    self.current_rpc = rpc
                    logger.info("Switched to different primary RPC",
                               old_rpc=old_rpc,
                               new_rpc=rpc.url)
                    return True
        
        # Try backup RPCs if no primary available
        for rpc in self.backup_rpcs:
            if rpc.should_retry():
                if await self._try_connect_rpc(rpc):
                    old_rpc = self.current_rpc.url
                    self.current_rpc = rpc
                    logger.warning("Switched to backup RPC",
                                  old_rpc=old_rpc,
                                  new_rpc=rpc.url)
                    return True
        
        return False
    
    async def disconnect(self) -> None:
        """Disconnect from blockchain."""
        try:
            if self.web3:
                # Web3 doesn't require explicit disconnect for HTTP provider
                # but we should clean up state
                self.web3 = None
                self.current_rpc = None
                self.primary_rpcs = []
                self.backup_rpcs = []
                logger.info("Disconnected from blockchain RPC")
        except Exception as e:
            logger.error("Error disconnecting from blockchain", error=str(e))
            # Don't raise here to allow other cleanup to continue
    
    async def _execute_with_failover(self, operation_name: str, func, *args, **kwargs):
        """Execute operation with automatic RPC failover."""
        last_exception = None
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                if not self.web3 or not self.current_rpc:
                    raise Exception("Not connected to any RPC")
                
                # Execute the operation
                result = await self._run_in_executor(func, *args, **kwargs)
                
                # Record success
                self.current_rpc.record_success()
                
                return result
                
            except Exception as e:
                last_exception = e
                
                # Record failure
                if self.current_rpc:
                    self.current_rpc.record_failure()
                
                logger.warning(f"RPC operation failed: {operation_name}",
                             rpc_url=self.current_rpc.url if self.current_rpc else None,
                             attempt=attempt + 1,
                             max_retries=max_retries,
                             error=str(e))
                
                # Try to switch RPC
                if attempt < max_retries - 1:  # Don't switch on last attempt
                    switched = await self._switch_rpc_if_needed()
                    if switched:
                        logger.info(f"Retrying {operation_name} with new RPC",
                                  new_rpc=self.current_rpc.url if self.current_rpc else None)
                        continue
                    else:
                        # If can't switch, wait before retry
                        await asyncio.sleep(2 ** attempt)
        
        # All attempts failed
        logger.error(f"All RPC attempts failed for {operation_name}",
                    error=str(last_exception))
        raise last_exception
    
    async def _run_in_executor(self, func, *args):
        """Run blocking web3 calls in executor to avoid blocking."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, func, *args)
    
    async def get_latest_block(self) -> int:
        """Get latest block number with automatic failover."""
        def _get_block():
            return self.web3.eth.get_block('latest')['number']
        
        return await self._execute_with_failover("get_latest_block", _get_block)
    
    async def get_block_timestamp(self, block_number: int) -> datetime:
        """Get block timestamp with automatic failover."""
        def _get_block_timestamp():
            block = self.web3.eth.get_block(block_number)
            return datetime.utcfromtimestamp(block['timestamp'])
        
        try:
            return await self._execute_with_failover("get_block_timestamp", _get_block_timestamp)
        except BlockNotFound:
            logger.warning("Block not found", block_number=block_number)
            raise
        except Exception as e:
            logger.error("Failed to get block timestamp",
                        block_number=block_number,
                        error=str(e))
            raise
    
    async def get_logs(
        self, 
        from_block: int, 
        to_block: int, 
        address: str, 
        topics: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get logs from blockchain with automatic failover."""
        def _get_logs():
            # Build filter parameters
            filter_params = {
                'fromBlock': from_block,
                'toBlock': to_block,
                'address': Web3.to_checksum_address(address)
            }
            
            # Only add topics if provided
            if topics is not None:
                filter_params['topics'] = topics
                
            return self.web3.eth.get_logs(filter_params)
        
        try:
            logger.debug("Getting logs with failover",
                        from_block=from_block,
                        to_block=to_block,
                        address=address,
                        topics=topics[:1] if topics else None,  # Only log first topic for brevity
                        current_rpc=self.current_rpc.url if self.current_rpc else None)
            
            logs = await self._execute_with_failover("get_logs", _get_logs)
            
            logger.debug("Retrieved logs successfully",
                        from_block=from_block,
                        to_block=to_block,
                        address=address,
                        count=len(logs),
                        current_rpc=self.current_rpc.url if self.current_rpc else None)
            
            return logs
            
        except Exception as e:
            logger.error("Failed to get logs after all retries",
                        from_block=from_block,
                        to_block=to_block,
                        address=address,
                        error=str(e))
            raise
    
    async def health_check(self) -> bool:
        """Check blockchain service health."""
        try:
            if not self.web3 or not self.current_rpc:
                return False
            
            # Test by getting latest block
            await self.get_latest_block()
            return True
            
        except Exception as e:
            logger.error("Blockchain health check failed", 
                        current_rpc=self.current_rpc.url if self.current_rpc else None,
                        error=str(e))
            return False
    
    def get_rpc_stats(self) -> Dict[str, Any]:
        """Get RPC endpoint statistics."""
        stats = {
            "current_rpc": self.current_rpc.url if self.current_rpc else None,
            "current_rpc_is_backup": self.current_rpc.is_backup if self.current_rpc else None,
            "primary_rpcs": [],
            "backup_rpcs": []
        }
        
        for rpc in self.primary_rpcs:
            stats["primary_rpcs"].append({
                "url": rpc.url,
                "is_healthy": rpc.is_healthy,
                "success_rate": rpc.success_rate,
                "total_requests": rpc.total_requests,
                "total_failures": rpc.total_failures,
                "failure_count": rpc.failure_count,
                "last_success": rpc.last_success_time.isoformat() if rpc.last_success_time else None,
                "last_failure": rpc.last_failure_time.isoformat() if rpc.last_failure_time else None
            })
        
        for rpc in self.backup_rpcs:
            stats["backup_rpcs"].append({
                "url": rpc.url,
                "is_healthy": rpc.is_healthy,
                "success_rate": rpc.success_rate,
                "total_requests": rpc.total_requests,
                "total_failures": rpc.total_failures,
                "failure_count": rpc.failure_count,
                "last_success": rpc.last_success_time.isoformat() if rpc.last_success_time else None,
                "last_failure": rpc.last_failure_time.isoformat() if rpc.last_failure_time else None
            })
        
        return stats
