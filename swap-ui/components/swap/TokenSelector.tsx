'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Star, Plus, AlertTriangle, X, Zap, TrendingUp, CheckCircle, TrendingDown, ChevronDown, DollarSign, Wallet } from 'lucide-react';
import { Modal, Input, TokenSelectorControl, TokenAmountDisplay, TokenNotFoundCard, TokenSkeleton, Button } from '@/components/ui';
import { useSelectedNetwork, useTokenState, useWalletAddress } from '@/stores';
import type { TokenBalance } from '@/types';

// Custom Token Management
interface CustomToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  chainId: number;
  imported: boolean;
}

interface ImportFormData {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

// Custom token storage utilities
const CUSTOM_TOKENS_KEY = 'moonx_custom_tokens';

const getCustomTokens = (chainId?: number): CustomToken[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CUSTOM_TOKENS_KEY);
    const tokens = stored ? JSON.parse(stored) : [];
    return chainId ? tokens.filter((t: CustomToken) => t.chainId === chainId) : tokens;
  } catch {
    return [];
  }
};

const saveCustomToken = (token: CustomToken): void => {
  if (typeof window === 'undefined') return;
  try {
    const existing = getCustomTokens();
    const updated = existing.filter(t => 
      !(t.address.toLowerCase() === token.address.toLowerCase() && t.chainId === token.chainId)
    );
    updated.push(token);
    localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save custom token:', error);
  }
};

const removeCustomToken = (address: string, chainId: number): void => {
  if (typeof window === 'undefined') return;
  try {
    const existing = getCustomTokens();
    const updated = existing.filter(t => 
      !(t.address.toLowerCase() === address.toLowerCase() && t.chainId === chainId)
    );
    localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to remove custom token:', error);
  }
};

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(func: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
}

// Address validation utility
const isValidAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

// Jupiter-style number formatting utilities
const formatPrice = (price: number): string => {
  if (price === 0) return '$0.00';
  if (price < 0.0001) return `$${price.toExponential(2)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 100) return `$${price.toFixed(4)}`;
  if (price < 10000) return `$${price.toFixed(2)}`;
  return `$${formatLargeNumber(price)}`;
};

const formatLargeNumber = (num: number): string => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
};

const formatBalance = (balance: string): string => {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  if (num < 0.000001) return '<0.000001';
  if (num < 0.01) return num.toFixed(6).replace(/\.?0+$/, '');
  if (num < 1) return num.toFixed(4).replace(/\.?0+$/, '');
  if (num < 1000) return num.toFixed(2).replace(/\.?0+$/, '');
  return formatLargeNumber(num);
};

const formatPriceChange = (change: number): { text: string; color: string; icon: React.ReactNode } => {
  const isPositive = change >= 0;
  const formatted = Math.abs(change).toFixed(2);
  return {
    text: `${isPositive ? '+' : ''}${formatted}%`,
    color: isPositive ? 'text-green-400' : 'text-red-400',
    icon: isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />
  };
};

interface TokenSelectorProps {
  selectedToken: TokenBalance | null;
  tokens: TokenBalance[];
  onSelectToken: (token: TokenBalance) => void;
  label: string;
  showBalance?: boolean;
  disabled?: boolean;
}

const TokenSelector: React.FC<TokenSelectorProps> = ({
  selectedToken,
  tokens,
  onSelectToken,
  label,
  showBalance = true,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<TokenBalance[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [hasLoadedTokens, setHasLoadedTokens] = useState(false);
  
  // Custom token import states
  const [customTokens, setCustomTokens] = useState<CustomToken[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importToken, setImportToken] = useState<CustomToken | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [importForm, setImportForm] = useState<ImportFormData>({
    address: '',
    symbol: '',
    name: '',
    decimals: 18,
    logoURI: ''
  });

  // Get network and wallet context
  const selectedNetwork = useSelectedNetwork();
  const { loadTokens, tokens: storeTokens } = useTokenState();
  const walletAddress = useWalletAddress();

  // Load custom tokens on mount and network change
  useEffect(() => {
    if (selectedNetwork) {
      const customs = getCustomTokens(selectedNetwork.chainId);
      setCustomTokens(customs);
    }
  }, [selectedNetwork]);

  // Reset loaded tokens when wallet or network changes to force reload with balance
  useEffect(() => {
    setHasLoadedTokens(false);
  }, [walletAddress, selectedNetwork?.chainId]);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string, chainId: number, userAddress?: string) => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        await loadTokens({
          chainId,
          search: searchQuery,
          userAddress
        });
        // loadTokens updates storeTokens, we'll use it in the effect below
      } catch (error) {
        console.error('Search tokens failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500),
    [loadTokens]
  );

  // Update search results when store tokens change during search
  useEffect(() => {
    if (searchTerm.length >= 2 && !isSearching && storeTokens.length > 0) {
      setSearchResults(storeTokens);
    }
  }, [storeTokens, searchTerm, isSearching]);

  // Load tokens when modal is opened - always refresh to get latest balances
  const handleModalOpen = async () => {
    setIsOpen(true);
    
    // Always reload tokens when modal opens to get fresh balance data
    // This ensures users see the most up-to-date token balances
    if (selectedNetwork) {
      setIsInitialLoading(true);
      try {
        await loadTokens({
          chainId: selectedNetwork.chainId,
          userAddress: walletAddress || undefined,
        });
        setHasLoadedTokens(true);
      } catch (error) {
        console.error('❌ TokenSelector: Failed to load tokens:', error);
        // On error, still mark as loaded to prevent infinite loading loops
        setHasLoadedTokens(true);
      } finally {
        setIsInitialLoading(false);
      }
    }
  };

  // Effect to trigger search when searchTerm changes
  useEffect(() => {
    if (selectedNetwork && searchTerm.length >= 2) {
      debouncedSearch(searchTerm, selectedNetwork.chainId, walletAddress || undefined);
    } else if (searchTerm.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchTerm, selectedNetwork, walletAddress, debouncedSearch]);

  // Convert custom tokens to TokenBalance format
  const customTokenBalances: TokenBalance[] = customTokens.map(ct => ({
    token: {
      symbol: ct.symbol,
      name: ct.name,
      address: ct.address,
      decimals: ct.decimals,
      logoURI: ct.logoURI
    },
    balance: '0',
    formattedBalance: '0.0'
  }));

  // Combined tokens logic: merge API tokens + custom tokens
  const apiTokens = storeTokens.length > 0 ? storeTokens : tokens;
  const allTokens = [...apiTokens, ...customTokenBalances];

  // Filter logic with improved search - use search results when searching
  const filteredTokens = !searchTerm 
    ? allTokens 
    : searchTerm.length >= 2 && searchResults.length > 0
      ? [...searchResults, ...customTokenBalances.filter(ct =>
          ct.token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ct.token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ct.token.address.toLowerCase().includes(searchTerm.toLowerCase())
        )]
      : allTokens.filter(token =>
          token.token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          token.token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          token.token.address.toLowerCase().includes(searchTerm.toLowerCase())
        );

  // Popular tokens: lấy 5 token đầu tiên từ API (không bao gồm custom tokens)
  const popularTokens = apiTokens.slice(0, 5);
  const otherTokens = filteredTokens.filter(token => 
    !popularTokens.some(pt => pt.token.address.toLowerCase() === token.token.address.toLowerCase())
  );

  // Check if search term looks like an address and no results found
  const shouldShowImportOption = searchTerm.length > 0 && 
    filteredTokens.length === 0 && 
    isValidAddress(searchTerm) &&
    !isSearching &&
    searchTerm.length >= 2;

  // Handle token selection
  const handleSelectToken = (token: TokenBalance) => {
    onSelectToken(token);
    setIsOpen(false);
    setSearchTerm('');
    setSearchResults([]);
    setIsSearching(false);
    setShowImportForm(false);
  };

  // Handle modal close
  const handleModalClose = () => {
    setIsOpen(false);
    setSearchTerm('');
    setSearchResults([]);
    setIsSearching(false);
    setShowImportForm(false);
    setShowImportModal(false);
    setImportToken(null);
    resetImportForm();
  };

  // Reset import form
  const resetImportForm = () => {
    setImportForm({
      address: '',
      symbol: '',
      name: '',
      decimals: 18,
      logoURI: ''
    });
  };

  // Handle import by address
  const handleImportByAddress = () => {
    if (!selectedNetwork || !searchTerm) return;
    
    setImportForm(prev => ({
      ...prev,
      address: searchTerm
    }));
    setShowImportForm(true);
  };

  // Handle import form submission
  const handleImportSubmit = () => {
    if (!selectedNetwork || !importForm.address || !importForm.symbol) return;

    const customToken: CustomToken = {
      symbol: importForm.symbol,
      name: importForm.name || importForm.symbol,
      address: importForm.address,
      decimals: importForm.decimals,
      logoURI: importForm.logoURI || undefined,
      chainId: selectedNetwork.chainId,
      imported: true
    };

    // Save to localStorage
    saveCustomToken(customToken);
    
    // Update local state
    setCustomTokens(prev => [...prev, customToken]);
    
    // Auto-select the imported token
    const tokenBalance: TokenBalance = {
      token: {
        symbol: customToken.symbol,
        name: customToken.name,
        address: customToken.address,
        decimals: customToken.decimals,
        logoURI: customToken.logoURI
      },
      balance: '0',
      formattedBalance: '0.0'
    };

    handleSelectToken(tokenBalance);
  };

  // Handle remove custom token
  const handleRemoveCustomToken = (address: string) => {
    if (!selectedNetwork) return;
    
    removeCustomToken(address, selectedNetwork.chainId);
    setCustomTokens(prev => prev.filter(t => t.address.toLowerCase() !== address.toLowerCase()));
  };

  return (
    <>
      <TokenSelectorControl
        selectedToken={selectedToken}
        onOpen={handleModalOpen}
        label={label}
        showBalance={showBalance}
        disabled={disabled}
      />

      <Modal
        isOpen={isOpen}
        onClose={handleModalClose}
        size="2xl"
      >
        <div className="flex flex-col min-h-[500px] max-h-[80vh]">
          {/* Header */}
          <div className="pb-4 sm:pb-5 border-b border-gray-700/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-r from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">Select Token</h2>
                  <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Choose a token to {label.toLowerCase()}</p>
                </div>
              </div>
              
              {/* Token Count */}
              {(storeTokens.length > 0 || tokens.length > 0) && (
                <div className="text-xs text-gray-400 bg-gray-800/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg">
                  {allTokens.length} tokens
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="py-3 sm:py-4 md:py-5 space-y-2 sm:space-y-3">
            <div className="relative">
              <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
              <input
                type="text"
                placeholder="Search by name, symbol, or paste contract address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-3 sm:py-4 bg-gray-800/40 border border-gray-700/50 rounded-xl sm:rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:border-orange-500/60 focus:bg-gray-800/60 transition-all duration-200 text-sm sm:text-base"
              />
              {isSearching && (
                <div className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-orange-400 border-t-transparent"></div>
                </div>
              )}
            </div>
            
            {/* Quick Filter Buttons */}
            {!searchTerm && allTokens.length > 0 && (
              <div className="flex items-center space-x-2 px-1">
                <span className="text-xs text-gray-500 hidden sm:inline">Popular:</span>
                <span className="text-xs text-gray-500 sm:hidden">Quick:</span>
                <button 
                  onClick={() => setSearchTerm('ETH')}
                  className="text-xs bg-gray-700/40 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded-md transition-colors"
                >
                  ETH
                </button>
                <button 
                  onClick={() => setSearchTerm('USDC')}
                  className="text-xs bg-gray-700/40 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded-md transition-colors"
                >
                  USDC
                </button>
                <button 
                  onClick={() => setSearchTerm('USDT')}
                  className="text-xs bg-gray-700/40 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded-md transition-colors"
                >
                  USDT
                </button>
              </div>
            )}
          </div>

          {/* Token List Container */}
          <div className="flex-1 overflow-hidden">
            {(isInitialLoading || (isSearching && searchTerm.length >= 2)) ? (
              <div className="space-y-1 sm:space-y-2 px-1">
                {Array.from({ length: isSearching ? 4 : 8 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between w-full p-3 sm:p-4 animate-pulse">
                    <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                      {/* Token Logo Skeleton */}
                      <div className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 bg-gray-700 rounded-full shadow-sm flex-shrink-0"></div>
                      
                      {/* Token Info Skeleton */}
                      <div className="flex-1 min-w-0 space-y-1 sm:space-y-2">
                        <div className="flex items-center space-x-2">
                          <div className="h-3 sm:h-4 bg-gray-700 rounded w-12 sm:w-16"></div>
                          <div className="h-2 sm:h-3 bg-gray-700/50 rounded w-8 sm:w-12"></div>
                        </div>
                        <div className="h-2 sm:h-3 bg-gray-700/70 rounded w-16 sm:w-24"></div>
                        <div className="h-2 sm:h-3 bg-gray-700/50 rounded w-12 sm:w-20 hidden sm:block"></div>
                      </div>
                    </div>
                    
                    {/* Balance Skeleton */}
                    <div className="flex flex-col items-end space-y-1 flex-shrink-0">
                      <div className="h-3 sm:h-4 bg-gray-700/70 rounded w-12 sm:w-16"></div>
                      <div className="h-2 sm:h-3 bg-gray-700/50 rounded w-8 sm:w-12"></div>
                    </div>
                  </div>
                ))}
                {isSearching && (
                  <div className="text-center py-3 sm:py-4">
                    <p className="text-xs sm:text-sm text-gray-400">Searching for "{searchTerm}"...</p>
                  </div>
                )}
              </div>
            ) : showImportForm ? (
              <ImportTokenForm
                form={importForm}
                setForm={setImportForm}
                onSubmit={handleImportSubmit}
                onCancel={() => setShowImportForm(false)}
              />
            ) : (
              <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                {filteredTokens.length > 0 ? (
                  <div className="space-y-1 px-1">
                    {/* Popular Tokens Section */}
                    {!searchTerm && popularTokens.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center space-x-2 mb-3 px-1">
                          <Star className="w-4 h-4 text-orange-400" />
                          <span className="text-sm font-medium text-gray-200">Popular</span>
                        </div>
                        <div className="space-y-1">
                          {popularTokens.map((token) => (
                            <ModernTokenRow
                              key={`popular-${token.token.address}`}
                              token={token}
                              onSelect={handleSelectToken}
                              showBalance={showBalance}
                              isPopular={true}
                              onRemove={customTokens.some(ct => ct.address.toLowerCase() === token.token.address.toLowerCase()) 
                                ? () => handleRemoveCustomToken(token.token.address) 
                                : undefined}
                            />
                          ))}
                        </div>
                        
                        {otherTokens.length > 0 && (
                          <div className="border-t border-gray-700/20 my-4"></div>
                        )}
                      </div>
                    )}

                    {/* All Tokens or Search Results */}
                    <div className="grid gap-1">
                      {(searchTerm ? filteredTokens : otherTokens).map((token) => (
                        <ModernTokenRow
                          key={token.token.address}
                          token={token}
                          onSelect={handleSelectToken}
                          showBalance={showBalance}
                          isPopular={false}
                          onRemove={customTokens.some(ct => ct.address.toLowerCase() === token.token.address.toLowerCase()) 
                            ? () => handleRemoveCustomToken(token.token.address) 
                            : undefined}
                        />
                      ))}
                    </div>
                  </div>
                ) : shouldShowImportOption ? (
                  <ImportOption
                    address={searchTerm}
                    onImport={handleImportByAddress}
                  />
                ) : searchTerm ? (
                  <EmptyState
                    searchTerm={searchTerm}
                    onClearSearch={() => setSearchTerm('')}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 sm:h-40 space-y-2 sm:space-y-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-700/50 rounded-xl sm:rounded-2xl flex items-center justify-center">
                      <Search className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-400 text-xs sm:text-sm">Search for tokens to get started</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

// Modern Token Row Component
interface ModernTokenRowProps {
  token: TokenBalance;
  onSelect: (token: TokenBalance) => void;
  showBalance: boolean;
  isPopular: boolean;
  onRemove?: () => void;
}

const ModernTokenRow: React.FC<ModernTokenRowProps> = ({
  token, 
  onSelect, 
  showBalance, 
  isPopular, 
  onRemove 
}) => {
  const priceChange = token.token.priceChange24h ? formatPriceChange(token.token.priceChange24h) : null;
  
  return (
    <div className="group relative">
      <button
        onClick={() => onSelect(token)}
        className="w-full p-2 sm:p-3 hover:bg-gray-800/40 rounded-lg sm:rounded-xl transition-all duration-200 border border-transparent hover:border-gray-600/50 group"
      >
        <div className="flex items-center justify-between w-full gap-2 sm:gap-3">
          {/* Left: Token Logo & Info */}
          <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0 text-left">
            {/* Token Logo */}
            <div className="relative flex-shrink-0">
              {token.token.logoURI ? (
                <img
                  src={token.token.logoURI}
                  alt={token.token.name}
                  className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm ${token.token.logoURI ? 'hidden' : ''}`}>
                {token.token.symbol.slice(0, 2).toUpperCase()}
              </div>
              
              {/* Popular Badge */}
              {isPopular && (
                <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-orange-400 rounded-full flex items-center justify-center">
                  <Star className="w-1 h-1 sm:w-1.5 sm:h-1.5 text-white fill-current" />
                </div>
              )}
            </div>
            
            {/* Token Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center space-x-1.5 sm:space-x-2 mb-0.5">
                <span className="text-white font-semibold text-sm sm:text-base">
                  {token.token.symbol}
                </span>
                
                {/* Verified Badge */}
                {token.token.verified && (
                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400 flex-shrink-0" />
                )}
                
                {/* Import Badge */}
                {onRemove && (
                  <span className="text-[10px] sm:text-xs bg-orange-500/20 text-orange-400 px-1 sm:px-1.5 py-0.5 rounded flex-shrink-0">
                    Imported
                  </span>
                )}
              </div>
              
              <div className="text-gray-400 text-xs sm:text-sm truncate leading-relaxed">
                {token.token.name}
              </div>
            </div>
          </div>
          
          {/* Right: Balance Display */}
          <div className="flex items-start space-x-1.5 sm:space-x-2.5 flex-shrink-0">
            <div className="text-right min-w-[60px] sm:min-w-[80px]">
              {showBalance ? (
                <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                  {parseFloat(token.formattedBalance) > 0 && (
                    <Wallet className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="text-right">
                    <div className="text-white font-medium text-xs sm:text-sm">
                      {parseFloat(token.formattedBalance) > 0 ? formatBalance(token.formattedBalance) : '0'}
                    </div>
                    <div className="text-[10px] sm:text-xs text-gray-400">
                      {token.token.symbol}
                    </div>
                  </div>
                </div>
              ) : (
                token.token.price ? (
                  <>
                    <div className="text-white font-medium text-xs sm:text-sm">
                      {formatPrice(token.token.price)}
                    </div>
                    {priceChange && (
                      <div className={`text-[10px] sm:text-xs flex items-center justify-end space-x-1 ${priceChange.color}`}>
                        {priceChange.icon}
                        <span>{priceChange.text}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[10px] sm:text-xs text-gray-400">
                    {token.token.symbol}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </button>
      
      {/* Remove Button for Custom Tokens */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1 right-1 sm:top-2 sm:right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 sm:p-1 hover:bg-red-500/20 rounded"
          title="Remove custom token"
        >
          <X className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-red-400" />
        </button>
      )}
    </div>
  );
};

// Import Token Form Component
interface ImportTokenFormProps {
  form: ImportFormData;
  setForm: React.Dispatch<React.SetStateAction<ImportFormData>>;
  onSubmit: () => void;
  onCancel: () => void;
}

const ImportTokenForm: React.FC<ImportTokenFormProps> = ({ form, setForm, onSubmit, onCancel }) => {
  const canSubmit = form.address && form.symbol;
  
  return (
    <div className="p-4 space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full flex items-center justify-center">
          <Plus className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Import Custom Token</h3>
        <p className="text-sm text-gray-400">Add a token by providing its details below</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Token Address*</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
            placeholder="0x..."
            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Symbol*</label>
            <input
              type="text"
              value={form.symbol}
              onChange={(e) => setForm(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
              placeholder="ETH"
              className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Decimals</label>
            <input
              type="number"
              value={form.decimals}
              onChange={(e) => setForm(prev => ({ ...prev, decimals: parseInt(e.target.value) || 18 }))}
              placeholder="18"
              min="0"
              max="18"
              className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Ethereum"
            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Logo URL (Optional)</label>
          <input
            type="url"
            value={form.logoURI}
            onChange={(e) => setForm(prev => ({ ...prev, logoURI: e.target.value }))}
            placeholder="https://..."
            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5" />
          <div className="text-sm text-orange-300">
            <p className="font-medium mb-1">Warning</p>
            <p>Anyone can create a token with any name. Always verify the token address before importing.</p>
          </div>
        </div>
      </div>

      <div className="flex space-x-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 px-4 border border-gray-600 text-gray-300 rounded-xl hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-400 to-orange-600 text-white rounded-xl hover:from-orange-500 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Import Token
        </button>
      </div>
    </div>
  );
};

// Import Option Component
interface ImportOptionProps {
  address: string;
  onImport: () => void;
}

const ImportOption: React.FC<ImportOptionProps> = ({ address, onImport }) => {
  return (
    <div className="flex flex-col items-center justify-center h-56 sm:h-64 space-y-4 sm:space-y-6 px-4">
      <div className="text-center">
        <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full flex items-center justify-center">
          <Plus className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Token Not Found</h3>
        <p className="text-xs sm:text-sm text-gray-400 max-w-sm">
          The token address you entered is not in our token list. You can import it as a custom token.
        </p>
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 max-w-sm w-full">
        <p className="text-xs sm:text-sm text-gray-300 break-all font-mono">
          {address}
        </p>
      </div>

      <button
        onClick={onImport}
        className="px-4 py-2 sm:px-6 sm:py-3 bg-gradient-to-r from-orange-400 to-orange-600 text-white rounded-lg sm:rounded-xl hover:from-orange-500 hover:to-orange-700 transition-all flex items-center space-x-2 text-sm sm:text-base"
      >
        <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
        <span>Import Custom Token</span>
      </button>
    </div>
  );
};

// Empty State Component
interface EmptyStateProps {
  searchTerm: string;
  onClearSearch: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ searchTerm, onClearSearch }) => {
  return (
    <div className="flex flex-col items-center justify-center h-56 sm:h-72 space-y-4 sm:space-y-6 px-4">
      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-lg">
        <Search className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
      </div>
      <div className="text-center space-y-2 sm:space-y-3">
        <h3 className="text-base sm:text-lg font-semibold text-white">No tokens found</h3>
        <p className="text-xs sm:text-sm text-gray-400 max-w-sm">
          We couldn't find any tokens matching "<span className="text-white font-medium">{searchTerm}</span>". 
          Try adjusting your search or browse our popular tokens.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-center justify-center pt-2">
          <button
            onClick={onClearSearch}
            className="px-3 py-2 sm:px-4 sm:py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg sm:rounded-xl transition-colors flex items-center space-x-2 text-sm"
          >
            <X className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>Clear search</span>
          </button>
          {isValidAddress(searchTerm) && (
            <button
              onClick={() => {/* Handle import */}}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg sm:rounded-xl transition-colors flex items-center space-x-2 text-sm"
            >
              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Import token</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenSelector; 