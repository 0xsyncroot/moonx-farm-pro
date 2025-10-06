"""Parser for Clanker TokenCreated events."""

from typing import List, Dict, Any, Optional
from datetime import datetime
import structlog
from web3 import Web3
from eth_abi import decode
import json

from models.token import ClankerTokenEvent


logger = structlog.get_logger(__name__)


class ClankerParser:
    """Parser for TokenCreated events from Clanker v4.0.0."""
    
    # ABI for decoding event data
    EVENT_ABI = {
        "anonymous": False,
        "inputs": [
            {"indexed": False, "name": "msgSender", "type": "address"},
            {"indexed": True, "name": "tokenAddress", "type": "address"},
            {"indexed": True, "name": "tokenAdmin", "type": "address"},
            {"indexed": False, "name": "tokenImage", "type": "string"},
            {"indexed": False, "name": "tokenName", "type": "string"},
            {"indexed": False, "name": "tokenSymbol", "type": "string"},
            {"indexed": False, "name": "tokenMetadata", "type": "string"},
            {"indexed": False, "name": "tokenContext", "type": "string"},
            {"indexed": False, "name": "startingTick", "type": "int24"},
            {"indexed": False, "name": "poolHook", "type": "address"},
            {"indexed": False, "name": "poolId", "type": "bytes32"},
            {"indexed": False, "name": "pairedToken", "type": "address"},
            {"indexed": False, "name": "locker", "type": "address"},
            {"indexed": False, "name": "mevModule", "type": "address"},
            {"indexed": False, "name": "extensionsSupply", "type": "uint256"},
            {"indexed": False, "name": "extensions", "type": "address[]"}
        ],
        "name": "TokenCreated",
        "type": "event"
    }
    
    def __init__(self, web3: Web3, event_signature: str):
        """Initialize the parser with Web3 instance and event signature."""
        self.web3 = web3
        self.event_signature = event_signature
        
        # ABI types for decoding data (non-indexed fields)
        self.data_types = [
            'address',   # msgSender
            'string',    # tokenImage
            'string',    # tokenName
            'string',    # tokenSymbol
            'string',    # tokenMetadata
            'string',    # tokenContext
            'int24',     # startingTick
            'address',   # poolHook
            'bytes32',   # poolId
            'address',   # pairedToken
            'address',   # locker
            'address',   # mevModule
            'uint256',   # extensionsSupply
            'address[]'  # extensions
        ]
    
    def can_parse(self, log: Dict[str, Any]) -> bool:
        """Check if this parser can handle the given log."""
        if not log.get("topics"):
            return False
        
        # Check if the first topic matches our event signature
        return log["topics"][0].hex() == self.event_signature
    
    def parse_log(self, log: Dict[str, Any], block_timestamp: datetime) -> Optional[ClankerTokenEvent]:
        """
        Parse a single log entry into a ClankerTokenEvent.
        
        Args:
            log: Raw log entry from blockchain
            block_timestamp: Timestamp of the block
            
        Returns:
            Parsed ClankerTokenEvent or None if parsing fails
        """
        try:
            if not self.can_parse(log):
                logger.warning("Log cannot be parsed by ClankerParser", 
                             tx_hash=log.get("transactionHash", {}).hex() if log.get("transactionHash") else None)
                return None
            
            # Decode indexed topics (tokenAddress, tokenAdmin)
            topics = log["topics"]
            token_address = topics[1].hex()[-40:]  # Remove 0x prefix and get last 40 chars
            token_admin = topics[2].hex()[-40:]
            
            # Add 0x prefix back
            token_address = Web3.to_checksum_address("0x" + token_address)
            token_admin = Web3.to_checksum_address("0x" + token_admin)
            
            # Decode non-indexed data fields
            data_bytes = bytes(log["data"])  # Convert HexBytes to bytes
            decoded_data = decode(self.data_types, data_bytes)
            
            # Extract decoded values
            msg_sender = Web3.to_checksum_address(decoded_data[0])
            token_image = decoded_data[1]
            token_name = decoded_data[2]
            token_symbol = decoded_data[3]
            token_metadata = decoded_data[4]
            token_context = decoded_data[5]
            starting_tick = decoded_data[6]
            pool_hook = Web3.to_checksum_address(decoded_data[7])
            pool_id = decoded_data[8].hex()
            paired_token = Web3.to_checksum_address(decoded_data[9])
            locker = Web3.to_checksum_address(decoded_data[10])
            mev_module = Web3.to_checksum_address(decoded_data[11])
            extensions_supply = str(decoded_data[12])  # Convert to string for MongoDB
            extensions = [Web3.to_checksum_address(addr) for addr in decoded_data[13]]
            
            logger.debug("Parsing Clanker TokenCreated event",
                        tx_hash=log["transactionHash"].hex(),
                        block_number=log["blockNumber"],
                        token_address=token_address,
                        token_name=token_name,
                        token_symbol=token_symbol)
            
            # Create ClankerTokenEvent
            event = ClankerTokenEvent(
                tx_hash=log["transactionHash"].hex(),
                log_index=log["logIndex"],
                block_number=log["blockNumber"],
                block_timestamp=block_timestamp,
                contract_address=Web3.to_checksum_address(log["address"]),
                token_address=token_address,
                token_admin=token_admin,
                msg_sender=msg_sender,
                token_image=token_image if token_image else None,
                token_name=token_name,
                token_symbol=token_symbol,
                token_metadata=token_metadata,
                token_context=token_context,
                starting_tick=starting_tick,
                pool_hook=pool_hook,
                pool_id=pool_id,
                paired_token=paired_token,
                locker=locker,
                mev_module=mev_module,
                extensions_supply=extensions_supply,
                extensions=extensions if extensions else []
            )
            
            logger.info("Successfully parsed Clanker TokenCreated event",
                       tx_hash=event.tx_hash,
                       block_number=event.block_number,
                       token_address=event.token_address,
                       token_name=event.token_name,
                       token_symbol=event.token_symbol,
                       creator=event.msg_sender,
                       admin=event.token_admin)
            
            return event
            
        except Exception as e:
            logger.error("Failed to parse Clanker TokenCreated event",
                        tx_hash=log.get("transactionHash", {}).hex() if log.get("transactionHash") else None,
                        block_number=log.get("blockNumber"),
                        error=str(e),
                        exception_type=type(e).__name__)
            return None
    
    def parse_logs(self, logs: List[Dict[str, Any]], block_timestamp: datetime) -> List[ClankerTokenEvent]:
        """
        Parse multiple logs into ClankerTokenEvents.
        
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
        
        logger.info("Parsed Clanker TokenCreated events",
                   total_logs=len(logs),
                   parsed_events=len(events),
                   failed_count=len(logs) - len(events))
        
        return events
    
    def get_event_signature(self) -> str:
        """Get the event signature for filtering logs."""
        return self.event_signature
