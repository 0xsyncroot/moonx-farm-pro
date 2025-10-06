"""SushiSwap protocol parsers."""

from typing import Dict, Any, Optional
from datetime import datetime
import structlog

from models.pool import PoolInfo, SwapEvent, PoolProtocol
from .base_parser import BaseProtocolParser

logger = structlog.get_logger()


class SushiSwapV2Parser(BaseProtocolParser):
    """Parser for SushiSwap V2 protocol."""
    
    def get_protocol(self) -> PoolProtocol:
        return PoolProtocol.SUSHISWAP
    
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse SushiSwap V2 pool created event."""
        try:
            # SushiSwap PairCreated event structure:
            # event PairCreated(address indexed token0, address indexed token1, address pair, uint)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract tokens from topics
            token0_address = "0x" + topics[1][-40:]
            token1_address = "0x" + topics[2][-40:]
            
            # Extract pool address from data (first 32 bytes)
            pool_address = "0x" + data[26:66]
            
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
                creation_timestamp=block_timestamp
            )
            
            # V2 state will be populated later via swap events or separate update process
            
            return pool_info
            
        except Exception as e:
            logger.error("Failed to parse SushiSwap V2 pool created event", error=str(e))
            return None
    
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse SushiSwap V2 swap event."""
        try:
            # SushiSwap V2 Swap event structure (same as Uniswap V2):
            # event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
            
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
            logger.error("Failed to parse SushiSwap V2 swap event", error=str(e))
            return None
    
    async def get_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get SushiSwap V2 pool state (reserves) - same as Uniswap V2."""
        try:
            # SushiSwap V2 follows Uniswap V2 interface exactly
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
            logger.error("Failed to get SushiSwap V2 pool state", pool_address=pool_address, error=str(e))
            return None
    
    def supports_pool_state_tracking(self) -> bool:
        return True
    



class SushiSwapV3Parser(BaseProtocolParser):
    """Parser for SushiSwap V3 protocol."""
    
    def get_protocol(self) -> PoolProtocol:
        return PoolProtocol.SUSHISWAP_V3
    
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse SushiSwap V3 pool created event."""
        try:
            # SushiSwap V3 follows Uniswap V3 pattern:
            # event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract tokens from topics (same as Uniswap V3)
            token0_address = "0x" + topics[1][-40:]
            token1_address = "0x" + topics[2][-40:]
            fee_tier = str(int(topics[3], 16))  # Store as string to avoid MongoDB 64-bit issues
            
            # Extract pool address from data
            pool_address = "0x" + data[-40:]
            
            # Only use token addresses from logs (no additional fetching)
            
            # Get current pool state (same as V3)
            pool_state = await self.get_pool_state(pool_address)
            
            pool_info = PoolInfo(
                pool_address=pool_address,
                chain_id=self.blockchain.chain_config.chain_id,
                protocol=self.protocol,
                token0_address=token0_address,
                token1_address=token1_address,
                fee_tier=fee_tier,
                factory_address=log["address"],
                creation_block=block_number,
                creation_tx_hash=log["transactionHash"],
                creation_timestamp=block_timestamp
            )
            
            # V3 state will be populated later via swap events or separate update process
            
            return pool_info
            
        except Exception as e:
            logger.error("Failed to parse SushiSwap V3 pool created event", error=str(e))
            return None
    
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse SushiSwap V3 swap event."""
        try:
            # SushiSwap V3 follows Uniswap V3 pattern:
            # event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract addresses from topics
            sender = "0x" + topics[1][-40:]
            recipient = "0x" + topics[2][-40:]
            
            # Parse amounts from data (each is 32 bytes)
            amount0 = int(data[2:66], 16)
            amount1 = int(data[66:130], 16)
            
            # Convert signed integers
            if amount0 >= 2**255:
                amount0 -= 2**256
            if amount1 >= 2**255:
                amount1 -= 2**256
            
            # Determine input/output amounts
            amount0_in = str(abs(amount0)) if amount0 < 0 else "0"
            amount0_out = str(amount0) if amount0 > 0 else "0"
            amount1_in = str(abs(amount1)) if amount1 < 0 else "0"
            amount1_out = str(amount1) if amount1 > 0 else "0"
            
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
            logger.error("Failed to parse SushiSwap V3 swap event", error=str(e))
            return None
    
    async def get_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get SushiSwap V3 pool state - same interface as Uniswap V3."""
        try:
            # Same function signatures as Uniswap V3
            slot0_sig = "0x3850c7bd"  # slot0()
            liquidity_sig = "0x1a686502"  # liquidity()
            tick_spacing_sig = "0xd0c93a7c"  # tickSpacing()
            fee_sig = "0xddca3f43"  # fee()
            
            # Make parallel calls to get pool state
            calls = [
                self.blockchain._make_rpc_call("eth_call", [{"to": pool_address, "data": slot0_sig}, "latest"]),
                self.blockchain._make_rpc_call("eth_call", [{"to": pool_address, "data": liquidity_sig}, "latest"]),
                self.blockchain._make_rpc_call("eth_call", [{"to": pool_address, "data": tick_spacing_sig}, "latest"]),
                self.blockchain._make_rpc_call("eth_call", [{"to": pool_address, "data": fee_sig}, "latest"])
            ]
            
            import asyncio
            slot0_result, liquidity_result, tick_spacing_result, fee_result = await asyncio.gather(
                *calls, return_exceptions=True
            )
            
            pool_state = {}
            
            # Parse slot0 result (contains sqrt_price_x96, tick, etc.)
            if not isinstance(slot0_result, Exception) and slot0_result != "0x":
                slot0_data = self._parse_slot0(slot0_result)
                pool_state.update(slot0_data)
            
            # Parse liquidity
            if not isinstance(liquidity_result, Exception) and liquidity_result != "0x":
                pool_state["liquidity"] = str(int(liquidity_result, 16))
            
            # Parse tick spacing - convert to string to avoid MongoDB 64-bit issues
            if not isinstance(tick_spacing_result, Exception) and tick_spacing_result != "0x":
                pool_state["tick_spacing"] = str(int(tick_spacing_result, 16))
            
            # Parse fee - convert to string to avoid MongoDB 64-bit issues  
            if not isinstance(fee_result, Exception) and fee_result != "0x":
                pool_state["fee"] = str(int(fee_result, 16))
            
            return pool_state if pool_state else None
            
        except Exception as e:
            logger.error("Failed to get SushiSwap V3 pool state", pool_address=pool_address, error=str(e))
            return None
    
    def supports_pool_state_tracking(self) -> bool:
        return True
    
    def _parse_slot0(self, slot0_data: str) -> Dict[str, Any]:
        """Parse slot0 data - same as Uniswap V3."""
        try:
            data = slot0_data[2:] if slot0_data.startswith("0x") else slot0_data
            result = {}
            
            # Extract sqrt price (first 32 bytes, but only use 20 bytes for uint160)
            sqrt_price_hex = data[:64]
            if sqrt_price_hex:
                result["sqrt_price_x96"] = str(int(sqrt_price_hex, 16))
            
            # Extract current tick (second 32 bytes, signed int24)
            tick_hex = data[64:128]
            if tick_hex:
                tick_value = int(tick_hex, 16)
                # Convert to signed int24
                if tick_value >= 2**23:
                    tick_value -= 2**24
                result["current_tick"] = tick_value
            
            return result
            
        except Exception as e:
            logger.error("Failed to parse slot0 data", error=str(e))
            return {}
    
