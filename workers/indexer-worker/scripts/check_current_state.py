#!/usr/bin/env python3
"""Check current blockchain state vs our configuration."""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import load_chain_configs, Settings
from services.blockchain_service import BlockchainService


async def check_current_state():
    """Check current state and identify issues."""
    
    print("🔍 CHECKING CURRENT STATE")
    print("="*50)
    
    try:
        # Load config
        chain_configs = load_chain_configs()
        settings = Settings()
        chain_config = chain_configs[8453]  # Base
        
        blockchain_service = BlockchainService(chain_config, settings)
        await blockchain_service.connect()
        
        latest_block = await blockchain_service.get_latest_block()
        print(f"📊 Current Base Chain Latest Block: {latest_block:,}")
        print(f"📊 Chain Config Start Block: {chain_config.start_block:,}")
        
        # Check each protocol's creation block vs current state
        print(f"\n📋 PROTOCOL CREATION BLOCKS vs LATEST BLOCK:")
        print("-" * 60)
        
        issues_found = []
        
        for pool_config in chain_config.pools:
            protocol = pool_config.get("protocol")
            creation_block = pool_config.get("creation_block", 0)
            
            status = "✅ OK"
            issue = ""
            
            if creation_block > latest_block:
                status = "❌ FUTURE"
                issue = f"Creation block is {creation_block - latest_block:,} blocks in the FUTURE!"
                issues_found.append(f"{protocol}: {issue}")
            elif creation_block > latest_block - 1000:
                status = "⚠️  VERY RECENT" 
                issue = f"Only {latest_block - creation_block:,} blocks ago"
            
            print(f"   {protocol:<12}: {creation_block:>10,} | {status} {issue}")
        
        # Check indexer's scanning logic
        print(f"\n🔍 INDEXER SCANNING LOGIC SIMULATION:")
        print("-" * 60)
        
        # Simulate what the indexer would do on first run (using new smart logic)
        max_scan_blocks = min(settings.max_blocks_per_request * 10, 10000)
        
        # Get protocol creation blocks (same logic as indexer)
        enabled_protocols = [p for p in chain_config.pools if p.get("enabled", True)]
        protocol_creation_blocks = [p.get("creation_block", 0) for p in enabled_protocols if p.get("creation_block")]
        valid_creation_blocks = [cb for cb in protocol_creation_blocks if cb <= latest_block]
        
        if valid_creation_blocks:
            min_protocol_creation = min(valid_creation_blocks)
            # New smart logic: If protocols are within 10M blocks, scan from oldest
            max_reasonable_age = 10000000  # 10M blocks back
            oldest_reasonable_block = latest_block - max_reasonable_age
            
            if min_protocol_creation >= oldest_reasonable_block:
                indexer_start_block = min_protocol_creation
                scan_strategy = "oldest_protocol_in_range"
            else:
                newer_protocols = [cb for cb in valid_creation_blocks if cb >= oldest_reasonable_block]
                if newer_protocols:
                    indexer_start_block = min(newer_protocols)
                    scan_strategy = "oldest_newer_protocol"
                else:
                    indexer_start_block = max(latest_block - max_scan_blocks, chain_config.start_block)
                    scan_strategy = "recent_history_fallback"
        else:
            indexer_start_block = max(latest_block - max_scan_blocks, chain_config.start_block)
            scan_strategy = "default_fallback"
        
        indexer_end_block = min(indexer_start_block + settings.max_blocks_per_request, latest_block)
        
        print(f"📊 Indexer would scan on first run:")
        print(f"   Latest block: {latest_block:,}")
        print(f"   Max scan blocks: {max_scan_blocks:,}")
        print(f"   Min protocol creation: {min(valid_creation_blocks):,}" if valid_creation_blocks else "None")
        print(f"   Scan strategy: {scan_strategy}")
        print(f"   Calculated start: {indexer_start_block:,}")
        print(f"   Calculated end: {indexer_end_block:,}")
        print(f"   Actual range: {indexer_end_block - indexer_start_block + 1:,} blocks")
        
        # Now check what happens when protocol creation blocks are applied
        print(f"\n🎯 PROTOCOL-SPECIFIC OPTIMIZATION:")
        print("-" * 60)
        
        for pool_config in chain_config.pools:
            protocol = pool_config.get("protocol")
            creation_block = pool_config.get("creation_block", 0)
            
            # With new smart logic, the indexer already considers all creation blocks
            # So individual protocol optimization is less relevant, but show the analysis
            if indexer_start_block <= creation_block:
                status = "✅ COVERED"
                reason = f"Protocol creation ({creation_block:,}) within scan range"
            else:
                status = "⚠️ MISSED"
                reason = f"Protocol creation ({creation_block:,}) before scan start ({indexer_start_block:,})"
            
            print(f"   {protocol:<12}: {status} | {reason}")
        
        # Major issues summary
        if issues_found:
            print(f"\n⚠️  MAJOR ISSUES FOUND:")
            print("-" * 60)
            for issue in issues_found:
                print(f"   ❌ {issue}")
            
            print(f"\n💡 LIKELY CAUSE:")
            print(f"   Your creation_block values (29M+) are HIGHER than current latest block ({latest_block:,})")
            print(f"   This means these protocols haven't been deployed yet, or blocks are wrong!")
        
        print(f"\n🧪 TESTING CONTRACT EXISTENCE:")
        print("-" * 60)
        
        for pool_config in chain_config.pools:
            protocol = pool_config.get("protocol")
            
            if protocol == "uniswap_v4":
                contract_address = pool_config.get("pool_manager")
                contract_type = "Pool Manager"
            else:
                contract_address = pool_config.get("factory")
                contract_type = "Factory"
            
            try:
                code_result = await blockchain_service.base_blockchain._make_rpc_call(
                    "eth_getCode", [contract_address, "latest"]
                )
                
                if code_result == "0x":
                    status = "❌ NO CODE"
                    details = "Contract not deployed"
                else:
                    status = "✅ HAS CODE"
                    details = f"Code length: {len(code_result)}"
                
                print(f"   {protocol:<12}: {status} | {contract_type}: {contract_address} | {details}")
            
            except Exception as e:
                print(f"   {protocol:<12}: ❌ ERROR | {str(e)[:50]}")
    
    except Exception as e:
        print(f"❌ Check failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await blockchain_service.disconnect()


async def main():
    await check_current_state()


if __name__ == "__main__":
    asyncio.run(main())
