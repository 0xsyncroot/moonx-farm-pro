import { FastifyRequest, FastifyReply } from 'fastify';
import { SwapService } from '../services/SwapService';
import { TokenSearchParams, QuoteRequest, SwapRequest } from '../types';
import { NETWORKS } from '../config/networks';

export class SwapController {
  private swapService: SwapService;

  constructor() {
    this.swapService = new SwapService();
  }

  // Cleanup method for graceful shutdown
  async cleanup(): Promise<void> {
    await this.swapService.cleanup();
  }

  // Get tokens with balances
  async getTokens(
    request: FastifyRequest<{
      Querystring: { chainId: string; search?: string; userAddress?: string };
    }>, 
    reply: FastifyReply
  ) {
    try {
      const { chainId, search, userAddress } = request.query;

      if (!chainId) {
        return reply.code(400).send({ 
          success: false, 
          error: 'chainId is required as query parameter' 
        });
      }

      const chainIdNum = parseInt(chainId);
      if (isNaN(chainIdNum)) {
        return reply.code(400).send({ 
          success: false, 
          error: 'Invalid chain ID' 
        });
      }

      const params: TokenSearchParams = {
        chainId: chainIdNum,
        search,
        userAddress
      };

      const result = await this.swapService.getTokensWithBalances(params);
      
      return reply.send({ 
        success: true, 
        data: result 
      });
    } catch (error) {
      console.error('Error in getTokens:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }

  // Get specific tokens with balances (optimized for post-swap refresh)
  async getSpecificTokens(
    request: FastifyRequest<{
      Querystring: { 
        chainId: string; 
        userAddress: string;
        addresses: string; // Comma-separated token addresses
      };
    }>, 
    reply: FastifyReply
  ) {
    try {
      const { chainId, userAddress, addresses } = request.query;

      if (!chainId || !userAddress || !addresses) {
        return reply.code(400).send({ 
          success: false, 
          error: 'chainId, userAddress, and addresses are required' 
        });
      }

      const chainIdNum = parseInt(chainId);
      if (isNaN(chainIdNum)) {
        return reply.code(400).send({ 
          success: false, 
          error: 'Invalid chain ID' 
        });
      }

      // Parse comma-separated addresses
      const tokenAddresses = addresses.split(',').map(addr => addr.trim()).filter(addr => addr);
      if (tokenAddresses.length === 0) {
        return reply.code(400).send({ 
          success: false, 
          error: 'At least one token address is required' 
        });
      }

      const result = await this.swapService.getSpecificTokensWithBalances({
        chainId: chainIdNum,
        userAddress,
        tokenAddresses
      });
      
      return reply.send({ 
        success: true, 
        data: result 
      });
    } catch (error) {
      console.error('Error in getSpecificTokens:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }

  // Get swap quote with calldata for client-side execution
  async getQuote(
    request: FastifyRequest<{
      Body: {
        fromTokenAddress: string;
        toTokenAddress: string;
        amount: string;
        slippage?: number;
        chainId: number;
        userAddress: string;
      };
    }>, 
    reply: FastifyReply
  ) {
    try {
      const { fromTokenAddress, toTokenAddress, amount, slippage = 0.5, chainId, userAddress } = request.body;

      if (!fromTokenAddress || !toTokenAddress || !amount || !chainId || !userAddress) {
        return reply.code(400).send({ 
          success: false, 
          error: 'Missing required parameters: fromTokenAddress, toTokenAddress, amount, chainId, userAddress' 
        });
      }

      const quoteRequest = {
        fromTokenAddress,
        toTokenAddress,
        amount,
        slippage,
        chainId,
        userAddress
      };

      const quote = await this.swapService.getSwapQuote(quoteRequest);
      
      return reply.send({ 
        success: true, 
        data: { quote } 
      });
    } catch (error) {
      console.error('Error in getQuote:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      const code = message.includes('Unsupported network') || message.includes('liquidity') ? 400 : 500;
      
      return reply.code(code).send({ 
        success: false, 
        error: message 
      });
    }
  }
} 