from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
from enum import Enum


class TokenSource(str, Enum):
    """Source platforms for token creation."""
    CREATOR_COIN = "creator_coin"
    CLANKER = "clanker"


class TokenStatus(str, Enum):
    """Token processing status."""
    ACTIVE = "active"
    PROCESSING = "processing"
    ERROR = "error"
    AUDITED = "audited"


class PoolKey(BaseModel):
    """Pool key structure for UniswapV4 pools."""
    currency0: str = Field(..., description="First currency address")
    currency1: str = Field(..., description="Second currency address") 
    fee: int = Field(..., description="Pool fee tier")
    tick_spacing: int = Field(..., description="Tick spacing")
    hooks: str = Field(..., description="Hooks address")


class CreatorCoinEvent(BaseModel):
    """CreatorCoinCreated event data model."""
    
    # Event identifiers
    tx_hash: str = Field(..., description="Transaction hash")
    log_index: int = Field(..., description="Log index in transaction")
    block_number: int = Field(..., description="Block number")
    block_timestamp: datetime = Field(..., description="Block timestamp")
    contract_address: str = Field(..., description="Event contract address")
    
    # Event topics
    caller: str = Field(..., description="Caller address (indexed)")
    payout_recipient: str = Field(..., description="Payout recipient address (indexed)")
    platform_referrer: str = Field(..., description="Platform referrer address (indexed)")
    
    # Event data
    currency: str = Field(..., description="Base currency address")
    uri: str = Field(..., description="Token metadata URI")
    name: str = Field(..., description="Token name")
    symbol: str = Field(..., description="Token symbol")
    coin: str = Field(..., description="Created coin address")
    pool_key: PoolKey = Field(..., description="Pool key information")
    pool_key_hash: str = Field(..., description="Pool key hash")
    version: str = Field(..., description="Contract version")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ClankerTokenEvent(BaseModel):
    """TokenCreated event data model from Clanker."""
    
    # Event identifiers  
    tx_hash: str = Field(..., description="Transaction hash")
    log_index: int = Field(..., description="Log index in transaction")
    block_number: int = Field(..., description="Block number")
    block_timestamp: datetime = Field(..., description="Block timestamp")
    contract_address: str = Field(..., description="Event contract address")
    
    # Event topics
    token_address: str = Field(..., description="Token address (indexed)")
    token_admin: str = Field(..., description="Token admin address (indexed)")
    
    # Event data
    msg_sender: str = Field(..., description="Message sender address")
    token_image: Optional[str] = Field(None, description="Token image URL")
    token_name: str = Field(..., description="Token name")
    token_symbol: str = Field(..., description="Token symbol")
    token_metadata: str = Field(..., description="Token metadata JSON")
    token_context: str = Field(..., description="Token context JSON")
    starting_tick: int = Field(..., description="Starting tick for pool")
    pool_hook: str = Field(..., description="Pool hook address")
    pool_id: str = Field(..., description="Pool ID")
    paired_token: str = Field(..., description="Paired token address (usually WETH)")
    locker: str = Field(..., description="Locker contract address")
    mev_module: str = Field(..., description="MEV module address")
    extensions_supply: str = Field(..., description="Extensions supply (as string to handle large uint256 values)")
    extensions: List[str] = Field(default_factory=list, description="Extension addresses")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class TokenInfo(BaseModel):
    """Main token information model for storage."""
    
    # Core token identifiers
    token_address: str = Field(..., description="Token contract address", index=True)
    chain_id: int = Field(..., description="Blockchain chain ID", index=True)
    source: TokenSource = Field(..., description="Source platform", index=True)
    
    # Basic token info
    name: str = Field(..., description="Token name")
    symbol: str = Field(..., description="Token symbol")
    
    # Creator/Admin information
    creator: str = Field(..., description="Token creator address", index=True)
    admin: Optional[str] = Field(None, description="Token admin address (for Clanker tokens)")
    payout_recipient: Optional[str] = Field(None, description="Payout recipient (for Creator tokens)")
    platform_referrer: Optional[str] = Field(None, description="Platform referrer")
    
    # Pool/Liquidity information
    base_currency: Optional[str] = Field(None, description="Base currency for pool")
    paired_token: Optional[str] = Field(None, description="Paired token address")
    pool_address: Optional[str] = Field(None, description="Associated pool address")
    pool_id: Optional[str] = Field(None, description="Pool ID (for Clanker)")
    pool_key_hash: Optional[str] = Field(None, description="Pool key hash (for Creator)")
    
    # Pool configuration
    fee_tier: Optional[int] = Field(None, description="Pool fee tier")
    tick_spacing: Optional[int] = Field(None, description="Tick spacing")
    starting_tick: Optional[int] = Field(None, description="Starting tick")
    hooks_address: Optional[str] = Field(None, description="Hooks contract address")
    
    # Metadata
    image_url: Optional[str] = Field(None, description="Token image URL")
    metadata_uri: Optional[str] = Field(None, description="Metadata URI (IPFS, etc)")
    metadata_json: Optional[Dict[str, Any]] = Field(None, description="Parsed metadata")
    context_json: Optional[Dict[str, Any]] = Field(None, description="Context information")
    
    # Contract information
    locker_address: Optional[str] = Field(None, description="Locker contract")
    mev_module: Optional[str] = Field(None, description="MEV module")
    contract_version: Optional[str] = Field(None, description="Contract version")
    
    # Creation tracking
    creation_block: int = Field(..., description="Block number when created", index=True)
    creation_tx_hash: str = Field(..., description="Creation transaction hash", index=True)
    creation_timestamp: datetime = Field(..., description="Creation timestamp", index=True)
    creation_contract: str = Field(..., description="Contract that emitted the event")
    
    # Processing status
    status: TokenStatus = Field(default=TokenStatus.ACTIVE, description="Processing status", index=True)
    audit_status: Optional[str] = Field(None, description="Audit status")
    error_message: Optional[str] = Field(None, description="Error message if status is ERROR")
    
    # Additional data for extensibility
    raw_event_data: Dict[str, Any] = Field(default_factory=dict, description="Raw event data")
    additional_metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    
    # Repository tracking fields
    created_at: Optional[datetime] = Field(None, description="Database creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Database update timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
    
    @classmethod
    def from_creator_coin_event(cls, event: CreatorCoinEvent, chain_id: int) -> "TokenInfo":
        """Create TokenInfo from CreatorCoinCreated event."""
        return cls(
            token_address=event.coin,
            chain_id=chain_id,
            source=TokenSource.CREATOR_COIN,
            name=event.name,
            symbol=event.symbol,
            creator=event.caller,
            payout_recipient=event.payout_recipient,
            platform_referrer=event.platform_referrer if event.platform_referrer != "0x0000000000000000000000000000000000000000" else None,
            base_currency=event.currency,
            paired_token=event.pool_key.currency0 if event.pool_key.currency1 == event.coin else event.pool_key.currency1,
            pool_key_hash=event.pool_key_hash,
            fee_tier=event.pool_key.fee,
            tick_spacing=event.pool_key.tick_spacing,
            hooks_address=event.pool_key.hooks,
            metadata_uri=event.uri,
            contract_version=event.version,
            creation_block=event.block_number,
            creation_tx_hash=event.tx_hash,
            creation_timestamp=event.block_timestamp,
            creation_contract=event.contract_address,
            raw_event_data={
                "caller": event.caller,
                "payout_recipient": event.payout_recipient,
                "platform_referrer": event.platform_referrer,
                "currency": event.currency,
                "uri": event.uri,
                "pool_key": event.pool_key.model_dump(),
                "pool_key_hash": event.pool_key_hash,
                "version": event.version
            }
        )
    
    @classmethod 
    def from_clanker_token_event(cls, event: ClankerTokenEvent, chain_id: int) -> "TokenInfo":
        """Create TokenInfo from ClankerTokenEvent."""
        
        # Parse metadata and context JSON if available
        metadata_json = None
        context_json = None
        
        try:
            if event.token_metadata:
                import json
                metadata_json = json.loads(event.token_metadata)
        except (json.JSONDecodeError, Exception):
            pass
            
        try:
            if event.token_context:
                import json  
                context_json = json.loads(event.token_context)
        except (json.JSONDecodeError, Exception):
            pass
        
        return cls(
            token_address=event.token_address,
            chain_id=chain_id,
            source=TokenSource.CLANKER,
            name=event.token_name,
            symbol=event.token_symbol,
            creator=event.msg_sender,
            admin=event.token_admin,
            paired_token=event.paired_token,
            pool_id=event.pool_id,
            starting_tick=event.starting_tick,
            hooks_address=event.pool_hook,
            image_url=event.token_image if event.token_image else None,
            metadata_json=metadata_json,
            context_json=context_json,
            locker_address=event.locker,
            mev_module=event.mev_module,
            creation_block=event.block_number,
            creation_tx_hash=event.tx_hash,
            creation_timestamp=event.block_timestamp,
            creation_contract=event.contract_address,
            raw_event_data={
                "msg_sender": event.msg_sender,
                "token_admin": event.token_admin,
                "token_image": event.token_image,
                "token_metadata": event.token_metadata,
                "token_context": event.token_context,
                "starting_tick": event.starting_tick,
                "pool_hook": event.pool_hook,
                "pool_id": event.pool_id,
                "paired_token": event.paired_token,
                "locker": event.locker,
                "mev_module": event.mev_module,
                "extensions_supply": event.extensions_supply,
                "extensions": event.extensions
            }
        )
