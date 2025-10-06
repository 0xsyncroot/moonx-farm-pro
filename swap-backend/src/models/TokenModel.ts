import { Document, Schema } from 'mongoose';

// Token pool info interface
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

// Token document interface for MongoDB
export interface TokenDocument extends Document {
  token_address: string;
  chain_id: number;
  source: 'creator_coin' | 'clanker';
  name: string;
  symbol: string;
  creator?: string;
  admin?: string;
  payout_recipient?: string;
  platform_referrer?: string;
  
  // Pool/Liquidity information
  base_currency?: string;
  paired_token?: string;
  pool_address?: string;
  pool_id?: string;
  pool_key_hash?: string;
  
  // Pool configuration
  fee_tier?: number;
  tick_spacing?: number;
  starting_tick?: number;
  hooks_address?: string;
  
  // Metadata
  image_url?: string;
  metadata_uri?: string;
  metadata_json?: any;
  context_json?: any;
  
  // Contract information
  locker_address?: string;
  mev_module?: string;
  contract_version?: string;
  
  // Creation tracking
  creation_block?: number;
  creation_tx_hash?: string;
  creation_timestamp?: Date;
  creation_contract?: string;
  
  // Processing status
  status: 'active' | 'processing' | 'error' | 'audited';
  audit_status?: string;
  error_message?: string;
  
  // Raw event data
  raw_event_data?: any;
  additional_metadata?: any;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
}

// Token schema based on DATABASE_SCHEMA.md
export const TokenSchema = new Schema({
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
