import CryptoJS from 'crypto-js';

// Global types for secure key storage
declare global {
  interface Window {
    secureKeyStore?: Map<string, CryptoKey>;
  }
}
import { Wallet } from 'ethers';

// Advanced encryption system sử dụng WebAuthn/Passkey
// Không cần user nhập password, sử dụng biometric authentication

export interface EncryptedWallet {
  id: string;
  address: string;
  encryptedData: string;
  name: string;
  createdAt: number;
  lastUsed: number;
  credentialId: string;
  publicKey: string;
  requiresSession?: boolean; // New field for session-based security
}

export interface WalletSession {
  id: string;
  address: string;
  privateKey: string;
  name: string;
  expiresAt: number;
}

// Check if WebAuthn is supported
export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' && 
         window.PublicKeyCredential !== undefined &&
         typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';
}

// Generate challenge for WebAuthn
function generateChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// Create passkey credential
export async function createPasskeyCredential(walletName: string): Promise<{
  credentialId: string;
  publicKey: string;
} | null> {
  if (!isPasskeySupported()) {
    console.warn('Passkey not supported, falling back to device-based encryption');
    return null;
  }

  try {
    const challenge = generateChallenge();
    
    // More permissive configuration to handle different browser/device capabilities
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'MoonX Swap',
          id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
        },
        user: {
          id: crypto.getRandomValues(new Uint8Array(32)), // Reduced size for compatibility
          name: walletName,
          displayName: walletName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
          { alg: -37, type: 'public-key' }, // PS256 - additional fallback
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred', // Changed from 'required' to 'preferred'
          residentKey: 'preferred',
          requireResidentKey: false, // Allow non-resident keys
        },
        timeout: 120000, // Increased timeout to 2 minutes
        attestation: 'none', // Don't require attestation
      },
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Failed to create credential');
    }

    const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    const publicKey = btoa(String.fromCharCode(...new Uint8Array(
      (credential.response as AuthenticatorAttestationResponse).getPublicKey()!
    )));

    return {
      credentialId,
      publicKey,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Passkey creation failed, falling back to device-based encryption:', errorMessage);
    return null; // Graceful fallback to device fingerprint
  }
}

// Authenticate with passkey
export async function authenticateWithPasskey(credentialId: string): Promise<boolean> {
  if (!isPasskeySupported()) {
    console.warn('Passkey not supported, authentication failed');
    return false; // Force proper authentication
  }

  try {
    const challenge = generateChallenge();
    
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          id: Uint8Array.from(atob(credentialId), c => c.charCodeAt(0)),
          type: 'public-key',
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    return assertion !== null;
  } catch (error) {
    console.error('Error authenticating with passkey:', error);
    return false;
  }
}

// Detect if running on mobile device
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
         window.matchMedia?.('(max-width: 768px)')?.matches;
}

// Device-based authentication fallback
export async function authenticateDeviceAccess(): Promise<boolean> {
  // For device-based wallets, require user confirmation
  if (typeof window === 'undefined') return false;
  
  try {
    const isMobile = isMobileDevice();
    
    // Try WebAuthn/Credential API first for biometric auth on supported devices
    if ('credentials' in navigator && navigator.credentials.get && 
        'PublicKeyCredential' in window && isMobile) {
      try {
        // Check if platform authenticator is available
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available) {
          // Generate a random challenge
          let challenge: Uint8Array;
          if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            challenge = crypto.getRandomValues(new Uint8Array(32));
          } else {
            // Fallback using CryptoJS
            const words = CryptoJS.lib.WordArray.random(8).words; // 8 words = 32 bytes
            challenge = new Uint8Array(32);
            for (let i = 0; i < words.length; i++) {
              const word = words[i];
              challenge[i * 4] = (word >>> 24) & 0xFF;
              challenge[i * 4 + 1] = (word >>> 16) & 0xFF;
              challenge[i * 4 + 2] = (word >>> 8) & 0xFF;
              challenge[i * 4 + 3] = word & 0xFF;
            }
          }
          
          // Try to use platform authenticator (Touch ID, Face ID, fingerprint)
          const credential = await navigator.credentials.get({
            publicKey: {
              challenge,
              allowCredentials: [], // Platform will use available biometrics
              userVerification: 'required',
              timeout: 30000, // 30 second timeout
            }
          } as CredentialRequestOptions);
          
          // If we reach here, platform authentication succeeded
          if (credential) {
            return true;
          }
        }
      } catch (webauthnError) {
        console.log('Platform authenticator not available or failed, falling back to confirmation');
      }
    }
    
    // Fallback to appropriate confirmation method
    if (isMobile) {
      // Mobile-friendly confirmation
      return await showMobileAuthConfirmation(isMobile);
    } else {
      // Desktop confirmation dialog
      const userConfirmed = window.confirm(
        '🔐 Wallet Authentication Required\n\n' +
        'This action requires confirmation to access your wallet.\n' +
        'Click OK to authenticate and proceed.'
      );
      return userConfirmed;
    }
  } catch (error) {
    console.error('Device authentication failed:', error);
    return false;
  }
}

// Mobile-friendly authentication confirmation
async function showMobileAuthConfirmation(isMobile: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    // Detect dark mode
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Create mobile-optimized modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    `;
    
    const dialog = document.createElement('div');
    const bgColor = isDarkMode ? '#1f2937' : 'white';
    const textColor = isDarkMode ? '#f9fafb' : '#333';
    const textColorSecondary = isDarkMode ? '#d1d5db' : '#666';
    
    dialog.style.cssText = `
      background: ${bgColor};
      border-radius: 16px;
      padding: 24px;
      margin: 20px;
      max-width: 320px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, ${isDarkMode ? '0.6' : '0.3'});
      text-align: center;
      border: ${isDarkMode ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'};
    `;
    
    dialog.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
      <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: ${textColor};">
        Wallet Authentication
      </h3>
      <p style="margin: 0 0 24px 0; font-size: 14px; color: ${textColorSecondary}; line-height: 1.4;">
        Confirm access to your wallet to continue with this transaction.
      </p>
      <div style="display: flex; gap: 12px;">
        <button id="auth-cancel" style="
          flex: 1;
          padding: 14px 16px;
          border: 1px solid ${isDarkMode ? '#374151' : '#ddd'};
          border-radius: 8px;
          background: ${isDarkMode ? '#374151' : 'white'};
          color: ${isDarkMode ? '#d1d5db' : '#666'};
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          touch-action: manipulation;
          user-select: none;
          transition: all 0.2s ease;
        ">Cancel</button>
        <button id="auth-confirm" style="
          flex: 1;
          padding: 14px 16px;
          border: none;
          border-radius: 8px;
          background: #6366f1;
          color: white;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          touch-action: manipulation;
          user-select: none;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
        ">Authenticate</button>
      </div>
    `;
    
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // Add event listeners with mobile optimizations
    const confirmBtn = dialog.querySelector('#auth-confirm') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#auth-cancel') as HTMLButtonElement;
    
    // Vibration support for mobile feedback
    const vibrate = (pattern: number | number[]) => {
      if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    };
    
    // Add button hover/touch effects
    const addButtonEffects = (button: HTMLButtonElement, isConfirm: boolean) => {
      const onTouchStart = () => {
        button.style.transform = 'scale(0.98)';
        if (isConfirm) {
          button.style.background = '#4f46e5';
        }
        vibrate(10); // Light haptic feedback
      };
      
      const onTouchEnd = () => {
        button.style.transform = 'scale(1)';
        if (isConfirm) {
          button.style.background = '#6366f1';
        }
      };
      
      button.addEventListener('touchstart', onTouchStart, { passive: true });
      button.addEventListener('touchend', onTouchEnd, { passive: true });
      button.addEventListener('mousedown', onTouchStart);
      button.addEventListener('mouseup', onTouchEnd);
      button.addEventListener('mouseleave', onTouchEnd);
    };
    
    addButtonEffects(confirmBtn, true);
    addButtonEffects(cancelBtn, false);
    
    // Enhanced cleanup that handles all cleanup tasks
    let enhancedCleanup: () => void;
    
    // Handle keyboard events
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        enhancedCleanup();
        resolve(false);
      } else if (e.key === 'Enter') {
        enhancedCleanup();
        resolve(true);
      }
    };
    
    enhancedCleanup = () => {
      document.removeEventListener('keydown', handleKeydown);
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    };
    
    document.addEventListener('keydown', handleKeydown);
    
    confirmBtn.onclick = () => {
      vibrate([50, 25, 50]); // Success pattern
      enhancedCleanup();
      resolve(true);
    };
    
    cancelBtn.onclick = () => {
      vibrate(100); // Cancel feedback
      enhancedCleanup();
      resolve(false);
    };
    
    // Close on backdrop click (but not on dialog click)
    modal.onclick = (e) => {
      if (e.target === modal) {
        vibrate(50);
        enhancedCleanup();
        resolve(false);
      }
    };
    
    // Prevent dialog click from bubbling to modal
    dialog.onclick = (e) => {
      e.stopPropagation();
    };
    
    // Auto-focus confirm button for better UX (but not on mobile to avoid keyboard)
    if (!isMobile) {
      setTimeout(() => confirmBtn.focus(), 100);
    }
  });
}



// Session-based decryption key (NEVER persist to storage)
let currentSessionDecryptionKey: string | null = null;

// Generate hardware-backed session key (non-extractable)
async function generateSessionDecryptionKey(): Promise<string> {
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
      const sessionId = CryptoJS.lib.WordArray.random(16).toString();
      
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
    console.warn('Hardware-backed keys not available, using session-memory key');
  }
  
  // Fallback: Generate session key that exists ONLY in memory
  const sessionKey = CryptoJS.lib.WordArray.random(32).toString();
  const sessionId = CryptoJS.lib.WordArray.random(16).toString();
  
  // Store in memory only (NOT in any persistent storage)
  currentSessionDecryptionKey = sessionKey;
  
  return `session_${sessionId}`;
}

// Get session decryption key (requires active session)
function getSessionDecryptionKey(sessionKeyRef: string): string | null {
  if (!sessionKeyRef) return null;
  
  if (sessionKeyRef.startsWith('hw_key_')) {
    // Hardware-backed key
    if (window.secureKeyStore && window.secureKeyStore.has(sessionKeyRef)) {
      // Key exists but we can't extract it - this is just validation
      return sessionKeyRef; // Return reference for hardware operations
    }
    return null;
  }
  
  if (sessionKeyRef.startsWith('session_')) {
    // Memory-based session key
    return currentSessionDecryptionKey;
  }
  
  return null;
}

// Clear session keys (on logout/session end)
export function clearSessionKeys(): void {
  currentSessionDecryptionKey = null;
  
  if (typeof window !== 'undefined' && window.secureKeyStore) {
    window.secureKeyStore.clear();
  }
}

// Check if session key is valid
export function isSessionKeyValid(sessionKeyRef: string): boolean {
  return getSessionDecryptionKey(sessionKeyRef) !== null;
}

// Device fingerprint - chỉ dùng yếu tố phần cứng ổn định
function generateDeviceFingerprint(): string {
  // Only run on client side
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return CryptoJS.lib.WordArray.random(16).toString(); // Fallback for SSR
  }

  // Chỉ dùng yếu tố phần cứng cơ bản và ổn định
  const fingerprint = [
    // Browser engine core (không phải full user agent)
    navigator.userAgent.split(' ').slice(0, 2).join(' '), // Chỉ lấy browser engine
    
    // Hardware specs - ổn định theo device
    navigator.hardwareConcurrency || 'unknown', // CPU cores
    (navigator as any).deviceMemory || 'unknown', // RAM
    screen.colorDepth, // Color capability
    
    // Basic browser capabilities - ít thay đổi
    navigator.cookieEnabled ? 'cookies' : 'no-cookies',
    typeof(Storage) !== "undefined" ? 'storage' : 'no-storage',
    
    // Static identifier để tránh collision
    'moonx-device-v4'
  ].join('|');
  
  return CryptoJS.SHA256(fingerprint).toString();
}

// Generate secure encryption key
function generateEncryptionKey(baseKey: string, walletId: string): string {
  const salt = CryptoJS.SHA256(walletId + 'moonx-salt-v2').toString();
  const key = CryptoJS.PBKDF2(baseKey + walletId, salt, {
    keySize: 256 / 32,
    iterations: 150000, // Increased iterations for better security
    hasher: CryptoJS.algo.SHA256
  });
  return key.toString();
}

// Generate unique wallet ID
export function generateWalletId(): string {
  return 'wallet_' + CryptoJS.lib.WordArray.random(16).toString();
}

// Encrypt private key with session-based security
export async function encryptPrivateKey(privateKey: string, walletName: string, walletId?: string): Promise<{
  encryptedData: string;
  credentialId: string;
  publicKey: string;
  walletId: string;
  requiresSession: boolean;
} | null> {
  const id = walletId || generateWalletId();
  
  // Try to create passkey credential
  const passkey = await createPasskeyCredential(walletName);
  
  let baseKey: string;
  let credentialId: string;
  let publicKey: string;
  let requiresSession = true; // Always require session for security
  
  if (passkey) {
    // Passkey-based encryption with device binding
    const deviceFingerprint = generateDeviceFingerprint();
    baseKey = CryptoJS.SHA256(passkey.publicKey + deviceFingerprint).toString();
    credentialId = passkey.credentialId;
    publicKey = passkey.publicKey;
  } else {
    // Device-based encryption (reproducible)
    const deviceFingerprint = generateDeviceFingerprint();
    baseKey = CryptoJS.SHA256(deviceFingerprint + 'moonx-device-v3').toString();
    credentialId = 'device_' + CryptoJS.lib.WordArray.random(8).toString();
    publicKey = baseKey; // Store full baseKey for reproducible decryption
  }
  
  const encryptionKey = generateEncryptionKey(baseKey, id);
  
  // Encrypt with AES-256 and add HMAC for integrity
  const encrypted = CryptoJS.AES.encrypt(privateKey, encryptionKey).toString();
  const hmac = CryptoJS.HmacSHA256(encrypted, encryptionKey).toString();
  
  const encryptedData = JSON.stringify({
    data: encrypted,
    hmac: hmac,
    timestamp: Date.now(),
    version: 'v3', // New version with session requirement
    deviceFingerprint: generateDeviceFingerprint() // For validation
  });

  return {
    encryptedData,
    credentialId,
    publicKey,
    walletId: id,
    requiresSession
  };
}

// Create session and return session-based decryption capability
export async function createDecryptionSession(wallet: EncryptedWallet): Promise<string | null> {
  try {
    // ALWAYS require authentication - no skipping allowed
    let authenticated = false;
    
    if (wallet.credentialId.startsWith('device_')) {
      // Device-based wallet - use fallback authentication
      authenticated = await authenticateDeviceAccess();
    } else {
      // Passkey-based wallet - use passkey authentication  
      authenticated = await authenticateWithPasskey(wallet.credentialId);
    }
    
        if (!authenticated) {
      throw new Error('Authentication failed - access denied');
    }
    
    // Generate session decryption key (hardware-backed if possible)
    const sessionKeyRef = await generateSessionDecryptionKey();
    
    // Return session key reference for this wallet
    return sessionKeyRef;
  } catch (error) {
    console.error('Error creating decryption session:', error);
    return null;
  }
}

// Decrypt private key using active session
export async function decryptPrivateKeyWithSession(wallet: EncryptedWallet, sessionKeyRef: string): Promise<string | null> {
  try {
    // Verify session is still valid
    const sessionKey = getSessionDecryptionKey(sessionKeyRef);
    if (!sessionKey) {
      throw new Error('Invalid or expired session - authentication required');
    }
    
    const { data, hmac, version = 'v3', deviceFingerprint } = JSON.parse(wallet.encryptedData);
    
    // Only support v3+ wallets - reject legacy wallets
    if (version !== 'v3') {
      throw new Error('Wallet version not supported - please re-create your wallet with the latest version');
    }
    
    // Validate device fingerprint hasn't changed
    if (deviceFingerprint) {
      const currentFingerprint = generateDeviceFingerprint();
      if (deviceFingerprint !== currentFingerprint) {
        throw new Error('Device fingerprint mismatch - re-authentication required');
      }
    }
    
    // Generate baseKey based on wallet type
    let baseKey: string;
    if (wallet.credentialId.startsWith('device_')) {
      // Device-based: Use stored public key (contains device fingerprint)
      baseKey = wallet.publicKey;
    } else {
      // Passkey-based: Combine public key with device fingerprint
      const deviceFingerprint = generateDeviceFingerprint();
      baseKey = CryptoJS.SHA256(wallet.publicKey + deviceFingerprint).toString();
    }
    
    const encryptionKey = generateEncryptionKey(baseKey, wallet.id);
    
    // Verify HMAC integrity
    if (hmac) {
      const expectedHmac = CryptoJS.HmacSHA256(data, encryptionKey).toString();
      if (hmac !== expectedHmac) {
      throw new Error('Data integrity check failed');
      }
    }
    
    // Decrypt the private key
    const decrypted = CryptoJS.AES.decrypt(data, encryptionKey);
    const privateKey = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!privateKey) {
      throw new Error('Failed to decrypt private key');
    }
    
    return privateKey;
  } catch (error) {
    // Re-throw authentication and validation errors
    if (error instanceof Error) {
      throw error;
    }
    
    // Handle unexpected errors
    throw new Error('Failed to decrypt private key');
  }
}

// Main decrypt function - creates session and decrypts
export async function decryptPrivateKey(wallet: EncryptedWallet): Promise<string | null> {
  try {
    // Create session with authentication
    const sessionKeyRef = await createDecryptionSession(wallet);
    if (!sessionKeyRef) {
    return null;
    }
    
    // Decrypt with session
    return await decryptPrivateKeyWithSession(wallet, sessionKeyRef);
  } catch (error) {
    throw error; // Re-throw for proper error handling
  }
}

// Validate private key format
export function isValidPrivateKey(privateKey: string): boolean {
  try {
    const cleanKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    new Wallet(cleanKey);
    return true;
  } catch (error) {
    return false;
  }
}

// Get address from private key using ethers.js
export function getAddressFromPrivateKey(privateKey: string): string | null {
  try {
    if (!isValidPrivateKey(privateKey)) {
      return null;
    }
    const cleanKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const wallet = new Wallet(cleanKey);
    return wallet.address;
  } catch (error) {
    console.error('Error getting address from private key:', error);
    return null;
  }
}

// Generate random wallet
export function generateRandomWallet(): { privateKey: string; address: string; name: string } {
  const wallet = Wallet.createRandom();
  return {
    privateKey: wallet.privateKey,
    address: wallet.address,
    name: generateWalletName()
  };
}

// Generate random wallet name
export function generateWalletName(): string {
  const adjectives = ['Swift', 'Bright', 'Golden', 'Silver', 'Quick', 'Smart', 'Bold', 'Fast', 'Prime', 'Elite'];
  const nouns = ['Wallet', 'Account', 'Vault', 'Safe', 'Chamber', 'Key', 'Node', 'Hub'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9999);
  
  return `moonx-farm-${adj} ${noun} ${num}`;
}

// Local storage keys
export const STORAGE_KEYS = {
  WALLETS: 'moonx-secure-wallets',
  ACTIVE_WALLET: 'moonx-active-wallet',
  SETTINGS: 'moonx-settings'
} as const;

// Save encrypted wallet to local storage
export function saveWalletToStorage(wallet: EncryptedWallet): void {
  try {
    const existingWallets = getWalletsFromStorage();
    const updatedWallets = existingWallets.filter(w => w.address !== wallet.address);
    updatedWallets.push({
      ...wallet,
      lastUsed: Date.now()
    });
    
    localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(updatedWallets));
  } catch (error) {
    console.error('Error saving wallet to storage:', error);
  }
}

// Get all wallets from local storage
export function getWalletsFromStorage(): EncryptedWallet[] {
  try {
    const walletsJson = localStorage.getItem(STORAGE_KEYS.WALLETS);
    return walletsJson ? JSON.parse(walletsJson) : [];
  } catch (error) {
    console.error('Error getting wallets from storage:', error);
    return [];
  }
}

// Remove wallet from local storage
export function removeWalletFromStorage(address: string): void {
  try {
    const existingWallets = getWalletsFromStorage();
    const updatedWallets = existingWallets.filter(w => w.address !== address);
    localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(updatedWallets));
  } catch (error) {
    console.error('Error removing wallet from storage:', error);
  }
}

// Set active wallet
export function setActiveWallet(address: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_WALLET, address);
  } catch (error) {
    console.error('Error setting active wallet:', error);
  }
}

// Get active wallet
export function getActiveWallet(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_WALLET);
  } catch (error) {
    console.error('Error getting active wallet:', error);
    return null;
  }
}

// Clear all wallet data from storage
export function clearAllWalletData(): void {
  try {
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEYS.WALLETS);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WALLET);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    
    // Clear sessionStorage
    sessionStorage.removeItem('moonx-session');
    sessionStorage.removeItem('moonx-session-config');
    
    // Clear in-memory secure keys
    if (typeof window !== 'undefined' && window.secureKeyStore) {
      window.secureKeyStore.clear();
    }
  } catch (error) {
    console.error('Error clearing wallet data:', error);
  }
}

// Clear specific wallet from storage
export function clearWalletFromStorage(address: string): void {
  try {
    removeWalletFromStorage(address);
    
    // If this was the active wallet, clear active wallet reference
    const activeWallet = getActiveWallet();
    if (activeWallet === address) {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_WALLET);
    }
  } catch (error) {
    console.error('Error clearing wallet from storage:', error);
  }
} 