#!/usr/bin/env python3
"""Validate and update creation blocks for all protocols."""

import asyncio
import json
import sys
from pathlib import Path
from typing import Dict, Any

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import load_chain_configs, Settings
from services.blockchain_service import BlockchainService
from services.creation_block_detector import CreationBlockDetector


async def validate_creation_blocks_for_chain(chain_id: int) -> Dict[str, Any]:
    """Validate creation blocks for a specific chain."""
    
    # Load configurations
    chain_configs = load_chain_configs()
    settings = Settings()
    
    if chain_id not in chain_configs:
        print(f"❌ Chain {chain_id} not found in configurations")
        return {}
    
    chain_config = chain_configs[chain_id]
    print(f"\n🔍 Validating creation blocks for {chain_config.name} (Chain ID: {chain_id})")
    
    # Initialize blockchain service
    blockchain_service = BlockchainService(chain_config, settings)
    await blockchain_service.connect()
    
    try:
        # Initialize detector
        detector = CreationBlockDetector(blockchain_service.base_blockchain)
        
        # Track results
        validation_results = {}
        
        # Validate each protocol
        for i, pool_config in enumerate(chain_config.pools):
            protocol = pool_config.get("protocol")
            current_creation_block = pool_config.get("creation_block")
            
            print(f"\n📊 [{i+1}/{len(chain_config.pools)}] Validating {protocol}...")
            print(f"   Current config: {current_creation_block:,}" if current_creation_block else "   Current config: Not set")
            
            # Detect actual creation block
            detected_block = await detector.detect_protocol_creation_block(pool_config)
            
            if detected_block:
                print(f"   🎯 Detected: {detected_block:,}")
                
                if current_creation_block:
                    diff = abs(detected_block - current_creation_block)
                    if diff > 100000:
                        print(f"   ⚠️  Large difference: {diff:,} blocks")
                        validation_results[protocol] = {
                            "current": current_creation_block,
                            "detected": detected_block,
                            "difference": diff,
                            "recommendation": "UPDATE_NEEDED"
                        }
                    else:
                        print(f"   ✅ Close match (diff: {diff:,} blocks)")
                        validation_results[protocol] = {
                            "current": current_creation_block,
                            "detected": detected_block,
                            "difference": diff,
                            "recommendation": "OK"
                        }
                else:
                    print("   📝 Missing in config - will add detected value")
                    validation_results[protocol] = {
                        "current": None,
                        "detected": detected_block,
                        "difference": None,
                        "recommendation": "ADD_DETECTED"
                    }
            else:
                print("   ❌ Could not detect creation block")
                validation_results[protocol] = {
                    "current": current_creation_block,
                    "detected": None,
                    "difference": None,
                    "recommendation": "KEEP_CURRENT" if current_creation_block else "MANUAL_RESEARCH_NEEDED"
                }
        
        return validation_results
        
    finally:
        await blockchain_service.disconnect()


def update_config_file(chain_id: int, validation_results: Dict[str, Any]):
    """Update the config file with corrected creation blocks."""
    
    config_dir = Path(__file__).parent.parent / "config" / "chains"
    
    # Find config file
    config_file = None
    for file_path in config_dir.glob("*.json"):
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            if data.get("chain_id") == chain_id:
                config_file = file_path
                break
        except Exception:
            continue
    
    if not config_file:
        print(f"❌ Could not find config file for chain {chain_id}")
        return
    
    print(f"\n📝 Updating config file: {config_file}")
    
    # Load current config
    with open(config_file, 'r') as f:
        config_data = json.load(f)
    
    # Update creation blocks
    updated_count = 0
    for pool_config in config_data["pools"]:
        protocol = pool_config.get("protocol")
        if protocol in validation_results:
            result = validation_results[protocol]
            
            if result["recommendation"] in ["UPDATE_NEEDED", "ADD_DETECTED"]:
                old_value = pool_config.get("creation_block")
                new_value = result["detected"]
                
                pool_config["creation_block"] = new_value
                updated_count += 1
                
                print(f"   ✏️  {protocol}: {old_value} → {new_value}")
    
    if updated_count > 0:
        # Write updated config
        with open(config_file, 'w') as f:
            json.dump(config_data, f, indent=2)
        
        print(f"✅ Updated {updated_count} creation blocks in {config_file}")
    else:
        print("ℹ️  No updates needed")


def print_summary(validation_results: Dict[str, Any]):
    """Print validation summary."""
    print("\n" + "="*60)
    print("📊 VALIDATION SUMMARY")
    print("="*60)
    
    categories = {
        "OK": [],
        "UPDATE_NEEDED": [],
        "ADD_DETECTED": [],
        "KEEP_CURRENT": [],
        "MANUAL_RESEARCH_NEEDED": []
    }
    
    for protocol, result in validation_results.items():
        categories[result["recommendation"]].append(protocol)
    
    for category, protocols in categories.items():
        if protocols:
            icon = {"OK": "✅", "UPDATE_NEEDED": "⚠️", "ADD_DETECTED": "📝", 
                   "KEEP_CURRENT": "📌", "MANUAL_RESEARCH_NEEDED": "❌"}[category]
            print(f"{icon} {category}: {', '.join(protocols)}")


async def main():
    """Main validation script."""
    print("🚀 Creation Block Validator")
    print("="*50)
    
    # Default to Base chain
    chain_id = 8453
    
    if len(sys.argv) > 1:
        try:
            chain_id = int(sys.argv[1])
        except ValueError:
            print("❌ Invalid chain ID. Using default (8453 - Base)")
    
    try:
        # Validate creation blocks
        validation_results = await validate_creation_blocks_for_chain(chain_id)
        
        if not validation_results:
            print("❌ No validation results")
            return
        
        # Print summary
        print_summary(validation_results)
        
        # Ask if user wants to update config
        print("\n" + "="*60)
        update_config = input("🤔 Update config file with detected values? (y/N): ").strip().lower()
        
        if update_config in ['y', 'yes']:
            update_config_file(chain_id, validation_results)
        else:
            print("ℹ️  Config file not updated")
        
        print("\n✅ Validation completed!")
        
    except KeyboardInterrupt:
        print("\n❌ Validation cancelled by user")
    except Exception as e:
        print(f"\n❌ Validation failed: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
