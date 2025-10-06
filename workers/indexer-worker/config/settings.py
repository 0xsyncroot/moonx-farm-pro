from pydantic_settings import BaseSettings
from typing import Dict, List, Optional
import os
from pathlib import Path


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Database settings
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_database: str = "moonx_indexer"
    
    # Redis settings
    redis_url: str = "redis://localhost:6379"
    redis_db: int = 0
    redis_key_prefix: str = "moonx:indexer"
    
    # Worker settings  
    worker_interval_seconds: int = 15  # Reduced to 15 seconds for faster swap processing
    worker_batch_size: int = 100
    worker_max_retries: int = 3
    worker_retry_delay: int = 30
    
    # Blockchain settings
    default_chain_id: int = 8453  # Base
    rpc_timeout: int = 60  # Increased for reliability
    rpc_request_timeout: int = 90  # Individual request timeout  
    rpc_max_retries: int = 3  # Method-level retries
    rpc_retry_delay: int = 2  # Base delay between retries
    max_blocks_per_request: int = 2000
    
    # Lock settings
    lock_timeout_seconds: int = 300  # 5 minutes
    lock_retry_delay: int = 5
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"
    
    # Scalability  
    enable_distributed_processing: bool = True
    worker_pool_size: int = 4
    
    # Performance optimization
    max_concurrent_protocols: int = 4  # Max protocols to process in parallel
    max_concurrent_logs_per_protocol: int = 20  # Max logs per protocol in parallel
    log_batch_size: int = 10  # Logs per batch
    database_batch_size: int = 100  # Database operations per batch
    
    class Config:
        env_file = ".env"
        env_prefix = "MOONX_"


class ChainConfig:
    """Chain-specific configuration."""
    
    def __init__(
        self,
        chain_id: int,
        name: str,
        rpc_url: str,
        block_time: int,
        start_block: int,
        pools: List[Dict],
        contracts: Dict[str, str],
        backup_rpc_urls: Optional[List[str]] = None,
        rpc_urls: Optional[List[str]] = None,
        confirmation_blocks: int = 5,
        max_block_range: int = 2000,
        gas_price_strategy: str = "fast",
        special_tokens: Optional[Dict[str, str]] = None,
        monitoring: Optional[Dict] = None,
        performance: Optional[Dict] = None,
        features: Optional[Dict] = None,
        indexing: Optional[Dict] = None
    ):
        self.chain_id = chain_id
        self.name = name
        # Support both single rpc_url and multiple rpc_urls for round robin
        self.rpc_urls = rpc_urls or [rpc_url]  # Use rpc_urls if provided, else fallback to single rpc_url
        self.rpc_url = rpc_url  # Keep for backward compatibility
        self.backup_rpc_urls = backup_rpc_urls or []
        self.current_rpc_index = 0  # For round robin
        self.block_time = block_time  # Average block time in seconds
        self.confirmation_blocks = confirmation_blocks
        self.start_block = start_block
        self.max_block_range = max_block_range
        self.gas_price_strategy = gas_price_strategy
        self.pools = pools  # List of pool configurations
        self.contracts = contracts  # Contract addresses
        self.special_tokens = special_tokens or {}
        self.monitoring = monitoring or {}
        self.performance = performance or {}
        self.features = features or {}
        self.indexing = indexing or {}
    
    @classmethod
    def load_from_file(cls, config_path: Path) -> "ChainConfig":
        """Load chain configuration from JSON file."""
        import json
        
        with open(config_path, 'r') as f:
            data = json.load(f)
        
        # Support both rpc_url (backward compatibility) and rpc_urls (new format)
        rpc_url = data.get("rpc_url", data.get("rpc_urls", [None])[0] if data.get("rpc_urls") else None)
        
        return cls(
            chain_id=data["chain_id"],
            name=data["name"],
            rpc_url=rpc_url,
            block_time=data["block_time"],
            start_block=data["start_block"],
            pools=data["pools"],
            contracts=data["contracts"],
            backup_rpc_urls=data.get("backup_rpc_urls"),
            rpc_urls=data.get("rpc_urls"),
            confirmation_blocks=data.get("confirmation_blocks", 5),
            max_block_range=data.get("max_block_range", 2000),
            gas_price_strategy=data.get("gas_price_strategy", "fast"),
            special_tokens=data.get("special_tokens"),
            monitoring=data.get("monitoring"),
            performance=data.get("performance"),
            features=data.get("features"),
            indexing=data.get("indexing")
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

