import { Model } from 'mongoose';
import { BaseMongoManager } from './BaseMongoManager';
import { NetworkSchema, NetworkConfig, NetworkDocument } from '../models/NetworkModel';

export class NetworkManager extends BaseMongoManager {
  private NetworkModel: Model<NetworkDocument> | null = null;

  constructor(connectionName: string = 'networks_api', mongoUri?: string, databaseName?: string) {
    super(connectionName, mongoUri, databaseName || 'moonx_networks');
  }

  // Initialize models for network operations
  protected initializeModels(): void {
    this.NetworkModel = this.registerModel<NetworkDocument>('Network', NetworkSchema);
  }

  // Get singleton instance
  public static getInstance(mongoUri?: string, databaseName?: string): NetworkManager {
    return BaseMongoManager.createInstance(NetworkManager, 'networks_api', mongoUri, databaseName);
  }

  // ===== NETWORK MANAGEMENT METHODS =====

  // Get all active networks
  async getNetworks(): Promise<NetworkConfig[]> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    try {
      const networks = await this.NetworkModel!.find({ isActive: true })
        .sort({ chainId: 1 })
        .lean()
        .exec();

      return networks.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        chainId: doc.chainId,
        rpc: doc.rpc,
        defaultRpc: doc.defaultRpc,
        fallbackRpcs: doc.fallbackRpcs || [],
        currency: doc.currency,
        logoUrl: doc.logoUrl,
        explorer: doc.explorer,
        multicall3Address: doc.multicall3Address,
        moonxContractAddress: doc.moonxContractAddress,
        blockExplorer: doc.blockExplorer,
        blockTime: doc.blockTime,
        confirmations: doc.confirmations,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }));
    } catch (error) {
      this.handleDatabaseError(error, 'getNetworks');
    }
  }

  // Get network by chain ID
  async getNetworkByChainId(chainId: number): Promise<NetworkConfig | null> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    try {
      const network = await this.NetworkModel!.findOne({ 
        chainId, 
        isActive: true 
      }).lean().exec();

      if (!network) {
        return null;
      }

      const doc = network as any;
      return {
        id: doc.id,
        name: doc.name,
        chainId: doc.chainId,
        rpc: doc.rpc,
        defaultRpc: doc.defaultRpc,
        fallbackRpcs: doc.fallbackRpcs || [],
        currency: doc.currency,
        logoUrl: doc.logoUrl,
        explorer: doc.explorer,
        multicall3Address: doc.multicall3Address,
        moonxContractAddress: doc.moonxContractAddress,
        blockExplorer: doc.blockExplorer,
        blockTime: doc.blockTime,
        confirmations: doc.confirmations,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getNetworkByChainId');
    }
  }

  // Get network by ID
  async getNetworkById(id: string): Promise<NetworkConfig | null> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    try {
      const network = await this.NetworkModel!.findOne({ 
        id, 
        isActive: true 
      }).lean().exec();

      if (!network) {
        return null;
      }

      const doc = network as any;
      return {
        id: doc.id,
        name: doc.name,
        chainId: doc.chainId,
        rpc: doc.rpc,
        defaultRpc: doc.defaultRpc,
        fallbackRpcs: doc.fallbackRpcs || [],
        currency: doc.currency,
        logoUrl: doc.logoUrl,
        explorer: doc.explorer,
        multicall3Address: doc.multicall3Address,
        moonxContractAddress: doc.moonxContractAddress,
        blockExplorer: doc.blockExplorer,
        blockTime: doc.blockTime,
        confirmations: doc.confirmations,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      };
    } catch (error) {
      this.handleDatabaseError(error, 'getNetworkById');
    }
  }

  // Create or update network
  async upsertNetwork(networkConfig: Omit<NetworkConfig, 'createdAt' | 'updatedAt'>): Promise<NetworkConfig | null> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    try {
      const network = await this.NetworkModel!.findOneAndUpdate(
        { chainId: networkConfig.chainId },
        {
          ...networkConfig,
          updatedAt: new Date()
        },
        { 
          upsert: true, 
          new: true,
          lean: true
        }
      ).exec();

      if (!network) {
        return null;
      }

      const doc = network as any;
      return {
        id: doc.id,
        name: doc.name,
        chainId: doc.chainId,
        rpc: doc.rpc,
        defaultRpc: doc.defaultRpc,
        fallbackRpcs: doc.fallbackRpcs || [],
        currency: doc.currency,
        logoUrl: doc.logoUrl,
        explorer: doc.explorer,
        multicall3Address: doc.multicall3Address,
        moonxContractAddress: doc.moonxContractAddress,
        blockExplorer: doc.blockExplorer,
        blockTime: doc.blockTime,
        confirmations: doc.confirmations,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      };
    } catch (error) {
      this.handleDatabaseError(error, 'upsertNetwork');
    }
  }

  // Bulk upsert networks (for performance)
  async bulkUpsertNetworks(networks: Omit<NetworkConfig, 'createdAt' | 'updatedAt'>[]): Promise<boolean> {
    if (!this.NetworkModel || networks.length === 0) {
      return false;
    }

    try {
      const operations = networks.map(network => ({
        updateOne: {
          filter: { chainId: network.chainId },
          update: { 
            ...network,
            updatedAt: new Date()
          },
          upsert: true
        }
      }));

      const result = await this.NetworkModel!.bulkWrite(operations);
      console.log(`✅ Bulk upserted ${result.upsertedCount + result.modifiedCount} networks`);
      return true;
    } catch (error) {
      this.handleDatabaseError(error, 'bulkUpsertNetworks');
    }
  }

  // Deactivate network (soft delete)
  async deactivateNetwork(chainId: number): Promise<boolean> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    try {
      const result = await this.NetworkModel!.updateOne(
        { chainId },
        { 
          isActive: false,
          updatedAt: new Date()
        }
      ).exec();

      return result.modifiedCount > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'deactivateNetwork');
    }
  }

  // Activate network
  async activateNetwork(chainId: number): Promise<boolean> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    try {
      const result = await this.NetworkModel!.updateOne(
        { chainId },
        { 
          isActive: true,
          updatedAt: new Date()
        }
      ).exec();

      return result.modifiedCount > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'activateNetwork');
    }
  }

  // Get supported chain IDs
  async getSupportedChainIds(): Promise<number[]> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    try {
      const networks = await this.NetworkModel!.find({ isActive: true })
        .select('chainId')
        .lean()
        .exec();

      return networks.map((network: any) => network.chainId);
    } catch (error) {
      this.handleDatabaseError(error, 'getSupportedChainIds');
    }
  }

  // Initialize default networks (migration helper)
  async initializeDefaultNetworks(): Promise<void> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    // MOONX_CONTRACT_ADDRESSES from networks.ts
    const MOONX_CONTRACT_ADDRESSES: Record<number, string> = {
      8453: process.env.MOONX_BASE_CONTRACT_ADDRESS || '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630',
      18453: process.env.MOONX_DEV_TEST_CONTRACT_ADDRESS || '0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630'
    };

    const defaultNetworks: Omit<NetworkConfig, 'createdAt' | 'updatedAt'>[] = [
      {
        id: 'base',
        name: 'Base',
        chainId: 8453,
        rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
        defaultRpc: 'https://mainnet.base.org',
        fallbackRpcs: [
          process.env.BASE_BACKUP_RPC_URL || 'https://mainnet.base.org',
          'https://base.llamarpc.com',
          'https://base-rpc.publicnode.com',
          'https://base.drpc.org',
          'https://1rpc.io/base',
          'https://base.gateway.tenderly.co'
        ],
        currency: 'ETH',
        logoUrl: 'https://raw.githubusercontent.com/base/brand-kit/refs/heads/main/logo/TheSquare/Digital/Base_square_blue.png',
        explorer: 'https://basescan.org',
        multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
        moonxContractAddress: MOONX_CONTRACT_ADDRESSES[8453],
        blockExplorer: 'https://basescan.org',
        blockTime: 2,
        confirmations: 1,
        isActive: true
      },
      {
        id: 'baseDevTest',
        name: 'Dev Test',
        chainId: 18453,
        rpc: process.env.DEV_TEST_RPC_URL || 'http://localhost:8645',
        defaultRpc: 'http://localhost:8645',
        fallbackRpcs: [
          process.env.DEV_TEST_RPC_URL || 'http://localhost:8645'
        ],
        currency: 'ETH',
        logoUrl: 'https://raw.githubusercontent.com/base/brand-kit/refs/heads/main/logo/TheSquare/Digital/Base_square_blue.png',
        explorer: 'https://basescan.org',
        multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
        moonxContractAddress: MOONX_CONTRACT_ADDRESSES[18453],
        blockExplorer: 'https://basescan.org',
        blockTime: 2,
        confirmations: 1,
        isActive: true
      }
    ];

    try {
      await this.bulkUpsertNetworks(defaultNetworks);
      console.log('✅ Default networks initialized');
    } catch (error) {
      console.error('❌ Error initializing default networks:', error);
    }
  }

  // Get network stats
  async getNetworkStats(): Promise<{ 
    totalNetworks: number; 
    activeNetworks: number;
    networksByStatus: Record<string, number>;
  }> {
    if (!this.NetworkModel) {
      await this.initialize();
    }

    try {
      const [totalResult, activeResult, statusResult] = await Promise.all([
        this.NetworkModel!.countDocuments({}),
        this.NetworkModel!.countDocuments({ isActive: true }),
        this.NetworkModel!.aggregate([
          { $group: { _id: '$isActive', count: { $sum: 1 } } }
        ])
      ]);

      const networksByStatus: Record<string, number> = {};
      statusResult.forEach((item: any) => {
        networksByStatus[item._id ? 'active' : 'inactive'] = item.count;
      });

      return {
        totalNetworks: totalResult,
        activeNetworks: activeResult,
        networksByStatus
      };
    } catch (error) {
      console.error('Error getting network stats:', error);
      return { totalNetworks: 0, activeNetworks: 0, networksByStatus: {} };
    }
  }

  // Get Network model for advanced operations
  getNetworkModel(): Model<NetworkDocument> | null {
    return this.NetworkModel;
  }
}
