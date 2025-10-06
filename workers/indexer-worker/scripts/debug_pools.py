#!/usr/bin/env python3
"""Debug script to find out why V4 and Aerodrome pools are not being parsed."""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import load_chain_configs, Settings
from services.blockchain_service import BlockchainService


async def debug_pool_discovery():
    """Debug pool discovery issues."""
    
    print("🔍 DEBUG: Pool Discovery Issues")
    print("="*50)
    
    try:
        # Load config
        chain_configs = load_chain_configs()
        settings = Settings()
        chain_config = chain_configs[8453]  # Base
        
        blockchain_service = BlockchainService(chain_config, settings)
        await blockchain_service.connect()
        
        latest_block = await blockchain_service.get_latest_block()
        print(f"📊 Latest block: {latest_block:,}")
        
        # Focus on V4 and Aerodrome
        problem_protocols = ["uniswap_v4", "aerodrome"]
        
        for pool_config in chain_config.pools:
            protocol = pool_config.get("protocol")
            
            if protocol not in problem_protocols:
                continue
                
            print(f"\n🔍 DEBUGGING: {protocol.upper()}")
            print("-" * 40)
            
            await debug_protocol(blockchain_service, pool_config, latest_block)
    
    except Exception as e:
        print(f"❌ Debug failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await blockchain_service.disconnect()


async def debug_protocol(blockchain_service, pool_config, latest_block):
    """Debug a specific protocol."""
    
    protocol = pool_config.get("protocol")
    creation_block = pool_config.get("creation_block")
    
    print(f"📋 Configuration:")
    print(f"   Protocol: {protocol}")
    print(f"   Creation block: {creation_block:,}")
    
    # Get contract info
    if protocol == "uniswap_v4":
        contract_address = pool_config.get("pool_manager")
        topic = pool_config.get("pool_init_topic")
        event_name = "Initialize"
    else:  # aerodrome
        contract_address = pool_config.get("factory")
        topic = pool_config.get("pool_created_topic")
        event_name = "PairCreated"
    
    print(f"   Contract: {contract_address}")
    print(f"   Topic: {topic}")
    print(f"   Event: {event_name}")
    
    # Test 1: Check contract exists
    print(f"\n🧪 TEST 1: Contract Code Check")
    try:
        code_result = await blockchain_service.base_blockchain._make_rpc_call(
            "eth_getCode", [contract_address, "latest"]
        )
        
        if code_result == "0x":
            print(f"   ❌ Contract has no code at {contract_address}")
            print(f"   💡 This contract might not be deployed yet or address is wrong")
            return
        else:
            print(f"   ✅ Contract has code (length: {len(code_result)} chars)")
    
    except Exception as e:
        print(f"   ❌ Failed to check contract: {e}")
        return
    
    # Test 2: Search for events in different block ranges
    print(f"\n🧪 TEST 2: Event Search in Multiple Ranges")
    
    # Range 1: From creation block
    await search_events_in_range(
        blockchain_service, contract_address, topic, event_name,
        creation_block, min(creation_block + 50000, latest_block),
        "From creation block"
    )
    
    # Range 2: Recent blocks (last 10k)
    recent_start = max(latest_block - 10000, creation_block)
    await search_events_in_range(
        blockchain_service, contract_address, topic, event_name,
        recent_start, latest_block,
        "Recent blocks"
    )
    
    # Range 3: Specific known block (if events exist)
    if creation_block < latest_block:
        test_end = min(creation_block + 1000, latest_block)
        await search_events_in_range(
            blockchain_service, contract_address, topic, event_name,
            creation_block, test_end,
            "First 1000 blocks after creation"
        )


async def search_events_in_range(blockchain_service, contract_address, topic, event_name, start_block, end_block, range_name):
    """Search for events in a specific block range."""
    
    print(f"\n   📍 {range_name}: blocks {start_block:,} to {end_block:,}")
    
    if start_block > end_block:
        print(f"      ⏭️  Skipping (start > end)")
        return
    
    try:
        logs = await blockchain_service.get_logs(
            from_block=start_block,
            to_block=end_block,
            address=contract_address,
            topics=[topic]
        )
        
        print(f"      📝 Found {len(logs)} {event_name} events")
        
        if logs:
            # Test parsing first event
            log = logs[0]
            block_num = int(log["blockNumber"], 16)
            tx_hash = log.get("transactionHash", "unknown")
            
            print(f"      🎯 First event at block {block_num:,}, tx: {tx_hash}")
            print(f"         Topics count: {len(log.get('topics', []))}")
            print(f"         Data length: {len(log.get('data', ''))}")
            
            # Try parsing
            try:
                if contract_address == blockchain_service.chain_config.pools[0].get("pool_manager"):  # V4
                    protocol = "uniswap_v4"
                else:
                    protocol = "aerodrome"
                
                pool_info = await blockchain_service.parse_pool_created_event(log, protocol)
                
                if pool_info:
                    print(f"      ✅ Parsing SUCCESS!")
                    print(f"         Pool address: {pool_info.pool_address}")
                    print(f"         Token0: {pool_info.token0_address}")
                    print(f"         Token1: {pool_info.token1_address}")
                else:
                    print(f"      ❌ Parsing failed - returned None")
            
            except Exception as parse_error:
                print(f"      ❌ Parsing error: {str(parse_error)[:100]}")
                
                # Print raw log for debugging
                print(f"      🔍 Raw log:")
                print(f"         Address: {log.get('address')}")
                print(f"         Topics: {log.get('topics', [])}")
                print(f"         Data: {log.get('data', '')[:100]}...")
        
        else:
            print(f"      ❌ No events found in this range")
            
            # If no events found, let's try a broader search without topics
            print(f"         🔍 Checking if contract has ANY events...")
            try:
                all_logs = await blockchain_service.get_logs(
                    from_block=start_block,
                    to_block=min(start_block + 100, end_block),  # Small range
                    address=contract_address,
                    topics=None  # Any events
                )
                
                if all_logs:
                    print(f"         📝 Contract has {len(all_logs)} events (any topic)")
                    # Show first event topics
                    first_log = all_logs[0]
                    print(f"         🎯 First event topic: {first_log.get('topics', [None])[0]}")
                    print(f"         🎯 Expected topic:    {topic}")
                    
                    if first_log.get('topics', [None])[0] != topic:
                        print(f"         ⚠️  TOPIC MISMATCH! Event topics don't match config")
                else:
                    print(f"         ❌ Contract has NO events at all in this range")
            
            except Exception as broad_error:
                print(f"         ❌ Broad search failed: {str(broad_error)[:50]}")
    
    except Exception as e:
        print(f"      ❌ Search failed: {str(e)[:100]}")


async def main():
    """Main debug function."""
    print("🔍 Starting Pool Discovery Debug")
    await debug_pool_discovery()
    print("\n✅ Debug completed!")


if __name__ == "__main__":
    asyncio.run(main())
