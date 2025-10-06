import CryptoJS from 'crypto-js';
import { 
  EncryptedWallet, 
  createDecryptionSession, 
  decryptPrivateKeyWithSession,
  isSessionKeyValid,
  clearSessionKeys 
} from './crypto';
import { SwapErrorFactory } from '@/types/errors';

export interface WalletSession {
  id: string;
  address: string;
  sessionKeyRef: string | null; // Hardware-backed session key reference (not private key), null for restored sessions
  expiresAt: number;
  lastActivity: number;
}

export interface SessionConfig {
  sessionTimeout: number; // Session duration in minutes
  activityTimeout: number; // Inactivity timeout in minutes (0 = disabled)
}

// Default session configuration
const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionTimeout: 480, // 8 hours
  activityTimeout: 0, // Disabled by default
};

const STORAGE_KEYS = {
  SESSION: 'moonx-session',
  CONFIG: 'moonx-session-config',
} as const;

class SessionManager {
  private currentSession: WalletSession | null = null;
  private activityTimer: NodeJS.Timeout | null = null;
  private lockCallbacks: Array<() => void> = [];
  private config: SessionConfig;
  private eventListeners: Array<{ element: any; event: string; handler: any }> = [];

  constructor() {
    this.config = this.loadConfig();
    this.initializeBrowserEventListeners();
    this.startActivityMonitor();
    
    // Try to restore existing session on page refresh
    this.tryRestoreSession();
  }

  /**
   * Load session configuration from storage
   */
  private loadConfig(): SessionConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (stored) {
        return { ...DEFAULT_SESSION_CONFIG, ...JSON.parse(stored) };
      }
    } catch (error) {
      // Ignore error, use defaults
    }
    return DEFAULT_SESSION_CONFIG;
  }

  /**
   * Save session configuration to storage
   */
  private saveConfig(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    } catch (error) {
      // Ignore error
    }
  }

  /**
   * Try to restore existing session from storage (for page refresh)
   */
  private tryRestoreSession(): void {
    // Only run on client side
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return;
    }

    // Just check if session exists, don't remove anything
    // Let the wallet restoration process handle expired sessions
    try {
      const storedSession = sessionStorage.getItem(STORAGE_KEYS.SESSION);
      if (storedSession) {
        // Session exists, it will be validated during wallet load
        JSON.parse(storedSession); // Just verify it's valid JSON
      }
    } catch (error) {
      // If JSON is corrupted, remove it
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEYS.SESSION);
      }
    }
  }



  /**
   * Remove all existing event listeners
   */
  private removeEventListeners(): void {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
  }

  /**
   * Add event listener and track it for cleanup
   */
  private addTrackedEventListener(element: any, event: string, handler: any, options?: any): void {
    element.addEventListener(event, handler, options);
    this.eventListeners.push({ element, event, handler });
  }

  /**
   * Initialize browser event listeners for auto-lock
   */
  private initializeBrowserEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Remove existing listeners first to prevent duplicates
    this.removeEventListeners();

    // Monitor user activity (only for activity timeout)
    if (this.config.activityTimeout > 0) {
      const activityHandler = () => {
        this.updateActivity();
      };
      
      ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
        this.addTrackedEventListener(document, event, activityHandler, { passive: true });
      });
    }
  }

  /**
   * Start monitoring user activity for auto-lock
   */
  private startActivityMonitor(): void {
    this.activityTimer = setInterval(() => {
      if (this.currentSession && this.config.activityTimeout > 0) {
        const now = Date.now();
        const inactiveTime = now - this.currentSession.lastActivity;
        const activityTimeoutMs = this.config.activityTimeout * 60 * 1000;
        
        if (inactiveTime > activityTimeoutMs) {
          this.lockWallet();
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Update last activity timestamp
   */
  private updateActivity(): void {
    if (this.currentSession) {
      this.currentSession.lastActivity = Date.now();
    }
  }

  /**
   * Generate session key for session restoration (no authentication required)
   */
  private async generateSessionKeyForRestore(): Promise<string> {
    try {
      // Try to use Web Crypto API with non-extractable key
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const key = await crypto.subtle.generateKey(
          {
            name: 'AES-GCM',
            length: 256,
          },
          false, // ❌ NOT extractable - can't be stolen!
          ['encrypt', 'decrypt']
        );
        
        // Create session-bound identifier
        const sessionId = 'restore_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Store key reference (not the key itself) with session manager
        const keyReference = `hw_key_${sessionId}`;
        
        // Store non-extractable key in a secure map (memory only)
        if (!window.secureKeyStore) {
          window.secureKeyStore = new Map();
        }
        window.secureKeyStore.set(keyReference, key);
        
        return keyReference;
      }
    } catch (error) {
      console.warn('Hardware-backed keys not available for restore, using memory key');
    }
    
    // Fallback: Generate session key that exists ONLY in memory
    const sessionKey = 'restore_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
    const sessionId = `session_${sessionKey}`;
    
    return sessionId;
  }

  /**
   * Create hardware-backed session for wallet
   */
  async createSession(wallet: EncryptedWallet): Promise<boolean> {
    try {
      // If we already have an active session for this wallet, validate it
      if (this.currentSession && 
          this.currentSession.id === wallet.id && 
          this.currentSession.address === wallet.address &&
          this.hasActiveSession()) {
        
        // Verify session key is still valid (if it exists)
        if (this.currentSession.sessionKeyRef && isSessionKeyValid(this.currentSession.sessionKeyRef)) {
          this.currentSession.lastActivity = Date.now();
          return true;
        } else if (!this.currentSession.sessionKeyRef) {
          // No session key yet (restored session), but session is still valid
          this.currentSession.lastActivity = Date.now();
          return true;
        } else {
          // Session key invalid, clear and create new
          this.currentSession = null;
        }
      }

      // Check if we can restore from existing session (page refresh case)
      if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
        const storedSession = sessionStorage.getItem(STORAGE_KEYS.SESSION);
        if (storedSession) {
          const sessionInfo = JSON.parse(storedSession);
          const now = Date.now();
          
          // If session is still valid and for the same wallet, restore it without authentication
          if (sessionInfo.expiresAt && (now - 5000) < sessionInfo.expiresAt && 
              sessionInfo.id === wallet.id && sessionInfo.address === wallet.address) {
            
            // 🔑 SIMPLE RESTORE: Just restore session info, session key will be created on demand
            this.currentSession = {
              id: wallet.id,
              address: wallet.address,
              sessionKeyRef: null, // No session key yet - will be created when needed
              expiresAt: sessionInfo.expiresAt, // Keep original expiry
              lastActivity: now, // Update activity
            };
            
            console.log('🔄 Session restored for wallet:', wallet.address);
            return true;
          }
        }
      }
      
      // 🔐 SECURE: Create new hardware-backed session with authentication
      const sessionKeyRef = await createDecryptionSession(wallet);
      if (!sessionKeyRef) {
        return false; // Authentication failed
      }
      
      const now = Date.now();
      const sessionTimeoutMs = this.config.sessionTimeout * 60 * 1000;
      this.currentSession = {
        id: wallet.id,
        address: wallet.address,
        sessionKeyRef, // Hardware-backed session key reference (not private key!)
        expiresAt: now + sessionTimeoutMs,
        lastActivity: now,
      };

      // Store session metadata (session key reference is safe to store)
      if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.currentSession));
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get private key from current session (requires wallet for decryption)
   */
  async getPrivateKey(wallet: EncryptedWallet): Promise<string> {
    if (!this.currentSession) {
      throw SwapErrorFactory.createAuthenticationRequiredError();
    }

    const now = Date.now();
    // Check if session expired (with 5 second buffer)
    if (now > (this.currentSession.expiresAt + 5000)) {
      // Session expired, throw specific error
      throw SwapErrorFactory.createSessionExpiredError();
    }

    // If no session key (restored session), create one on-demand without authentication
    if (!this.currentSession.sessionKeyRef) {
      // Create session key for restored session (no auth required)
      const sessionKeyRef = await this.generateSessionKeyForRestore();
      this.currentSession.sessionKeyRef = sessionKeyRef;
      
      // Update stored session
      if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.currentSession));
      }
    }

    // Verify session key is still valid (if it exists)
    if (this.currentSession.sessionKeyRef && !isSessionKeyValid(this.currentSession.sessionKeyRef)) {
      // Session key invalid, clear session and throw error
      this.currentSession = null;
      throw SwapErrorFactory.createSessionExpiredError();
    }

    try {
      // 🔐 SECURE: Decrypt private key using hardware-backed session
      const privateKey = await decryptPrivateKeyWithSession(wallet, this.currentSession.sessionKeyRef);
      
      if (privateKey) {
        this.updateActivity();
        return privateKey;
      }
      
      // If decryption returns null, throw error instead of returning null
      throw SwapErrorFactory.createPrivateKeyDecryptError();
    } catch (error) {
      // Let errors bubble up from crypto level - don't wrap them here
      throw error;
    }
  }

  /**
   * Check if wallet session is active
   */
  hasActiveSession(): boolean {
    if (!this.currentSession) return false;
    
    const now = Date.now();
    // Add 5 second buffer to avoid timing issues
    // Session is active if not expired (sessionKeyRef can be null for restored sessions)
    return (now - 5000) < this.currentSession.expiresAt;
  }

  /**
   * Check if there's a valid session in storage (for wallet restoration)
   */
  hasValidStoredSession(walletId?: string, walletAddress?: string): boolean {
    // Only run on client side
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return false;
    }

    try {
      const storedSession = sessionStorage.getItem(STORAGE_KEYS.SESSION);
      if (!storedSession) return false;

      const sessionInfo = JSON.parse(storedSession);
      const now = Date.now();
      
      // Check if session is still valid (with 5 second buffer)
      const isValid = sessionInfo.expiresAt && (now - 5000) < sessionInfo.expiresAt;
      
      // If wallet info provided, check if it matches
      if (walletId && walletAddress) {
        return isValid && sessionInfo.id === walletId && sessionInfo.address === walletAddress;
      }
      
      return isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current session info
   */
  getCurrentSession(): WalletSession | null {
    return this.currentSession;
  }

  /**
   * Lock wallet and clear session from memory (but preserve sessionStorage)
   */
  lockWallet(): void {
    // Clear current session
    if (this.currentSession) {
      this.currentSession = null;
    }

    // Notify all lock callbacks
    this.lockCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        // Ignore error
      }
    });
  }

  /**
   * Permanently clear session (for logout/disconnect)
   */
  clearSession(): void {
    this.lockWallet();
    
    // 🔐 SECURE: Clear hardware-backed session keys
    clearSessionKeys();
    
    // Clear sessionStorage for permanent cleanup
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
       sessionStorage.removeItem(STORAGE_KEYS.SESSION);
    }
  }

  /**
   * Add callback to be called when wallet is locked
   */
  onLock(callback: () => void): () => void {
    this.lockCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.lockCallbacks.indexOf(callback);
      if (index > -1) {
        this.lockCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Extend session timeout
   */
  extendSession(): boolean {
    if (!this.currentSession) return false;
    
    const now = Date.now();
    const sessionTimeoutMs = this.config.sessionTimeout * 60 * 1000;
    this.currentSession.expiresAt = now + sessionTimeoutMs;
    this.currentSession.lastActivity = now;
    
    return true;
  }

  /**
   * Get current session configuration
   */
  getConfig(): SessionConfig {
    return { ...this.config };
  }

  /**
   * Update session configuration
   */
  updateConfig(newConfig: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    
    // Restart browser event listeners with new config
    this.initializeBrowserEventListeners();
    
    // If session timeout changed, update current session
    if (newConfig.sessionTimeout && this.currentSession) {
      const now = Date.now();
      const sessionTimeoutMs = this.config.sessionTimeout * 60 * 1000;
      this.currentSession.expiresAt = now + sessionTimeoutMs;
    }
    

  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_SESSION_CONFIG };
    this.saveConfig();
    this.initializeBrowserEventListeners();

  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clean up timers
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    
    // Remove all event listeners
    this.removeEventListeners();
    
    // Clear session completely
    this.clearSession();
    this.lockCallbacks = [];
  }
}

// Lazy singleton instance for client-side only
let sessionManagerInstance: SessionManager | null = null;

export const getSessionManager = (): SessionManager => {
  // Only create on client side
  if (typeof window === 'undefined') {
    // Return a mock instance for SSR
    return {
      hasActiveSession: () => false,
      hasValidStoredSession: () => false,
      createSession: async () => false,
      getPrivateKey: async () => null,
      getCurrentSession: () => null,
      lockWallet: () => {},
      onLock: () => () => {},
      extendSession: () => false,
      getConfig: () => ({ sessionTimeout: 480, activityTimeout: 0, lockOnBrowserClose: true, lockOnTabHidden: false }),
      updateConfig: () => {},
      resetConfig: () => {},
      destroy: () => {},
    } as any;
  }

  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
    
    // DON'T auto-cleanup on beforeunload
    // beforeunload fires on F5/page refresh, not just browser close
    // Let sessionStorage natural lifecycle handle cleanup when browser actually closes
  }
  
  return sessionManagerInstance;
};

// Create a proxy object for sessionManager that lazily initializes
export const sessionManager = new Proxy({} as SessionManager, {
  get(target, prop) {
    const manager = getSessionManager();
    const value = (manager as any)[prop];
    return typeof value === 'function' ? value.bind(manager) : value;
  }
});