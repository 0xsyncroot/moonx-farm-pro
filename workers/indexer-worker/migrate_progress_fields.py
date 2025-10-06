#!/usr/bin/env python3
"""
Migration script to fix IndexerProgress records missing required fields.

This script will:
1. Find progress records missing target_block or started_at
2. Set default values for these fields
3. Update the records in database

Usage:
    python migrate_progress_fields.py --dry-run  # Preview changes
    python migrate_progress_fields.py --apply    # Apply fixes
"""

import asyncio
import argparse
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import sys

class ProgressFieldsMigrator:
    def __init__(self, mongodb_url: str = "mongodb://localhost:27017"):
        self.client = AsyncIOMotorClient(mongodb_url)
        self.db = self.client.moonx_indexer
        
    async def find_incomplete_records(self):
        """Find progress records missing required fields."""
        # Find records missing target_block or started_at
        missing_target = await self.db.indexer_progress.count_documents({
            "target_block": {"$exists": False}
        })
        
        missing_started = await self.db.indexer_progress.count_documents({
            "started_at": {"$exists": False}
        })
        
        # Get sample records to understand the issue
        sample_records = await self.db.indexer_progress.find({
            "$or": [
                {"target_block": {"$exists": False}},
                {"started_at": {"$exists": False}}
            ]
        }).limit(5).to_list(None)
        
        return {
            "missing_target": missing_target,
            "missing_started": missing_started,
            "sample_records": sample_records
        }
    
    async def migrate_records(self, dry_run: bool = True):
        """Migrate records to add missing fields."""
        current_time = datetime.utcnow()
        
        # Update records missing target_block
        if dry_run:
            target_count = await self.db.indexer_progress.count_documents({
                "target_block": {"$exists": False}
            })
            print(f"  [DRY-RUN] Would update {target_count} records missing target_block")
        else:
            result = await self.db.indexer_progress.update_many(
                {"target_block": {"$exists": False}},
                {
                    "$set": {
                        "target_block": 0  # Default to 0, will be updated by next indexing run
                    }
                }
            )
            print(f"  ✅ Updated {result.modified_count} records with target_block")
        
        # Update records missing started_at
        if dry_run:
            started_count = await self.db.indexer_progress.count_documents({
                "started_at": {"$exists": False}
            })
            print(f"  [DRY-RUN] Would update {started_count} records missing started_at")
        else:
            result = await self.db.indexer_progress.update_many(
                {"started_at": {"$exists": False}},
                {
                    "$set": {
                        "started_at": current_time
                    }
                }
            )
            print(f"  ✅ Updated {result.modified_count} records with started_at")
        
        # Also ensure status field exists with default value
        if dry_run:
            status_count = await self.db.indexer_progress.count_documents({
                "$or": [
                    {"status": {"$exists": False}},
                    {"status": None}
                ]
            })
            print(f"  [DRY-RUN] Would update {status_count} records missing status")
        else:
            result = await self.db.indexer_progress.update_many(
                {
                    "$or": [
                        {"status": {"$exists": False}},
                        {"status": None}
                    ]
                },
                {
                    "$set": {
                        "status": "running"
                    }
                }
            )
            print(f"  ✅ Updated {result.modified_count} records with status")
        
        return True
    
    async def close(self):
        """Close database connection."""
        self.client.close()

async def main():
    parser = argparse.ArgumentParser(description="Migrate IndexerProgress fields")
    parser.add_argument("--dry-run", action="store_true", 
                       help="Preview changes without applying them")
    parser.add_argument("--apply", action="store_true", 
                       help="Apply the migration")
    parser.add_argument("--mongodb-url", default="mongodb://localhost:27017",
                       help="MongoDB connection URL")
    
    args = parser.parse_args()
    
    if not args.dry_run and not args.apply:
        print("❌ Must specify either --dry-run or --apply")
        sys.exit(1)
    
    if args.dry_run and args.apply:
        print("❌ Cannot specify both --dry-run and --apply")
        sys.exit(1)
    
    migrator = ProgressFieldsMigrator(args.mongodb_url)
    
    try:
        print("🔧 IndexerProgress Fields Migration")
        print("=" * 50)
        print()
        
        # Analyze current state
        print("🔍 Analyzing current progress records...")
        analysis = await migrator.find_incomplete_records()
        
        print(f"Records missing target_block: {analysis['missing_target']}")
        print(f"Records missing started_at: {analysis['missing_started']}")
        print()
        
        if analysis['sample_records']:
            print("📊 Sample incomplete records:")
            for record in analysis['sample_records'][:3]:
                print(f"  - Chain {record['chain_id']}, Type: {record['indexer_type']}")
                print(f"    Pool: {record.get('pool_address', 'Global')}")
                missing_fields = []
                if 'target_block' not in record:
                    missing_fields.append('target_block')
                if 'started_at' not in record:
                    missing_fields.append('started_at')
                print(f"    Missing: {', '.join(missing_fields)}")
            print()
        
        if analysis['missing_target'] == 0 and analysis['missing_started'] == 0:
            print("✅ All progress records have required fields!")
            return
        
        if args.dry_run:
            print("🔍 DRY RUN MODE - No changes will be made")
        else:
            print("⚡ APPLY MODE - Applying migration!")
        print()
        
        await migrator.migrate_records(dry_run=args.dry_run)
        
        if args.dry_run:
            print()
            print("💡 To apply these changes, run with --apply flag")
        else:
            print()
            print("✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    finally:
        await migrator.close()

if __name__ == "__main__":
    asyncio.run(main())