"""Uniswap protocol parsers."""

import asyncio
from typing import Dict, Any, Optional
from datetime import datetime
import structlog

from models.pool import PoolInfo, SwapEvent, LiquidityEvent, PoolProtocol
from .base_parser import BaseProtocolParser

logger = structlog.get_logger()


class UniswapV2Parser(BaseProtocolParser):
    """Parser for Uniswap V2 protocol."""
    
    def get_protocol(self) -> PoolProtocol:
        return PoolProtocol.UNISWAP_V2
    
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse Uniswap V2 pool created event."""
        try:
            # Uniswap V2 PairCreated event structure:
            # event PairCreated(address indexed token0, address indexed token1, address pair, uint)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract tokens from topics
            token0_address = "0x" + topics[1][-40:]
            token1_address = "0x" + topics[2][-40:]
            
            # Extract pool address from data (first 20 bytes)
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
            logger.error("Failed to parse Uniswap V2 pool created event", error=str(e))
            return None
    
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse Uniswap V2 swap event."""
        try:
            # Uniswap V2 Swap event structure:
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
            logger.error("Failed to parse Uniswap V2 swap event", error=str(e))
            return None
    
    async def get_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Uniswap V2 pool state (reserves)."""
        try:
            # Uniswap V2 Pool function signatures
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
            logger.error("Failed to get V2 pool state", pool_address=pool_address, error=str(e))
            return None
    
    def supports_pool_state_tracking(self) -> bool:
        return True
    



class UniswapV3Parser(BaseProtocolParser):
    """Parser for Uniswap V3 protocol."""
    
    def get_protocol(self) -> PoolProtocol:
        return PoolProtocol.UNISWAP_V3
    
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse Uniswap V3 pool created event."""
        try:
            # Uniswap V3 PoolCreated event structure:
            # event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract tokens from topics
            token0_address = "0x" + topics[1][-40:]
            token1_address = "0x" + topics[2][-40:]
            fee_tier = str(int(topics[3], 16))  # Store as string to avoid MongoDB 64-bit issues
            
            # Extract pool address from data
            pool_address = "0x" + data[-40:]
            
            # Only use token addresses from logs (no additional fetching)
            # Skip pool state fetching during creation - will be updated via swap events
            
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
            logger.error("Failed to parse Uniswap V3 pool created event", error=str(e))
            return None
    
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse Uniswap V3 swap event."""
        try:
            # Uniswap V3 Swap event structure:
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
            logger.error("Failed to parse Uniswap V3 swap event", error=str(e))
            return None
    
    async def get_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Uniswap V3 pool state."""
        try:
            # Uniswap V3 Pool function signatures
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
            logger.error("Failed to get V3 pool state", pool_address=pool_address, error=str(e))
            return None
    
    def supports_pool_state_tracking(self) -> bool:
        return True
    
    def _parse_slot0(self, slot0_data: str) -> Dict[str, Any]:
        """Parse Uniswap V3 slot0 data."""
        try:
            # Remove 0x prefix
            data = slot0_data[2:] if slot0_data.startswith("0x") else slot0_data
            
            result = {}
            
            # Extract sqrt price (first 32 bytes, but only use 20 bytes for uint160)
            # Store as hex string to avoid 64-bit overflow during intermediate int conversion
            sqrt_price_hex = data[:64]
            if sqrt_price_hex:
                # Convert directly to decimal string to avoid large int intermediate value
                result["sqrt_price_x96"] = str(int(sqrt_price_hex, 16))
            
            # Extract current tick (second 32 bytes, signed int24) - only read last 6 hex chars
            tick_hex = data[64:128]
            if tick_hex:
                tick_value = int(tick_hex[-6:], 16)  # Read only last 6 hex chars for int24
                # Convert to signed int24
                if tick_value >= 2**23:
                    tick_value -= 2**24
                result["current_tick"] = tick_value
            
            # Extract observation index (third 32 bytes) - convert to string to avoid MongoDB 64-bit limit
            obs_index_hex = data[128:192]
            if obs_index_hex:
                result["observation_index"] = str(int(obs_index_hex, 16))
            
            # Extract observation cardinality (fourth 32 bytes) - convert to string to avoid MongoDB 64-bit limit
            obs_card_hex = data[192:256]
            if obs_card_hex:
                result["observation_cardinality"] = str(int(obs_card_hex, 16))
            
            return result
            
        except Exception as e:
            logger.error("Failed to parse slot0 data", error=str(e))
            return {}
    



class UniswapV4Parser(BaseProtocolParser):
    """Parser for Uniswap V4 protocol."""
    
    def get_protocol(self) -> PoolProtocol:
        return PoolProtocol.UNISWAP_V4
    
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse Uniswap V4 Initialize event."""
        try:
            # Uniswap V4 Initialize event structure:
            # event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)
            # First 3 parameters are indexed (in topics), remaining 5 are in data
            
            topics = log["topics"]
            data = log["data"]
            
            if len(topics) < 4:  # event signature + 3 indexed parameters
                logger.error("Insufficient topics for Uniswap V4 Initialize event", topics_count=len(topics))
                return None
                
            if len(data) < 162:  # 5 parameters * 32 bytes + 2 for 0x
                logger.error("Insufficient data length for Uniswap V4 Initialize event", data_length=len(data))
                return None
                
            # Parse indexed parameters from topics
            pool_id = topics[1][2:]  # Remove 0x prefix from bytes32 PoolId
            token0_address = "0x" + topics[2][-40:]  # address currency0 (last 20 bytes)
            token1_address = "0x" + topics[3][-40:]  # address currency1 (last 20 bytes)
            
            # Parse non-indexed parameters from data (each parameter is 32 bytes)
            fee_tier = str(int(data[2:66], 16))  # uint24 fee - store as string to avoid MongoDB issues
            
            # Handle signed int24 tickSpacing (only read last 6 hex chars = 3 bytes = 24 bits)
            tick_spacing_raw = int(data[66:130][-6:], 16)  # Read only last 6 hex chars
            if tick_spacing_raw >= 2**23:
                tick_spacing_raw -= 2**24
            tick_spacing = str(tick_spacing_raw)
            
            hooks_address = "0x" + data[154:194]  # address hooks (last 20 bytes of 32-byte slot)
            sqrt_price_x96 = int(data[194:258], 16)  # uint160 sqrtPriceX96
            
            # Handle signed int24 tick (only read last 6 hex chars = 3 bytes = 24 bits)
            current_tick_raw = int(data[258:322][-6:], 16)  # Read only last 6 hex chars
            if current_tick_raw >= 2**23:
                current_tick_raw -= 2**24
            current_tick = current_tick_raw
            
            # For V4, we use pool_id as unique identifier since all pools are in singleton
            # But we still need a readable pool_address - use combination of manager + pool_id
            pool_manager = log["address"]  # PoolManager singleton address
            pool_address = f"{pool_manager}#{pool_id}"  # Unique identifier
            
            pool_info = PoolInfo(
                pool_address=pool_address,
                chain_id=self.blockchain.chain_config.chain_id,
                protocol=self.protocol,
                token0_address=token0_address,
                token1_address=token1_address,
                fee_tier=fee_tier,
                tick_spacing=tick_spacing,
                factory_address=pool_manager,
                creation_block=block_number,
                creation_tx_hash=log["transactionHash"],
                creation_timestamp=block_timestamp,
                # V4-specific state
                current_sqrt_price_x96=str(sqrt_price_x96),  # Store as string for MongoDB
                current_tick=str(current_tick),
                metadata={
                    "pool_id": pool_id,
                    "hooks_address": hooks_address,
                    "singleton_manager": True,
                    "pool_manager": pool_manager
                }
            )
            
            return pool_info
            
        except Exception as e:
            logger.error("Failed to parse Uniswap V4 Initialize event", 
                        error=str(e), 
                        data_length=len(log.get("data", "")),
                        topics_count=len(log.get("topics", [])))
            return None
    
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse Uniswap V4 swap event."""
        try:
            # Uniswap V4 Swap event structure:
            # event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
            # First 2 parameters are indexed (in topics), remaining 6 are in data
            
            topics = log["topics"]
            data = log["data"]
            
            if len(topics) < 3:  # event signature + 2 indexed parameters
                logger.error("Insufficient topics for Uniswap V4 Swap event", topics_count=len(topics))
                return None
                
            if len(data) < 194:  # 6 parameters * 32 bytes + 2 for 0x
                logger.error("Insufficient data length for Uniswap V4 Swap event", data_length=len(data))
                return None
            
            # Parse indexed parameters from topics
            pool_id = topics[1][2:]  # Remove 0x prefix from bytes32 id
            sender = "0x" + topics[2][-40:]  # address sender (last 20 bytes)
            
            # Parse non-indexed parameters from data (each parameter is 32 bytes)
            amount0 = int(data[2:66], 16)  # int128 amount0
            amount1 = int(data[66:130], 16)  # int128 amount1
            sqrt_price_x96 = int(data[130:194], 16)  # uint160 sqrtPriceX96
            liquidity = int(data[194:258], 16)  # uint128 liquidity
            tick = int(data[258:322][-6:], 16)  # int24 tick (only read last 6 hex chars)
            fee = int(data[322:386], 16)  # uint24 fee
            
            # Convert signed 128-bit integers (two's complement)
            if amount0 >= 2**127:
                amount0 -= 2**128
            if amount1 >= 2**127:
                amount1 -= 2**128
                
            # Convert signed 24-bit tick (two's complement)
            if tick >= 2**23:
                tick -= 2**24
            
            # For V4, recipient is often the same as sender
            recipient = sender
            
            # Determine input/output amounts based on sign
            amount0_in = str(abs(amount0)) if amount0 < 0 else "0"
            amount0_out = str(amount0) if amount0 > 0 else "0"
            amount1_in = str(abs(amount1)) if amount1 < 0 else "0"
            amount1_out = str(amount1) if amount1 > 0 else "0"
            
            # Verify pool_id matches (extract from pool_address if it's in format manager#pool_id)
            if "#" in pool_info.pool_address:
                expected_pool_id = pool_info.pool_address.split("#")[1]
                if pool_id != expected_pool_id:
                    logger.warning("Pool ID mismatch in V4 swap event", 
                                 expected=expected_pool_id, 
                                 actual=pool_id,
                                 pool_address=pool_info.pool_address)
            
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
            logger.error("Failed to parse Uniswap V4 swap event", 
                        error=str(e),
                        data_length=len(log.get("data", "")),
                        topics_count=len(log.get("topics", [])))
            return None
    
    def parse_liquidity_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[LiquidityEvent]:
        """Parse Uniswap V4 ModifyLiquidity event."""
        try:
            # Uniswap V4 ModifyLiquidity event structure:
            # event ModifyLiquidity(PoolId indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)
            # First 2 parameters are indexed (in topics), remaining 4 are in data
            
            topics = log["topics"]
            data = log["data"]
            
            if len(topics) < 3:  # event signature + 2 indexed parameters
                logger.error("Insufficient topics for Uniswap V4 ModifyLiquidity event", topics_count=len(topics))
                return None
                
            if len(data) < 130:  # 4 parameters * 32 bytes + 2 for 0x
                logger.error("Insufficient data length for Uniswap V4 ModifyLiquidity event", data_length=len(data))
                return None
                
            # Parse indexed parameters from topics
            pool_id = topics[1][2:]  # Remove 0x prefix from bytes32 PoolId
            sender = "0x" + topics[2][-40:]  # address sender (last 20 bytes)
            
            # Verify pool_id matches (extract from pool_address if it's in format manager#pool_id)
            if "#" in pool_info.pool_address:
                expected_pool_id = pool_info.pool_address.split("#")[1]
                if pool_id != expected_pool_id:
                    logger.warning("Pool ID mismatch in V4 ModifyLiquidity event", 
                                 expected=expected_pool_id, 
                                 actual=pool_id,
                                 pool_address=pool_info.pool_address)
            
            # Parse non-indexed parameters from data (each parameter is 32 bytes)
            # Handle signed int24 tickLower (only read last 6 hex chars = 3 bytes = 24 bits)
            tick_lower_raw = int(data[2:66][-6:], 16)  # Read only last 6 hex chars
            if tick_lower_raw >= 2**23:
                tick_lower_raw -= 2**24
            tick_lower = tick_lower_raw
            
            # Handle signed int24 tickUpper (only read last 6 hex chars = 3 bytes = 24 bits)
            tick_upper_raw = int(data[66:130][-6:], 16)  # Read only last 6 hex chars
            if tick_upper_raw >= 2**23:
                tick_upper_raw -= 2**24
            tick_upper = tick_upper_raw
            
            # Handle signed int256 liquidityDelta
            liquidity_delta_raw = int(data[130:194], 16)
            if liquidity_delta_raw >= 2**255:
                liquidity_delta_raw -= 2**256
            liquidity_delta = str(liquidity_delta_raw)
            
            # bytes32 salt
            salt = data[194:258]
            
            return LiquidityEvent(
                tx_hash=log["transactionHash"],
                log_index=int(log["logIndex"], 16),
                pool_address=pool_info.pool_address,
                chain_id=self.blockchain.chain_config.chain_id,
                block_number=block_number,
                block_timestamp=block_timestamp,
                sender=sender,
                tick_lower=tick_lower,
                tick_upper=tick_upper,
                liquidity_delta=liquidity_delta,
                salt=salt
            )
            
        except Exception as e:
            logger.error("Failed to parse Uniswap V4 ModifyLiquidity event", 
                        error=str(e),
                        data_length=len(log.get("data", "")),
                        topics_count=len(log.get("topics", [])))
            return None
    
    def supports_pool_state_tracking(self) -> bool:
        return False  # V4 uses singleton pattern, state tracking is different
    
    def supports_liquidity_tracking(self) -> bool:
        """V4 supports liquidity tracking via ModifyLiquidity events."""
        return True