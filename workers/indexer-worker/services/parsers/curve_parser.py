"""Curve protocol parser."""

from typing import Dict, Any, Optional, List
from datetime import datetime
import structlog

from models.pool import PoolInfo, SwapEvent, PoolProtocol
from .base_parser import BaseProtocolParser

logger = structlog.get_logger()


class CurveParser(BaseProtocolParser):
    """Parser for Curve protocol."""
    
    def get_protocol(self) -> PoolProtocol:
        return PoolProtocol.CURVE
    
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse Curve pool created event."""
        try:
            # Curve PlainPoolDeployed event structure varies by factory
            # event PlainPoolDeployed(address[4] coins, uint256[4] A, uint256 fee, address deployer, address pool)
            
            topics = log["topics"]
            data = log["data"]
            
            # Curve event parsing is more complex due to array parameters
            # Extract pool address (usually the last parameter)
            pool_address = "0x" + data[-64:-24]
            
            # Get tokens from the pool contract
            tokens = await self.get_curve_pool_coins(pool_address)
            
            if not tokens or len(tokens) < 2:
                logger.warning("Curve pool has insufficient tokens", pool_address=pool_address)
                return None
            
            # Take first two tokens for primary pair tracking (addresses only)
            token0_address = tokens[0]
            token1_address = tokens[1]
            
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
                    "all_tokens": tokens,  # List of token addresses
                    "pool_type": "stable",  # Curve specializes in stable swaps
                    "token_count": len(tokens),
                    "amplification_coefficient": "unknown"  # Would need to query from contract
                }
            )
            
            return pool_info
            
        except Exception as e:
            logger.error("Failed to parse Curve pool created event", error=str(e))
            return None
    
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse Curve swap event."""
        try:
            # Curve TokenExchange event structure:
            # event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract buyer from topics
            buyer = "0x" + topics[1][-40:]
            sender = buyer
            recipient = buyer  # In Curve, sender and recipient are usually the same
            
            # Parse token indices and amounts from data
            sold_id = int(data[2:66], 16)
            tokens_sold = str(int(data[66:130], 16))
            bought_id = int(data[130:194], 16)
            tokens_bought = str(int(data[194:258], 16))
            
            # Map to token0/token1 based on indices
            # This is simplified - real implementation would need proper token mapping
            if sold_id == 0 and bought_id == 1:  # Selling token0 for token1
                amount0_in = tokens_sold
                amount0_out = "0"
                amount1_in = "0"
                amount1_out = tokens_bought
            elif sold_id == 1 and bought_id == 0:  # Selling token1 for token0
                amount0_in = "0"
                amount0_out = tokens_bought
                amount1_in = tokens_sold
                amount1_out = "0"
            else:
                # Swap involving other tokens in multi-token pool
                # For simplicity, we'll map based on primary pair
                if sold_id == 0:  # Selling token0
                    amount0_in = tokens_sold
                    amount0_out = "0"
                    amount1_in = "0"
                    amount1_out = tokens_bought
                else:  # Selling token1 (or other token mapped to token1)
                    amount0_in = "0"
                    amount0_out = tokens_bought
                    amount1_in = tokens_sold
                    amount1_out = "0"
            
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
            logger.error("Failed to parse Curve swap event", error=str(e))
            return None
    
    async def get_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Curve pool state."""
        try:
            # Get basic pool information
            tokens = await self.get_curve_pool_coins(pool_address)
            if not tokens:
                return None
            
            # Get balances for each token
            balances = await self.get_curve_pool_balances(pool_address, len(tokens))
            
            return {
                "tokens": [t.address for t in tokens],
                "token_count": len(tokens),
                "balances": balances,
                "pool_type": "stable"
            }
            
        except Exception as e:
            logger.error("Failed to get Curve pool state", pool_address=pool_address, error=str(e))
            return None
    
    async def get_curve_pool_coins(self, pool_address: str) -> Optional[List[str]]:
        """Get coins from a Curve pool."""
        try:
            # Curve pool function signatures
            coins_sig = "0xc6610657"  # coins(uint256)
            
            tokens = []
            
            # Try to get up to 8 coins (Curve pools can have many)
            for i in range(8):
                try:
                    # Call coins(i) to get token at index i
                    coin_call_data = coins_sig + hex(i)[2:].zfill(64)
                    coin_result = await self.blockchain._make_rpc_call("eth_call", [
                        {"to": pool_address, "data": coin_call_data}, "latest"
                    ])
                    
                    if coin_result == "0x" or coin_result == "0x" + "0" * 64:
                        break  # No more coins
                    
                    coin_address = "0x" + coin_result[-40:]
                    
                    if coin_address != "0x" + "0" * 40:  # Skip zero address
                        # Only store token address (logs-only approach)
                        tokens.append(coin_address)
                    else:
                        break
                        
                except Exception:
                    break  # Stop if we can't get more coins
            
            return tokens if len(tokens) >= 2 else None
            
        except Exception as e:
            logger.error("Failed to get Curve pool coins", pool_address=pool_address, error=str(e))
            return None
    
    async def get_curve_pool_balances(self, pool_address: str, token_count: int) -> Optional[List[str]]:
        """Get balances for each token in the Curve pool."""
        try:
            # Curve pool function signatures
            balances_sig = "0x4903b0d1"  # balances(uint256)
            
            balances = []
            
            # Get balance for each token
            for i in range(min(token_count, 8)):
                try:
                    balance_call_data = balances_sig + hex(i)[2:].zfill(64)
                    balance_result = await self.blockchain._make_rpc_call("eth_call", [
                        {"to": pool_address, "data": balance_call_data}, "latest"
                    ])
                    
                    if balance_result == "0x":
                        balances.append("0")
                    else:
                        balance = str(int(balance_result, 16))
                        balances.append(balance)
                        
                except Exception:
                    balances.append("0")
            
            return balances if balances else None
            
        except Exception as e:
            logger.error("Failed to get Curve pool balances", pool_address=pool_address, error=str(e))
            return None
    
    def supports_pool_state_tracking(self) -> bool:
        return True