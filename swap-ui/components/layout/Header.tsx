'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { Wallet, ChevronDown, Settings, LogOut, Copy, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button, SettingsModal } from '@/components/ui';
import { useWalletState, useUIState, useNetworkState } from '@/stores';
import { usePrivy } from '@privy-io/react-auth';
import { useWallet } from '@/hooks/useWallet';

const Header: React.FC = () => {
  const { walletAddress, isConnected, setWalletAddress } = useWalletState();
  const { openWalletModal } = useUIState();
  const { selectedNetwork, networks, walletConfig, setWalletConfig } = useNetworkState();
  const { logout: privyLogout } = usePrivy();
  const { getPrivateKey, disconnectWallet, clearAllWalletDataCompletely } = useWallet();

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [currentPrivateKey, setCurrentPrivateKey] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowWalletDropdown(false);
      }
    };

    if (showWalletDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showWalletDropdown]);

  const formatAddress = (address: string) => {
    if (!address) return 'Invalid Address';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getWalletType = () => {
    return walletConfig.walletType === 'private' ? 'PRK' : 'EOA';
  };

  const getWalletTypeName = () => {
    return walletConfig.walletType === 'private' ? 'Private Key' : 'External Wallet';
  };

  const copyAddress = async () => {
    if (walletAddress) {
      await navigator.clipboard.writeText(walletAddress);
      // Could add toast notification here
    }
  };

  const handleDisconnectClick = () => {
    setShowWalletDropdown(false);
    setShowDisconnectModal(true);
  };

  const confirmDisconnect = async () => {
    try {
      if (walletConfig.walletType === 'private') {
        // 🔒 SECURE: Complete cleanup for private key wallets
        // This removes ONLY the active wallet connection but keeps saved wallets
        disconnectWallet();
      } else {
        // 🔒 SECURE: Complete cleanup for Privy wallets
        try {
          // Logout from Privy (clears Privy session, cookies, etc.)
          await privyLogout();
        } catch (privyError) {
          // Handle Privy logout error gracefully
          console.warn('Privy logout failed, continuing with local cleanup:', privyError);
        }
        
        // Clear local wallet state regardless of Privy logout result
        setWalletAddress(null);
        setWalletConfig({
          walletType: 'privy',
          privateKey: undefined,
        });
        
        // Clear any remaining local data (sessions, etc.)
        disconnectWallet();
      }
    } catch (error) {
      console.error('Error during disconnect:', error);
      // Force clear all data if there's an error
      try {
        disconnectWallet();
      } catch (fallbackError) {
        console.error('Fallback disconnect also failed:', fallbackError);
      }
    }
    
    setShowDisconnectModal(false);
  };

  const showPrivateKeyWarning = async () => {
    setShowWalletDropdown(false);
    setAuthError(null);
    setCurrentPrivateKey(null);
    setShowPrivateKey(false);
    setShowPrivateKeyModal(true);
  };

  // 🔐 SECURE: Authenticate and get private key
  const authenticateAndShowPrivateKey = async () => {
    if (walletConfig.walletType !== 'private') {
      setAuthError('Private key not available for this wallet type');
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const privateKey = await getPrivateKey();
      if (privateKey) {
        setCurrentPrivateKey(privateKey);
        setShowPrivateKey(true);
      } else {
        setAuthError('Failed to authenticate. Please try again.');
      }
    } catch (error) {
      setAuthError('Authentication failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Clear private key when modal closes
  const closePrivateKeyModal = () => {
    setShowPrivateKeyModal(false);
    setShowPrivateKey(false);
    setCurrentPrivateKey(null);
    setAuthError(null);
    setIsAuthenticating(false);
  };

  const tabs = [
    { id: 'swap', label: 'Swap', active: true, href: '/' },
    { id: 'pool', label: 'Pool', active: false, href: '#' },
    { id: 'bridge', label: 'Bridge', active: false, href: '#' },
  ];

  return (
    <>
      <header className="w-full bg-[#1a1b23] border-b border-gray-800 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left Side - Logo & Navigation */}
            <div className="flex items-center space-x-8">
              {/* Logo */}
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-sm">M</span>
                </div>
                <span className="text-xl font-bold text-white">MoonX</span>
              </div>

              {/* Navigation Tabs */}
              <nav className="hidden md:flex items-center space-x-1">
                {tabs.map((tab) => (
                  <a
                    key={tab.id}
                    href={tab.href}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      tab.active
                        ? 'bg-gradient-to-r from-orange-500/20 to-orange-600/20 text-orange-400 border border-orange-500/30 shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50 border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </a>
                ))}
              </nav>
            </div>

            {/* Right Side - Chain Selector & Wallet */}
            <div className="flex items-center space-x-3">
              {/* Chain Selector */}
              <div className="flex items-center space-x-2 px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-xl hover:bg-gray-800/80 hover:border-gray-600 transition-all cursor-pointer group">
                <div className="w-5 h-5 rounded-full overflow-hidden">
                  {selectedNetwork ? (
                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {selectedNetwork.name.charAt(0)}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gray-600 rounded-full animate-pulse"></div>
                  )}
                </div>
                <span className="hidden sm:block text-sm text-white font-medium group-hover:text-gray-200">
                  {selectedNetwork?.name || (networks.length > 0 ? 'No Network' : 'Loading...')}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-300" />
              </div>

              {/* Settings Button */}
              <button 
                onClick={() => setShowSettingsModal(true)}
                className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/60 border border-gray-700 hover:border-gray-600 rounded-xl transition-all duration-200"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>

              {/* Wallet Connection */}
              {isConnected ? (
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                      className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl border border-orange-500/20"
                    >
                      <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                        <Wallet className="w-3 h-3 text-white" />
                      </div>
                      <div className="hidden sm:flex flex-col items-start">
                        <span className="text-white font-medium text-sm">
                          {walletAddress ? formatAddress(walletAddress) : 'No Address'}
                        </span>
                        <span className="text-orange-200 text-xs">
                          {getWalletType()}
                        </span>
                      </div>
                    <ChevronDown className="w-4 h-4 text-white/80" />
                  </button>

                  {/* Enhanced Wallet Dropdown */}
                  {showWalletDropdown && (
                    <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 backdrop-blur-sm">
                      {/* Header */}
                      <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-white font-semibold">Wallet Connected</div>
                          <div className="flex items-center space-x-1 px-2 py-1 bg-orange-500/20 rounded-md">
                            <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                            <span className="text-orange-400 text-xs font-medium">{getWalletType()}</span>
                          </div>
                        </div>
                        <div className="text-gray-300 text-sm mb-1">{getWalletTypeName()}</div>
                        <div className="text-gray-400 text-sm font-mono bg-gray-800 p-2 rounded-lg break-all">
                          {walletAddress}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="p-2">
                        <button
                          onClick={copyAddress}
                          className="w-full flex items-center space-x-3 px-3 py-2.5 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all duration-200"
                        >
                          <Copy className="w-4 h-4" />
                          <span>Copy Address</span>
                        </button>
                        
                        <button
                          onClick={() => {
                            setShowWalletDropdown(false);
                            openWalletModal('manage');
                          }}
                          className="w-full flex items-center space-x-3 px-3 py-2.5 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all duration-200"
                        >
                          <Wallet className="w-4 h-4" />
                          <span>Manage Wallet</span>
                        </button>

                        {/* Show Private Key (only for private key wallets) */}
                        {walletConfig.walletType === 'private' && (
                          <button
                            onClick={showPrivateKeyWarning}
                            className="w-full flex items-center space-x-3 px-3 py-2.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-all duration-200"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Show Private Key</span>
                          </button>
                        )}
                        
                        <div className="border-t border-gray-700 my-2"></div>
                        
                        <button
                          onClick={handleDisconnectClick}
                          className="w-full flex items-center space-x-3 px-3 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Disconnect Wallet</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  onClick={() => openWalletModal('connect')}
                  variant="primary"
                  size="md"
                  className="shadow-lg hover:shadow-xl"
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  Connect Wallet
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
      />

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Disconnect Wallet</h3>
                <p className="text-gray-400 text-sm">Are you sure you want to disconnect?</p>
              </div>
            </div>
            
            {walletConfig.walletType === 'private' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-amber-400 font-medium text-sm mb-1">Disconnect Options</p>
                    <p className="text-amber-300 text-sm">
                      <strong>Disconnect:</strong> Keeps your saved wallet for future use.<br/>
                      <strong>Remove Completely:</strong> Permanently deletes all wallet data.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex space-x-3">
              <Button
                onClick={() => setShowDisconnectModal(false)}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </Button>
              
              {walletConfig.walletType === 'private' ? (
                <>
                  <Button
                    onClick={confirmDisconnect}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    Disconnect
                  </Button>
                  <Button
                    onClick={() => {
                      clearAllWalletDataCompletely();
                      setShowDisconnectModal(false);
                    }}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    Remove All
                  </Button>
                </>
              ) : (
                <Button
                  onClick={confirmDisconnect}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Show Private Key Modal */}
      {showPrivateKeyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Private Key</h3>
                <p className="text-gray-400 text-sm">Keep this secret and secure</p>
              </div>
            </div>
            
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-red-400 font-medium text-sm mb-1">Security Warning</p>
                  <p className="text-red-300 text-sm">
                    Never share your private key with anyone. Anyone with this key can access your wallet.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Authentication Required State */}
            {!currentPrivateKey && !isAuthenticating && (
              <div className="space-y-4 mb-4">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Eye className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-blue-400 font-medium text-sm mb-1">Authentication Required</p>
                      <p className="text-blue-300 text-sm">
                        To view your private key, you need to authenticate using your passkey or biometrics.
                      </p>
                    </div>
                  </div>
                </div>
                
                {authError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-red-400 text-sm">{authError}</p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={authenticateAndShowPrivateKey}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isAuthenticating}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Authenticate & Show Private Key
                </Button>
              </div>
            )}

            {/* Loading State */}
            {isAuthenticating && (
              <div className="space-y-4 mb-4">
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                </div>
                <p className="text-center text-gray-400 text-sm">
                  Authenticating... Please complete the authentication challenge.
                </p>
              </div>
            )}

            {/* Private Key Display */}
            {currentPrivateKey && (
              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center">
                  <label className="text-gray-300 text-sm font-medium">Private Key</label>
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="text-gray-400 hover:text-white p-1"
                  >
                    {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                  <div className="font-mono text-sm text-gray-300 break-all">
                    {showPrivateKey ? currentPrivateKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                  </div>
                </div>
                {showPrivateKey && (
                  <button
                    onClick={() => {
                      if (currentPrivateKey) {
                        navigator.clipboard.writeText(currentPrivateKey);
                      }
                    }}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy to Clipboard</span>
                  </button>
                )}
              </div>
            )}
            
            <div className="flex space-x-3">
              <Button
                onClick={closePrivateKeyModal}
                variant="secondary"
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header; 