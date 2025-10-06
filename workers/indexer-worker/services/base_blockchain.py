"""Base blockchain service with core RPC functionality."""

from web3 import Web3
from web3.middleware import geth_poa_middleware
from typing import List, Dict, Any, Optional
import asyncio
import aiohttp
import structlog
from datetime import datetime
# Removed tenacity imports - using custom failover logic

from config.settings import ChainConfig, Settings

logger = structlog.get_logger()


class BaseBlockchainService:
    """Base service for blockchain RPC interactions."""
    
    def __init__(self, chain_config: ChainConfig, settings: Optional[Settings] = None):
        self.chain_config = chain_config
        self.settings = settings or Settings()
        self.w3: Optional[Web3] = None
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def connect(self) -> None:
        """Connect to blockchain RPC with failover support."""
        # Use rpc_urls for round robin, then backup_rpc_urls for failover
        primary_urls = getattr(self.chain_config, 'rpc_urls', [self.chain_config.rpc_url])
        rpc_urls = primary_urls + (self.chain_config.backup_rpc_urls or [])
        
        for i, rpc_url in enumerate(rpc_urls):
            try:
                # Skip URLs that need API keys if not configured
                if "YOUR_PROJECT_ID" in rpc_url:
                    continue
                    
                # Initialize Web3 with HTTP provider
                self.w3 = Web3(Web3.HTTPProvider(
                    rpc_url,
                    request_kwargs={'timeout': 30}
                ))
                
                # Add PoA middleware for some chains
                self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
                
                # Initialize aiohttp session for async requests
                self.session = aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=self.settings.rpc_request_timeout)
                )
                
                # Test connection
                latest_block = await self.get_latest_block()
                
                rpc_type = "primary" if i == 0 else f"backup-{i}"
                logger.info("Connected to blockchain",
                           chain_id=self.chain_config.chain_id,
                           chain_name=self.chain_config.name,
                           rpc_type=rpc_type,
                           rpc_url=rpc_url,
                           latest_block=latest_block)
                return
                
            except Exception as e:
                logger.warning("Failed to connect to RPC",
                             chain_id=self.chain_config.chain_id,
                             rpc_url=rpc_url,
                             rpc_index=i,
                             error=str(e))
                if i == len(rpc_urls) - 1:  # Last attempt
                    raise Exception(f"Failed to connect to any RPC after {len(rpc_urls)} attempts")
    
    async def disconnect(self) -> None:
        """Disconnect from blockchain."""
        if self.session:
            await self.session.close()
        logger.info("Disconnected from blockchain", chain_id=self.chain_config.chain_id)
    
    def get_next_primary_rpc_url(self) -> str:
        """Get next RPC URL using round robin from primary rpc_urls list."""
        primary_urls = getattr(self.chain_config, 'rpc_urls', [self.chain_config.rpc_url])
        
        if not hasattr(self.chain_config, 'current_rpc_index'):
            self.chain_config.current_rpc_index = 0
            
        # Get current URL and increment index
        current_url = primary_urls[self.chain_config.current_rpc_index % len(primary_urls)]
        self.chain_config.current_rpc_index = (self.chain_config.current_rpc_index + 1) % len(primary_urls)
        
        return current_url
    
    async def _make_rpc_call(self, method: str, params: List[Any]) -> Any:
        """Make async RPC call with failover support."""
        if not self.session:
            raise Exception("Session not initialized")
        
        # Get primary URLs for round robin, then backup URLs for failover
        primary_urls = getattr(self.chain_config, 'rpc_urls', [self.chain_config.rpc_url])
        # Try round robin on primary URLs first  
        primary_attempts = min(len(primary_urls) * 2, 6)  # Try each primary URL at most twice
        
        backup_urls = []
        if self.chain_config.backup_rpc_urls:
            # Filter out URLs requiring API keys that aren't configured
            backup_urls = [
                url for url in self.chain_config.backup_rpc_urls 
                if "YOUR_PROJECT_ID" not in url
            ]
        
        rpc_urls = []
        # Add primary URLs (using round robin order)
        for i in range(primary_attempts):
            rpc_urls.append(self.get_next_primary_rpc_url())
        # Add backup URLs
        rpc_urls.extend(backup_urls)
        
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1
        }
        
        last_error = None
        
        # Try each RPC URL in sequence  
        for i, rpc_url in enumerate(rpc_urls):
            try:
                # Determine if this is a primary (round robin) or backup URL
                rpc_type = "primary" if i < primary_attempts else "backup"
                logger.debug("Attempting RPC call", 
                           method=method, 
                           rpc_url=rpc_url[:50] + "..." if len(rpc_url) > 50 else rpc_url,
                           rpc_type=rpc_type,
                           attempt=i+1,
                           total_rpcs=len(rpc_urls))
                
                # Use configured timeout for blockchain calls
                timeout = aiohttp.ClientTimeout(total=self.settings.rpc_timeout)
                
                async with self.session.post(
                    rpc_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=timeout
                ) as response:
                    
                    if response.status != 200:
                        raise Exception(f"HTTP {response.status}: {await response.text()}")
                    
                    data = await response.json()
                    
                    if "error" in data:
                        rpc_error = data["error"]
                        raise Exception(f"RPC error: {rpc_error}")
                    
                    result = data.get("result")
                    if result is None and method != "eth_getCode":  # eth_getCode can return null
                        raise Exception(f"RPC returned null result for {method}")
                    
                    # Success - log if not using first attempt
                    if i > 0:
                        logger.info("RPC call succeeded", 
                                  method=method,
                                  rpc_type=rpc_type,
                                  attempt=i+1,
                                  rpc_url=rpc_url[:50] + "...")
                    
                    # Add small delay after successful calls to prevent rate limiting
                    if rpc_type == "primary":
                        await asyncio.sleep(0.05)  # 50ms delay for round robin requests
                    
                    return result
                    
            except Exception as e:
                last_error = e
                logger.warning("RPC call failed, trying next URL", 
                             method=method,
                             rpc_url=rpc_url[:50] + "..." if len(rpc_url) > 50 else rpc_url,
                             rpc_type=rpc_type,
                             error=str(e),
                             attempt=i+1,
                             remaining_rpcs=len(rpc_urls) - i - 1)
                
                # Add delay between RPC attempts (except for last one)
                if i < len(rpc_urls) - 1:
                    await asyncio.sleep(2 ** i)  # Exponential backoff: 1s, 2s, 4s...
        
        # All RPCs failed
        logger.error("All RPC URLs failed", 
                    method=method,
                    total_rpcs_tried=len(rpc_urls),
                    last_error=str(last_error))
        
        raise Exception(f"All {len(rpc_urls)} RPC URLs failed. Last error: {last_error}")
    
    async def get_latest_block(self) -> int:
        """Get latest block number with caching to reduce RPC calls."""
        try:
            # Cache latest block for 3 seconds to avoid excessive RPC calls
            import time
            current_time = time.time()
            cache_duration = 3  # seconds
            
            if (hasattr(self, '_latest_block_cache') and 
                hasattr(self, '_latest_block_cache_time') and
                current_time - self._latest_block_cache_time < cache_duration):
                return self._latest_block_cache
            
            result = await self._make_rpc_call("eth_blockNumber", [])
            latest_block = int(result, 16)
            
            # Update cache
            self._latest_block_cache = latest_block
            self._latest_block_cache_time = current_time
            
            return latest_block
        except Exception as e:
            logger.error("Failed to get latest block", error=str(e))
            raise
    
    async def get_block_timestamp(self, block_number: int) -> datetime:
        """Get block timestamp with retry logic."""
        max_retries = self.settings.rpc_max_retries
        base_delay = self.settings.rpc_retry_delay
        
        for attempt in range(max_retries):
            try:
                result = await self._make_rpc_call("eth_getBlockByNumber", [hex(block_number), False])
                
                if not result or "timestamp" not in result:
                    raise Exception(f"Invalid block data returned for block {block_number}")
                
                timestamp = int(result["timestamp"], 16)
                return datetime.utcfromtimestamp(timestamp)
                
            except Exception as e:
                if attempt == max_retries - 1:
                    # Final attempt failed
                    logger.error("Failed to get block timestamp after all retries", 
                               block_number=block_number, 
                               attempts=max_retries,
                               error=str(e))
                    raise
                else:
                    # Retry with exponential backoff
                    delay = base_delay * (2 ** attempt)
                    logger.warning("Failed to get block timestamp, retrying", 
                                 block_number=block_number,
                                 attempt=attempt + 1,
                                 max_retries=max_retries,
                                 retry_delay=delay,
                                 error=str(e))
                    await asyncio.sleep(delay)
    
    async def get_logs(
        self, 
        from_block: int, 
        to_block: int, 
        address: Optional[str] = None,
        topics: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get logs from blockchain."""
        try:
            params = {
                "fromBlock": hex(from_block),
                "toBlock": hex(to_block)
            }
            
            if address:
                params["address"] = address
            if topics:
                params["topics"] = topics
            
            result = await self._make_rpc_call("eth_getLogs", [params])
            return result or []
        except Exception as e:
            logger.error("Failed to get logs",
                        from_block=from_block,
                        to_block=to_block,
                        error=str(e))
            raise

    def _decode_string(self, hex_data: str) -> str:
        """Decode hex string from contract call."""
        try:
            if hex_data == "0x" or len(hex_data) < 3:
                return "UNKNOWN"
            
            # Remove 0x prefix
            data = hex_data[2:]
            
            # Skip first 64 chars (offset) and next 64 chars (length)
            if len(data) > 128:
                # Get length
                length = int(data[64:128], 16) * 2
                # Get string data
                string_data = data[128:128+length]
                return bytes.fromhex(string_data).decode('utf-8', errors='ignore').rstrip('\x00')
            
            return "UNKNOWN"
        except Exception:
            return "UNKNOWN"