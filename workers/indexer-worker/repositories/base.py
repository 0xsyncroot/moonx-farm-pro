from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from models.pool import PoolInfo, SwapEvent, PoolLiquidity, IndexerProgress, PriceCalculation


class BaseRepository(ABC):
    """Base repository interface."""
    
    @abstractmethod
    async def connect(self) -> None:
        """Connect to the data store."""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Disconnect from the data store."""
        pass
    
    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the data store is healthy."""
        pass


class PoolRepository(BaseRepository):
    """Pool data repository interface."""
    
    @abstractmethod
    async def save_pool(self, pool: PoolInfo) -> None:
        """Save pool information."""
        pass
    
    @abstractmethod
    async def get_pool(self, chain_id: int, pool_address: str) -> Optional[PoolInfo]:
        """Get pool information by address."""
        pass
    
    @abstractmethod
    async def get_pools_by_chain(self, chain_id: int, limit: int = 100, offset: int = 0) -> List[PoolInfo]:
        """Get pools by chain ID."""
        pass
    
    @abstractmethod
    async def update_pool_status(self, chain_id: int, pool_address: str, status: str, last_indexed_block: int) -> None:
        """Update pool status and last indexed block."""
        pass
    
    @abstractmethod
    async def save_swap_event(self, event: SwapEvent) -> None:
        """Save swap event."""
        pass
    
    @abstractmethod
    async def get_swap_events(
        self, 
        chain_id: int, 
        pool_address: Optional[str] = None,
        from_block: Optional[int] = None,
        to_block: Optional[int] = None,
        limit: int = 100
    ) -> List[SwapEvent]:
        """Get swap events with filters."""
        pass
    
    @abstractmethod
    async def save_pool_liquidity(self, liquidity: PoolLiquidity) -> None:
        """Save pool liquidity snapshot."""
        pass
    
    @abstractmethod
    async def get_latest_liquidity(self, chain_id: int, pool_address: str) -> Optional[PoolLiquidity]:
        """Get latest liquidity snapshot for a pool."""
        pass
    
    @abstractmethod
    async def save_price_calculation(self, price_calc: PriceCalculation) -> None:
        """Save price calculation."""
        pass
    
    @abstractmethod
    async def get_price_calculations(
        self, 
        chain_id: int, 
        pool_address: Optional[str] = None,
        from_block: Optional[int] = None,
        to_block: Optional[int] = None,
        limit: int = 100
    ) -> List[PriceCalculation]:
        """Get price calculations with filters."""
        pass
    
    @abstractmethod
    async def get_latest_price(self, chain_id: int, pool_address: str) -> Optional[PriceCalculation]:
        """Get latest price calculation for a pool."""
        pass


class ProgressRepository(BaseRepository):
    """Progress tracking repository interface."""
    
    @abstractmethod
    async def save_progress(self, progress: IndexerProgress) -> None:
        """Save indexer progress."""
        pass
    
    @abstractmethod
    async def get_progress(self, chain_id: int, indexer_type: str, pool_address: Optional[str] = None) -> Optional[IndexerProgress]:
        """Get indexer progress."""
        pass
    
    @abstractmethod
    async def update_progress(
        self, 
        chain_id: int, 
        indexer_type: str, 
        last_processed_block: int,
        pool_address: Optional[str] = None,
        status: Optional[str] = None,
        error_message: Optional[str] = None
    ) -> None:
        """Update indexer progress."""
        pass


class CacheRepository(BaseRepository):
    """Cache repository interface."""
    
    @abstractmethod
    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> None:
        """Set cache value."""
        pass
    
    @abstractmethod
    async def get(self, key: str) -> Optional[str]:
        """Get cache value."""
        pass
    
    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete cache value."""
        pass
    
    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        pass
    
    @abstractmethod
    async def acquire_lock(self, key: str, ttl: int) -> bool:
        """Acquire distributed lock."""
        pass
    
    @abstractmethod
    async def release_lock(self, key: str) -> None:
        """Release distributed lock."""
        pass
    
    @abstractmethod
    async def extend_lock(self, key: str, ttl: int) -> bool:
        """Extend lock timeout."""
        pass