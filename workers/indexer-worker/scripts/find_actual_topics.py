#!/usr/bin/env python3
"""Find actual event topics emitted by contracts."""

import asyncio
import sys
from pathlib import Path
from collections import Counter

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import load_chain_configs, Settings
from services.blockchain_service import BlockchainService


async def find_actual_topics():
    """Find actual event topics emitted by contracts."""
    
    print("🔍 FINDING ACTUAL EVENT TOPICS")
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
        
        # Focus on problematic protocols
        problem_protocols = ["uniswap_v4", "aerodrome"]
        
        for pool_config in chain_config.pools:
            protocol = pool_config.get("protocol")
            
            if protocol not in problem_protocols:
                continue
                
            print(f"\n🔍 ANALYZING: {protocol.upper()}")
            print("-" * 40)
            
            await analyze_contract_events(blockchain_service, pool_config, latest_block)
    
    except Exception as e:
        print(f"❌ Analysis failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await blockchain_service.disconnect()


async def analyze_contract_events(blockchain_service, pool_config, latest_block):
    """Analyze all events from a contract to find actual topics."""
    
    protocol = pool_config.get("protocol")
    creation_block = pool_config.get("creation_block")
    
    if protocol == "uniswap_v4":
        contract_address = pool_config.get("pool_manager")
        expected_topic = pool_config.get("pool_init_topic")
        expected_event = "Initialize"
    else:  # aerodrome
        contract_address = pool_config.get("factory")
        expected_topic = pool_config.get("pool_created_topic")
        expected_event = "PairCreated"
    
    print(f"📋 Contract: {contract_address}")
    print(f"📋 Expected topic: {expected_topic}")
    print(f"📋 Expected event: {expected_event}")
    
    # Strategy: Sample different ranges to find actual events
    search_ranges = [
        ("Creation range", creation_block, min(creation_block + 10000, latest_block)),
        ("Mid range", creation_block + 50000, min(creation_block + 60000, latest_block)),
        ("Recent range", latest_block - 10000, latest_block),
    ]
    
    all_topics = Counter()
    sample_logs = []
    
    for range_name, start_block, end_block in search_ranges:
        if start_block >= end_block or start_block > latest_block:
            continue
            
        print(f"\n📍 {range_name}: {start_block:,} to {end_block:,}")
        
        try:
            # Get ALL events from contract (no topic filter)
            logs = await blockchain_service.get_logs(
                from_block=start_block,
                to_block=end_block,
                address=contract_address,
                topics=None  # Get all events
            )
            
            print(f"   📝 Found {len(logs)} total events")
            
            if logs:
                # Analyze topics
                for log in logs:
                    topics = log.get("topics", [])
                    if topics:
                        event_signature = topics[0]
                        all_topics[event_signature] += 1
                
                # Keep sample logs for detailed analysis
                sample_logs.extend(logs[:5])  # Keep first 5 from each range
            
        except Exception as e:
            print(f"   ❌ Search error: {str(e)[:100]}")
    
    # Analyze results
    if all_topics:
        print(f"\n📊 TOPIC ANALYSIS:")
        print(f"   Found {len(all_topics)} unique event types")
        print(f"   Total events analyzed: {sum(all_topics.values())}")
        
        print(f"\n🎯 TOP EVENT TOPICS:")
        for i, (topic, count) in enumerate(all_topics.most_common(10)):
            status = "✅ MATCH!" if topic == expected_topic else ""
            print(f"   {i+1}. {topic} ({count} events) {status}")
            
            # Try to identify known topics
            known_topics = {
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "ERC20 Transfer",
                "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "ERC20 Approval",
                "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118": "Uniswap V3 PoolCreated",
                "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9": "Uniswap V2 PairCreated",
                "0xc4805696c66d7cf352fc1d6bb633ad5ee82f6cb577c453024b6e0eb8306c6fc9": "Aerodrome PairCreated",
                "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438": "Uniswap V4 Initialize (expected)",
            }
            
            if topic in known_topics:
                print(f"      🏷️  Known as: {known_topics[topic]}")
        
        # If expected topic not found, suggest alternatives
        if expected_topic not in all_topics:
            print(f"\n⚠️  EXPECTED TOPIC NOT FOUND!")
            print(f"   Expected: {expected_topic}")
            print(f"   This suggests:")
            print(f"   - Event signature in config is wrong")
            print(f"   - Event name/parameters have changed")
            print(f"   - Contract doesn't emit this event")
            
            if protocol == "uniswap_v4":
                print(f"\n💡 UNISWAP V4 SUGGESTIONS:")
                print(f"   - V4 might use different events (not Initialize)")
                print(f"   - Check if it's actually deployed and active")
                print(f"   - Verify official V4 documentation")
        
        # Show sample event data
        if sample_logs:
            print(f"\n🔍 SAMPLE EVENT DATA:")
            for i, log in enumerate(sample_logs[:3]):
                block_num = int(log["blockNumber"], 16)
                topics = log.get("topics", [])
                data = log.get("data", "")
                
                print(f"   Event {i+1} (block {block_num:,}):")
                print(f"      Topic0: {topics[0] if topics else 'None'}")
                print(f"      Topics: {len(topics)}")
                print(f"      Data length: {len(data)}")
    
    else:
        print(f"\n❌ NO EVENTS FOUND")
        print(f"   This suggests:")
        print(f"   - Contract is not active in searched ranges")
        print(f"   - Wrong contract address")
        print(f"   - Events are emitted from different contract")


# Create keccak hash calculator for event signatures
def calculate_topic_hash(event_signature: str) -> str:
    """Calculate keccak256 hash of event signature."""
    try:
        from Crypto.Hash import keccak
        k = keccak.new(digest_bits=256)
        k.update(event_signature.encode('utf-8'))
        return '0x' + k.hexdigest()
    except ImportError:
        return "Install pycryptodome to calculate hashes"


async def verify_event_signatures():
    """Verify our expected event signatures match actual hashes."""
    
    print(f"\n🧮 VERIFYING EVENT SIGNATURE HASHES:")
    print("-" * 50)
    
    expected_signatures = {
        "uniswap_v4": "Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)",
        "aerodrome": "PairCreated(address indexed token0,address indexed token1,bool indexed stable,address pool,uint256)"
    }
    
    for protocol, signature in expected_signatures.items():
        calculated_hash = calculate_topic_hash(signature)
        print(f"{protocol}:")
        print(f"   Signature: {signature}")
        print(f"   Calculated: {calculated_hash}")


async def main():
    await find_actual_topics()
    await verify_event_signatures()
    
    print(f"\n💡 NEXT STEPS:")
    print(f"1. Compare expected vs actual topics")
    print(f"2. Update config with correct topic hashes if needed")
    print(f"3. Check if protocols are actually active")


if __name__ == "__main__":
    asyncio.run(main())
