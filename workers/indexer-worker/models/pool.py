from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class PoolProtocol(str, Enum):
    """Supported pool protocols."""
    UNISWAP_V2 = "uniswap_v2"
    UNISWAP_V3 = "uniswap_v3"
    UNISWAP_V4 = "uniswap_v4"
    SUSHISWAP = "sushiswap"
    SUSHISWAP_V3 = "sushiswap_v3"
    PANCAKESWAP_V2 = "pancakeswap_v2"
    PANCAKESWAP_V3 = "pancakeswap_v3"
    BALANCER_V2 = "balancer_v2"
    CURVE = "curve"
    AERODROME = "aerodrome"


class PoolStatus(str, Enum):
    """Pool indexing status."""
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"


# TokenInfo model removed completely
# Only use token addresses from pool creation logs


class PoolInfo(BaseModel):
    """Optimized liquidity pool information model for indexing."""
    
    # Core pool identifiers - essential
    pool_address: str = Field(..., description="Pool contract address")
    chain_id: int = Field(..., description="Blockchain chain ID")
    protocol: PoolProtocol = Field(..., description="Pool protocol")
    
    # Token addresses - directly from pool creation logs only
    token0_address: str = Field(..., description="First token address from pool creation event")
    token1_address: str = Field(..., description="Second token address from pool creation event")
    
    # Pool configuration - essential  
    fee_tier: Optional[str] = Field(None, description="Pool fee tier (for V3) - stored as string to avoid 64-bit limits")
    tick_spacing: Optional[str] = Field(None, description="Tick spacing for V3 pools - stored as string to avoid 64-bit limits")
    factory_address: str = Field(..., description="Factory contract address")
    
    # Creation information - essential for tracking
    creation_block: int = Field(..., description="Block number when pool was created")
    creation_tx_hash: str = Field(..., description="Transaction hash of pool creation")
    creation_timestamp: datetime = Field(..., description="Pool creation timestamp")
    
    # Indexing status - essential for processing
    status: PoolStatus = Field(default=PoolStatus.ACTIVE, description="Pool status")
    last_indexed_block: int = Field(default=0, description="Last processed block")
    
    # Current pool state - for DEX operations
    current_liquidity: Optional[str] = Field(None, description="Current total liquidity")
    current_sqrt_price_x96: Optional[str] = Field(None, description="Current sqrt price for V3")
    current_tick: Optional[int] = Field(None, description="Current tick for V3")
    
    # Reserve information - essential for V2 style pools
    reserve0: Optional[str] = Field(None, description="Current reserve of token0")
    reserve1: Optional[str] = Field(None, description="Current reserve of token1")
    
    # Price calculation removed - store raw reserves/sqrt_price only
    
    # Minimal additional data for flexibility
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional pool metadata")
    
    # Last state update - for data freshness
    state_updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last state update timestamp")
    
    # Repository-added tracking fields
    created_at: Optional[datetime] = Field(None, description="Database creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Database update timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class SwapEvent(BaseModel):
    """Swap event model."""
    
    # Event identifiers
    tx_hash: str = Field(..., description="Transaction hash")
    log_index: int = Field(..., description="Log index in transaction")
    pool_address: str = Field(..., description="Pool contract address")
    chain_id: int = Field(..., description="Blockchain chain ID")
    
    # Block information
    block_number: int = Field(..., description="Block number")
    block_timestamp: datetime = Field(..., description="Block timestamp")
    
    # Swap details
    sender: str = Field(..., description="Sender address")
    recipient: str = Field(..., description="Recipient address")
    amount0_in: str = Field(..., description="Amount of token0 input")
    amount1_in: str = Field(..., description="Amount of token1 input")
    amount0_out: str = Field(..., description="Amount of token0 output")
    amount1_out: str = Field(..., description="Amount of token1 output")
    
    # Price information (calculated from onchain amounts)
    price: Optional[str] = Field(None, description="Calculated price from swap amounts")
    
    # Gas information
    gas_used: Optional[int] = Field(None, description="Gas used for transaction")
    gas_price: Optional[str] = Field(None, description="Gas price")
    
    # Processing metadata
    processed_at: datetime = Field(default_factory=datetime.utcnow, description="When event was processed")
    
    # Repository-added tracking fields
    created_at: Optional[datetime] = Field(None, description="Database creation timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PoolLiquidity(BaseModel):
    """Pool liquidity snapshot model."""
    
    # Identifiers
    pool_address: str = Field(..., description="Pool contract address")
    chain_id: int = Field(..., description="Blockchain chain ID")
    
    # Block information
    block_number: int = Field(..., description="Block number")
    block_timestamp: datetime = Field(..., description="Block timestamp")
    
    # Liquidity data
    total_liquidity: str = Field(..., description="Total liquidity in pool")
    reserve0: str = Field(..., description="Reserve of token0")
    reserve1: str = Field(..., description="Reserve of token1")
    
    # Price information (calculated from onchain reserves)
    token0_price: Optional[str] = Field(None, description="Price of token0 in token1")
    token1_price: Optional[str] = Field(None, description="Price of token1 in token0")
    
    # Processing metadata
    processed_at: datetime = Field(default_factory=datetime.utcnow, description="When snapshot was taken")
    
    # Repository-added tracking fields
    created_at: Optional[datetime] = Field(None, description="Database creation timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class LiquidityEvent(BaseModel):
    """Liquidity modification event model for Uniswap V4."""
    
    # Event identifiers
    tx_hash: str = Field(..., description="Transaction hash")
    log_index: int = Field(..., description="Log index in transaction")
    pool_address: str = Field(..., description="Pool contract address")
    chain_id: int = Field(..., description="Blockchain chain ID")
    
    # Block information
    block_number: int = Field(..., description="Block number")
    block_timestamp: datetime = Field(..., description="Block timestamp")
    
    # Liquidity modification details
    sender: str = Field(..., description="Sender address")
    tick_lower: int = Field(..., description="Lower tick of position")
    tick_upper: int = Field(..., description="Upper tick of position")
    liquidity_delta: str = Field(..., description="Change in liquidity (positive for add, negative for remove)")
    salt: str = Field(..., description="Salt for position identification")
    
    # Processing metadata
    processed_at: datetime = Field(default_factory=datetime.utcnow, description="When event was processed")
    
    # Repository-added tracking fields
    created_at: Optional[datetime] = Field(None, description="Database creation timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PriceCalculation(BaseModel):
    """Price calculation model for swap events and pool states."""
    
    # Identifiers
    pool_address: str = Field(..., description="Pool contract address")
    chain_id: int = Field(..., description="Blockchain chain ID")
    
    # Transaction information
    tx_hash: str = Field(..., description="Transaction hash")
    block_number: int = Field(..., description="Block number")
    timestamp: int = Field(..., description="Block timestamp (Unix timestamp)")
    
    # Price calculation - using string to avoid precision loss and scientific notation
    price: str = Field(..., description="Calculated price (token1/token0)")
    
    # Token amounts (positive for inflow, negative for outflow)
    amount0: str = Field(..., description="Amount of token0 (can be negative)")
    amount1: str = Field(..., description="Amount of token1 (can be negative)")
    
    # Token addresses
    token0: str = Field(..., description="Token0 contract address")
    token1: str = Field(..., description="Token1 contract address")
    
    # Price context - using string for consistency and precision
    price_impact: Optional[str] = Field(None, description="Price impact percentage")
    price_before: Optional[str] = Field(None, description="Price before transaction")
    price_after: Optional[str] = Field(None, description="Price after transaction")
    
    # Liquidity context (onchain pool state)
    liquidity_before: Optional[str] = Field(None, description="Pool liquidity before transaction")
    liquidity_after: Optional[str] = Field(None, description="Pool liquidity after transaction")
    
    # DEX protocol information
    protocol: PoolProtocol = Field(..., description="DEX protocol")
    fee_tier: Optional[int] = Field(None, description="Fee tier for V3 pools")
    
    # Price derivation method
    calculation_method: str = Field(..., description="How price was calculated (swap, tick, reserves)")
    
    # Processing metadata
    processed_at: datetime = Field(default_factory=datetime.utcnow, description="When price was calculated")
    
    # Repository-added tracking fields
    created_at: Optional[datetime] = Field(None, description="Database creation timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class IndexerProgress(BaseModel):
    """Indexer progress tracking model."""
    
    # Identifiers
    chain_id: int = Field(..., description="Blockchain chain ID")
    pool_address: Optional[str] = Field(None, description="Pool address (if pool-specific)")
    indexer_type: str = Field(..., description="Type of indexer (pools, swaps, liquidity)")
    
    # Progress information
    last_processed_block: int = Field(..., description="Last successfully processed block")
    target_block: Optional[int] = Field(None, description="Target block to process")
    
    # Status
    status: str = Field(default="running", description="Current indexer status")
    error_message: Optional[str] = Field(None, description="Last error message")
    
    # Timestamps
    started_at: Optional[datetime] = Field(None, description="When indexing started")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update time")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }