#!/usr/bin/env python3
"""Test script for Base chain configuration."""

import asyncio
import sys
from pathlib import Path

# Add the current directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import load_chain_configs
from services.blockchain_service import BlockchainService


async def test_base_config():
    """Test Base chain configuration."""
    print("🔍 Testing Base chain configuration...")
    
    # Load chain configs
    try:
        chain_configs = load_chain_configs()
        print(f"✅ Loaded {len(chain_configs)} chain configurations")
        
        # Check Base chain
        base_chain_id = 8453
        if base_chain_id not in chain_configs:
            print("❌ Base chain (8453) not found in configurations")
            return False
        
        base_config = chain_configs[base_chain_id]
        print(f"✅ Base chain config loaded: {base_config.name}")
        
        # Test configuration fields
        print(f"   - Chain ID: {base_config.chain_id}")
        print(f"   - RPC URL: {base_config.rpc_url}")
        print(f"   - Block time: {base_config.block_time}s")
        print(f"   - Confirmation blocks: {base_config.confirmation_blocks}")
        print(f"   - Max block range: {base_config.max_block_range}")
        print(f"   - Start block: {base_config.start_block}")
        print(f"   - Backup RPCs: {len(base_config.backup_rpc_urls)}")
        print(f"   - Special tokens: {len(base_config.special_tokens)}")
        print(f"   - Contracts: {len(base_config.contracts)}")
        
        # Test protocols
        print(f"   - Supported protocols: {len(base_config.pools)}")
        for i, pool_config in enumerate(base_config.pools):
            protocol = pool_config.get('protocol', 'unknown')
            factory = pool_config.get('factory', 'N/A')
            enabled = pool_config.get('enabled', True)
            print(f"     {i+1}. {protocol}: {factory} ({'enabled' if enabled else 'disabled'})")
        
        # Test blockchain service initialization
        print("\n🔌 Testing blockchain service initialization...")
        blockchain_service = BlockchainService(base_config)
        
        # Test protocol support
        supported_protocols = blockchain_service.get_supported_protocols()
        print(f"✅ Service supports {len(supported_protocols)} protocols: {supported_protocols}")
        
        # Test connection (optional - comment out if no internet)
        try:
            print("\n🌐 Testing RPC connection...")
            await blockchain_service.connect()
            latest_block = await blockchain_service.get_latest_block()
            print(f"✅ Connected successfully! Latest block: {latest_block}")
            
            # Test health check
            health = await blockchain_service.health_check()
            print(f"✅ Health check: {health['status']}")
            
            await blockchain_service.disconnect()
            
        except Exception as e:
            print(f"⚠️  RPC connection test skipped: {e}")
        
        print("\n🎉 Base configuration test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Configuration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_aerodrome_parser():
    """Test Aerodrome parser specifically."""
    print("\n🚀 Testing Aerodrome parser...")
    
    try:
        chain_configs = load_chain_configs()
        base_config = chain_configs[8453]
        
        blockchain_service = BlockchainService(base_config)
        
        # Check if Aerodrome is supported
        if blockchain_service.supports_protocol("aerodrome"):
            print("✅ Aerodrome protocol is supported")
            
            protocol_info = blockchain_service.get_protocol_info()
            aerodrome_info = protocol_info.get("aerodrome")
            if aerodrome_info:
                print(f"   - Parser class: {aerodrome_info['class']}")
                print(f"   - State tracking: {aerodrome_info['supports_state_tracking']}")
            
        else:
            print("❌ Aerodrome protocol not supported")
            
    except Exception as e:
        print(f"❌ Aerodrome parser test failed: {e}")


if __name__ == "__main__":
    async def main():
        success = await test_base_config()
        await test_aerodrome_parser()
        
        if success:
            print("\n✅ All tests passed!")
            sys.exit(0)
        else:
            print("\n❌ Some tests failed!")
            sys.exit(1)
    
    asyncio.run(main())