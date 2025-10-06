import { ethers, type TransactionRequest } from 'ethers';
import { sessionManager } from './session-manager';
import { type EncryptedWallet } from './crypto';

/**
 * Secure transaction signer with session-based authentication
 */
export class SecureSigner {
  private static instance: SecureSigner | null = null;
  private activeWallet: EncryptedWallet | null = null;

  static getInstance(): SecureSigner {
    if (!SecureSigner.instance) {
      SecureSigner.instance = new SecureSigner();
    }
    return SecureSigner.instance;
  }

  /**
   * Set active wallet for signing operations
   */
  setActiveWallet(wallet: EncryptedWallet | null): void {
    this.activeWallet = wallet;
  }

  /**
   * Get private key from session with active wallet
   */
  private async getPrivateKey(): Promise<string> {
    if (!this.activeWallet) {
      throw new Error('No active wallet - please set wallet first');
    }
    return await sessionManager.getPrivateKey(this.activeWallet);
  }

  /**
   * Sign transaction
   */
  async signTransaction(transaction: TransactionRequest): Promise<string> {
    const privateKey = await this.getPrivateKey();
    // getPrivateKey now throws SwapError instead of returning null
    const wallet = new ethers.Wallet(privateKey);
    return await wallet.signTransaction(transaction);
  }

  /**
   * Sign message
   */
  async signMessage(message: string): Promise<string> {
    const privateKey = await this.getPrivateKey();
    // getPrivateKey now throws SwapError instead of returning null
    const wallet = new ethers.Wallet(privateKey);
    return await wallet.signMessage(message);
  }

  /**
   * Sign typed data
   */
  async signTypedData(
    domain: any,
    types: Record<string, any>,
    value: Record<string, any>
  ): Promise<string> {
    const privateKey = await this.getPrivateKey();
    // getPrivateKey now throws SwapError instead of returning null
    const wallet = new ethers.Wallet(privateKey);
    return await wallet.signTypedData(domain, types, value);
  }

  /**
   * Get wallet address
   */
  getAddress(): string | null {
    return this.activeWallet?.address || null;
  }

  /**
   * Create provider wallet for read/write operations
   */
  async createProviderWallet(provider: ethers.Provider): Promise<ethers.Wallet> {
    const privateKey = await this.getPrivateKey();
    // getPrivateKey now throws SwapError instead of returning null
    // so privateKey will always be truthy if we reach this point
    return new ethers.Wallet(privateKey!, provider);
  }

  /**
   * Check if signer has active session
   */
  hasActiveSession(): boolean {
    return sessionManager.hasActiveSession();
  }

  /**
   * Check if there's a valid session in storage that can be restored
   */
  hasValidStoredSession(): boolean {
    return sessionManager.hasValidStoredSession();
  }

  /**
   * Lock wallet session
   */
  lock(): void {
    sessionManager.lockWallet();
  }
}

// Export singleton instance
export const secureSigner = SecureSigner.getInstance();

// Export convenience functions for backward compatibility
export const signTransaction = (tx: TransactionRequest) => secureSigner.signTransaction(tx);
export const signMessage = (message: string) => secureSigner.signMessage(message);
export const signTypedData = (domain: any, types: Record<string, any>, value: Record<string, any>) => 
  secureSigner.signTypedData(domain, types, value);
export const getSignerAddress = () => secureSigner.getAddress();
export const createProviderWallet = (provider: ethers.Provider) => 
  secureSigner.createProviderWallet(provider);