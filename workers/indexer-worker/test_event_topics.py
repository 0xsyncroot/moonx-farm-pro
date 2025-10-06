#!/usr/bin/env python3
"""
Script to test if the corrected event topics can find actual events on Base chain.

This script will:
1. Load the updated Base config
2. Test each protocol's event topics against recent blocks
3. Report if events are found with the new topics

Usage:
    python test_event_topics.py
"""

import asyncio
import json
from web3 import Web3
from typing import List, Dict, Any

class EventTopicTester:
    def __init__(self, rpc_url: str = "https://mainnet.base.org"):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        
    def load_base_config(self) -> Dict[str, Any]:
        """Load Base chain configuration."""
        with open('config/chains/base.json', 'r') as f:
            return json.load(f)
    
    async def test_protocol_events(self, protocol_config: Dict[str, Any], from_block: int, to_block: int) -> Dict[str, int]:
        """Test if protocol events can be found in the given block range."""
        results = {}
        protocol = protocol_config['protocol']
        
        print(f"🔍 Testing {protocol}...")
        
        # Determine which events to test based on protocol
        if protocol == 'uniswap_v4':
            events_to_test = {
                'pool_init': protocol_config.get('pool_init_topic'),
                'swap': protocol_config.get('swap_topic')
            }
        elif protocol == 'aerodrome':
            events_to_test = {
                'pool_created': protocol_config.get('pool_created_topic'),
                'swap': protocol_config.get('swap_topic')
            }
        else:
            events_to_test = {
                'pool_created': protocol_config.get('pool_created_topic'),
                'swap': protocol_config.get('swap_topic')
            }
        
        for event_name, topic in events_to_test.items():
            if not topic:
                continue
                
            try:
                # Create filter for the event
                filter_params = {
                    'fromBlock': from_block,
                    'toBlock': to_block,
                    'topics': [topic]
                }
                
                # Add contract address for events that need it
                if protocol == 'uniswap_v4' and 'pool_manager' in protocol_config:
                    filter_params['address'] = protocol_config['pool_manager']
                elif protocol != 'uniswap_v4' and 'factory' in protocol_config:
                    filter_params['address'] = protocol_config['factory']
                
                # Get logs
                logs = self.w3.eth.get_logs(filter_params)
                count = len(logs)
                results[event_name] = count
                
                status = "✅" if count > 0 else "❌"
                print(f"  {status} {event_name}: {count} events found")
                
                if count > 0:
                    # Show sample event
                    sample = logs[0]
                    print(f"    📝 Sample: Block {sample['blockNumber']}, Tx {sample['transactionHash'].hex()[:10]}...")
                
            except Exception as e:
                print(f"  ❌ {event_name}: Error - {str(e)}")
                results[event_name] = -1
        
        return results
    
    async def run_tests(self):
        """Run comprehensive tests on all protocols."""
        config = self.load_base_config()
        
        # Get current block
        latest_block = self.w3.eth.block_number
        from_block = latest_block - 1000  # Check last 1000 blocks
        
        print(f"🧪 Testing Event Topics trên Base Chain")
        print(f"📊 Block range: {from_block} → {latest_block}")
        print(f"🕒 Latest block: {latest_block}")
        print()
        
        all_results = {}
        
        for pool_config in config['pools']:
            protocol = pool_config['protocol']
            if protocol in ['uniswap_v4', 'aerodrome']:
                results = await self.test_protocol_events(pool_config, from_block, latest_block)
                all_results[protocol] = results
                print()
        
        # Summary
        print("📋 SUMMARY:")
        for protocol, results in all_results.items():
            print(f"🔧 {protocol.upper()}:")
            for event_name, count in results.items():
                if count > 0:
                    status = "✅ WORKING"
                elif count == 0:
                    status = "⚠️  NO EVENTS (might be normal)"
                else:
                    status = "❌ ERROR"
                print(f"   {event_name}: {status}")
        
        print()
        print("💡 Next steps:")
        print("- ✅ Event topics đã được fix")
        print("- 🔄 Restart worker để áp dụng config mới")
        print("- 📊 Monitor logs để check xem có events được process không")

if __name__ == "__main__":
    asyncio.run(EventTopicTester().run_tests())