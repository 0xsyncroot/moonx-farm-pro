"""Aerodrome protocol parser (Base chain native DEX)."""

from typing import Dict, Any, Optional
from datetime import datetime
import structlog

from models.pool import PoolInfo, SwapEvent, PoolProtocol
from .base_parser import BaseProtocolParser

logger = structlog.get_logger()


class AerodromeParser(BaseProtocolParser):
    """Parser for Aerodrome protocol (Base chain)."""
    
    def get_protocol(self) -> PoolProtocol:
        return PoolProtocol.AERODROME
    
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse Aerodrome pool created event."""
        try:
            # Aerodrome PoolCreated event structure:
            # event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract tokens from topics
            token0_address = "0x" + topics[1][-40:]
            token1_address = "0x" + topics[2][-40:]
            
            # Extract stable flag from topics (indexed bool parameter)
            stable_flag = int(topics[3], 16) == 1
            
            # Extract pool address from data  
            # pool address is first 32 bytes, uint256 is second 32 bytes
            pool_address = "0x" + data[26:66]  # Extract 20 bytes from 32-byte slot
            
            # Only use token addresses from logs (no additional fetching)
            
            # Skip pool state fetching during creation - will be updated via swap events
            
            pool_info = PoolInfo(
                pool_address=pool_address,
                chain_id=self.blockchain.chain_config.chain_id,
                protocol=self.protocol,
                token0_address=token0_address,
                token1_address=token1_address,
                factory_address=log["address"],
                creation_block=block_number,
                creation_tx_hash=log["transactionHash"],
                creation_timestamp=block_timestamp,
                metadata={
                    "stable": stable_flag,
                    "pool_type": "stable" if stable_flag else "volatile"
                }
            )
            
            # Pool state will be populated later via swap events or separate update process
            
            return pool_info
            
        except Exception as e:
            logger.error("Failed to parse Aerodrome pool created event", error=str(e))
            return None
    
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse Aerodrome swap event."""
        try:
            # Aerodrome Swap event structure (similar to Uniswap V2):
            # event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract addresses from topics
            sender = "0x" + topics[1][-40:]
            recipient = "0x" + topics[2][-40:]
            
            # Parse amounts from data
            amount0_in = str(int(data[2:66], 16))
            amount1_in = str(int(data[66:130], 16))
            amount0_out = str(int(data[130:194], 16))
            amount1_out = str(int(data[194:258], 16))
            
            return SwapEvent(
                tx_hash=log["transactionHash"],
                log_index=int(log["logIndex"], 16),
                pool_address=pool_info.pool_address,
                chain_id=self.blockchain.chain_config.chain_id,
                block_number=block_number,
                block_timestamp=block_timestamp,
                sender=sender,
                recipient=recipient,
                amount0_in=amount0_in,
                amount1_in=amount1_in,
                amount0_out=amount0_out,
                amount1_out=amount1_out
            )
            
        except Exception as e:
            logger.error("Failed to parse Aerodrome swap event", error=str(e))
            return None
    
    async def get_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Aerodrome pool state (reserves)."""
        try:
            # Aerodrome Pool function signatures (similar to Uniswap V2)
            reserves_sig = "0x0902f1ac"  # getReserves()
            
            # Make call to get reserves
            reserves_result = await self.blockchain._make_rpc_call("eth_call", [
                {"to": pool_address, "data": reserves_sig}, "latest"
            ])
            
            if reserves_result == "0x":
                return None
            
            # Parse reserves result
            data = reserves_result[2:]  # Remove 0x prefix
            
            reserve0 = str(int(data[0:64], 16))
            reserve1 = str(int(data[64:128], 16))
            last_update = int(data[128:192], 16)
            
            return {
                "reserve0": reserve0,
                "reserve1": reserve1,
                "last_update_timestamp": last_update
            }
            
        except Exception as e:
            logger.error("Failed to get Aerodrome pool state", pool_address=pool_address, error=str(e))
            return None
    
    def supports_pool_state_tracking(self) -> bool:
        return True
    
