"""Protocol factory for managing different DEX protocol parsers."""

from typing import Dict, Optional
import structlog

from models.pool import PoolProtocol
from .parsers.base_parser import BaseProtocolParser
from .parsers.uniswap_parsers import UniswapV2Parser, UniswapV3Parser, UniswapV4Parser
from .parsers.aerodrome_parser import AerodromeParser
from .parsers.sushiswap_parsers import SushiSwapV2Parser, SushiSwapV3Parser
from .parsers.pancakeswap_parsers import PancakeSwapV2Parser, PancakeSwapV3Parser
from .parsers.balancer_parser import BalancerV2Parser
from .parsers.curve_parser import CurveParser
from .base_blockchain import BaseBlockchainService

logger = structlog.get_logger()


class ProtocolFactory:
    """Factory for creating and managing protocol parsers."""
    
    def __init__(self, blockchain_service: BaseBlockchainService):
        self.blockchain_service = blockchain_service
        self._parsers: Dict[PoolProtocol, BaseProtocolParser] = {}
        self._initialize_parsers()
    
    def _initialize_parsers(self) -> None:
        """Initialize all available protocol parsers."""
        try:
            # Uniswap parsers (logs-only, no token fetching)
            self._parsers[PoolProtocol.UNISWAP_V2] = UniswapV2Parser(
                self.blockchain_service
            )
            self._parsers[PoolProtocol.UNISWAP_V3] = UniswapV3Parser(
                self.blockchain_service
            )
            self._parsers[PoolProtocol.UNISWAP_V4] = UniswapV4Parser(
                self.blockchain_service
            )
            
            # Aerodrome parser (Base chain native)
            self._parsers[PoolProtocol.AERODROME] = AerodromeParser(
                self.blockchain_service
            )
            
            # SushiSwap parsers
            self._parsers[PoolProtocol.SUSHISWAP] = SushiSwapV2Parser(
                self.blockchain_service
            )
            self._parsers[PoolProtocol.SUSHISWAP_V3] = SushiSwapV3Parser(
                self.blockchain_service
            )
            
            # PancakeSwap parsers
            self._parsers[PoolProtocol.PANCAKESWAP_V2] = PancakeSwapV2Parser(
                self.blockchain_service
            )
            self._parsers[PoolProtocol.PANCAKESWAP_V3] = PancakeSwapV3Parser(
                self.blockchain_service
            )
            
            # Balancer parser
            self._parsers[PoolProtocol.BALANCER_V2] = BalancerV2Parser(
                self.blockchain_service
            )
            
            # Curve parser
            self._parsers[PoolProtocol.CURVE] = CurveParser(
                self.blockchain_service
            )
            
            logger.info("Initialized protocol parsers", 
                       parser_count=len(self._parsers),
                       protocols=[p.value for p in self._parsers.keys()])
                       
        except Exception as e:
            logger.error("Failed to initialize protocol parsers", error=str(e))
            raise
    

    
    def get_parser(self, protocol: PoolProtocol) -> Optional[BaseProtocolParser]:
        """Get parser for specified protocol."""
        return self._parsers.get(protocol)
    
    def get_parser_by_name(self, protocol_name: str) -> Optional[BaseProtocolParser]:
        """Get parser by protocol name string."""
        try:
            protocol = PoolProtocol(protocol_name)
            return self.get_parser(protocol)
        except ValueError:
            logger.warning("Unknown protocol name", protocol=protocol_name)
            return None
    
    def get_supported_protocols(self) -> list[PoolProtocol]:
        """Get list of supported protocols."""
        return list(self._parsers.keys())
    
    def supports_protocol(self, protocol: PoolProtocol) -> bool:
        """Check if protocol is supported."""
        return protocol in self._parsers
    
    def get_parsers_with_state_tracking(self) -> Dict[PoolProtocol, BaseProtocolParser]:
        """Get parsers that support pool state tracking."""
        return {
            protocol: parser 
            for protocol, parser in self._parsers.items()
            if parser.supports_pool_state_tracking()
        }
    
    def reload_parsers(self) -> None:
        """Reload all parsers (useful for hot-reloading)."""
        logger.info("Reloading protocol parsers")
        self._parsers.clear()
        self._initialize_parsers()
    
    def get_parser_info(self) -> Dict[str, Dict[str, any]]:
        """Get information about all registered parsers."""
        info = {}
        for protocol, parser in self._parsers.items():
            info[protocol.value] = {
                "class": parser.__class__.__name__,
                "supports_state_tracking": parser.supports_pool_state_tracking(),
                "protocol": protocol.value
            }
        return info