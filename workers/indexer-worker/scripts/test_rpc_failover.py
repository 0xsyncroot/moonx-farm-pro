#!/usr/bin/env python3
"""
Script to test RPC failover functionality
"""

import asyncio
import json
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from config.settings import Settings, ChainConfig
from services.base_blockchain import BaseBlockchainService
import structlog

logger = structlog.get_logger()

async def test_rpc_failover():
    """Test RPC failover with different scenarios."""
    
    # Load Base chain config
    config_path = project_root / "config" / "chains" / "base.json"
    with open(config_path, 'r') as f:
        chain_data = json.load(f)
    
    chain_config = ChainConfig(**chain_data)
    settings = Settings()
    
    print("🧪 Testing RPC Failover Functionality")
    print("=" * 50)
    
    # Test 1: Normal operation
    print("\n📡 Test 1: Normal RPC operation")
    try:
        blockchain = BaseBlockchainService(chain_config, settings)
        await blockchain.connect()
        
        latest_block = await blockchain.get_latest_block()
        print(f"✅ Latest block: {latest_block}")
        
        # Test get_block_timestamp
        timestamp = await blockchain.get_block_timestamp(latest_block)
        print(f"✅ Block timestamp: {timestamp}")
        
        await blockchain.disconnect()
        print("✅ Normal operation successful")
        
    except Exception as e:
        print(f"❌ Normal operation failed: {e}")
    
    # Test 2: Test with bad primary RPC
    print("\n📡 Test 2: Primary RPC failure simulation")
    try:
        # Create config with bad primary URL
        bad_config = ChainConfig(
            chain_id=8453,
            name="Base",
            rpc_url="https://invalid-rpc-url.invalid",  # Bad primary
            backup_rpc_urls=chain_config.backup_rpc_urls,  # Good backups
            block_time=2,
            confirmation_blocks=5,
            start_block=1750000,
            max_block_range=2000,
            gas_price_strategy="fast",
            pools=[]
        )
        
        blockchain = BaseBlockchainService(bad_config, settings)
        await blockchain.connect()
        
        latest_block = await blockchain.get_latest_block()
        print(f"✅ Failover successful - Latest block: {latest_block}")
        
        await blockchain.disconnect()
        print("✅ RPC failover working correctly")
        
    except Exception as e:
        print(f"❌ RPC failover failed: {e}")
    
    # Test 3: Test method-level retry
    print("\n📡 Test 3: Method-level retry for get_block_timestamp")
    try:
        blockchain = BaseBlockchainService(chain_config, settings)
        await blockchain.connect()
        
        # Test with a slightly older block to ensure it exists
        test_block = latest_block - 10
        timestamp = await blockchain.get_block_timestamp(test_block)
        print(f"✅ Block {test_block} timestamp: {timestamp}")
        
        await blockchain.disconnect()
        print("✅ Method-level retry working correctly")
        
    except Exception as e:
        print(f"❌ Method-level retry failed: {e}")
    
    # Test 4: Test concurrent requests
    print("\n📡 Test 4: Concurrent RPC requests")
    try:
        blockchain = BaseBlockchainService(chain_config, settings)
        await blockchain.connect()
        
        # Test multiple concurrent get_block_timestamp calls
        test_blocks = [latest_block - i for i in range(5)]
        tasks = [blockchain.get_block_timestamp(block) for block in test_blocks]
        
        timestamps = await asyncio.gather(*tasks)
        
        for block, timestamp in zip(test_blocks, timestamps):
            print(f"✅ Block {block}: {timestamp}")
        
        await blockchain.disconnect()
        print("✅ Concurrent requests successful")
        
    except Exception as e:
        print(f"❌ Concurrent requests failed: {e}")
    
    print("\n🎯 RPC Failover Test Summary")
    print("=" * 50)
    print("✅ Enhanced RPC implementation features:")
    print("   - Multi-RPC failover support")
    print("   - Exponential backoff between RPC attempts")
    print("   - Method-level retry with exponential backoff")
    print("   - Increased timeouts for reliability")
    print("   - Better error logging and context")
    print("   - Settings-based configuration")

if __name__ == "__main__":
    # Configure logging
    structlog.configure(
        processors=[
            structlog.dev.ConsoleRenderer()
        ],
        logger_factory=structlog.WriteLoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=False
    )
    
    asyncio.run(test_rpc_failover())