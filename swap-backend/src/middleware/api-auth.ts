import { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthenticatedRequest extends FastifyRequest {
  isApiKeyAuthenticated?: boolean;
}

// API Key authentication middleware
export const requireApiKey = async (request: AuthenticatedRequest, reply: FastifyReply) => {
  const apiKey = process.env.ADMIN_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ADMIN_API_KEY not configured in environment');
    return reply.code(500).send({
      success: false,
      error: 'Server configuration error'
    });
  }

  const providedApiKey = request.headers['x-api-key'] as string;
  
  if (!providedApiKey) {
    return reply.code(401).send({
      success: false,
      error: 'Missing API key header (x-api-key)'
    });
  }

  if (providedApiKey !== apiKey) {
    return reply.code(403).send({
      success: false,
      error: 'Invalid API key'
    });
  }

  // Mark request as authenticated
  request.isApiKeyAuthenticated = true;
};

// Optional API key check (for logging/analytics)
export const checkOptionalApiKey = async (request: AuthenticatedRequest, reply: FastifyReply) => {
  const apiKey = process.env.ADMIN_API_KEY;
  const providedApiKey = request.headers['x-api-key'] as string;
  
  if (apiKey && providedApiKey === apiKey) {
    request.isApiKeyAuthenticated = true;
  } else {
    request.isApiKeyAuthenticated = false;
  }
};
