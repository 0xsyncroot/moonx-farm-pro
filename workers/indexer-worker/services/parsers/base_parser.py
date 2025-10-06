"""Base protocol parser interface."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from datetime import datetime

from models.pool import PoolInfo, SwapEvent, LiquidityEvent, PoolProtocol
from ..base_blockchain import BaseBlockchainService


class BaseProtocolParser(ABC):
    """Base class for protocol-specific parsers."""
    
    def __init__(self, blockchain_service: BaseBlockchainService):
        self.blockchain = blockchain_service
        self.protocol = self.get_protocol()
    
    @abstractmethod
    def get_protocol(self) -> PoolProtocol:
        """Return the protocol this parser handles."""
        pass
    
    @abstractmethod
    async def parse_pool_created_event(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[PoolInfo]:
        """Parse pool creation event from log."""
        pass
    
    @abstractmethod
    def parse_swap_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[SwapEvent]:
        """Parse swap event from log."""
        pass
    
    async def get_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get current pool state (optional, protocol-specific)."""
        return None
    
    def supports_pool_state_tracking(self) -> bool:
        """Whether this protocol supports pool state tracking."""
        return False
    
    def supports_liquidity_tracking(self) -> bool:
        """Whether this protocol supports liquidity event tracking."""
        return False
    
    def parse_liquidity_event(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> Optional[LiquidityEvent]:
        """Parse liquidity modification event from log. Override in subclasses that support it."""
        return None
    
    async def update_pool_state_if_needed(self, pool_info: 'PoolInfo', force: bool = False) -> 'PoolInfo':
        """Update pool state only if needed or forced. Override in subclasses."""
        if force and self.supports_pool_state_tracking():
            pool_state = await self.get_pool_state(pool_info.pool_address)
            if pool_state:
                # Update pool_info with current state
                return self._apply_pool_state(pool_info, pool_state)
        return pool_info
    
    def _apply_pool_state(self, pool_info: 'PoolInfo', pool_state: dict) -> 'PoolInfo':
        """Apply pool state data to pool_info. Override in subclasses."""
        return pool_info
    
