"""Parser for CreatorCoinCreated events."""

from typing import List, Dict, Any, Optional
from datetime import datetime
import structlog
from web3 import Web3
from eth_abi import decode

from models.token import CreatorCoinEvent, PoolKey


logger = structlog.get_logger(__name__)


class CreatorCoinParser:
    """Parser for CreatorCoinCreated events from creator coin factory contract."""
    
    # ABI for decoding event data
    EVENT_ABI = {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "caller", "type": "address"},
            {"indexed": True, "name": "payoutRecipient", "type": "address"},
            {"indexed": True, "name": "platformReferrer", "type": "address"},
            {"indexed": False, "name": "currency", "type": "address"},
            {"indexed": False, "name": "uri", "type": "string"},
            {"indexed": False, "name": "name", "type": "string"},
            {"indexed": False, "name": "symbol", "type": "string"},
            {"indexed": False, "name": "coin", "type": "address"},
            {"indexed": False, "name": "poolKey", "type": "tuple", "components": [
                {"name": "currency0", "type": "address"},
                {"name": "currency1", "type": "address"},
                {"name": "fee", "type": "uint24"},
                {"name": "tickSpacing", "type": "int24"},
                {"name": "hooks", "type": "address"}
            ]},
            {"indexed": False, "name": "poolKeyHash", "type": "bytes32"},
            {"indexed": False, "name": "version", "type": "string"}
        ],
        "name": "CreatorCoinCreated",
        "type": "event"
    }
    
    def __init__(self, web3: Web3, event_signature: str):
        """Initialize the parser with Web3 instance and event signature."""
        self.web3 = web3
        self.event_signature = event_signature
        
        # ABI types for decoding data (non-indexed fields)
        self.data_types = [
            'address',   # currency
            'string',    # uri
            'string',    # name
            'string',    # symbol
            'address',   # coin
            '(address,address,uint24,int24,address)',  # poolKey tuple
            'bytes32',   # poolKeyHash
            'string'     # version
        ]
    
    def can_parse(self, log: Dict[str, Any]) -> bool:
        """Check if this parser can handle the given log."""
        if not log.get("topics"):
            return False
        
        # Check if the first topic matches our event signature
        return log["topics"][0].hex() == self.event_signature
    
    def parse_log(self, log: Dict[str, Any], block_timestamp: datetime) -> Optional[CreatorCoinEvent]:
        """
        Parse a single log entry into a CreatorCoinEvent.
        
        Args:
            log: Raw log entry from blockchain
            block_timestamp: Timestamp of the block
            
        Returns:
            Parsed CreatorCoinEvent or None if parsing fails
        """
        try:
            if not self.can_parse(log):
                logger.warning("Log cannot be parsed by CreatorCoinParser", 
                             tx_hash=log.get("transactionHash", {}).hex() if log.get("transactionHash") else None)
                return None
            
            # Decode indexed topics (caller, payoutRecipient, platformReferrer)
            topics = log["topics"]
            caller = topics[1].hex()[-40:]  # Remove 0x prefix and get last 40 chars
            payout_recipient = topics[2].hex()[-40:]
            platform_referrer = topics[3].hex()[-40:]
            
            # Add 0x prefix back
            caller = Web3.to_checksum_address("0x" + caller)
            payout_recipient = Web3.to_checksum_address("0x" + payout_recipient)
            platform_referrer = Web3.to_checksum_address("0x" + platform_referrer)
            
            # Decode non-indexed data fields
            data_bytes = bytes(log["data"])  # Convert HexBytes to bytes
            decoded_data = decode(self.data_types, data_bytes)
            
            # Extract decoded values
            currency = Web3.to_checksum_address(decoded_data[0])
            uri = decoded_data[1]
            name = decoded_data[2]
            symbol = decoded_data[3]
            coin = Web3.to_checksum_address(decoded_data[4])
            pool_key_tuple = decoded_data[5]
            pool_key_hash = decoded_data[6].hex()
            version = decoded_data[7]
            
            logger.debug("Parsing CreatorCoinCreated event",
                        tx_hash=log["transactionHash"].hex(),
                        block_number=log["blockNumber"],
                        coin=coin,
                        name=name,
                        symbol=symbol)
            
            # Extract pool key data
            pool_key = PoolKey(
                currency0=Web3.to_checksum_address(pool_key_tuple[0]),  # currency0
                currency1=Web3.to_checksum_address(pool_key_tuple[1]),  # currency1
                fee=pool_key_tuple[2],        # fee
                tick_spacing=pool_key_tuple[3],  # tickSpacing
                hooks=Web3.to_checksum_address(pool_key_tuple[4])       # hooks
            )
            
            # Create CreatorCoinEvent
            event = CreatorCoinEvent(
                tx_hash=log["transactionHash"].hex(),
                log_index=log["logIndex"],
                block_number=log["blockNumber"],
                block_timestamp=block_timestamp,
                contract_address=Web3.to_checksum_address(log["address"]),
                caller=caller,
                payout_recipient=payout_recipient,
                platform_referrer=platform_referrer,
                currency=currency,
                uri=uri,
                name=name,
                symbol=symbol,
                coin=coin,
                pool_key=pool_key,
                pool_key_hash=pool_key_hash,
                version=version
            )
            
            logger.info("Successfully parsed CreatorCoinCreated event",
                       tx_hash=event.tx_hash,
                       block_number=event.block_number,
                       coin_address=event.coin,
                       coin_name=event.name,
                       coin_symbol=event.symbol,
                       creator=event.caller)
            
            return event
            
        except Exception as e:
            logger.error("Failed to parse CreatorCoinCreated event",
                        tx_hash=log.get("transactionHash", {}).hex() if log.get("transactionHash") else None,
                        block_number=log.get("blockNumber"),
                        error=str(e),
                        exception_type=type(e).__name__)
            return None
    
    def parse_logs(self, logs: List[Dict[str, Any]], block_timestamp: datetime) -> List[CreatorCoinEvent]:
        """
        Parse multiple logs into CreatorCoinEvents.
        
        Args:
            logs: List of raw log entries
            block_timestamp: Timestamp of the block
            
        Returns:
            List of successfully parsed events
        """
        events = []
        
        for log in logs:
            event = self.parse_log(log, block_timestamp)
            if event:
                events.append(event)
        
        logger.info("Parsed CreatorCoinCreated events",
                   total_logs=len(logs),
                   parsed_events=len(events),
                   failed_count=len(logs) - len(events))
        
        return events
    
    def get_event_signature(self) -> str:
        """Get the event signature for filtering logs."""
        return self.event_signature
