"""Automatic creation block detection for protocols."""

import asyncio
from typing import Dict, Any, Optional
import structlog
from datetime import datetime

from .base_blockchain import BaseBlockchainService
from config.settings import ChainConfig

logger = structlog.get_logger()


class CreationBlockDetector:
    """Automatically detect protocol deployment blocks."""
    
    def __init__(self, blockchain_service: BaseBlockchainService):
        self.blockchain = blockchain_service
        self.chain_config = blockchain_service.chain_config
    
    async def detect_protocol_creation_block(
        self, 
        pool_config: Dict[str, Any],
        search_range_blocks: int = 1000000
    ) -> Optional[int]:
        """
        Detect the actual creation block for a protocol by finding first contract deployment.
        
        Args:
            pool_config: Protocol configuration
            search_range_blocks: How many blocks to search back from current block
        
        Returns:
            Block number of first deployment or None if not found
        """
        try:
            protocol = pool_config.get("protocol")
            
            # Get the main contract address
            if protocol == "uniswap_v4":
                contract_address = pool_config.get("pool_manager")
                event_topic = pool_config.get("pool_init_topic")
            else:
                contract_address = pool_config.get("factory")
                event_topic = pool_config.get("pool_created_topic")
            
            if not contract_address or not event_topic:
                logger.error("Missing contract address or topic for protocol", protocol=protocol)
                return None
            
            logger.info("Detecting creation block for protocol",
                       protocol=protocol,
                       contract=contract_address,
                       event_topic=event_topic)
            
            # Method 1: Try to find contract creation transaction
            creation_block = await self._find_contract_creation_block(contract_address)
            if creation_block:
                logger.info("Found contract creation block",
                          protocol=protocol,
                          creation_block=creation_block)
                return creation_block
            
            # Method 2: Binary search for first event
            latest_block = await self.blockchain.get_latest_block()
            earliest_search_block = max(1, latest_block - search_range_blocks)
            
            first_event_block = await self._binary_search_first_event(
                contract_address,
                event_topic,
                earliest_search_block,
                latest_block
            )
            
            if first_event_block:
                logger.info("Found first event block via binary search",
                          protocol=protocol,
                          first_event_block=first_event_block)
                return first_event_block
            
            logger.warning("Could not detect creation block for protocol", protocol=protocol)
            return None
            
        except Exception as e:
            logger.error("Failed to detect creation block",
                        protocol=pool_config.get("protocol"),
                        error=str(e))
            return None
    
    async def _find_contract_creation_block(self, contract_address: str) -> Optional[int]:
        """Find the block where contract was created."""
        try:
            # Get contract code to verify it exists
            code_result = await self.blockchain._make_rpc_call("eth_getCode", [contract_address, "latest"])
            
            if code_result == "0x":
                logger.warning("Contract has no code", contract=contract_address)
                return None
            
            # Binary search for contract creation
            # Start from a reasonable range
            latest_block = await self.blockchain.get_latest_block()
            
            # For Base chain, contracts are typically deployed recently
            search_start = max(1, latest_block - 5000000)  # Search last 5M blocks
            
            creation_block = await self._binary_search_contract_creation(
                contract_address, search_start, latest_block
            )
            
            return creation_block
            
        except Exception as e:
            logger.error("Error finding contract creation block",
                        contract=contract_address,
                        error=str(e))
            return None
    
    async def _binary_search_contract_creation(
        self, 
        contract_address: str, 
        start_block: int, 
        end_block: int,
        max_iterations: int = 50
    ) -> Optional[int]:
        """Binary search to find contract creation block."""
        try:
            left, right = start_block, end_block
            creation_block = None
            iterations = 0
            
            while left <= right and iterations < max_iterations:
                iterations += 1
                mid = (left + right) // 2
                
                # Check if contract exists at this block
                try:
                    code_result = await self.blockchain._make_rpc_call(
                        "eth_getCode", [contract_address, hex(mid)]
                    )
                    
                    has_code = code_result != "0x"
                    
                    if has_code:
                        # Contract exists, search earlier
                        creation_block = mid
                        right = mid - 1
                    else:
                        # Contract doesn't exist yet, search later
                        left = mid + 1
                        
                except Exception as e:
                    # If we can't check this block, skip it
                    logger.debug("Error checking block", block=mid, error=str(e))
                    left = mid + 1
                    continue
            
            return creation_block
            
        except Exception as e:
            logger.error("Error in binary search for contract creation",
                        contract=contract_address,
                        error=str(e))
            return None
    
    async def _binary_search_first_event(
        self,
        contract_address: str,
        event_topic: str,
        start_block: int,
        end_block: int,
        max_iterations: int = 20
    ) -> Optional[int]:
        """Binary search to find first event occurrence."""
        try:
            left, right = start_block, end_block
            first_event_block = None
            iterations = 0
            
            while left <= right and iterations < max_iterations:
                iterations += 1
                mid = (left + right) // 2
                
                # Search for events in a small range around mid
                search_start = mid
                search_end = min(mid + 1000, end_block)  # Small range to avoid large queries
                
                try:
                    logs = await self.blockchain.get_logs(
                        from_block=search_start,
                        to_block=search_end,
                        address=contract_address,
                        topics=[event_topic]
                    )
                    
                    if logs:
                        # Found events, search earlier
                        first_event_block = int(logs[0]["blockNumber"], 16)
                        right = mid - 1000  # Jump back significantly
                    else:
                        # No events found, search later  
                        left = mid + 1000
                        
                except Exception as e:
                    logger.debug("Error searching for events", 
                               start_block=search_start,
                               end_block=search_end,
                               error=str(e))
                    left = mid + 1000
                    continue
            
            return first_event_block
            
        except Exception as e:
            logger.error("Error in binary search for first event",
                        contract=contract_address,
                        topic=event_topic,
                        error=str(e))
            return None

    async def validate_creation_blocks(self, pool_configs: list) -> Dict[str, int]:
        """Validate all protocol creation blocks and return corrected values."""
        corrected_blocks = {}
        
        for pool_config in pool_configs:
            protocol = pool_config.get("protocol")
            current_creation_block = pool_config.get("creation_block")
            
            logger.info("Validating creation block for protocol",
                       protocol=protocol,
                       current_creation_block=current_creation_block)
            
            detected_block = await self.detect_protocol_creation_block(pool_config)
            
            if detected_block:
                if current_creation_block and abs(detected_block - current_creation_block) > 100000:
                    logger.warning("Large difference in creation blocks detected",
                                 protocol=protocol,
                                 current_config=current_creation_block,
                                 detected=detected_block,
                                 difference=abs(detected_block - current_creation_block))
                
                corrected_blocks[protocol] = detected_block
            else:
                # Keep current value if detection fails
                if current_creation_block:
                    corrected_blocks[protocol] = current_creation_block
                    logger.warning("Could not detect creation block, keeping current value",
                                 protocol=protocol,
                                 keeping_value=current_creation_block)
        
        return corrected_blocks


async def validate_and_update_creation_blocks(blockchain_service: BaseBlockchainService) -> Dict[str, int]:
    """Convenience function to validate creation blocks for current chain."""
    detector = CreationBlockDetector(blockchain_service)
    return await detector.validate_creation_blocks(blockchain_service.chain_config.pools)
