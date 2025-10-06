#!/usr/bin/env python3
"""Integration test script to verify event parsing works correctly."""

import asyncio
import json
import sys
from pathlib import Path
from typing import Dict, Any, List

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import load_chain_configs, Settings
from services.blockchain_service import BlockchainService
from models.pool import PoolProtocol


async def test_event_parsing_for_chain(chain_id: int = 8453) -> None:
    """Test event parsing for all protocols on a chain."""
    
    # Load configurations
    chain_configs = load_chain_configs()
    settings = Settings()
    
    if chain_id not in chain_configs:
        print(f"❌ Chain {chain_id} not found in configurations")
        return
    
    chain_config = chain_configs[chain_id]
    print(f"\n🧪 Testing Event Parsing for {chain_config.name} (Chain ID: {chain_id})")
    print("="*70)
    
    # Initialize blockchain service
    blockchain_service = BlockchainService(chain_config, settings)
    await blockchain_service.connect()
    
    try:
        latest_block = await blockchain_service.get_latest_block()
        print(f"📊 Latest block: {latest_block:,}")
        
        # Test each protocol
        for i, pool_config in enumerate(chain_config.pools):
            protocol = pool_config.get("protocol")
            creation_block = pool_config.get("creation_block")
            
            if not creation_block:
                print(f"\n⏭️  [{i+1}/{len(chain_config.pools)}] Skipping {protocol} (no creation_block)")
                continue
            
            print(f"\n🔍 [{i+1}/{len(chain_config.pools)}] Testing {protocol}")
            print(f"   Creation block: {creation_block:,}")
            
            # Test pool creation events
            await test_pool_creation_events(blockchain_service, pool_config, creation_block, latest_block)
            
            # Test swap events (if we can find pools)
            await test_swap_events(blockchain_service, pool_config, protocol)
            
            # Test liquidity events (V4 only)
            if protocol == "uniswap_v4":
                await test_liquidity_events(blockchain_service, pool_config)
    
    except Exception as e:
        print(f"❌ Test failed: {e}")
        raise
    
    finally:
        await blockchain_service.disconnect()


async def test_pool_creation_events(
    blockchain_service: BlockchainService, 
    pool_config: Dict[str, Any],
    creation_block: int,
    latest_block: int
) -> None:
    """Test pool creation event parsing."""
    try:
        protocol = pool_config.get("protocol")
        
        # Determine contract and topic
        if protocol == "uniswap_v4":
            contract_address = pool_config.get("pool_manager")
            topic = pool_config.get("pool_init_topic")
            event_name = "Initialize"
        else:
            contract_address = pool_config.get("factory")
            topic = pool_config.get("pool_created_topic")
            event_name = "PairCreated"
        
        if not contract_address or not topic:
            print(f"   ⚠️  Missing contract address or topic for {protocol}")
            return
        
        # Search a small range around creation block
        search_start = max(creation_block, creation_block)
        search_end = min(creation_block + 10000, latest_block)  # Search 10k blocks max
        
        print(f"   🔍 Searching for {event_name} events in blocks {search_start:,}-{search_end:,}")
        
        # Get logs
        logs = await blockchain_service.get_logs(
            from_block=search_start,
            to_block=search_end,
            address=contract_address,
            topics=[topic]
        )
        
        print(f"   📝 Found {len(logs)} {event_name} events")
        
        if logs:
            # Test parsing first few events
            test_count = min(3, len(logs))
            successful_parses = 0
            
            for j, log in enumerate(logs[:test_count]):
                try:
                    # Parse the event
                    pool_info = await blockchain_service.parse_pool_created_event(log, protocol)
                    
                    if pool_info:
                        print(f"   ✅ [{j+1}] Parsed pool: {pool_info.pool_address}")
                        print(f"       Token0: {pool_info.token0_address}")
                        print(f"       Token1: {pool_info.token1_address}")
                        if hasattr(pool_info, 'fee_tier') and pool_info.fee_tier:
                            print(f"       Fee Tier: {pool_info.fee_tier}")
                        successful_parses += 1
                    else:
                        print(f"   ❌ [{j+1}] Failed to parse event")
                
                except Exception as e:
                    print(f"   ❌ [{j+1}] Parse error: {str(e)[:100]}")
            
            print(f"   📊 Success rate: {successful_parses}/{test_count} ({100*successful_parses/test_count:.1f}%)")
        else:
            print(f"   ⚠️  No events found - may need to search different block range")
    
    except Exception as e:
        print(f"   ❌ Pool creation test failed: {str(e)[:100]}")


async def test_swap_events(
    blockchain_service: BlockchainService, 
    pool_config: Dict[str, Any],
    protocol: str
) -> None:
    """Test swap event parsing."""
    try:
        # For swap events, we need to find an active pool first
        # This is a simplified test - in production we'd query database for known pools
        print(f"   🔄 Swap event testing not implemented yet for {protocol}")
        print(f"      (Would need to find active pools first)")
    
    except Exception as e:
        print(f"   ❌ Swap test failed: {str(e)[:100]}")


async def test_liquidity_events(
    blockchain_service: BlockchainService, 
    pool_config: Dict[str, Any]
) -> None:
    """Test Uniswap V4 liquidity event parsing."""
    try:
        pool_manager = pool_config.get("pool_manager")
        liquidity_topic = pool_config.get("modify_liquidity_topic")
        creation_block = pool_config.get("creation_block")
        
        if not all([pool_manager, liquidity_topic, creation_block]):
            print(f"   ⚠️  Missing V4 configuration for liquidity events")
            return
        
        # Search a small range for liquidity events
        latest_block = await blockchain_service.get_latest_block()
        search_start = max(creation_block, latest_block - 50000)  # Last 50k blocks
        search_end = latest_block
        
        print(f"   💧 Searching for ModifyLiquidity events in blocks {search_start:,}-{search_end:,}")
        
        logs = await blockchain_service.get_logs(
            from_block=search_start,
            to_block=search_end,
            address=pool_manager,
            topics=[liquidity_topic]
        )
        
        print(f"   📝 Found {len(logs)} ModifyLiquidity events")
        
        if logs:
            # Test parsing first event
            log = logs[0]
            
            # We need a pool_info to parse liquidity events
            # For testing, create a mock pool_info
            from models.pool import PoolInfo
            from datetime import datetime
            
            mock_pool = PoolInfo(
                pool_address=f"{pool_manager}#test",  # V4 format
                chain_id=blockchain_service.chain_config.chain_id,
                protocol=PoolProtocol.UNISWAP_V4,
                token0_address="0x0000000000000000000000000000000000000000",
                token1_address="0x0000000000000000000000000000000000000001",
                factory_address=pool_manager,
                creation_block=creation_block,
                creation_tx_hash="0x0",
                creation_timestamp=datetime.utcnow()
            )
            
            try:
                liquidity_event = await blockchain_service.parse_liquidity_event(log, mock_pool)
                
                if liquidity_event:
                    print(f"   ✅ Parsed liquidity event:")
                    print(f"       TX: {liquidity_event.tx_hash}")
                    print(f"       Sender: {liquidity_event.sender}")
                    print(f"       Liquidity Delta: {liquidity_event.liquidity_delta}")
                    print(f"       Ticks: {liquidity_event.tick_lower} to {liquidity_event.tick_upper}")
                else:
                    print(f"   ❌ Failed to parse liquidity event")
            
            except Exception as e:
                print(f"   ❌ Liquidity event parse error: {str(e)[:100]}")
        else:
            print(f"   ⚠️  No liquidity events found in search range")
    
    except Exception as e:
        print(f"   ❌ Liquidity event test failed: {str(e)[:100]}")


def print_test_summary():
    """Print test execution summary."""
    print("\n" + "="*70)
    print("🎯 TEST SUMMARY")
    print("="*70)
    print("✅ Pool Creation Events: Testing event signature parsing")
    print("🔄 Swap Events: Placeholder (needs active pool data)")  
    print("💧 Liquidity Events: Testing V4 ModifyLiquidity parsing")
    print("\n📋 To run full tests:")
    print("   1. Ensure RPC connection is stable")
    print("   2. Verify creation_block values are accurate")
    print("   3. Check event topics match deployed contracts")
    print("   4. Run: python scripts/test_parsing.py [chain_id]")


async def main():
    """Main test runner."""
    print("🧪 Event Parsing Integration Test")
    print("="*50)
    
    # Default to Base chain
    chain_id = 8453
    
    if len(sys.argv) > 1:
        try:
            chain_id = int(sys.argv[1])
        except ValueError:
            print("❌ Invalid chain ID. Using default (8453 - Base)")
    
    try:
        await test_event_parsing_for_chain(chain_id)
        print_test_summary()
        print("\n✅ Testing completed!")
        
    except KeyboardInterrupt:
        print("\n❌ Testing cancelled by user")
    except Exception as e:
        print(f"\n❌ Testing failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
