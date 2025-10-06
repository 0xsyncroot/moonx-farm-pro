#!/usr/bin/env python3
"""Find correct creation blocks for protocols by searching backwards from current block."""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import load_chain_configs, Settings
from services.blockchain_service import BlockchainService


async def find_correct_creation_blocks():
    """Find correct creation blocks by searching backwards."""
    
    print("🔍 FINDING CORRECT CREATION BLOCKS")
    print("="*50)
    
    try:
        # Load config
        chain_configs = load_chain_configs()
        settings = Settings()
        chain_config = chain_configs[8453]  # Base
        
        blockchain_service = BlockchainService(chain_config, settings)
        await blockchain_service.connect()
        
        latest_block = await blockchain_service.get_latest_block()
        print(f"📊 Current Latest Block: {latest_block:,}")
        
        # Focus on protocols that need fixing
        protocols_to_check = ["uniswap_v4", "aerodrome"]
        
        for pool_config in chain_config.pools:
            protocol = pool_config.get("protocol")
            
            if protocol not in protocols_to_check:
                continue
                
            print(f"\n🔍 SEARCHING: {protocol.upper()}")
            print("-" * 40)
            
            await find_protocol_creation_block(blockchain_service, pool_config, latest_block)
    
    except Exception as e:
        print(f"❌ Search failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await blockchain_service.disconnect()


async def find_protocol_creation_block(blockchain_service, pool_config, latest_block):
    """Find creation block for a specific protocol."""
    
    protocol = pool_config.get("protocol")
    current_config_block = pool_config.get("creation_block", 0)
    
    # Get contract info
    if protocol == "uniswap_v4":
        contract_address = pool_config.get("pool_manager")
        topic = pool_config.get("pool_init_topic")
        event_name = "Initialize"
    else:  # aerodrome
        contract_address = pool_config.get("factory")
        topic = pool_config.get("pool_created_topic")
        event_name = "PairCreated"
    
    print(f"📋 Config: {contract_address} | {event_name} | Current: {current_config_block:,}")
    
    # Strategy 1: Check if contract exists
    try:
        code_result = await blockchain_service.base_blockchain._make_rpc_call(
            "eth_getCode", [contract_address, "latest"]
        )
        
        if code_result == "0x":
            print(f"❌ Contract {contract_address} has no code - not deployed or wrong address")
            return
        else:
            print(f"✅ Contract exists (code length: {len(code_result)})")
    
    except Exception as e:
        print(f"❌ Cannot check contract: {e}")
        return
    
    # Strategy 2: Search backwards in chunks
    search_ranges = [
        ("Recent 10k", latest_block - 10000, latest_block),
        ("Recent 50k", latest_block - 50000, latest_block - 10000),
        ("Recent 100k", latest_block - 100000, latest_block - 50000),
        ("Recent 500k", latest_block - 500000, latest_block - 100000),
        ("Ancient history", max(1, latest_block - 5000000), latest_block - 500000),
    ]
    
    found_events = []
    
    for range_name, start_block, end_block in search_ranges:
        if start_block < 1:
            continue
            
        print(f"\n📍 Searching {range_name}: {start_block:,} to {end_block:,}")
        
        try:
            logs = await blockchain_service.get_logs(
                from_block=start_block,
                to_block=end_block,
                address=contract_address,
                topics=[topic]
            )
            
            if logs:
                first_block = int(logs[0]["blockNumber"], 16)
                last_block = int(logs[-1]["blockNumber"], 16)
                
                print(f"   ✅ Found {len(logs)} events")
                print(f"   🎯 First event: block {first_block:,}")
                print(f"   🎯 Last event: block {last_block:,}")
                
                found_events.extend([(int(log["blockNumber"], 16), log) for log in logs])
            else:
                print(f"   ❌ No events found")
        
        except Exception as e:
            print(f"   ❌ Search error: {str(e)[:100]}")
    
    # Analyze results
    if found_events:
        found_events.sort()  # Sort by block number
        earliest_block = found_events[0][0]
        latest_found_block = found_events[-1][0]
        total_events = len(found_events)
        
        print(f"\n📊 ANALYSIS:")
        print(f"   🎯 Earliest event: block {earliest_block:,}")
        print(f"   🎯 Latest event: block {latest_found_block:,}")
        print(f"   📝 Total events found: {total_events:,}")
        print(f"   📅 Event span: {latest_found_block - earliest_block:,} blocks")
        
        # Test parsing the earliest event
        print(f"\n🧪 Testing parse of earliest event:")
        try:
            earliest_log = found_events[0][1]
            pool_info = await blockchain_service.parse_pool_created_event(earliest_log, protocol)
            
            if pool_info:
                print(f"   ✅ Parse SUCCESS!")
                print(f"   📝 Pool: {pool_info.pool_address}")
                print(f"   📝 Token0: {pool_info.token0_address}")
                print(f"   📝 Token1: {pool_info.token1_address}")
            else:
                print(f"   ❌ Parse returned None")
        
        except Exception as e:
            print(f"   ❌ Parse error: {str(e)[:100]}")
        
        # Recommendation
        print(f"\n💡 RECOMMENDATION:")
        print(f"   Set creation_block = {earliest_block:,}")
        print(f"   Current config = {current_config_block:,}")
        
        if current_config_block != earliest_block:
            diff = abs(current_config_block - earliest_block)
            if current_config_block > earliest_block:
                print(f"   ⚠️  Config is {diff:,} blocks TOO HIGH")
            else:
                print(f"   ⚠️  Config is {diff:,} blocks too low")
    
    else:
        print(f"\n❌ NO EVENTS FOUND for {protocol}")
        print(f"   This could mean:")
        print(f"   - Wrong contract address: {contract_address}")
        print(f"   - Wrong event topic: {topic}")
        print(f"   - Protocol not deployed yet")
        print(f"   - Need to search different block ranges")


async def main():
    await find_correct_creation_blocks()
    
    print(f"\n💡 NEXT STEPS:")
    print(f"1. Update creation_block values in config/chains/base.json")
    print(f"2. Test with: python scripts/debug_pools.py")
    print(f"3. Run indexer to see if pools are found")


if __name__ == "__main__":
    asyncio.run(main())
