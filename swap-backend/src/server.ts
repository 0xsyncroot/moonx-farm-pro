import fastify, { FastifyInstance } from 'fastify';
import dotenv from 'dotenv';
import { SwapController } from './controllers/SwapController';
import { NetworkController } from './controllers/NetworkController';
import { requireApiKey } from './middleware/api-auth';

dotenv.config();

const app: FastifyInstance = fastify({ 
  logger: true,
  // Configure timeouts for better shutdown behavior
  keepAliveTimeout: 5000, // 5 seconds keep-alive
  requestTimeout: 30000,   // 30 seconds request timeout
});

// Register CORS
app.register(require('@fastify/cors'), {
  origin: true
});

// Initialize controllers
const swapController = new SwapController();

// Routes - Networks (new MongoDB-backed endpoints)
app.get('/api/networks', NetworkController.getNetworks);
app.get('/api/networks/supported-chains', NetworkController.getSupportedChainIds);
app.get('/api/networks/:chainId', NetworkController.getNetworkByChainId);
app.post('/api/networks/refresh-cache', NetworkController.refreshCache);

// Protected Network Management Routes (requires API key)
app.post<{
  Body: {
    id: string;
    name: string;
    chainId: number;
    rpc: string;
    defaultRpc: string;
    fallbackRpcs?: string[];
    currency: string;
    logoUrl: string;
    explorer: string;
    multicall3Address: string;
    moonxContractAddress?: string;
    blockExplorer?: string;
    blockTime?: number;
    confirmations?: number;
    isActive?: boolean;
  };
}>('/api/networks', { preHandler: requireApiKey }, NetworkController.createNetwork);

app.delete<{
  Params: { chainId: string };
}>('/api/networks/:chainId', { preHandler: requireApiKey }, NetworkController.deleteNetwork);

app.put<{
  Params: { chainId: string };
}>('/api/networks/:chainId/activate', { preHandler: requireApiKey }, NetworkController.activateNetwork);

// Routes - Tokens and quote (for calldata generation)

// Fix: Change route to accept query parameters instead of path parameters
app.get('/api/tokens', swapController.getTokens.bind(swapController));

// Get specific tokens with balances (optimized for post-swap refresh)
app.get('/api/tokens/specific', swapController.getSpecificTokens.bind(swapController));

// Quote API - Build calldata with platform fee for client-side execution
app.post('/api/quote', swapController.getQuote.bind(swapController));

// Health check
app.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  reply.status(500).send({ 
    success: false, 
    error: 'Internal Server Error' 
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\n📢 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Set timeout for forced exit if graceful shutdown takes too long
    const forceExitTimer = setTimeout(() => {
      console.log('⚠️  Graceful shutdown timeout. Forcing exit...');
      process.exit(1);
    }, 10000); // 10 seconds timeout

    // Cleanup blockchain connections
    await swapController.cleanup();

    // Close Fastify server
    console.log('🔌 Closing HTTP server...');
    await app.close();
    
    // Clear the force exit timer since we're shutting down properly
    clearTimeout(forceExitTimer);
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start server
const start = async (): Promise<void> => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || '0.0.0.0';
    
    // Configure server options for better shutdown
    await app.listen({ 
      port, 
      host
    });
    
    console.log(`🚀 Server listening on http://${host}:${port}`);
    console.log(`📊 Health check: http://${host}:${port}/health`);
    console.log(`🔗 API Documentation:`);
    console.log(`  === NETWORKS (MongoDB-backed + Redis cache) ===`);
    console.log(`  GET  /api/networks - Get all active networks (without RPC info)`);
    console.log(`  GET  /api/networks/:chainId - Get network by chain ID (without RPC info)`);
    console.log(`  GET  /api/networks/supported-chains - Get supported chain IDs`);
    console.log(`  POST /api/networks/refresh-cache - Refresh networks cache`);
    console.log(`  === PROTECTED NETWORK MANAGEMENT (requires x-api-key header) ===`);
    console.log(`  POST   /api/networks - Create/update network`);
    console.log(`  DELETE /api/networks/:chainId - Deactivate network`);
    console.log(`  PUT    /api/networks/:chainId/activate - Activate network`);
    console.log(`  === TOKENS & SWAPS ===`);
    console.log(`  GET  /api/tokens?chainId=X&search=Y&userAddress=Z - Get tokens with balances + prices`);
    console.log(`  GET  /api/tokens/specific?chainId=X&userAddress=Y&addresses=Z - Get specific tokens (optimized)`);
    console.log(`  POST /api/quote - Get swap quote with calldata (MoonX-Swap-Guide.md format)`);
    console.log(`  ✅ Updated: Uses bytes[] args format as per MoonX-Swap-Guide.md`);
    console.log(`  ✅ Cleaned: Removed executeSwap - all swaps now client-side only`);
    console.log(`  ✅ Platform fee: Auto-fetched from getPlatformFee() contract call`);
    console.log(`  ✅ Price data: Token prices from Binance & DexScreener with 1min caching`);
    console.log(`  ✅ Pool cache: MongoDB + Redis caching for pool information`);
    console.log(`🛡️  Graceful shutdown enabled (Ctrl+C to stop)`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();