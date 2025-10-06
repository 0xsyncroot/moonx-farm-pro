#!/usr/bin/env python3
"""Quick test script to verify parsing is working correctly."""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import load_chain_configs, Settings
from services.blockchain_service import BlockchainService


async def quick_test():
    """Quick verification that everything is working."""
    
    print("🚀 Quick Test: MoonX Farm Pro Indexer")
    print("="*45)
    
    try:
        # Load config
        chain_configs = load_chain_configs()
        settings = Settings()
        chain_config = chain_configs[8453]  # Base
        
        print(f"✅ Loaded config for {chain_config.name}")
        print(f"📊 Found {len(chain_config.pools)} protocols configured")
        
        # Initialize blockchain service  
        blockchain_service = BlockchainService(chain_config, settings)
        await blockchain_service.connect()
        
        latest_block = await blockchain_service.get_latest_block()
        print(f"🔗 Connected to blockchain - Latest block: {latest_block:,}")
        
        # Test each protocol configuration
        for pool_config in chain_config.pools:
            protocol = pool_config.get("protocol")
            creation_block = pool_config.get("creation_block")
            
            print(f"\n🔍 Testing {protocol}:")
            print(f"   Creation block: {creation_block:,}")
            
            # Check if parser exists
            parser = blockchain_service.protocol_factory.get_parser_by_name(protocol)
            if parser:
                print(f"   ✅ Parser: {parser.__class__.__name__}")
                print(f"   📝 Pool state tracking: {parser.supports_pool_state_tracking()}")
                
                # Check V4 liquidity support
                if hasattr(parser, 'supports_liquidity_tracking'):
                    print(f"   💧 Liquidity tracking: {parser.supports_liquidity_tracking()}")
            else:
                print(f"   ❌ No parser found")
            
            # Verify contract addresses
            if protocol == "uniswap_v4":
                contract = pool_config.get("pool_manager")
                print(f"   🏭 Pool Manager: {contract}")
            else:
                contract = pool_config.get("factory")  
                print(f"   🏭 Factory: {contract}")
        
        # Test creation block optimization logic
        print(f"\n📊 Creation Block Optimization Test:")
        
        # Simulate indexing scenario
        current_block = latest_block
        scan_start = current_block - 10000  # Want to scan last 10k blocks
        
        for pool_config in chain_config.pools:
            protocol = pool_config.get("protocol")
            creation_block = pool_config.get("creation_block", 0)
            
            # Apply creation block optimization
            optimized_start = max(scan_start, creation_block)
            blocks_saved = max(0, creation_block - scan_start)
            
            print(f"   {protocol}:")
            print(f"     Scan range: {scan_start:,} → {optimized_start:,}")
            print(f"     Blocks saved: {blocks_saved:,}")
        
        await blockchain_service.disconnect()
        
        print(f"\n🎉 Quick test completed successfully!")
        print(f"\n📋 Next steps:")
        print(f"   1. Run full parsing test: python scripts/test_parsing.py")
        print(f"   2. Validate creation blocks: python scripts/validate_creation_blocks.py")
        print(f"   3. Start indexer in production")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(quick_test())
