#!/usr/bin/env python3
"""
Utility script to fix swap indexing for pools with incorrect start_block logic.

This script will:
1. Find pools where last_indexed_block > creation_block (indicating the bug)
2. Reset swap progress for those pools to start from creation_block
3. Display statistics about the fix

Usage:
    python fix_swap_indexing.py --chain-id 8453 --dry-run  # Preview changes
    python fix_swap_indexing.py --chain-id 8453 --apply    # Apply fixes
"""

import asyncio
import argparse
from typing import List
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import sys

class SwapIndexingFixer:
    def __init__(self, mongodb_url: str = "mongodb://localhost:27017"):
        self.client = AsyncIOMotorClient(mongodb_url)
        self.db = self.client.moonx_indexer
        
    async def find_affected_pools(self, chain_id: int) -> List[dict]:
        """Find pools affected by the start_block bug."""
        # Pools where last_indexed_block doesn't match creation_block
        # and there's no swap progress yet (indicating they haven't been properly indexed)
        pipeline = [
            {"$match": {"chain_id": chain_id}},
            {
                "$lookup": {
                    "from": "indexer_progress",
                    "let": {"pool_addr": "$pool_address", "chain": "$chain_id"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$and": [
                                        {"$eq": ["$pool_address", "$$pool_addr"]},
                                        {"$eq": ["$chain_id", "$$chain"]},
                                        {"$eq": ["$indexer_type", "swaps"]}
                                    ]
                                }
                            }
                        }
                    ],
                    "as": "swap_progress"
                }
            },
            {
                "$match": {
                    "$or": [
                        {"swap_progress": {"$size": 0}},  # No swap progress yet
                        {
                            "$expr": {
                                "$gt": [
                                    {"$arrayElemAt": ["$swap_progress.last_processed_block", 0]},
                                    "$creation_block"
                                ]
                            }
                        }
                    ]
                }
            }
        ]
        
        cursor = self.db.pools.aggregate(pipeline)
        return await cursor.to_list(None)
    
    async def reset_swap_progress(self, pool_address: str, chain_id: int, dry_run: bool = True) -> bool:
        """Reset swap progress for a pool to start from creation_block."""
        if dry_run:
            print(f"  [DRY-RUN] Would reset swap progress for {pool_address}")
            return True
            
        try:
            # Delete existing swap progress
            result = await self.db.indexer_progress.delete_many({
                "chain_id": chain_id,
                "pool_address": pool_address,
                "indexer_type": "swaps"
            })
            
            print(f"  ✅ Reset swap progress for {pool_address} (deleted {result.deleted_count} records)")
            return True
            
        except Exception as e:
            print(f"  ❌ Failed to reset progress for {pool_address}: {e}")
            return False
    
    async def fix_pools(self, chain_id: int, dry_run: bool = True) -> dict:
        """Fix swap indexing for affected pools."""
        print(f"🔍 Analyzing pools on chain {chain_id}...")
        
        affected_pools = await self.find_affected_pools(chain_id)
        
        if not affected_pools:
            print("✅ No pools found with swap indexing issues!")
            return {"total": 0, "fixed": 0, "errors": 0}
        
        print(f"🚨 Found {len(affected_pools)} pools with potential swap indexing issues:")
        print()
        
        stats = {"total": len(affected_pools), "fixed": 0, "errors": 0}
        
        for pool in affected_pools:
            pool_addr = pool["pool_address"]
            creation_block = pool["creation_block"]
            last_indexed = pool.get("last_indexed_block", 0)
            protocol = pool["protocol"]
            
            # Get current swap progress
            swap_progress = pool.get("swap_progress", [])
            current_progress = swap_progress[0] if swap_progress else None
            
            print(f"📊 Pool: {pool_addr}")
            print(f"   Protocol: {protocol}")
            print(f"   Creation block: {creation_block:,}")
            print(f"   Last indexed block: {last_indexed:,}")
            
            if current_progress:
                print(f"   Current swap progress: {current_progress['last_processed_block']:,}")
                if current_progress['last_processed_block'] <= creation_block:
                    print("   ✅ Swap progress looks correct, skipping")
                    continue
            else:
                print("   ⚠️  No swap progress found")
            
            # Calculate missed blocks
            if last_indexed > creation_block:
                missed_blocks = last_indexed - creation_block
                print(f"   🚨 Potentially missed {missed_blocks:,} blocks of swap events!")
            
            # Fix the pool
            success = await self.reset_swap_progress(pool_addr, chain_id, dry_run)
            if success:
                stats["fixed"] += 1
            else:
                stats["errors"] += 1
            
            print()
        
        return stats
    
    async def close(self):
        """Close database connection."""
        self.client.close()

async def main():
    parser = argparse.ArgumentParser(description="Fix swap indexing start_block logic")
    parser.add_argument("--chain-id", type=int, required=True, 
                       help="Chain ID to fix (e.g., 8453 for Base)")
    parser.add_argument("--dry-run", action="store_true", 
                       help="Preview changes without applying them")
    parser.add_argument("--apply", action="store_true", 
                       help="Apply the fixes")
    parser.add_argument("--mongodb-url", default="mongodb://localhost:27017",
                       help="MongoDB connection URL")
    
    args = parser.parse_args()
    
    if not args.dry_run and not args.apply:
        print("❌ Must specify either --dry-run or --apply")
        sys.exit(1)
    
    if args.dry_run and args.apply:
        print("❌ Cannot specify both --dry-run and --apply")
        sys.exit(1)
    
    fixer = SwapIndexingFixer(args.mongodb_url)
    
    try:
        print("🔧 MoonX Swap Indexing Fixer")
        print("=" * 50)
        print()
        
        if args.dry_run:
            print("🔍 DRY RUN MODE - No changes will be made")
        else:
            print("⚡ APPLY MODE - Changes will be applied!")
        print()
        
        stats = await fixer.fix_pools(args.chain_id, dry_run=args.dry_run)
        
        print("📈 Summary:")
        print(f"   Total pools analyzed: {stats['total']}")
        print(f"   Pools fixed: {stats['fixed']}")
        print(f"   Errors: {stats['errors']}")
        
        if args.dry_run and stats['total'] > 0:
            print()
            print("💡 To apply these fixes, run with --apply flag")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    finally:
        await fixer.close()

if __name__ == "__main__":
    asyncio.run(main())