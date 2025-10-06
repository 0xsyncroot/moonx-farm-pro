import { Schema, Document } from 'mongoose';

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

// Network document interface for MongoDB
export interface NetworkDocument extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

// Network schema for MongoDB
export const NetworkSchema = new Schema({
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
