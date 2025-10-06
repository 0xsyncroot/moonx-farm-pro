"""Price calculation service for different AMM types."""

from typing import Dict, Optional, Any
import asyncio
import structlog
from datetime import datetime

from models.pool import PoolInfo, SwapEvent, PriceCalculation, PoolProtocol
from .base_blockchain import BaseBlockchainService

logger = structlog.get_logger()


class PriceCalculationService:
    """Service for calculating prices from various sources."""
    
    def __init__(self, blockchain_service: BaseBlockchainService):
        self.blockchain = blockchain_service
    
    async def create_price_calculation_from_swap(
        self, 
        swap_event: SwapEvent, 
        pool_info: PoolInfo,
        sqrt_price_x96_after: Optional[str] = None
    ) -> PriceCalculation:
        """Create price calculation from swap event."""
        try:
            # Calculate the effective price from the swap
            price = self._calculate_swap_price(swap_event, pool_info)
            
            # Calculate net amounts (positive for inflow, negative for outflow)
            amount0_net = self._calculate_net_amount(swap_event.amount0_in, swap_event.amount0_out)
            amount1_net = self._calculate_net_amount(swap_event.amount1_in, swap_event.amount1_out)
            
            # Get pool state after swap if available
            price_before = None
            price_after = None
            
            if sqrt_price_x96_after:
                prices = self._calculate_prices_from_sqrt_price(
                    sqrt_price_x96_after,
                    pool_info.token0.decimals,
                    pool_info.token1.decimals
                )
                price_after = float(prices["price_token0"])
            
            # Calculate price impact if we have before/after prices
            price_impact = None
            if price_before and price_after and price_before != 0:
                price_impact = abs((price_after - price_before) / price_before) * 100
            
            return PriceCalculation(
                pool_address=pool_info.pool_address,
                chain_id=self.blockchain.chain_config.chain_id,
                tx_hash=swap_event.tx_hash,
                block_number=swap_event.block_number,
                timestamp=int(swap_event.block_timestamp.timestamp()),
                price=price,
                amount0=amount0_net,
                amount1=amount1_net,
                token0=pool_info.token0.address,
                token1=pool_info.token1.address,
                price_impact=price_impact,
                price_before=price_before,
                price_after=price_after,
                protocol=pool_info.protocol,
                fee_tier=pool_info.fee_tier,
                calculation_method="swap"
            )
            
        except Exception as e:
            logger.error("Failed to create price calculation from swap", 
                        tx_hash=swap_event.tx_hash, error=str(e))
            raise
    
    async def create_price_calculation_from_pool_state(
        self, 
        pool_info: PoolInfo, 
        block_number: int, 
        tx_hash: str
    ) -> Optional[PriceCalculation]:
        """Create price calculation from current pool state."""
        try:
            if pool_info.protocol in [PoolProtocol.UNISWAP_V3, PoolProtocol.SUSHISWAP_V3, PoolProtocol.PANCAKESWAP_V3]:
                return await self._create_v3_state_price_calculation(pool_info, block_number, tx_hash)
            elif pool_info.protocol in [PoolProtocol.UNISWAP_V2, PoolProtocol.SUSHISWAP, PoolProtocol.PANCAKESWAP_V2]:
                return await self._create_v2_state_price_calculation(pool_info, block_number, tx_hash)
            else:
                logger.warning("Price calculation from pool state not implemented for protocol", 
                             protocol=pool_info.protocol)
                return None
                
        except Exception as e:
            logger.error("Failed to create price calculation from pool state", 
                        pool_address=pool_info.pool_address, error=str(e))
            return None
    
    async def _create_v3_state_price_calculation(
        self, 
        pool_info: PoolInfo, 
        block_number: int, 
        tx_hash: str
    ) -> Optional[PriceCalculation]:
        """Create price calculation from V3 pool state."""
        # Get current pool state
        pool_state = await self._get_uniswap_v3_pool_state(pool_info.pool_address)
        
        if not pool_state or not pool_state.get("sqrt_price_x96"):
            return None
        
        # Calculate price from sqrt price
        prices = self._calculate_prices_from_sqrt_price(
            pool_state["sqrt_price_x96"],
            pool_info.token0.decimals,
            pool_info.token1.decimals
        )
        
        # Get block timestamp
        block_timestamp = await self.blockchain.get_block_timestamp(block_number)
        
        return PriceCalculation(
            pool_address=pool_info.pool_address,
            chain_id=self.blockchain.chain_config.chain_id,
            tx_hash=tx_hash,
            block_number=block_number,
            timestamp=int(block_timestamp.timestamp()),
            price=float(prices["price_token0"]),
            amount0="0",  # No specific transaction amounts for state-based calculation
            amount1="0",
            token0=pool_info.token0.address,
            token1=pool_info.token1.address,
            liquidity_after=pool_state.get("liquidity"),
            protocol=pool_info.protocol,
            fee_tier=pool_info.fee_tier,
            calculation_method="pool_state"
        )
    
    async def _create_v2_state_price_calculation(
        self, 
        pool_info: PoolInfo, 
        block_number: int, 
        tx_hash: str
    ) -> Optional[PriceCalculation]:
        """Create price calculation from V2 pool state."""
        # Get current pool state
        pool_state = await self._get_uniswap_v2_pool_state(pool_info.pool_address)
        
        if not pool_state or not pool_state.get("reserve0") or not pool_state.get("reserve1"):
            return None
        
        # Calculate price from reserves
        prices = self._calculate_prices_from_reserves(
            pool_state["reserve0"],
            pool_state["reserve1"],
            pool_info.token0.decimals,
            pool_info.token1.decimals
        )
        
        # Get block timestamp
        block_timestamp = await self.blockchain.get_block_timestamp(block_number)
        
        return PriceCalculation(
            pool_address=pool_info.pool_address,
            chain_id=self.blockchain.chain_config.chain_id,
            tx_hash=tx_hash,
            block_number=block_number,
            timestamp=int(block_timestamp.timestamp()),
            price=float(prices["price_token0"]),
            amount0="0",
            amount1="0",
            token0=pool_info.token0.address,
            token1=pool_info.token1.address,
            protocol=pool_info.protocol,
            calculation_method="reserves"
        )
    
    def _calculate_swap_price(self, swap_event: SwapEvent, pool_info: PoolInfo) -> float:
        """Calculate effective price from swap amounts."""
        try:
            # Convert string amounts to float for calculation
            amount0_in = float(swap_event.amount0_in) if swap_event.amount0_in != "0" else 0
            amount0_out = float(swap_event.amount0_out) if swap_event.amount0_out != "0" else 0
            amount1_in = float(swap_event.amount1_in) if swap_event.amount1_in != "0" else 0
            amount1_out = float(swap_event.amount1_out) if swap_event.amount1_out != "0" else 0
            
            # Determine which token is being traded for which
            if amount0_in > 0 and amount1_out > 0:
                # Trading token0 for token1
                # Adjust for decimals
                adjusted_amount0 = amount0_in / (10 ** pool_info.token0.decimals)
                adjusted_amount1 = amount1_out / (10 ** pool_info.token1.decimals)
                price = adjusted_amount1 / adjusted_amount0 if adjusted_amount0 != 0 else 0
            elif amount1_in > 0 and amount0_out > 0:
                # Trading token1 for token0
                # Adjust for decimals
                adjusted_amount0 = amount0_out / (10 ** pool_info.token0.decimals)
                adjusted_amount1 = amount1_in / (10 ** pool_info.token1.decimals)
                price = adjusted_amount1 / adjusted_amount0 if adjusted_amount0 != 0 else 0
            else:
                # Fallback: use the ratio of total amounts
                total_amount0 = amount0_in + amount0_out
                total_amount1 = amount1_in + amount1_out
                if total_amount0 != 0:
                    adjusted_amount0 = total_amount0 / (10 ** pool_info.token0.decimals)
                    adjusted_amount1 = total_amount1 / (10 ** pool_info.token1.decimals)
                    price = adjusted_amount1 / adjusted_amount0
                else:
                    price = 0
            
            return price
            
        except Exception as e:
            logger.error("Failed to calculate swap price", error=str(e))
            return 0.0
    
    def _calculate_net_amount(self, amount_in: str, amount_out: str) -> str:
        """Calculate net amount (positive for inflow, negative for outflow)."""
        try:
            in_amount = float(amount_in) if amount_in != "0" else 0
            out_amount = float(amount_out) if amount_out != "0" else 0
            
            # Net flow: positive if more coming in, negative if more going out
            net = in_amount - out_amount
            return str(net)
            
        except Exception:
            return "0"
    
    def _calculate_prices_from_sqrt_price(
        self, 
        sqrt_price_x96: str, 
        token0_decimals: int, 
        token1_decimals: int
    ) -> Dict[str, str]:
        """Calculate token prices from Uniswap V3 sqrt price."""
        try:
            # Calculate prices using decimal utility to avoid scientific notation
            from utils.decimal_utils import calculate_price_from_sqrt_price
            price_token0_in_token1, price_token1_in_token0 = calculate_price_from_sqrt_price(
                sqrt_price_x96, token0_decimals, token1_decimals
            )
            
            return {
                "price_token0": price_token0_in_token1,
                "price_token1": price_token1_in_token0
            }
            
        except Exception as e:
            logger.error("Failed to calculate prices from sqrt price", error=str(e))
            return {
                "price_token0": "0",
                "price_token1": "0"
            }
    
    def _calculate_prices_from_reserves(
        self, 
        reserve0: str, 
        reserve1: str, 
        token0_decimals: int, 
        token1_decimals: int
    ) -> Dict[str, str]:
        """Calculate token prices from V2-style reserves."""
        try:
            # Convert reserves to float
            res0 = float(reserve0)
            res1 = float(reserve1)
            
            if res0 == 0 or res1 == 0:
                return {"price_token0": "0", "price_token1": "0"}
            
            # Adjust for token decimals
            adjusted_reserve0 = res0 / (10 ** token0_decimals)
            adjusted_reserve1 = res1 / (10 ** token1_decimals)
            
            # Calculate prices using decimal utility to avoid scientific notation
            from utils.decimal_utils import calculate_price_from_reserves
            price_token0_in_token1, price_token1_in_token0 = calculate_price_from_reserves(
                adjusted_reserve0, adjusted_reserve1, 0, 0  # Already adjusted for decimals
            )
            
            return {
                "price_token0": price_token0_in_token1,
                "price_token1": price_token1_in_token0
            }
            
        except Exception as e:
            logger.error("Failed to calculate prices from reserves", error=str(e))
            return {"price_token0": "0", "price_token1": "0"}
    
    async def _get_uniswap_v3_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Uniswap V3 pool state."""
        try:
            # Uniswap V3 Pool function signatures
            slot0_sig = "0x3850c7bd"  # slot0()
            liquidity_sig = "0x1a686502"  # liquidity()
            
            # Make parallel calls to get pool state
            calls = [
                self.blockchain._make_rpc_call("eth_call", [{"to": pool_address, "data": slot0_sig}, "latest"]),
                self.blockchain._make_rpc_call("eth_call", [{"to": pool_address, "data": liquidity_sig}, "latest"])
            ]
            
            slot0_result, liquidity_result = await asyncio.gather(*calls, return_exceptions=True)
            
            pool_state = {}
            
            # Parse slot0 result (contains sqrt_price_x96, tick, etc.)
            if not isinstance(slot0_result, Exception) and slot0_result != "0x":
                slot0_data = self._parse_slot0(slot0_result)
                pool_state.update(slot0_data)
            
            # Parse liquidity
            if not isinstance(liquidity_result, Exception) and liquidity_result != "0x":
                pool_state["liquidity"] = str(int(liquidity_result, 16))
            
            return pool_state if pool_state else None
            
        except Exception as e:
            logger.error("Failed to get V3 pool state", pool_address=pool_address, error=str(e))
            return None
    
    async def _get_uniswap_v2_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
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
            # getReserves() returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
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
    
    def _parse_slot0(self, slot0_data: str) -> Dict[str, Any]:
        """Parse Uniswap V3 slot0 data."""
        try:
            # Remove 0x prefix
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