#!/usr/bin/env ts-node

import { networkManager } from '../managers';
import { NetworkConfig } from '../models';
import dotenv from 'dotenv';

dotenv.config();

async function migrateNetworks() {
  console.log('🚀 Starting network migration...');
  
  try {
    // Initialize MongoDB connection
    await networkManager.initialize();
    console.log('✅ MongoDB connected');

    // Initialize default networks
    await networkManager.initializeDefaultNetworks();
    console.log('✅ Default networks initialized');

    // Verify networks were created
    const networks = await networkManager.getNetworks();
    console.log(`✅ Migration completed. ${networks.length} networks available:`);
    
    networks.forEach((network: NetworkConfig) => {
      console.log(`  - ${network.name} (Chain ID: ${network.chainId})`);
    });

    // Test network retrieval
    console.log('\n🧪 Testing network retrieval...');
    
    const baseNetwork = await networkManager.getNetworkByChainId(8453);
    if (baseNetwork) {
      console.log(`✅ Base network found: ${baseNetwork.name}`);
    } else {
      console.log('❌ Base network not found');
    }

    const devTestNetwork = await networkManager.getNetworkById('baseDevTest');
    if (devTestNetwork) {
      console.log(`✅ Dev Test network found: ${devTestNetwork.name}`);
    } else {
      console.log('❌ Dev Test network not found');
    }

    const supportedChainIds = await networkManager.getSupportedChainIds();
    console.log(`✅ Supported chain IDs: ${supportedChainIds.join(', ')}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await networkManager.cleanup();
    console.log('✅ MongoDB connection closed');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateNetworks()
    .then(() => {
      console.log('🎉 Network migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Network migration failed:', error);
      process.exit(1);
    });
}

export { migrateNetworks };
