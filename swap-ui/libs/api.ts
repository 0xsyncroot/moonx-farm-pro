// Pure HTTP Client - Base implementation with retry, error handling, interceptors
import axios, { AxiosInstance, AxiosResponse, AxiosRequestConfig } from 'axios';
import type { Network, Token, TokenBalance, SwapQuote, ApiResponse } from '@/types/api';

// Get API URL from environment variables safely
const getApiUrl = (): string => {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
};

const API_BASE_URL = getApiUrl();

// Removed ApiCache - caching will be handled by services layer

// Retry configuration
interface RetryConfig {
  retries: number;
  retryDelay: number;
  retryCondition?: (error: any) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  retries: 3,
  retryDelay: 1000, // 1 second
  retryCondition: (error) => {
    // Retry on network errors and 5xx status codes
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }
};

/**
 * Pure HTTP Client with retry logic, interceptors, and error handling
 * No business logic - just HTTP operations
 */
class ApiClient {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;

  constructor(baseUrl: string = API_BASE_URL, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
    
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000, // 30 seconds timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`🌐 HTTP ${config.method?.toUpperCase()}: ${config.url}`);
        }
        return config;
      },
      (error) => {
        console.error('🔴 HTTP Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor with retry logic
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ HTTP ${response.status}: ${response.config.url}`);
        }
        
        // Standardized response handling - modify response.data in-place
        if (response.data && typeof response.data === 'object') {
          // Case 1: Standard ApiResponse format { success: true, data: {...} }
          if ('success' in response.data) {
            if (!response.data.success) {
              throw new Error(response.data.error || 'API request failed');
            }
            // Extract the actual data from ApiResponse format
            response.data = response.data.data;
          }
          // Case 2: Direct data response (legacy APIs) - keep as is
        }
        // Case 3: Non-object response - keep as is
        
        return response;
      },
      async (error) => {
        const config = error.config;
        
        // Check if we should retry
        if (this.shouldRetry(error, config)) {
          config.__retryCount = config.__retryCount || 0;
          config.__retryCount++;
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔄 Retrying request (${config.__retryCount}/${this.retryConfig.retries}): ${config.url}`);
          }
          
          // Wait before retry
          await this.delay(this.retryConfig.retryDelay * config.__retryCount);
          
          return this.client(config);
        }
        
        // Format error for consistent handling
        return Promise.reject(this.formatError(error));
      }
    );
  }

  private shouldRetry(error: any, config: any): boolean {
    const retryCount = config.__retryCount || 0;
    return (
      retryCount < this.retryConfig.retries &&
      this.retryConfig.retryCondition!(error)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private formatError(error: any): Error {
    if (process.env.NODE_ENV === 'development') {
      console.error('🔴 HTTP Response Error:', error);
    }
    
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.error || 
                     error.response.data?.message || 
                     `HTTP ${error.response.status}: ${error.response.statusText}`;
      return new Error(message);
    } else if (error.request) {
      // Network error
      return new Error('Network connection error. Please check your internet connection and try again.');
    } else {
      // Something else happened
      return new Error(error.message || 'An unexpected error occurred');
    }
  }

  /**
   * Pure HTTP Methods - No business logic, just HTTP operations
   */
  
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete(url, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch(url, data, config);
    return response.data;
  }

  /**
   * Get full response including metadata (for debugging)
   */
  async getFullResponse<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get(url, config);
  }

  async postFullResponse<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.post(url, data, config);
  }

  /**
   * Get current base URL
   */
  getBaseURL(): string {
    return this.client.defaults.baseURL || '';
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Set authorization header
   */
  setAuthToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove authorization header
   */
  clearAuthToken(): void {
    delete this.client.defaults.headers.common['Authorization'];
  }
}

// Create singleton instance
const apiClient = new ApiClient();

// Export only the pure HTTP client - no convenience functions
export { apiClient };
export default apiClient; 