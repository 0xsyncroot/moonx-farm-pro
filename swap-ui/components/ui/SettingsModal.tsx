'use client';

import { useState, useEffect } from 'react';
import { Settings, Wifi, Key, Check, X, AlertTriangle, Info, Shield, Plus, Eye, EyeOff, RefreshCw, Clock } from 'lucide-react';
import { Modal, Button, Input } from '@/components/ui';
import { useNetworkState, useWalletState } from '@/stores';
import { useWallet } from '@/hooks/useWallet';
import { generateRandomWallet, isPasskeySupported } from '@/libs/crypto';
import type { RPCSettings, WalletConfig } from '@/types';
import type { SessionConfig } from '@/libs/session-manager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { rpcSettings, walletConfig, networks, setRpcSettings, setWalletConfig, loadNetworks } = useNetworkState();
  const { passkeySupported, walletAddress, activeWallet, isConnected, savedWallets } = useWalletState();
  const { getSessionConfig, updateSessionConfig, resetSessionConfig, switchWallet } = useWallet();
  
  const [tempRpcSettings, setTempRpcSettings] = useState<RPCSettings>(rpcSettings);
  const [tempWalletConfig, setTempWalletConfig] = useState<WalletConfig>(walletConfig);
  const [tempSessionConfig, setTempSessionConfig] = useState<SessionConfig>({
    sessionTimeout: 480,
    activityTimeout: 0,
  });
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [testingRpc, setTestingRpc] = useState(false);
  const [rpcTestResult, setRpcTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync temp settings with current store values when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempRpcSettings(rpcSettings);
      setTempWalletConfig(walletConfig);
      
      // Load current session config
      try {
        const currentSessionConfig = getSessionConfig();
        setTempSessionConfig(currentSessionConfig);
      } catch (error) {
        console.warn('Failed to load session config:', error);
      }

      // Load networks if not already loaded (use store method to prevent double API calls)
      if (networks.length === 0) {
        console.log('🔧 SettingsModal: Loading networks via store...');
        loadNetworks();
      }
      
      // Debug current wallet state
      console.log('🔧 SettingsModal: Current state:', {
        isConnected,
        walletAddress,
        activeWallet: activeWallet ? {
          name: activeWallet.name,
          address: activeWallet.address,
          id: activeWallet.id
        } : null,
        savedWalletsCount: savedWallets.length,
        walletConfigType: walletConfig.walletType,
        tempWalletConfigType: tempWalletConfig.walletType,
        passkeySupported
      });
    }
  }, [isOpen, rpcSettings, walletConfig, getSessionConfig, networks.length, loadNetworks, isConnected, walletAddress, activeWallet, savedWallets]);

  const handleSave = async () => {
    setSaving(true);
    try {
      console.log('🔧 SettingsModal: Saving settings...', {
        currentWalletType: walletConfig.walletType,
        newWalletType: tempWalletConfig.walletType,
        hasPrivateKey: !!tempWalletConfig.privateKey
      });
      
      // Save wallet configuration
      setWalletConfig(tempWalletConfig);
      
      // Save RPC settings
      setRpcSettings(tempRpcSettings);
      
      // Save session configuration
      try {
        updateSessionConfig(tempSessionConfig);
      } catch (error) {
        console.error('Failed to save session config:', error);
      }
      
      // If user entered a new private key, handle wallet connection
      if (tempWalletConfig.walletType === 'private' && tempWalletConfig.privateKey) {
        console.log('🔧 SettingsModal: New private key detected, handling wallet connection...');
        // Note: Private key connection should be handled by connectWithPrivateKey
        // This is just for wallet type switching
      }
      
      console.log('✅ SettingsModal: Settings saved successfully');
      onClose();
    } catch (error) {
      console.error('❌ SettingsModal: Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setTempRpcSettings(rpcSettings);
    setTempWalletConfig(walletConfig);
    setRpcTestResult(null);
    onClose();
  };

  const handleGenerateNewWallet = async () => {
    setGeneratingKey(true);
    try {
      const wallet = await generateRandomWallet();
      setTempWalletConfig(prev => ({
        ...prev,
        privateKey: wallet.privateKey,
        walletType: 'private'
      }));
      setShowPrivateKey(true);
    } catch (error) {
      console.error('Failed to generate wallet:', error);
    } finally {
      setGeneratingKey(false);
    }
  };

  const testRpcConnection = async () => {
    setTestingRpc(true);
    setRpcTestResult(null);
    
    try {
      // Always test custom RPC when this function is called (since button only shows for custom RPC)
      const rpcUrl = tempRpcSettings.customRpcUrl;
      
      if (!rpcUrl || !tempRpcSettings.useCustomRpc) {
        setRpcTestResult({ success: false, message: 'Custom RPC URL is required' });
        return;
      }

      console.log('🔧 Testing Custom RPC:', rpcUrl);

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          setRpcTestResult({ 
            success: true, 
            message: `Custom RPC connected successfully (Block: ${parseInt(data.result, 16)})` 
          });
        } else {
          setRpcTestResult({ success: false, message: 'Invalid RPC response' });
        }
      } else {
        setRpcTestResult({ success: false, message: `RPC connection failed (${response.status})` });
      }
    } catch (error) {
      console.error('RPC test error:', error);
      setRpcTestResult({ success: false, message: 'Connection timeout or network error' });
    } finally {
      setTestingRpc(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="Settings" size="2xl" className="!max-w-none w-[98vw] sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[80vw] 2xl:max-w-7xl">
      <div className="space-y-4 sm:space-y-6 max-h-[85vh] sm:max-h-[80vh] overflow-y-auto scrollbar-hide px-1 sm:px-2">
        
        {/* Main Grid Layout - Responsive */}
        <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          
          {/* Left Column */}
          <div className="space-y-4 sm:space-y-6 lg:space-y-8">
            
            {/* RPC Configuration Section */}
            <section className="space-y-4">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Network Configuration</h3>
                  <p className="text-xs text-gray-400">Configure RPC endpoints and network settings</p>
                </div>
              </div>
          
          <div className="space-y-4">
            {/* Default Base RPC URL - Read Only */}
            <div>
              <label className="block text-xs font-medium text-white mb-2">
                Default Base RPC URL
                <span className="ml-2 text-xs text-gray-400">(System Default)</span>
              </label>
              <div className="relative">
                <Input
                  value={tempRpcSettings.baseRpcUrl}
                  onChange={() => {}} // No-op for disabled field
                  disabled
                  placeholder="https://mainnet.base.org"
                  className="text-xs font-mono bg-gray-800/50 text-gray-300 cursor-not-allowed"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                This is the default RPC endpoint for Base network
              </p>
            </div>

            {/* Custom RPC Configuration */}
            <div className="space-y-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="useCustomRpc"
                    checked={tempRpcSettings.useCustomRpc}
                    onChange={(e) => setTempRpcSettings(prev => ({ ...prev, useCustomRpc: e.target.checked }))}
                    className="rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500"
                  />
                  <label htmlFor="useCustomRpc" className="text-xs font-medium text-white">
                    Use Custom RPC Endpoint
                  </label>
                </div>
                {tempRpcSettings.useCustomRpc && (
                  <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-1 rounded">
                    Active
                  </span>
                )}
              </div>
              
              <p className="text-xs text-gray-400">
                {tempRpcSettings.useCustomRpc 
                  ? "Custom RPC will be used instead of default Base RPC"
                  : "Enable to use your own RPC endpoint"
                }
              </p>
              
              {tempRpcSettings.useCustomRpc && (
                <div className="space-y-3 mt-3 pt-3 border-t border-gray-700/50">
                  <div>
                    <label className="block text-xs font-medium text-orange-400 mb-2">
                      Custom RPC URL
                    </label>
                    <Input
                      value={tempRpcSettings.customRpcUrl || ''}
                      onChange={(value) => setTempRpcSettings(prev => ({ ...prev, customRpcUrl: value }))}
                      placeholder="https://your-custom-rpc.com"
                      className="text-xs font-mono border-orange-500/30 focus:border-orange-500/50"
                    />
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Button
                      onClick={testRpcConnection}
                      disabled={testingRpc || !tempRpcSettings.customRpcUrl}
                      size="sm"
                      variant="secondary"
                      className="flex items-center space-x-2 border-orange-500/30 hover:border-orange-500/50"
                    >
                      {testingRpc ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wifi className="w-3 h-3" />
                      )}
                      <span className="text-xs">Test Custom RPC</span>
                    </Button>
                    
                    {rpcTestResult && (
                      <div className={`flex items-center space-x-1 text-xs ${
                        rpcTestResult.success ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {rpcTestResult.success ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        <span>{rpcTestResult.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
            </section>

            {/* Wallet Configuration Section */}
            <section className="space-y-4">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
              <Key className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Wallet Configuration</h3>
              <p className="text-xs text-gray-400">Choose your preferred wallet connection method</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Wallet Type Selection */}
            <div>
              <label className="block text-xs font-medium text-white mb-3">
                Connection Method
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setTempWalletConfig(prev => ({ ...prev, walletType: 'privy' }))}
                  className={`p-4 rounded-xl border transition-all duration-200 ${
                    tempWalletConfig.walletType === 'privy'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-400 shadow-lg shadow-orange-500/20'
                      : 'border-gray-600 bg-gray-800/40 text-gray-300 hover:border-gray-500 hover:bg-gray-700/40'
                  }`}
                >
                  <div className="text-center">
                    <div className="w-8 h-8 mx-auto mb-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
                      <Shield className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-sm font-medium">Privy Wallet</div>
                    <div className="text-xs mt-1 opacity-70">Social Login</div>
                  </div>
                </button>
                
                <button
                  onClick={() => setTempWalletConfig(prev => ({ ...prev, walletType: 'private' }))}
                  className={`p-4 rounded-xl border transition-all duration-200 ${
                    tempWalletConfig.walletType === 'private'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-400 shadow-lg shadow-orange-500/20'
                      : 'border-gray-600 bg-gray-800/40 text-gray-300 hover:border-gray-500 hover:bg-gray-700/40'
                  }`}
                >
                  <div className="text-center">
                    <div className="w-8 h-8 mx-auto mb-2 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center">
                      <Key className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-sm font-medium">Private Key</div>
                    <div className="text-xs mt-1 opacity-70">Direct Access</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Private Key Configuration */}
            {tempWalletConfig.walletType === 'private' && (
              <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
                {/* Current Wallet Info */}
                {isConnected && walletConfig.walletType === 'private' && activeWallet && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span className="text-green-400 font-medium text-xs">Current Active Wallet</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-xs">Name:</span>
                        <span className="text-white text-xs font-mono">{activeWallet.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-xs">Address:</span>
                        <span className="text-white text-xs font-mono">{walletAddress}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-white">
                    {isConnected && walletConfig.walletType === 'private' 
                      ? 'Switch to Different Wallet' 
                      : 'Private Key Wallet'
                    }
                  </label>
                  <Button
                    onClick={handleGenerateNewWallet}
                    disabled={generatingKey}
                    variant="ghost"
                    size="sm"
                    className="text-green-400 hover:bg-green-500/10 border border-green-500/20 px-3 py-1"
                  >
                    {generatingKey ? (
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3 mr-1" />
                    )}
                    <span className="text-xs">Generate New</span>
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {/* Private Key Input */}
                  <div className="relative">
                    <Input
                      type={showPrivateKey ? 'text' : 'password'}
                      value={tempWalletConfig.privateKey || ''}
                      onChange={(value) => setTempWalletConfig(prev => ({ ...prev, privateKey: value }))}
                      placeholder={
                        isConnected && walletConfig.walletType === 'private' && !tempWalletConfig.privateKey
                          ? "Enter new private key to switch wallet"
                          : "0x... or import existing private key"
                      }
                      className="pr-10 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      title={showPrivateKey ? 'Hide' : 'Show'}
                    >
                      {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Security Status */}
                  {tempWalletConfig.privateKey && (
                    <div className={`p-3 rounded-lg text-xs flex items-start space-x-2 ${
                      passkeySupported 
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                        : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    }`}>
                      <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium mb-1">
                          {passkeySupported ? 'Enhanced Security Active' : 'Basic Security'}
                        </div>
                        <div>
                          {passkeySupported 
                            ? 'Encrypted with biometric authentication' 
                            : 'Consider using Privy Wallet for better security'
                          }
                        </div>
                      </div>
                    </div>
                                    )}
                </div>
              </div>
            )}
            
            {/* Saved Wallets Section - Only show for private key mode */}
            {tempWalletConfig.walletType === 'private' && savedWallets.length > 0 && (
              <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-white">Saved Wallets</h4>
                  <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded">
                    {savedWallets.length} wallet{savedWallets.length > 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="space-y-2 max-h-32 overflow-y-auto scrollbar-hide">
                  {savedWallets.map((wallet, index) => (
                    <div 
                      key={wallet.id}
                      className={`p-2 rounded-lg border cursor-pointer transition-all duration-200 ${
                        wallet.address === walletAddress
                          ? 'border-orange-500/50 bg-orange-500/10'
                          : 'border-gray-600/50 bg-gray-700/30 hover:border-gray-500/50 hover:bg-gray-700/50'
                      }`}
                      onClick={() => {
                        if (wallet.address !== walletAddress) {
                          switchWallet(wallet);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${
                            wallet.address === walletAddress ? 'bg-orange-400' : 'bg-gray-500'
                          }`}></div>
                          <span className="text-xs font-mono text-white">{wallet.name}</span>
                        </div>
                        <span className="text-xs text-gray-400 font-mono">
                          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                        </span>
                      </div>
                      {wallet.address === walletAddress && (
                        <div className="mt-1 text-xs text-orange-400">Currently Active</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
            
          </div>
          
          {/* Right Column */}
          <div className="space-y-4 sm:space-y-6 lg:space-y-8">
            
            {/* Session Security Section */}
            {isConnected && activeWallet && (
              <section className="space-y-4">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Session Security</h3>
                    <p className="text-xs text-gray-400">Configure wallet session timeouts and auto-lock behavior</p>
                  </div>
                </div>
            
            <div className="space-y-5">
              {/* Session Timeout */}
              <div>
                <label className="block text-xs font-medium text-white mb-3">
                  Session Timeout
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
                  {[
                    { label: '15m', value: 15 },
                    { label: '30m', value: 30 },
                    { label: '1h', value: 60 },
                    { label: '2h', value: 120 },
                    { label: '4h', value: 240 },
                    { label: '8h', value: 480 },
                    { label: '12h', value: 720 },
                    { label: '24h', value: 1440 }
                  ].map((option, index) => (
                    <button
                      key={option.value}
                      onClick={() => setTempSessionConfig(prev => ({ ...prev, sessionTimeout: option.value }))}
                      className={`p-2 sm:p-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        tempSessionConfig.sessionTimeout === option.value
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-lg shadow-purple-500/20'
                          : 'bg-gray-800/40 text-gray-300 border border-gray-600/40 hover:border-gray-500/50 hover:bg-gray-700/30'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Time before session expires (requires re-authentication)
                </p>
              </div>

              {/* Activity Timeout */}
              <div>
                <label className="block text-xs font-medium text-white mb-3">
                  Inactivity Auto-Lock
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2">
                  {[
                    { label: 'Off', value: 0 },
                    { label: '5m', value: 5 },
                    { label: '15m', value: 15 },
                    { label: '30m', value: 30 }
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setTempSessionConfig(prev => ({ ...prev, activityTimeout: option.value }))}
                      className={`p-2 sm:p-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        tempSessionConfig.activityTimeout === option.value
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-lg shadow-purple-500/20'
                          : 'bg-gray-800/40 text-gray-300 border border-gray-600/40 hover:border-gray-500/50 hover:bg-gray-700/30'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Auto-lock wallet after period of inactivity
                </p>
              </div>

              <div className="flex items-start space-x-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-300">
                  <p className="font-medium mb-1">Session Security</p>
                  <p>These settings control when your wallet session automatically locks for security. Shorter timeouts provide better security but require more frequent authentication.</p>
                </div>
                </div>
              </div>
            </section>
            )}
            
          </div>
          
          {/* Network Info - Full Width on Large Screens */}
          {networks.length > 0 && (
            <div className="lg:col-span-2">
              <section className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">Available Networks</h3>
                  <span className="text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded">{networks.length} networks</span>
                </div>
                <div className="text-xs text-gray-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <Check className="w-3 h-3 text-green-400" />
                    <span className="text-green-400 font-medium">Networks loaded successfully from API</span>
                  </div>
                </div>
              </section>
            </div>
          )}
          
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4 sm:pt-6 border-t border-gray-700 mt-4 sm:mt-6 px-1 sm:px-0">
        <Button
          onClick={handleCancel}
          variant="secondary"
          disabled={saving}
          className="px-4 sm:px-6 w-full sm:w-auto"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-4 sm:px-6 w-full sm:w-auto"
        >
          {saving ? (
            <div className="flex items-center justify-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </div>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default SettingsModal;