"""Refactored blockchain service with modular architecture."""

from typing import Dict, Any, Optional
from datetime import datetime
import structlog

from config.settings import ChainConfig, Settings
from models.pool import PoolInfo, SwapEvent, LiquidityEvent, PriceCalculation
from .base_blockchain import BaseBlockchainService
from .price_calculator import PriceCalculationService
from .protocol_factory import ProtocolFactory

logger = structlog.get_logger()


class BlockchainService:
    """Main blockchain service orchestrating all components."""
    
    def __init__(self, chain_config: ChainConfig, settings: Optional[Settings] = None):
        # Initialize core services with settings (no token service - logs only)
        self.settings = settings or Settings()
        self.base_blockchain = BaseBlockchainService(chain_config, self.settings)
        self.price_calculator = PriceCalculationService(self.base_blockchain)
        self.protocol_factory = ProtocolFactory(self.base_blockchain)
        
        # Expose chain config for compatibility
        self.chain_config = chain_config
    
    async def connect(self) -> None:
        """Connect to blockchain RPC."""
        await self.base_blockchain.connect()
        logger.info("Blockchain service connected with modular architecture",
                   chain_id=self.chain_config.chain_id,
                   supported_protocols=len(self.protocol_factory.get_supported_protocols()))
    
    async def disconnect(self) -> None:
        """Disconnect from blockchain."""
        await self.base_blockchain.disconnect()
    
    # Expose base blockchain methods
    async def get_latest_block(self) -> int:
        """Get latest block number."""
        return await self.base_blockchain.get_latest_block()
    
    async def get_block_timestamp(self, block_number: int) -> datetime:
        """Get block timestamp."""
        return await self.base_blockchain.get_block_timestamp(block_number)
    
    async def get_logs(
        self, 
        from_block: int, 
        to_block: int, 
        address: Optional[str] = None,
        topics: Optional[list[str]] = None
    ) -> list[Dict[str, Any]]:
        """Get logs from blockchain."""
        return await self.base_blockchain.get_logs(from_block, to_block, address, topics)
    
    # Token service methods
    async def get_token_info(self, token_address: str, include_market_data: bool = False):
        """Get token information."""
        return await self.token_service.get_token_info(token_address, include_market_data)
    
    # Protocol parsing methods
    async def parse_pool_created_event(self, log: Dict[str, Any], protocol: str) -> Optional[PoolInfo]:
        """Parse pool creation event using appropriate protocol parser."""
        try:
            # Get block timestamp
            block_number = int(log["blockNumber"], 16)
            block_timestamp = await self.get_block_timestamp(block_number)
            
            # Get appropriate parser
            parser = self.protocol_factory.get_parser_by_name(protocol)
            if not parser:
                logger.warning("Unsupported protocol for pool creation", protocol=protocol)
                return None
            
            return await parser.parse_pool_created_event(log, block_number, block_timestamp)
            
        except Exception as e:
            logger.error("Failed to parse pool created event", 
                        protocol=protocol, error=str(e))
            return None
    
    async def parse_swap_event(self, log: Dict[str, Any], pool_info: PoolInfo) -> Optional[SwapEvent]:
        """Parse swap event using appropriate protocol parser."""
        try:
            # Get block timestamp
            block_number = int(log["blockNumber"], 16)
            block_timestamp = await self.get_block_timestamp(block_number)
            
            # Get appropriate parser
            parser = self.protocol_factory.get_parser(pool_info.protocol)
            if not parser:
                logger.warning("Unsupported protocol for swap event", protocol=pool_info.protocol)
                return None
            
            return parser.parse_swap_event(log, pool_info, block_number, block_timestamp)
            
        except Exception as e:
            logger.error("Failed to parse swap event", 
                        protocol=pool_info.protocol, error=str(e))
            return None
    
    async def parse_liquidity_event(self, log: Dict[str, Any], pool_info: PoolInfo) -> Optional[LiquidityEvent]:
        """Parse liquidity event using appropriate protocol parser."""
        try:
            # Get block timestamp
            block_number = int(log["blockNumber"], 16)
            block_timestamp = await self.get_block_timestamp(block_number)
            
            # Get appropriate parser
            parser = self.protocol_factory.get_parser(pool_info.protocol)
            if not parser:
                logger.warning("Unsupported protocol for liquidity event", protocol=pool_info.protocol)
                return None
            
            # Check if parser supports liquidity tracking
            if not parser.supports_liquidity_tracking():
                return None
            
            return parser.parse_liquidity_event(log, pool_info, block_number, block_timestamp)
            
        except Exception as e:
            logger.error("Failed to parse liquidity event", 
                        protocol=pool_info.protocol, error=str(e))
            return None
    
    # Price calculation methods
    async def create_price_calculation_from_swap(
        self, 
        swap_event: SwapEvent, 
        pool_info: PoolInfo,
        sqrt_price_x96_after: Optional[str] = None
    ) -> PriceCalculation:
        """Create price calculation from swap event."""
        return await self.price_calculator.create_price_calculation_from_swap(
            swap_event, pool_info, sqrt_price_x96_after
        )
    
    async def create_price_calculation_from_pool_state(
        self, 
        pool_info: PoolInfo, 
        block_number: int, 
        tx_hash: str
    ) -> Optional[PriceCalculation]:
        """Create price calculation from current pool state."""
        return await self.price_calculator.create_price_calculation_from_pool_state(
            pool_info, block_number, tx_hash
        )
    
    # Pool state methods
    async def get_pool_state(self, pool_address: str, protocol: str) -> Optional[Dict[str, Any]]:
        """Get pool state using appropriate protocol parser."""
        try:
            parser = self.protocol_factory.get_parser_by_name(protocol)
            if not parser or not parser.supports_pool_state_tracking():
                return None
            
            return await parser.get_pool_state(pool_address)
            
        except Exception as e:
            logger.error("Failed to get pool state", 
                        pool_address=pool_address, protocol=protocol, error=str(e))
            return None
    
    # Legacy compatibility methods (delegating to appropriate services)
    async def get_uniswap_v3_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Uniswap V3 pool state (legacy compatibility)."""
        return await self.get_pool_state(pool_address, "uniswap_v3")
    
    async def get_uniswap_v2_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Uniswap V2 pool state (legacy compatibility)."""
        return await self.get_pool_state(pool_address, "uniswap_v2")
    
    def _calculate_prices_from_sqrt_price(
        self, 
        sqrt_price_x96: str, 
        token0_decimals: int, 
        token1_decimals: int
    ) -> Dict[str, str]:
        """Calculate prices from sqrt price (legacy compatibility)."""
        return self.price_calculator._calculate_prices_from_sqrt_price(
            sqrt_price_x96, token0_decimals, token1_decimals
        )
    
    # Service management methods
    def get_supported_protocols(self) -> list[str]:
        """Get list of supported protocols."""
        return [p.value for p in self.protocol_factory.get_supported_protocols()]
    
    def get_protocol_info(self) -> Dict[str, Dict[str, any]]:
        """Get information about supported protocols."""
        return self.protocol_factory.get_parser_info()
    
    def supports_protocol(self, protocol: str) -> bool:
        """Check if protocol is supported."""
        parser = self.protocol_factory.get_parser_by_name(protocol)
        return parser is not None
    
    def clear_token_cache(self) -> None:
        """Clear token information cache."""
        self.token_service.clear_cache()
    
    def reload_protocol_parsers(self) -> None:
        """Reload protocol parsers (useful for development)."""
        self.protocol_factory.reload_parsers()
    
    # Health check methods
    async def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check."""
        health = {
            "status": "healthy",
            "chain_id": self.chain_config.chain_id,
            "chain_name": self.chain_config.name,
            "components": {}
        }
        
        try:
            # Check RPC connection
            latest_block = await self.get_latest_block()
            health["components"]["rpc"] = {
                "status": "healthy",
                "latest_block": latest_block
            }
        except Exception as e:
            health["components"]["rpc"] = {
                "status": "unhealthy", 
                "error": str(e)
            }
            health["status"] = "unhealthy"
        
        # Check protocol parsers
        try:
            supported_protocols = self.get_supported_protocols()
            health["components"]["protocols"] = {
                "status": "healthy",
                "count": len(supported_protocols),
                "supported": supported_protocols
            }
        except Exception as e:
            health["components"]["protocols"] = {
                "status": "unhealthy",
                "error": str(e)
            }
            health["status"] = "unhealthy"
        
        return health