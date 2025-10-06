"""Balancer V2 protocol parser."""

from typing import Dict, Any, Optional, List
from datetime import datetime
import structlog

from models.pool import PoolInfo, SwapEvent, PoolProtocol
from .base_parser import BaseProtocolParser

logger = structlog.get_logger()


class BalancerV2Parser(BaseProtocolParser):
    """Parser for Balancer V2 protocol."""
    
    def get_protocol(self) -> PoolProtocol:
        return PoolProtocol.BALANCER_V2
    
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse Balancer V2 pool created event."""
        try:
            # Balancer V2 PoolRegistered event structure:
            # event PoolRegistered(bytes32 indexed poolId, address indexed poolAddress, PoolSpecialization specialization)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract pool ID and address from topics
            pool_id = topics[1]
            pool_address = "0x" + topics[2][-40:]
            
            # For Balancer, we need to get tokens from the pool contract
            tokens = await self.get_balancer_pool_tokens(pool_address)
            
            if not tokens or len(tokens) < 2:
                logger.warning("Balancer pool has insufficient tokens", pool_address=pool_address)
                return None
            
            # For now, take first two tokens (Balancer can have more) - addresses only
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
                    "pool_id": pool_id,
                    "all_tokens": tokens,  # List of token addresses
                    "pool_type": "weighted",  # Could be weighted, stable, etc.
                    "token_count": len(tokens)
                }
            )
            
            return pool_info
            
        except Exception as e:
            logger.error("Failed to parse Balancer V2 pool created event", error=str(e))
            return None
    
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse Balancer V2 swap event."""
        try:
            # Balancer V2 Swap event structure:
            # event Swap(bytes32 indexed poolId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)
            
            topics = log["topics"]
            data = log["data"]
            
            # Extract pool ID and tokens from topics
            pool_id = topics[1]
            token_in = "0x" + topics[2][-40:]
            token_out = "0x" + topics[3][-40:]
            
            # Parse amounts from data
            amount_in = str(int(data[2:66], 16))
            amount_out = str(int(data[66:130], 16))
            
            # For Balancer, we need to map to token0/token1 based on pool configuration
            # This is simplified - real implementation would need proper token mapping
            if token_in.lower() == pool_info.token0.address.lower():
                amount0_in = amount_in
                amount0_out = "0"
                amount1_in = "0"
                amount1_out = amount_out
            elif token_in.lower() == pool_info.token1.address.lower():
                amount0_in = "0"
                amount0_out = amount_out
                amount1_in = amount_in
                amount1_out = "0"
            else:
                # Token not in our tracked pair - skip or handle multi-token logic
                logger.warning("Balancer swap with untracked token", token_in=token_in, pool=pool_info.pool_address)
                return None
            
            # Extract sender from transaction (Balancer doesn't include in event)
            # In real implementation, would need to get from transaction details
            sender = "0x" + "0" * 40  # Placeholder
            recipient = sender  # Simplified
            
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
            logger.error("Failed to parse Balancer V2 swap event", error=str(e))
            return None
    
    async def get_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Balancer V2 pool state."""
        try:
            # Balancer pools have different interfaces depending on type
            # For weighted pools, we can get weights and balances
            
            # Get pool tokens first
            tokens = await self.get_balancer_pool_tokens(pool_address)
            if not tokens:
                return None
            
            # For simplicity, return basic token info
            # Real implementation would get balances, weights, etc.
            return {
                "tokens": [t.address for t in tokens],
                "token_count": len(tokens),
                "pool_type": "weighted"  # Would determine actual type
            }
            
        except Exception as e:
            logger.error("Failed to get Balancer V2 pool state", pool_address=pool_address, error=str(e))
            return None
    
    async def get_balancer_pool_tokens(self, pool_address: str) -> Optional[List[str]]:
        """Get tokens from a Balancer pool."""
        try:
            # Balancer V2 Pool function signatures
            vault_sig = "0x8d928af8"  # getVault()
            pool_id_sig = "0x38fff2d0"  # getPoolId()
            
            # First get the vault address
            vault_result = await self.blockchain._make_rpc_call("eth_call", [
                {"to": pool_address, "data": vault_sig}, "latest"
            ])
            
            if vault_result == "0x":
                return None
            
            vault_address = "0x" + vault_result[-40:]
            
            # Get pool ID
            pool_id_result = await self.blockchain._make_rpc_call("eth_call", [
                {"to": pool_address, "data": pool_id_sig}, "latest"
            ])
            
            if pool_id_result == "0x":
                return None
            
            pool_id = pool_id_result
            
            # Query vault for pool tokens using getPoolTokens(bytes32 poolId)
            get_pool_tokens_sig = "0xf94d4668"  # getPoolTokens(bytes32)
            tokens_result = await self.blockchain._make_rpc_call("eth_call", [
                {"to": vault_address, "data": get_pool_tokens_sig + pool_id[2:]}, "latest"
            ])
            
            if tokens_result == "0x":
                return None
            
            # Parse token addresses from result
            # This is a simplified parsing - real implementation would need proper ABI decoding
            tokens = []
            data = tokens_result[2:]
            
            # Extract token addresses (this is simplified)
            # Real implementation would properly decode the array
            for i in range(0, min(len(data), 512), 64):  # Limit to reasonable number
                if i + 64 <= len(data):
                    token_hex = data[i+24:i+64]  # Skip padding, get 20 bytes
                    token_address = "0x" + token_hex
                    
                    if token_address != "0x" + "0" * 40:  # Skip zero address
                        # Only store token address (logs-only approach)
                        tokens.append(token_address)
                        
                        if len(tokens) >= 8:  # Limit to reasonable number
                            break
            
            return tokens if tokens else None
            
        except Exception as e:
            logger.error("Failed to get Balancer pool tokens", pool_address=pool_address, error=str(e))
            return None
    
    def supports_pool_state_tracking(self) -> bool:
        return True