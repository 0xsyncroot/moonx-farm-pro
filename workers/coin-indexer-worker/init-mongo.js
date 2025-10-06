// MongoDB initialization script for MoonX Coin Indexer Worker
// This script runs when the container starts for the first time

// Switch to moonx_indexer database
db = db.getSiblingDB('moonx_indexer');

// Create collections with validation schema
db.createCollection('tokens', {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["token_address", "chain_id", "source", "name", "symbol", "creator", "creation_block", "creation_tx_hash", "creation_timestamp"],
      properties: {
        token_address: {
          bsonType: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Token contract address - required and must be valid Ethereum address"
        },
        chain_id: {
          bsonType: "int",
          minimum: 1,
          description: "Blockchain chain ID - required and must be positive integer"
        },
        source: {
          bsonType: "string",
          enum: ["creator_coin", "clanker"],
          description: "Token source platform - required"
        },
        name: {
          bsonType: "string",
          maxLength: 100,
          description: "Token name - required"
        },
        symbol: {
          bsonType: "string", 
          maxLength: 20,
          description: "Token symbol - required"
        },
        creator: {
          bsonType: "string",
          pattern: "^0x[a-fA-F0-9]{40}$",
          description: "Token creator address - required"
        },
        creation_block: {
          bsonType: "int",
          minimum: 0,
          description: "Block number when token was created - required"
        },
        creation_tx_hash: {
          bsonType: "string",
          pattern: "^0x[a-fA-F0-9]{64}$",
          description: "Transaction hash of token creation - required"
        },
        status: {
          bsonType: "string",
          enum: ["active", "processing", "error", "audited"],
          description: "Token processing status"
        }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "warn"
});

db.createCollection('indexer_progress', {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["chain_id", "indexer_type", "last_processed_block"],
      properties: {
        chain_id: {
          bsonType: "int",
          minimum: 1,
          description: "Chain ID - required"
        },
        indexer_type: {
          bsonType: "string",
          description: "Type of indexer - required"
        },
        last_processed_block: {
          bsonType: "int",
          minimum: 0,
          description: "Last processed block number - required"
        }
      }
    }
  }
});

// Create indexes for tokens collection
print('Creating indexes for tokens collection...');

// Unique index for token identification
db.tokens.createIndex(
  { "chain_id": 1, "token_address": 1 }, 
  { unique: true, name: "idx_chain_token_unique" }
);

// Query optimization indexes
db.tokens.createIndex(
  { "chain_id": 1, "source": 1 }, 
  { name: "idx_chain_source" }
);

db.tokens.createIndex(
  { "creator": 1 }, 
  { name: "idx_creator" }
);

db.tokens.createIndex(
  { "creation_block": 1 }, 
  { name: "idx_creation_block" }
);

db.tokens.createIndex(
  { "creation_timestamp": -1 }, 
  { name: "idx_creation_timestamp_desc" }
);

db.tokens.createIndex(
  { "status": 1 }, 
  { name: "idx_status" }
);

db.tokens.createIndex(
  { "creation_tx_hash": 1 }, 
  { name: "idx_creation_tx" }
);

// Text search index for name and symbol
db.tokens.createIndex(
  { "name": "text", "symbol": "text" }, 
  { name: "idx_text_search" }
);

// Compound indexes for complex queries
db.tokens.createIndex(
  { "chain_id": 1, "source": 1, "status": 1 }, 
  { name: "idx_chain_source_status" }
);

db.tokens.createIndex(
  { "status": 1, "creation_timestamp": -1 }, 
  { name: "idx_status_timestamp" }
);

// Create indexes for indexer_progress collection
print('Creating indexes for indexer_progress collection...');

db.indexer_progress.createIndex(
  { "chain_id": 1, "indexer_type": 1 }, 
  { unique: true, name: "idx_chain_indexer_unique" }
);

// Create initial progress record for Base chain
print('Creating initial progress record...');

db.indexer_progress.insertOne({
  chain_id: 8453,
  indexer_type: "coin_tokens",
  last_processed_block: 34000000,
  updated_at: new Date(),
  created_at: new Date()
});

// Create admin user if needed (uncomment in production)
/*
db.createUser({
  user: "moonx_indexer",
  pwd: "your_secure_password_here",
  roles: [
    { role: "readWrite", db: "moonx_indexer" }
  ]
});
*/

print('MongoDB initialization completed successfully!');
print('Collections created: tokens, indexer_progress');
print('Indexes created: 10 total indexes for optimal query performance');
print('Initial progress record created for Base chain (ID: 8453)');
