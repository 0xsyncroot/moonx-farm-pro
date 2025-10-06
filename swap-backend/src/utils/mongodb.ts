import mongoose, { Connection, Schema, Model } from 'mongoose';
import { Network, Token } from '../types';

export interface TokenPoolInfo {
  token_address: string;
  chain_id: number;
  source: 'creator_coin' | 'clanker';
  hooks_address: string;
  fee_tier: number;
  tick_spacing: number;
  paired_token: string;
  pool_key_hash?: string;
  pool_id?: string;
  base_currency?: string;
  status: string;
}

// Network configuration interface for MongoDB
export interface NetworkConfig {
  id: string;
  name: string;
  chainId: number;
  rpc: string;
  defaultRpc: string;
  fallbackRpcs: string[];
  currency: string;
  logoUrl: string;
  explorer: string;
  multicall3Address: string;
  moonxContractAddress?: string;
  blockExplorer: string;
  blockTime: number;
  confirmations: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Token schema based on DATABASE_SCHEMA.md
const TokenSchema = new Schema({
  token_address: { type: String, required: true },
  chain_id: { type: Number, required: true },
  source: { type: String, required: true, enum: ['creator_coin', 'clanker'] },
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  creator: String,
  admin: String,
  payout_recipient: String,
  platform_referrer: String,
  
  // Pool/Liquidity information
  base_currency: String,
  paired_token: String,
  pool_address: String,
  pool_id: String,
  pool_key_hash: String,
  
  // Pool configuration
  fee_tier: Number,
  tick_spacing: Number,
  starting_tick: Number,
  hooks_address: String,
  
  // Metadata
  image_url: String,
  metadata_uri: String,
  metadata_json: Schema.Types.Mixed,
  context_json: Schema.Types.Mixed,
  
  // Contract information
  locker_address: String,
  mev_module: String,
  contract_version: String,
  
  // Creation tracking
  creation_block: Number,
  creation_tx_hash: String,
  creation_timestamp: Date,
  creation_contract: String,
  
  // Processing status
  status: { type: String, required: true, enum: ['active', 'processing', 'error', 'audited'] },
  audit_status: String,
  error_message: String,
  
  // Raw event data
  raw_event_data: Schema.Types.Mixed,
  additional_metadata: Schema.Types.Mixed,
  
  // Repository timestamps
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  collection: 'tokens',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes based on DATABASE_SCHEMA.md
TokenSchema.index({ chain_id: 1, token_address: 1 }, { unique: true });
TokenSchema.index({ chain_id: 1, source: 1 });
TokenSchema.index({ creator: 1 });
TokenSchema.index({ creation_block: 1 });
TokenSchema.index({ creation_timestamp: -1 });
TokenSchema.index({ status: 1 });
TokenSchema.index({ creation_tx_hash: 1 });
TokenSchema.index({ name: 'text', symbol: 'text' });

// Network schema for MongoDB
const NetworkSchema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  chainId: { type: Number, required: true, unique: true },
  rpc: { type: String, required: true },
  defaultRpc: { type: String, required: true },
  fallbackRpcs: [{ type: String }],
  currency: { type: String, required: true },
  logoUrl: { type: String, required: true },
  explorer: { type: String, required: true },
  multicall3Address: { type: String, required: true },
  moonxContractAddress: { type: String },
  blockExplorer: { type: String, required: true },
  blockTime: { type: Number, required: true, default: 2 },
  confirmations: { type: Number, required: true, default: 1 },
  isActive: { type: Boolean, required: true, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { 
  collection: 'networks',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Network indexes
NetworkSchema.index({ chainId: 1 }, { unique: true });
NetworkSchema.index({ id: 1 }, { unique: true });
NetworkSchema.index({ isActive: 1 });
NetworkSchema.index({ name: 1 });

export class MongoDBManager {
  private static instance: MongoDBManager;
  private connection: Connection | null = null;
  private TokenModel: Model<any> | null = null;
  private NetworkModel: Model<any> | null = null;

  private constructor() {}

  public static getInstance(): MongoDBManager {
    if (!MongoDBManager.instance) {
      MongoDBManager.instance = new MongoDBManager();
    }
    return MongoDBManager.instance;
  }

  // Initialize MongoDB connection
  async initialize(): Promise<void> {
    if (this.connection?.readyState === 1) {
      return; // Already connected
    }

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/moonx_indexer';
    
    try {
      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false
      });

      this.connection = mongoose.connection;
      this.TokenModel = mongoose.model('Token', TokenSchema);
      this.NetworkModel = mongoose.model('Network', NetworkSchema);
      
      console.log('✅ MongoDB connected');
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  // Get token pool information from database
  async getTokenPoolInfo(tokenAddress: string, chainId: number): Promise<TokenPoolInfo | null> {
    if (!this.TokenModel) {
      await this.initialize();
    }

    try {
      const tokenDoc = await this.TokenModel!.findOne({
        token_address: { $regex: new RegExp(`^${tokenAddress}$`, 'i') },
        chain_id: chainId,
        status: 'active'
      }).lean().exec();

      if (!tokenDoc) {
        console.log(`🔍 Token not found in DB: ${tokenAddress} on chain ${chainId}`);
        return null;
      } else {
        console.log(`🔍 Token found in DB: ${tokenAddress} on chain ${chainId}`);
      }

      const doc = tokenDoc as any;
      
      return {
        token_address: doc.token_address,
        chain_id: doc.chain_id,
        source: doc.source,
        hooks_address: doc.hooks_address,
        fee_tier: doc.fee_tier,
        tick_spacing: doc.tick_spacing,
        paired_token: doc.paired_token,
        pool_key_hash: doc.pool_key_hash,
        pool_id: doc.pool_id,
        base_currency: doc.base_currency,
        status: doc.status
      };
    } catch (error) {
      console.error('Error querying token from MongoDB:', error);
      return null;
    }
  }

  // Get multiple tokens pool info at once
  async getMultipleTokenPoolInfos(tokenAddresses: string[], chainId: number): Promise<Record<string, TokenPoolInfo | null>> {
    if (!this.TokenModel) {
      await this.initialize();
    }

    const result: Record<string, TokenPoolInfo | null> = {};

    try {
      const orQueries = tokenAddresses.map(addr => ({
        token_address: { $regex: new RegExp(`^${addr}$`, 'i') }
      }));
      
      const tokenDocs = await this.TokenModel!.find({
        $or: orQueries,
        chain_id: chainId,
        status: 'active'
      }).lean().exec();

      tokenAddresses.forEach(addr => {
        result[addr.toLowerCase()] = null;
      });

      tokenDocs.forEach((doc: any) => {
        const matchingAddress = tokenAddresses.find(addr => 
          addr.toLowerCase() === doc.token_address.toLowerCase()
        );
        
        if (matchingAddress) {
          result[matchingAddress.toLowerCase()] = {
            token_address: doc.token_address,
            chain_id: doc.chain_id,
            source: doc.source,
            hooks_address: doc.hooks_address,
            fee_tier: doc.fee_tier,
            tick_spacing: doc.tick_spacing,
            paired_token: doc.paired_token,
            pool_key_hash: doc.pool_key_hash,
            pool_id: doc.pool_id,
            base_currency: doc.base_currency,
            status: doc.status
          };
        }
      });
      return result;
    } catch (error) {
      console.error('Error querying multiple tokens from MongoDB:', error);
      return result;
    }
  }

  // Search tokens by name/symbol
  async searchTokens(query: string, chainId: number, limit: number = 20): Promise<TokenPoolInfo[]> {
    if (!this.TokenModel) {
      await this.initialize();
    }

    try {
      const tokenDocs = await this.TokenModel!.find({
        $text: { $search: query },
        chain_id: chainId,
        status: 'active'
      })
      .limit(limit)
      .lean()
      .exec();

      return tokenDocs.map((doc: any) => ({
        token_address: doc.token_address,
        chain_id: doc.chain_id,
        source: doc.source,
        hooks_address: doc.hooks_address,
        fee_tier: doc.fee_tier,
        tick_spacing: doc.tick_spacing,
        paired_token: doc.paired_token,
        pool_key_hash: doc.pool_key_hash,
        pool_id: doc.pool_id,
        base_currency: doc.base_currency,
        status: doc.status
      }));
    } catch (error) {
      console.error('Error searching tokens:', error);
      return [];
    }
  }

  // Get tokens by creator
  async getTokensByCreator(creator: string, chainId: number, limit: number = 50): Promise<TokenPoolInfo[]> {
    if (!this.TokenModel) {
      await this.initialize();
    }

    try {
      const tokenDocs = await this.TokenModel!.find({
        creator: creator.toLowerCase(),
        chain_id: chainId,
        status: 'active'
      })
      .sort({ creation_timestamp: -1 })
      .limit(limit)
      .lean()
      .exec();

      return tokenDocs.map((doc: any) => ({
        token_address: doc.token_address,
        chain_id: doc.chain_id,
        source: doc.source,
        hooks_address: doc.hooks_address,
        fee_tier: doc.fee_tier,
        tick_spacing: doc.tick_spacing,
        paired_token: doc.paired_token,
        pool_key_hash: doc.pool_key_hash,
        pool_id: doc.pool_id,
        base_currency: doc.base_currency,
        status: doc.status
      }));
    } catch (error) {
      console.error('Error getting tokens by creator:', error);
      return [];
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection) {
        return false;
      }
      
      const state = this.connection.readyState;
      return state === 1;
    } catch (error) {
      console.error('MongoDB health check failed:', error);
      return false;
    }
  }

  // Get MongoDB connection for advanced operations
  getConnection(): Connection | null {
    return this.connection;
  }

  // Get Token model for advanced operations
  getTokenModel(): Model<any> | null {
    return this.TokenModel;
  }

  // Get Network model for advanced operations
  getNetworkModel(): Model<any> | null {
    return this.NetworkModel;
  }

  // Cleanup connection
  async cleanup(): Promise<void> {
    try {
      if (this.connection?.readyState === 1) {
        await mongoose.disconnect();
        console.log('✅ MongoDB disconnected');
      }
      this.connection = null;
      this.TokenModel = null;
      this.NetworkModel = null;
    } catch (error) {
      console.error('Error disconnecting MongoDB:', error);
    }
  }

  // Get database stats
  async getStats(): Promise<{ totalTokens: number; tokensByChain: Record<string, number> }> {
    if (!this.TokenModel) {
      return { totalTokens: 0, tokensByChain: {} };
    }

    try {
      const [totalResult, chainResult] = await Promise.all([
        this.TokenModel.countDocuments({ status: 'active' }),
        this.TokenModel.aggregate([
          { $match: { status: 'active' } },
          { $group: { _id: '$chain_id', count: { $sum: 1 } } }
        ])
      ]);

      const tokensByChain: Record<string, number> = {};
      chainResult.forEach((item: any) => {
        tokensByChain[item._id.toString()] = item.count;
      });

      return {
        totalTokens: totalResult,
        tokensByChain
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { totalTokens: 0, tokensByChain: {} };
    }
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
      console.error('Error getting networks:', error);
      return [];
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
      console.error('Error getting network by chain ID:', error);
      return null;
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
      console.error('Error getting network by ID:', error);
      return null;
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
      console.error('Error upserting network:', error);
      return null;
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
      console.error('Error deactivating network:', error);
      return false;
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
      console.error('Error getting supported chain IDs:', error);
      return [];
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
      for (const network of defaultNetworks) {
        await this.upsertNetwork(network);
      }
      console.log('✅ Default networks initialized');
    } catch (error) {
      console.error('❌ Error initializing default networks:', error);
    }
  }
}

// Export singleton instance
export const mongoManager = MongoDBManager.getInstance();