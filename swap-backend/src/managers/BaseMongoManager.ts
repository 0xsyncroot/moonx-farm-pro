import mongoose, { Connection, Model } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export abstract class BaseMongoManager {
  protected connection: Connection | null = null;
  protected models: Map<string, Model<any>> = new Map();
  protected isInitialized: boolean = false;
  
  private static instances: Map<string, BaseMongoManager> = new Map();

  constructor(
    protected connectionName: string,
    protected mongoUri?: string,
    protected databaseName: string = 'moonx_indexer'
  ) {}

  // Singleton pattern per connection name
  protected static createInstance<T extends BaseMongoManager>(
    ManagerClass: new (connectionName: string, mongoUri?: string, databaseName?: string) => T,
    connectionName: string,
    mongoUri?: string,
    databaseName?: string
  ): T {
    const key = `${ManagerClass.name}_${connectionName}`;
    
    if (!BaseMongoManager.instances.has(key)) {
      BaseMongoManager.instances.set(key, new ManagerClass(connectionName, mongoUri, databaseName));
    }
    
    return BaseMongoManager.instances.get(key) as T;
  }

  // Abstract method to initialize models - must be implemented by subclasses
  protected abstract initializeModels(): void;

  // Initialize MongoDB connection
  async initialize(): Promise<void> {
    if (this.isInitialized && this.connection?.readyState === 1) {
      return; // Already connected and initialized
    }

    // Use provided mongoUri or build from environment variables
    let connectionUri = this.mongoUri;
    
    if (!connectionUri) {
      // Try connection-specific environment variables first
      if (this.connectionName === 'tokens') {
        connectionUri = process.env.TOKENS_MONGODB_URI || process.env.MONGODB_URI || `mongodb://localhost:27017/${this.databaseName}`;
      } else if (this.connectionName === 'networks_api') {
        connectionUri = process.env.NETWORKS_MONGODB_URI || process.env.MONGODB_URI || `mongodb://localhost:27017/moonx_networks`;
      } else {
        connectionUri = process.env.MONGODB_URI || `mongodb://localhost:27017/${this.databaseName}`;
      }
    }
    
    try {
      // Create connection with connection name
      this.connection = mongoose.createConnection(connectionUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false
      });

      // Wait for connection to be ready
      await this.connection.asPromise();

      // Initialize models
      this.initializeModels();
      
      this.isInitialized = true;
      console.log(`✅ MongoDB connected (${this.connectionName}) -> ${connectionUri}`);
    } catch (error) {
      console.error(`❌ MongoDB connection failed (${this.connectionName}):`, error);
      throw error;
    }
  }

  // Register a model
  protected registerModel<T>(name: string, schema: mongoose.Schema): Model<T> {
    if (!this.connection) {
      throw new Error('Connection not initialized. Call initialize() first.');
    }

    const model = this.connection.model<T>(name, schema);
    this.models.set(name, model);
    return model;
  }

  // Get a registered model
  protected getModel<T>(name: string): Model<T> | null {
    return this.models.get(name) as Model<T> || null;
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection) {
        return false;
      }
      
      const state = this.connection.readyState;
      return state === 1; // 1 = connected
    } catch (error) {
      console.error(`MongoDB health check failed (${this.connectionName}):`, error);
      return false;
    }
  }

  // Get MongoDB connection for advanced operations
  getConnection(): Connection | null {
    return this.connection;
  }

  // Get database stats
  async getStats(): Promise<{ 
    connectionName: string;
    databaseName: string;
    isConnected: boolean;
    models: string[];
  }> {
    return {
      connectionName: this.connectionName,
      databaseName: this.databaseName,
      isConnected: this.connection?.readyState === 1,
      models: Array.from(this.models.keys())
    };
  }

  // Cleanup connection
  async cleanup(): Promise<void> {
    try {
      if (this.connection?.readyState === 1) {
        await this.connection.close();
        console.log(`✅ MongoDB disconnected (${this.connectionName})`);
      }
      this.connection = null;
      this.models.clear();
      this.isInitialized = false;
      
      // Remove from instances map
      const key = `${this.constructor.name}_${this.connectionName}`;
      BaseMongoManager.instances.delete(key);
    } catch (error) {
      console.error(`Error disconnecting MongoDB (${this.connectionName}):`, error);
    }
  }

  // Utility method to handle common database errors
  protected handleDatabaseError(error: any, operation: string): never {
    console.error(`Database error in ${operation} (${this.connectionName}):`, error);
    
    if (error.code === 11000) {
      throw new Error(`Duplicate key error in ${operation}`);
    }
    
    if (error.name === 'ValidationError') {
      throw new Error(`Validation error in ${operation}: ${error.message}`);
    }
    
    if (error.name === 'MongoTimeoutError') {
      throw new Error(`Database timeout in ${operation}`);
    }
    
    throw new Error(`Database operation failed: ${operation}`);
  }

  // Utility method for transaction handling
  protected async withTransaction<T>(
    operation: (session: mongoose.ClientSession) => Promise<T>
  ): Promise<T> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    const session = await this.connection.startSession();
    
    try {
      session.startTransaction();
      const result = await operation(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
