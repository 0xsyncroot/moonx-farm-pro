import { FastifyRequest, FastifyReply } from 'fastify';
import { 
  getNetworks,
  getNetworkByChainId,
  getSupportedChainIds,
  refreshNetworksCache
} from '../config/networks';
import { networkManager } from '../managers';
import { NetworkConfig } from '../models/NetworkModel';

// Public network interface (without sensitive RPC information)
interface PublicNetwork {
  id: string;
  name: string;
  chainId: number;
  currency: string;
  logoUrl: string;
  explorer: string;
  multicall3Address: string;
  moonxContractAddress?: string;
}

export class NetworkController {

  // Helper method to convert Network to PublicNetwork (removes RPC info)
  private static toPublicNetwork(network: any): PublicNetwork {
    return {
      id: network.id,
      name: network.name,
      chainId: network.chainId,
      currency: network.currency,
      logoUrl: network.logoUrl,
      explorer: network.explorer,
      multicall3Address: network.multicall3Address,
      moonxContractAddress: network.moonxContractAddress
    };
  }
  
  // GET /api/networks - Get all active networks
  static async getNetworks(request: FastifyRequest, reply: FastifyReply) {
    try {
      const networks = await getNetworks();
      
      // Remove RPC information for client security
      const publicNetworks = Object.values(networks).map(network => 
        NetworkController.toPublicNetwork(network)
      );
      
      reply.code(200).send({
        success: true,
        data: {
          networks: publicNetworks,
          count: publicNetworks.length
        }
      });
    } catch (error) {
      console.error('Error getting networks:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get networks'
      });
    }
  }

  // GET /api/networks/:chainId - Get network by chain ID
  static async getNetworkByChainId(request: FastifyRequest<{ Params: { chainId: string } }>, reply: FastifyReply) {
    try {
      const chainId = parseInt(request.params.chainId);
      
      if (isNaN(chainId)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid chain ID'
        });
      }

      const network = await getNetworkByChainId(chainId);
      
      if (!network) {
        return reply.code(404).send({
          success: false,
          error: 'Network not found'
        });
      }

      // Remove RPC information for client security
      const publicNetwork = NetworkController.toPublicNetwork(network);

      reply.code(200).send({
        success: true,
        data: publicNetwork
      });
    } catch (error) {
      console.error('Error getting network by chain ID:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get network'
      });
    }
  }

  // GET /api/networks/supported-chains - Get supported chain IDs
  static async getSupportedChainIds(request: FastifyRequest, reply: FastifyReply) {
    try {
      const chainIds = await getSupportedChainIds();
      
      reply.code(200).send({
        success: true,
        data: {
          chainIds,
          count: chainIds.length
        }
      });
    } catch (error) {
      console.error('Error getting supported chain IDs:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to get supported chain IDs'
      });
    }
  }

  // POST /api/networks/refresh-cache - Refresh networks cache
  static async refreshCache(request: FastifyRequest, reply: FastifyReply) {
    try {
      await refreshNetworksCache();
      
      reply.code(200).send({
        success: true,
        message: 'Networks cache refreshed successfully'
      });
    } catch (error) {
      console.error('Error refreshing cache:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to refresh cache'
      });
    }
  }

  // POST /api/networks - Create or update network (requires API key)
  static async createNetwork(request: FastifyRequest<{
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
  }>, reply: FastifyReply) {
    try {
      const networkConfig = request.body;
      
      // Validate required fields
      const requiredFields = ['id', 'name', 'chainId', 'rpc', 'defaultRpc', 'currency', 'logoUrl', 'explorer', 'multicall3Address'];
      for (const field of requiredFields) {
        if (!networkConfig[field as keyof typeof networkConfig]) {
          return reply.code(400).send({
            success: false,
            error: `Missing required field: ${field}`
          });
        }
      }

      // Validate chain ID is positive integer
      if (!Number.isInteger(networkConfig.chainId) || networkConfig.chainId <= 0) {
        return reply.code(400).send({
          success: false,
          error: 'Chain ID must be a positive integer'
        });
      }

      // Validate RPC URLs
      try {
        new URL(networkConfig.rpc);
        new URL(networkConfig.defaultRpc);
        if (networkConfig.fallbackRpcs) {
          networkConfig.fallbackRpcs.forEach((url: string) => new URL(url));
        }
      } catch (urlError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid RPC URL format'
        });
      }

      // Check if network with same chain ID already exists
      const existingNetwork = await networkManager.getNetworkByChainId(networkConfig.chainId);
      
      // Create or update network
      const result = await networkManager.upsertNetwork({
        ...networkConfig,
        fallbackRpcs: networkConfig.fallbackRpcs || [],
        blockExplorer: networkConfig.blockExplorer || networkConfig.explorer,
        blockTime: networkConfig.blockTime || 2,
        confirmations: networkConfig.confirmations || 1,
        isActive: networkConfig.isActive !== undefined ? networkConfig.isActive : true
      });

      if (!result) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to create/update network'
        });
      }

      // Refresh cache after successful creation/update
      await refreshNetworksCache();

      reply.code(existingNetwork ? 200 : 201).send({
        success: true,
        message: existingNetwork ? 'Network updated successfully' : 'Network created successfully',
        data: result
      });
    } catch (error) {
      console.error('Error creating/updating network:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to create/update network'
      });
    }
  }

  // DELETE /api/networks/:chainId - Delete (deactivate) network (requires API key)
  static async deleteNetwork(request: FastifyRequest<{ Params: { chainId: string } }>, reply: FastifyReply) {
    try {
      const chainId = parseInt(request.params.chainId);
      
      if (isNaN(chainId)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid chain ID'
        });
      }

      // Check if network exists
      const existingNetwork = await networkManager.getNetworkByChainId(chainId);
      if (!existingNetwork) {
        return reply.code(404).send({
          success: false,
          error: 'Network not found'
        });
      }

      if (!existingNetwork.isActive) {
        return reply.code(400).send({
          success: false,
          error: 'Network is already deactivated'
        });
      }

      // Deactivate network (soft delete)
      const result = await networkManager.deactivateNetwork(chainId);
      
      if (!result) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to delete network'
        });
      }

      // Refresh cache after successful deletion
      await refreshNetworksCache();

      reply.code(200).send({
        success: true,
        message: `Network with chain ID ${chainId} deleted successfully`
      });
    } catch (error) {
      console.error('Error deleting network:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to delete network'
      });
    }
  }

  // PUT /api/networks/:chainId/activate - Activate network (requires API key)
  static async activateNetwork(request: FastifyRequest<{ Params: { chainId: string } }>, reply: FastifyReply) {
    try {
      const chainId = parseInt(request.params.chainId);
      
      if (isNaN(chainId)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid chain ID'
        });
      }

      // Check if network exists
      const existingNetwork = await networkManager.getNetworkByChainId(chainId);
      if (!existingNetwork && !(await networkManager.getNetworkModel()?.findOne({ chainId }).exec())) {
        return reply.code(404).send({
          success: false,
          error: 'Network not found'
        });
      }

      // Activate network
      const result = await networkManager.activateNetwork(chainId);
      
      if (!result) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to activate network'
        });
      }

      // Refresh cache after successful activation
      await refreshNetworksCache();

      reply.code(200).send({
        success: true,
        message: `Network with chain ID ${chainId} activated successfully`
      });
    } catch (error) {
      console.error('Error activating network:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to activate network'
      });
    }
  }
}