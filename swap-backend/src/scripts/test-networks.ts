#!/usr/bin/env ts-node

import { 
  loadNetworks, 
  getNetworks,
  getNetworkByChainId,
  getNetworkKeyByChainId,
  getSupportedChainIds,
  isChainSupported,
  getRpcUrlsByChainId,
  addNetwork,
  removeNetwork,
  clearNetworksCache,
  refreshNetworksCache
} from '../config/networks';
import { networkManager } from '../managers';
import dotenv from 'dotenv';

dotenv.config();

async function testNetworks() {
  console.log('🧪 Testing network loading system...\n');
  
  try {
    // Initialize MongoDB
    await networkManager.initialize();
    console.log('✅ MongoDB initialized\n');

    // Test 1: Load networks
    console.log('📋 Test 1: Loading networks...');
    const networks = await loadNetworks();
    console.log(`✅ Loaded ${Object.keys(networks).length} networks:`);
    Object.values(networks).forEach(network => {
      console.log(`  - ${network.name} (ID: ${network.id}, Chain: ${network.chainId})`);
    });
    console.log();

    // Test 2: Get networks (should use cache)
    console.log('📋 Test 2: Getting networks (cached)...');
    const networks2 = await getNetworks();
    console.log(`✅ Got ${Object.keys(networks2).length} networks from cache\n`);

    // Test 3: Get network by chain ID
    console.log('📋 Test 3: Getting network by chain ID...');
    const baseNetwork = await getNetworkByChainId(8453);
    if (baseNetwork) {
      console.log(`✅ Base network: ${baseNetwork.name} (${baseNetwork.chainId})`);
      console.log(`   RPC: ${baseNetwork.rpc}`);
      console.log(`   Fallbacks: ${baseNetwork.fallbackRpcs?.length || 0} URLs`);
    } else {
      console.log('❌ Base network not found');
    }
    console.log();

    // Test 4: Get network key by chain ID
    console.log('📋 Test 4: Getting network key by chain ID...');
    const networkKey = await getNetworkKeyByChainId(8453);
    console.log(`✅ Network key for chain 8453: ${networkKey}\n`);

    // Test 5: Get supported chain IDs
    console.log('📋 Test 5: Getting supported chain IDs...');
    const chainIds = await getSupportedChainIds();
    console.log(`✅ Supported chains: ${chainIds.join(', ')}\n`);

    // Test 6: Check if chain is supported
    console.log('📋 Test 6: Checking chain support...');
    const isBase = await isChainSupported(8453);
    const isEthereum = await isChainSupported(1);
    console.log(`✅ Base (8453) supported: ${isBase}`);
    console.log(`✅ Ethereum (1) supported: ${isEthereum}\n`);

    // Test 7: Get RPC URLs by chain ID
    console.log('📋 Test 7: Getting RPC URLs...');
    const rpcUrls = await getRpcUrlsByChainId(8453);
    console.log(`✅ Base RPC URLs (${rpcUrls.length}):`);
    rpcUrls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });
    console.log();

    // Test 8: Add a test network
    console.log('📋 Test 8: Adding test network...');
    const testNetwork = {
      id: 'testNetwork',
      name: 'Test Network',
      chainId: 99999,
      rpc: 'https://test-rpc.example.com',
      defaultRpc: 'https://test-rpc.example.com',
      fallbackRpcs: ['https://backup-rpc.example.com'],
      currency: 'TEST',
      logoUrl: 'https://example.com/logo.png',
      explorer: 'https://explorer.example.com',
      multicall3Address: '0x0000000000000000000000000000000000000000',
      blockExplorer: 'https://explorer.example.com',
      blockTime: 5,
      confirmations: 3,
      isActive: true
    };

    const addedNetwork = await addNetwork(testNetwork);
    if (addedNetwork) {
      console.log(`✅ Test network added: ${addedNetwork.name}`);
    } else {
      console.log('❌ Failed to add test network');
    }
    console.log();

    // Test 9: Verify test network was added
    console.log('📋 Test 9: Verifying test network...');
    const retrievedTestNetwork = await getNetworkByChainId(99999);
    if (retrievedTestNetwork) {
      console.log(`✅ Test network retrieved: ${retrievedTestNetwork.name}`);
    } else {
      console.log('❌ Test network not found');
    }
    console.log();

    // Test 10: Cache management
    console.log('📋 Test 10: Testing cache management...');
    clearNetworksCache();
    console.log('✅ Cache cleared');
    
    await refreshNetworksCache();
    console.log('✅ Cache refreshed');
    
    const networksAfterRefresh = await getNetworks();
    console.log(`✅ Networks after refresh: ${Object.keys(networksAfterRefresh).length}\n`);

    // Test 11: Remove test network
    console.log('📋 Test 11: Removing test network...');
    const removed = await removeNetwork(99999);
    if (removed) {
      console.log('✅ Test network removed');
    } else {
      console.log('❌ Failed to remove test network');
    }
    console.log();

    // Test 12: Verify test network was removed
    console.log('📋 Test 12: Verifying test network removal...');
    const removedNetwork = await getNetworkByChainId(99999);
    if (!removedNetwork) {
      console.log('✅ Test network successfully removed');
    } else {
      console.log('❌ Test network still exists');
    }

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await networkManager.cleanup();
    console.log('✅ MongoDB connection closed');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testNetworks()
    .then(() => {
      console.log('🎉 Network tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Network tests failed:', error);
      process.exit(1);
    });
}

export { testNetworks };
