import { Model } from 'mongoose';
import { BaseMongoManager } from './BaseMongoManager';
import { TokenSchema, TokenPoolInfo, TokenDocument } from '../models/TokenModel';

export class TokenManager extends BaseMongoManager {
  private TokenModel: Model<TokenDocument> | null = null;

  constructor(connectionName: string = 'tokens', mongoUri?: string, databaseName?: string) {
    super(connectionName, mongoUri, databaseName || 'moonx_indexer');
  }

  // Initialize models for token operations
  protected initializeModels(): void {
    this.TokenModel = this.registerModel<TokenDocument>('Token', TokenSchema);
  }

  // Get singleton instance
  public static getInstance(mongoUri?: string, databaseName?: string): TokenManager {
    return BaseMongoManager.createInstance(TokenManager, 'tokens', mongoUri, databaseName);
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
      this.handleDatabaseError(error, 'getTokenPoolInfo');
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

  // Get database stats for tokens
  async getTokenStats(): Promise<{ totalTokens: number; tokensByChain: Record<string, number> }> {
    if (!this.TokenModel) {
      await this.initialize();
    }

    try {
      const [totalResult, chainResult] = await Promise.all([
        this.TokenModel!.countDocuments({ status: 'active' }),
        this.TokenModel!.aggregate([
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
      console.error('Error getting token stats:', error);
      return { totalTokens: 0, tokensByChain: {} };
    }
  }

  // Create or update token
  async upsertToken(tokenData: Partial<TokenDocument>): Promise<TokenDocument | null> {
    if (!this.TokenModel) {
      await this.initialize();
    }

    try {
      const result = await this.TokenModel!.findOneAndUpdate(
        { 
          token_address: tokenData.token_address,
          chain_id: tokenData.chain_id 
        },
        {
          ...tokenData,
          updated_at: new Date()
        },
        { 
          upsert: true, 
          new: true 
        }
      ).exec();

      return result;
    } catch (error) {
      this.handleDatabaseError(error, 'upsertToken');
    }
  }

  // Bulk upsert tokens (for performance)
  async bulkUpsertTokens(tokens: Partial<TokenDocument>[]): Promise<boolean> {
    if (!this.TokenModel || tokens.length === 0) {
      return false;
    }

    try {
      const operations = tokens.map(token => ({
        updateOne: {
          filter: { 
            token_address: token.token_address,
            chain_id: token.chain_id 
          },
          update: { 
            ...token,
            updated_at: new Date()
          },
          upsert: true
        }
      }));

      const result = await this.TokenModel!.bulkWrite(operations);
      console.log(`✅ Bulk upserted ${result.upsertedCount + result.modifiedCount} tokens`);
      return true;
    } catch (error) {
      this.handleDatabaseError(error, 'bulkUpsertTokens');
    }
  }

  // Get Token model for advanced operations
  getTokenModel(): Model<TokenDocument> | null {
    return this.TokenModel;
  }
}
