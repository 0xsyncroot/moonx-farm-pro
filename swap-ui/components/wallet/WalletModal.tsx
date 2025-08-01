'use client';

import { useState } from 'react';
import { Wallet, Shield, Key, Eye, EyeOff, Copy, AlertTriangle, Download, CheckCircle } from 'lucide-react';
import { Modal, Button, Input } from '@/components/ui';
import { useUIState, useWalletState } from '@/stores';
import { useWallet } from '@/hooks/useWallet';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';

const WalletModal: React.FC = () => {
  const { walletModal, closeWalletModal, loading } = useUIState();
  const { passkeySupported } = useWalletState();
  const { 
    savedWallets, 
    connectWithPrivateKey, 
    generateNewWallet, 
    switchWallet, 
    deleteWallet 
  } = useWallet();
  
  // Check if Privy is configured
  const isPrivyConfigured = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  
  // Always call hook but handle gracefully
  const { connectWithPrivy, authenticated, availableWallets, walletAddress, disconnectPrivy } = usePrivyWallet();

  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [connectionMethod, setConnectionMethod] = useState<'privy' | 'private'>(
    isPrivyConfigured ? 'privy' : 'private'
  );
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState('');
  const [showGeneratedKey, setShowGeneratedKey] = useState(false);
  const [privateKeySaved, setPrivateKeySaved] = useState(false);

  const handleConnect = async () => {
    if (!privateKeyInput.trim()) return;

    const success = await connectWithPrivateKey(privateKeyInput);
    if (success) {
      setPrivateKeyInput('');
      closeWalletModal();
    }
  };

  const handleGenerateWallet = async () => {
    const privateKey = await generateNewWallet();
    if (privateKey) {
      setGeneratedPrivateKey(privateKey);
      setShowPrivateKeyModal(true);
      setShowGeneratedKey(false);
      setPrivateKeySaved(false);
    }
  };

  const handleCopyPrivateKey = async () => {
    if (generatedPrivateKey) {
      await navigator.clipboard.writeText(generatedPrivateKey);
      // Could add toast notification here
    }
  };

  const handleDownloadPrivateKey = () => {
    if (generatedPrivateKey) {
      const element = document.createElement('a');
      const file = new Blob([`MoonX Wallet Private Key\n\nPrivate Key: ${generatedPrivateKey}\n\nIMPORTANT: Keep this private key secure and never share it with anyone!`], {
        type: 'text/plain'
      });
      element.href = URL.createObjectURL(file);
      element.download = `moonx-wallet-${Date.now()}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const handleContinueWithGenerated = async () => {
    console.log('🚀 WalletModal: handleContinueWithGenerated starting...', { 
      generatedPrivateKeyLength: generatedPrivateKey.length 
    });
    
    setPrivateKeyInput(generatedPrivateKey);
    setShowPrivateKeyModal(false);
    
    // ✅ AUTO-CONNECT after user confirms private key saved
    console.log('🚀 WalletModal: Calling connectWithPrivateKey...');
    const success = await connectWithPrivateKey(generatedPrivateKey);
    
    if (success) {
      console.log('✅ WalletModal: Auto-connect SUCCESS, closing modal');
      setGeneratedPrivateKey('');
      setPrivateKeyInput('');
      closeWalletModal();
    } else {
      console.error('❌ WalletModal: Auto-connect FAILED, keeping modal open');
      // If auto-connect fails, fallback to manual input
      setPrivateKeyInput(generatedPrivateKey);
    }
    setGeneratedPrivateKey('');
  };

  const handleSwitchWallet = async (wallet: any) => {
    const success = await switchWallet(wallet);
    if (success) {
      closeWalletModal();
    }
  };

  return (
    <>
      <Modal
        isOpen={walletModal.isOpen}
        onClose={closeWalletModal}
        title="Connect Wallet"
        size="md"
      >
        <div className="space-y-6">
        {/* Connection Method Tabs */}
        {isPrivyConfigured ? (
          <div className="flex p-1 bg-gray-800 rounded-xl">
            <button
              onClick={() => setConnectionMethod('privy')}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-colors ${
                connectionMethod === 'privy'
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Privy Wallet</span>
            </button>
            <button
              onClick={() => setConnectionMethod('private')}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-colors ${
                connectionMethod === 'private'
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>Private Key</span>
            </button>
          </div>
        ) : (
          <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
            <div className="flex items-center space-x-2 text-gray-400">
              <Key className="w-4 h-4" />
              <span className="text-sm">Private Key Connection</span>
            </div>
          </div>
        )}

                 {/* Privy Connection */}
         {isPrivyConfigured && connectionMethod === 'privy' && (
           <div className="space-y-4">
             {!authenticated ? (
               <>
                 <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                   <div className="flex items-center space-x-2 mb-2">
                     <Shield className="w-4 h-4 text-blue-400" />
                     <span className="text-blue-400 text-sm font-medium">Secure & Easy</span>
                   </div>
                   <p className="text-xs text-gray-400">
                     Connect your external wallet (MetaMask, WalletConnect, etc.)
                   </p>
                 </div>
                 
                 <Button
                   onClick={connectWithPrivy}
                   loading={loading.isLoading}
                   className="w-full"
                   disabled={!connectWithPrivy}
                 >
                   Connect External Wallet
                 </Button>
               </>
             ) : (
               <>
                 <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                   <div className="flex items-center space-x-2 mb-2">
                     <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                     <span className="text-green-400 text-sm font-medium">External Wallet Connected</span>
                   </div>
                   <p className="text-xs text-gray-400">
                     Current wallet: {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-6)}
                   </p>
                 </div>

                 {/* Available External Wallets */}
                 {availableWallets && availableWallets.length > 0 && (
                   <div>
                     <label className="block text-sm font-medium text-gray-300 mb-3">
                       Connected Wallets
                     </label>
                     <div className="space-y-2 max-h-40 overflow-y-auto">
                       {availableWallets.map((wallet: any) => (
                         <div
                           key={wallet.id}
                           className="flex items-center justify-between p-3 bg-gray-800/60 border border-gray-700/40 rounded-lg hover:border-gray-600/50 transition-all"
                         >
                           <div className="flex items-center space-x-3">
                             <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                               <Wallet className="w-4 h-4 text-white" />
                             </div>
                             <div>
                               <div className="text-white text-sm font-medium">{wallet.name}</div>
                               <div className="text-gray-400 text-xs font-mono">
                                 {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                               </div>
                             </div>
                           </div>
                           <div className="flex items-center space-x-2">
                             {wallet.address === walletAddress && (
                               <span className="text-green-400 text-xs">Active</span>
                             )}
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}

                 <Button
                   onClick={() => {
                     disconnectPrivy();
                     closeWalletModal();
                   }}
                   variant="secondary"
                   className="w-full"
                 >
                   Disconnect Wallet
                 </Button>
               </>
             )}
           </div>
         )}

                 {/* Private Key Connection */}
         {(!isPrivyConfigured || connectionMethod === 'private') && (
          <div className="space-y-4">
            {/* Security Info */}
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm font-medium">
                  {passkeySupported ? 'Passkey Protected' : 'Device Protected'}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {passkeySupported 
                  ? 'Your wallet will be secured with biometric authentication (Face ID, Touch ID, or Windows Hello)' 
                  : 'Your wallet will be encrypted with advanced device-based security and stored locally'
                }
              </p>
              {!passkeySupported && (
                <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-amber-400 text-xs">
                    💡 Your browser doesn't support passkey authentication. Using secure device-based encryption instead.
                  </p>
                </div>
              )}
            </div>

                    {/* Private Key Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Enter Private Key
              </label>
              <Input
                type="password"
                placeholder="0x..."
                value={privateKeyInput}
                onChange={setPrivateKeyInput}
              />
              <p className="text-xs text-gray-400 mt-1">
                {passkeySupported 
                  ? 'Protected with passkey authentication' 
                  : 'Encrypted and stored locally'
                }
              </p>
            </div>

            {/* Generate New Wallet */}
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-2">or</div>
              <button
                onClick={handleGenerateWallet}
                className="text-green-400 hover:text-green-300 text-sm font-medium transition-colors"
              >
                Generate New Wallet
              </button>
            </div>

            {/* Saved Wallets */}
            {savedWallets.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Saved Wallets
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {savedWallets
                    .sort((a: any, b: any) => b.lastUsed - a.lastUsed)
                    .map((wallet: any) => (
                      <div
                        key={wallet.address}
                        className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors group"
                      >
                        <button
                          onClick={() => handleSwitchWallet(wallet)}
                          disabled={loading.isLoading}
                          className="flex items-center space-x-3 flex-1 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                            {loading.isLoading ? (
                              <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <Wallet className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <div>
                            <div className="text-white font-medium">{wallet.name}</div>
                            <div className="text-gray-400 text-sm">
                              {loading.isLoading && loading.loadingMessage ? loading.loadingMessage : 
                               `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => deleteWallet(wallet.address)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Private Key Actions */}
            <div className="flex space-x-3">
              <Button
                variant="secondary"
                onClick={closeWalletModal}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConnect}
                disabled={!privateKeyInput.trim()}
                loading={loading.isLoading}
                className="flex-1"
              >
                {loading.isLoading ? loading.loadingMessage || 'Connecting...' : 'Connect'}
              </Button>
            </div>
          </div>
        )}
        </div>
      </Modal>

      {/* Private Key Display Modal */}
      <Modal
        isOpen={showPrivateKeyModal}
        onClose={() => {
          setShowPrivateKeyModal(false);
          setGeneratedPrivateKey('');
          setShowGeneratedKey(false);
          setPrivateKeySaved(false);
        }}
        title="Your New Wallet"
        size="md"
      >
        <div className="space-y-6">
          {/* Security Warning */}
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-red-400 font-semibold text-sm mb-2">Critical Security Warning</h3>
                <ul className="text-red-300 text-sm space-y-1">
                  <li>• Never share your private key with anyone</li>
                  <li>• Store it in a secure location (password manager, hardware wallet)</li>
                  <li>• Anyone with this key can access your funds</li>
                  <li>• MoonX cannot recover your wallet if you lose this key</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Private Key Display */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-gray-300 text-sm font-semibold">Your Private Key</label>
              <button
                onClick={() => setShowGeneratedKey(!showGeneratedKey)}
                className="flex items-center space-x-1 text-gray-400 hover:text-white p-1 transition-colors"
              >
                {showGeneratedKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="text-xs">{showGeneratedKey ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="font-mono text-sm text-gray-300 break-all select-all">
                {showGeneratedKey ? generatedPrivateKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
              </div>
            </div>
            
            {showGeneratedKey && (
              <div className="flex space-x-2">
                <button
                  onClick={handleCopyPrivateKey}
                  className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy to Clipboard</span>
                </button>
                <button
                  onClick={handleDownloadPrivateKey}
                  className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Download as File</span>
                </button>
              </div>
            )}
          </div>

          {/* Confirmation Checkbox */}
          <div className="space-y-4">
            <label className="flex items-start space-x-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={privateKeySaved}
                  onChange={(e) => setPrivateKeySaved(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 border-2 rounded transition-all ${
                  privateKeySaved 
                    ? 'bg-green-500 border-green-500' 
                    : 'border-gray-400 group-hover:border-gray-300'
                }`}>
                  {privateKeySaved && (
                    <CheckCircle className="w-5 h-5 text-white -m-0.5" />
                  )}
                </div>
              </div>
              <div className="text-sm">
                <span className="text-white font-medium">I have safely stored my private key</span>
                <p className="text-gray-400 text-xs mt-1">
                  I understand that I am responsible for keeping my private key secure and that MoonX cannot help me recover it if lost.
                </p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            <Button
              onClick={() => {
                setShowPrivateKeyModal(false);
                setGeneratedPrivateKey('');
                setShowGeneratedKey(false);
                setPrivateKeySaved(false);
              }}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleContinueWithGenerated}
              disabled={!privateKeySaved}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              Continue Setup
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default WalletModal; 