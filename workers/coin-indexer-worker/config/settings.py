from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Dict, List, Optional
import os
import json
from pathlib import Path


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Database settings
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_database: str = "moonx_coin_indexer"
    
    # Redis settings
    redis_url: str = "redis://localhost:6379"
    redis_db: int = 0
    redis_key_prefix: str = "moonx:coins"
    
    # Worker settings  
    worker_interval_seconds: int = 15
    worker_batch_size: int = 100
    worker_max_retries: int = 3
    worker_retry_delay: int = 30
    
    # Blockchain settings
    default_chain_id: int = 8453  # Base
    max_blocks_per_request: int = 2000
    
    # Lock settings
    lock_timeout_seconds: int = 300
    lock_retry_delay: int = 5
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"
    
    # Kafka settings (optional)
    kafka_bootstrap_servers: Optional[str] = None
    kafka_topic_prefix: str = "moonx"
    kafka_enabled: bool = False
    
    # Telegram notification settings (optional)
    telegram_bot_token: Optional[str] = None
    telegram_chat_ids: Optional[List[str]] = None
    telegram_retake_chat_ids: Optional[List[str]] = None  # Separate channel for Retake tokens
    telegram_enabled: bool = False
    
    # ENS resolution RPC URLs (optional, for resolving creator addresses)
    ens_ethereum_rpc_url: str = "https://eth.llamarpc.com"
    ens_base_rpc_url: str = "https://base.llamarpc.com"
    ens_connection_timeout: int = 10  # seconds
    
    @field_validator('telegram_chat_ids', 'telegram_retake_chat_ids', mode='before')
    @classmethod
    def parse_telegram_chat_ids(cls, v):
        """Parse telegram_chat_ids and telegram_retake_chat_ids from JSON string if needed."""
        if v is None:
            return None
        
        # If already a list, return as is
        if isinstance(v, list):
            return v
        
        # If it's a string, try to parse as JSON
        if isinstance(v, str):
            # Handle nested quotes - strip outer quotes if they exist
            stripped = v.strip()
            if (stripped.startswith("'") and stripped.endswith("'")) or \
               (stripped.startswith('"') and stripped.endswith('"')):
                stripped = stripped[1:-1]
            
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return parsed
                else:
                    # If not a list, wrap it in a list
                    return [str(parsed)]
            except (json.JSONDecodeError, ValueError):
                # If JSON parsing fails, treat as single chat ID
                return [stripped]
        
        # For any other type, convert to string and wrap in list
        return [str(v)]
    
    # Scalability & Multithreading
    enable_distributed_processing: bool = True
    worker_pool_size: int = 4
    max_concurrent_contracts: int = 4    # Max contracts processed in parallel  
    max_concurrent_blocks: int = 3       # Max block ranges processed in parallel
    
    # Performance optimization
    database_batch_size: int = 100
    event_processing_batch_size: int = 50  # Batch size for event processing
    
    class Config:
        env_file = ".env"
        env_prefix = "MOONX_COIN_"


class ChainConfig:
    """Chain-specific configuration."""
    
    def __init__(
        self,
        chain_id: int,
        name: str,
        rpc_urls: List[str],
        block_time: int,
        start_block: int,
        contracts: Dict[str, Dict],
        backup_rpc_urls: Optional[List[str]] = None,
        confirmation_blocks: int = 5,
        max_block_range: int = 2000,
        monitoring: Optional[Dict] = None,
        performance: Optional[Dict] = None
    ):
        self.chain_id = chain_id
        self.name = name
        self.rpc_urls = rpc_urls  # Primary RPC URLs for round-robin
        self.backup_rpc_urls = backup_rpc_urls or []
        self.block_time = block_time  # Average block time in seconds
        self.confirmation_blocks = confirmation_blocks
        self.start_block = start_block
        self.max_block_range = max_block_range
        self.contracts = contracts  # Contract configurations with addresses and event mappings
        self.monitoring = monitoring or {}
        self.performance = performance or {}
    
    def get_contract_addresses(self) -> List[str]:
        """Get all contract addresses."""
        return [contract_config["address"] for contract_config in self.contracts.values()]
    
    def get_contract_address(self, contract_key: str) -> Optional[str]:
        """Get contract address by key."""
        contract = self.contracts.get(contract_key)
        return contract["address"] if contract else None
    
    def get_events_for_contract(self, contract_key: str) -> Dict[str, Dict]:
        """Get all events configuration for a specific contract."""
        contract = self.contracts.get(contract_key)
        return contract.get("events", {}) if contract else {}
    
    def get_event_signature(self, contract_key: str, event_name: str) -> Optional[str]:
        """Get event signature for a specific contract and event."""
        events = self.get_events_for_contract(contract_key)
        event = events.get(event_name)
        return event.get("signature") if event else None
    
    def get_event_parser(self, contract_key: str, event_name: str) -> Optional[str]:
        """Get parser name for a specific contract and event."""
        events = self.get_events_for_contract(contract_key)
        event = events.get(event_name)
        return event.get("parser") if event else None
    
    def get_all_event_signatures(self) -> Dict[str, List[str]]:
        """Get all event signatures grouped by contract address."""
        signatures = {}
        for contract_key, contract_config in self.contracts.items():
            address = contract_config["address"]
            events = contract_config.get("events", {})
            signatures[address] = [event_config["signature"] for event_config in events.values()]
        return signatures
    
    @classmethod
    def load_from_file(cls, config_path: Path) -> "ChainConfig":
        """Load chain configuration from JSON file."""
        import json
        
        with open(config_path, 'r') as f:
            data = json.load(f)
        
        # Validate required rpc_urls field
        rpc_urls = data.get("rpc_urls")
        if not rpc_urls or not isinstance(rpc_urls, list) or len(rpc_urls) == 0:
            raise ValueError(f"Invalid or missing 'rpc_urls' in config {config_path}. Must be a non-empty list.")
        
        return cls(
            chain_id=data["chain_id"],
            name=data["name"],
            rpc_urls=rpc_urls,
            block_time=data["block_time"],
            start_block=data["start_block"],
            contracts=data["contracts"],
            backup_rpc_urls=data.get("backup_rpc_urls"),
            confirmation_blocks=data.get("confirmation_blocks", 5),
            max_block_range=data.get("max_block_range", 2000),
            monitoring=data.get("monitoring"),
            performance=data.get("performance")
        )


def get_settings() -> Settings:
    """Get application settings."""
    return Settings()


def load_chain_configs() -> Dict[int, ChainConfig]:
    """Load all chain configurations from JSON files in chains/ directory."""
    configs = {}
    config_dir = Path(__file__).parent / "chains"
    
    if not config_dir.exists():
        raise FileNotFoundError(
            f"Chain configuration directory not found: {config_dir}. "
            "Please create the directory and add JSON configuration files."
        )
    
    json_files = list(config_dir.glob("*.json"))
    if not json_files:
        raise FileNotFoundError(
            f"No JSON configuration files found in: {config_dir}. "
            "Please add chain configuration files (e.g., base.json)."
        )
    
    for config_file in json_files:
        try:
            chain_config = ChainConfig.load_from_file(config_file)
            configs[chain_config.chain_id] = chain_config
        except Exception as e:
            print(f"Failed to load chain config {config_file}: {e}")
    
    return configs
