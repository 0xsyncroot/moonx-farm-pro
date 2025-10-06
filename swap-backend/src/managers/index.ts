// Export all managers
export { BaseMongoManager } from './BaseMongoManager';
export { TokenManager } from './TokenManager';
export { NetworkManager } from './NetworkManager';

// Import for creating instances
import { TokenManager } from './TokenManager';
import { NetworkManager } from './NetworkManager';

// Create singleton instances
export const tokenManager = TokenManager.getInstance();
export const networkManager = NetworkManager.getInstance();
