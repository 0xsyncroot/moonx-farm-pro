// MongoDB initialization script for MoonX Indexer

db = db.getSiblingDB('moonx_indexer');

// Create user for the application
db.createUser({
  user: 'moonx_indexer',
  pwd: 'indexer_password_123',
  roles: [
    {
      role: 'readWrite',
      db: 'moonx_indexer'
    }
  ]
});

// Create collections with validation schemas
db.createCollection('pools', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['pool_address', 'chain_id', 'protocol', 'token0', 'token1', 'factory_address', 'creation_block', 'creation_tx_hash', 'creation_timestamp'],
      properties: {
        pool_address: {
          bsonType: 'string',
          description: 'Pool contract address is required'
        },
        chain_id: {
          bsonType: 'int',
          minimum: 1,
          description: 'Chain ID must be a positive integer'
        },
        protocol: {
          enum: ['uniswap_v2', 'uniswap_v3', 'uniswap_v4', 'sushiswap', 'sushiswap_v3', 'pancakeswap_v2', 'pancakeswap_v3', 'balancer_v2', 'curve', 'aerodrome'],
          description: 'Protocol must be a supported DEX protocol'
        },
        token0: {
          bsonType: 'object',
          required: ['address', 'symbol', 'name', 'decimals'],
          description: 'Token0 information is required'
        },
        token1: {
          bsonType: 'object',
          required: ['address', 'symbol', 'name', 'decimals'],
          description: 'Token1 information is required'
        }
      }
    }
  }
});

db.createCollection('swap_events', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['tx_hash', 'log_index', 'pool_address', 'chain_id', 'block_number', 'block_timestamp', 'sender', 'recipient'],
      properties: {
        tx_hash: {
          bsonType: 'string',
          pattern: '^0x[a-fA-F0-9]{64}$',
          description: 'Transaction hash must be a valid hex string'
        },
        log_index: {
          bsonType: 'int',
          minimum: 0,
          description: 'Log index must be non-negative'
        },
        block_number: {
          bsonType: 'int',
          minimum: 0,
          description: 'Block number must be non-negative'
        }
      }
    }
  }
});

db.createCollection('pool_liquidity', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['pool_address', 'chain_id', 'block_number', 'block_timestamp', 'total_liquidity', 'reserve0', 'reserve1'],
      properties: {
        pool_address: {
          bsonType: 'string',
          description: 'Pool address is required'
        },
        chain_id: {
          bsonType: 'int',
          minimum: 1,
          description: 'Chain ID must be positive'
        },
        block_number: {
          bsonType: 'int',
          minimum: 0,
          description: 'Block number must be non-negative'
        }
      }
    }
  }
});

db.createCollection('indexer_progress', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['chain_id', 'indexer_type', 'last_processed_block', 'target_block', 'status', 'started_at', 'updated_at'],
      properties: {
        chain_id: {
          bsonType: 'int',
          minimum: 1,
          description: 'Chain ID must be positive'
        },
        indexer_type: {
          enum: ['pools', 'swaps', 'liquidity'],
          description: 'Indexer type must be valid'
        },
        last_processed_block: {
          bsonType: 'int',
          minimum: 0,
          description: 'Last processed block must be non-negative'
        },
        target_block: {
          bsonType: 'int',
          minimum: 0,
          description: 'Target block must be non-negative'
        }
      }
    }
  }
});

db.createCollection('price_calculations', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['pool_address', 'chain_id', 'tx_hash', 'block_number', 'timestamp', 'price', 'amount0', 'amount1', 'token0', 'token1', 'protocol', 'calculation_method'],
      properties: {
        pool_address: {
          bsonType: 'string',
          description: 'Pool address is required'
        },
        chain_id: {
          bsonType: 'int',
          minimum: 1,
          description: 'Chain ID must be positive'
        },
        tx_hash: {
          bsonType: 'string',
          pattern: '^0x[a-fA-F0-9]{64}$',
          description: 'Transaction hash must be a valid hex string'
        },
        block_number: {
          bsonType: 'int',
          minimum: 0,
          description: 'Block number must be non-negative'
        },
        timestamp: {
          bsonType: 'int',
          minimum: 0,
          description: 'Timestamp must be non-negative'
        },
        price: {
          bsonType: 'double',
          minimum: 0,
          description: 'Price must be non-negative'
        },
        token0: {
          bsonType: 'string',
          pattern: '^0x[a-fA-F0-9]{40}$',
          description: 'Token0 address must be a valid hex string'
        },
        token1: {
          bsonType: 'string',
          pattern: '^0x[a-fA-F0-9]{40}$',
          description: 'Token1 address must be a valid hex string'
        },
        protocol: {
          enum: ['uniswap_v2', 'uniswap_v3', 'uniswap_v4', 'sushiswap', 'sushiswap_v3', 'pancakeswap_v2', 'pancakeswap_v3', 'balancer_v2', 'curve', 'aerodrome'],
          description: 'Protocol must be a supported DEX protocol'
        },
        calculation_method: {
          enum: ['swap', 'pool_state', 'tick', 'reserves'],
          description: 'Calculation method must be valid'
        }
      }
    }
  }
});

print('MongoDB collections created successfully for MoonX Indexer');