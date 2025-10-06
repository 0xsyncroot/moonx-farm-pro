#!/usr/bin/env python3
"""Test RPC round robin logic and rate limiting."""

import asyncio
import sys
import os
from pathlib import Path

# Add the parent directory to Python path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import ChainConfig
from services.base_blockchain import BaseBlockchainService
from config.settings import Settings
import structlog

# Configure logging
structlog.configure(
    processors=[
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level, 
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


async def test_round_robin():
    """Test round robin RPC calls."""
    print("🧪 Testing RPC Round Robin Logic")
    print("=" * 50)
    
    # Load Base chain config
    config_path = Path(__file__).parent.parent / "config" / "chains" / "base.json"
    chain_config = ChainConfig.load_from_file(config_path)
    settings = Settings()
    
    print(f"📋 Chain: {chain_config.name} (ID: {chain_config.chain_id})")
    print(f"🔗 Primary RPCs: {len(chain_config.rpc_urls)}")
    for i, url in enumerate(chain_config.rpc_urls):
        print(f"   {i+1}. {url[:60]}...")
    
    print(f"🔄 Backup RPCs: {len(chain_config.backup_rpc_urls)}")
    for i, url in enumerate(chain_config.backup_rpc_urls):
        print(f"   {i+1}. {url[:60]}...")
        
    # Initialize blockchain service
    blockchain = BaseBlockchainService(chain_config, settings)
    
    try:
        # Connect to blockchain
        print("\n🔌 Connecting to blockchain...")
        await blockchain.connect()
        print("✅ Connected successfully!")
        
        # Make multiple RPC calls to test round robin
        print(f"\n🔄 Testing Round Robin with {len(chain_config.rpc_urls)} primary RPCs")
        print("Making 10 sequential calls to see round robin pattern...")
        
        for i in range(10):
            try:
                print(f"\n📞 Call #{i+1}:")
                # Get latest block number 
                latest_block = await blockchain.get_latest_block()
                print(f"   ✅ Latest block: {latest_block:,}")
                
                # Small delay to see round robin clearly
                await asyncio.sleep(0.1)
                
            except Exception as e:
                print(f"   ❌ Error: {e}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")
        
    finally:
        await blockchain.disconnect()
        print("\n🔌 Disconnected from blockchain")
        

async def test_rate_limiting():
    """Test rate limiting by making rapid requests."""
    print("\n🚦 Testing Rate Limiting")
    print("=" * 50)
    
    config_path = Path(__file__).parent.parent / "config" / "chains" / "base.json"  
    chain_config = ChainConfig.load_from_file(config_path)
    settings = Settings()
    
    # Reduce concurrent requests for testing
    blockchain = BaseBlockchainService(chain_config, settings)
    
    try:
        await blockchain.connect()
        print("✅ Connected for rate limiting test")
        
        # Make rapid requests to test rate limiting
        print("🚄 Making 20 rapid requests...")
        tasks = []
        
        for i in range(20):
            task = blockchain.get_latest_block()
            tasks.append(task)
            
        # Execute all tasks concurrently
        start_time = asyncio.get_event_loop().time()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        end_time = asyncio.get_event_loop().time()
        
        # Analyze results
        successful = sum(1 for r in results if not isinstance(r, Exception))
        failed = len(results) - successful
        duration = end_time - start_time
        
        print(f"📊 Results:")
        print(f"   ✅ Successful: {successful}")
        print(f"   ❌ Failed: {failed}")
        print(f"   ⏱️  Duration: {duration:.2f}s")
        print(f"   🚄 Rate: {len(results)/duration:.2f} req/s")
        
        # Show any errors
        errors = [r for r in results if isinstance(r, Exception)]
        if errors:
            print(f"🚨 Error samples:")
            for i, error in enumerate(errors[:3]):
                print(f"   {i+1}. {error}")
                
    except Exception as e:
        print(f"❌ Rate limiting test failed: {e}")
        
    finally:
        await blockchain.disconnect()


async def main():
    """Run all tests."""
    print("🧪 RPC Round Robin & Rate Limiting Tests")
    print("=" * 60)
    
    try:
        await test_round_robin()
        await test_rate_limiting()
        
        print("\n✅ All tests completed!")
        
    except Exception as e:
        print(f"❌ Tests failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
