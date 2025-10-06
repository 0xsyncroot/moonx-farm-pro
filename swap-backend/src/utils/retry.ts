export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  retryCondition?: (error: any) => boolean;
}

export interface RetryResult<T> {
  data: T;
  attempts: number;
  totalTime: number;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  backoffMultiplier: 2,
  maxDelay: 10000, // 10 seconds
  retryCondition: (error: any) => {
    // Retry on network errors, timeouts, and 5xx server errors
    const isNetworkError = error.code === 'ECONNRESET' || 
                          error.code === 'ENOTFOUND' || 
                          error.code === 'ECONNREFUSED' ||
                          error.code === 'ETIMEDOUT';
    
    const isTimeoutError = error.code === 'ECONNABORTED' || 
                          error.message?.toLowerCase().includes('timeout');
    
    const is5xxError = error.response?.status >= 500 && error.response?.status < 600;
    
    const is429Error = error.response?.status === 429; // Rate limit
    
    return isNetworkError || isTimeoutError || is5xxError || is429Error;
  }
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: Error;
  let delay = config.initialDelay;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const data = await operation();
      const totalTime = Date.now() - startTime;
      
      if (attempt > 1) {
        console.log(`✅ Operation succeeded on attempt ${attempt}/${config.maxAttempts} after ${totalTime}ms`);
      }
      
      return {
        data,
        attempts: attempt,
        totalTime
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const shouldRetry = attempt < config.maxAttempts && config.retryCondition(error);
      
      if (!shouldRetry) {
        const totalTime = Date.now() - startTime;
        console.error(`❌ Operation failed after ${attempt} attempts (${totalTime}ms):`, {
          error: lastError.message,
          attempts: attempt,
          maxAttempts: config.maxAttempts
        });
        
        if (attempt === config.maxAttempts) {
          throw new RetryError(
            `Operation failed after ${attempt} attempts: ${lastError.message}`,
            attempt,
            lastError
          );
        } else {
          throw lastError;
        }
      }

      console.warn(`⚠️ Attempt ${attempt}/${config.maxAttempts} failed, retrying in ${delay}ms:`, {
        error: lastError.message,
        status: (error as any).response?.status,
        code: (error as any).code
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Calculate next delay with exponential backoff
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
  }

  // This should never be reached due to the logic above, but TypeScript needs it
  throw new RetryError(
    `Operation failed after ${config.maxAttempts} attempts: ${lastError!.message}`,
    config.maxAttempts,
    lastError!
  );
}

// Convenience function for HTTP requests with specific retry conditions
export async function withHttpRetry<T>(
  httpOperation: () => Promise<T>,
  options: Omit<RetryOptions, 'retryCondition'> & {
    retryOn4xx?: boolean;
  } = {}
): Promise<RetryResult<T>> {
  const { retryOn4xx = false, ...retryOptions } = options;
  
  return withRetry(httpOperation, {
    ...retryOptions,
    retryCondition: (error: any) => {
      // Use default retry condition
      const defaultShouldRetry = DEFAULT_RETRY_OPTIONS.retryCondition(error);
      
      // Additionally retry on 4xx if specified (useful for rate limiting)
      if (retryOn4xx && error.response?.status >= 400 && error.response?.status < 500) {
        return true;
      }
      
      return defaultShouldRetry;
    }
  });
}
