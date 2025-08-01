'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowDownUp, Settings, Zap, Clock, TrendingUp, RefreshCw, RotateCcw } from 'lucide-react';
import { Button, Input, TokenInput, TokenAmountDisplay, ErrorCard, useToast } from '@/components/ui';
import TokenSelector from './TokenSelector';
import SlippageModal from './SlippageModal';
// Remove TutorialHighlight import - we now use data attributes for tutorial targeting
import { useSwap } from '@/hooks/useSwap';
import { useUIState, useWalletState, useNetworkState, useTokenState } from '@/stores';
import { buildTransactionUrl } from '@/utils';

const SwapContainer: React.FC = () => {
  const {
    swapForm,
    quote,
    tokens,
    canSwap,
    hasInsufficientBalance,
    hasValidQuote,
    setFromToken,
    setToToken,
    updateFromAmount,
    setSlippage,
    setMaxAmount,
    swapTokenPositions,
    getSwapQuote,
    executeSwapTransaction,
    resetSwapForm,
    clearQuote,
  } = useSwap();

  const { loading, error, clearError, openWalletModal, swapExecution, setSwapPending, setSwapCompleted, resetSwapExecution, tutorial, completeTutorialStep } = useUIState();
  const { isConnected, walletAddress } = useWalletState();
  const { selectedNetwork } = useNetworkState();
  const { refreshSpecificTokens } = useTokenState();
  const [showSlippageModal, setShowSlippageModal] = useState(false);
  const [quoteCountdown, setQuoteCountdown] = useState(0);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);
  const tokenRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toast = useToast();

  // Dynamic balance lookup - get latest balance from tokens array
  const getLatestBalance = (selectedToken: typeof swapForm.fromToken) => {
    if (!selectedToken) return '0.00';
    
    // Find latest balance from tokens array
    const latestToken = tokens.find(t => 
      t.token.address.toLowerCase() === selectedToken.token.address.toLowerCase()
    );
    
    return latestToken?.formattedBalance || selectedToken.formattedBalance || '0.00';
  };

  const fromTokenBalance = getLatestBalance(swapForm.fromToken);
  const toTokenBalance = getLatestBalance(swapForm.toToken);

// Tutorial step completion tracking is now handled in TutorialGuide component

  // Helper function to refresh selected tokens
  const refreshSelectedTokens = async (showLoading = false) => {
    if (!selectedNetwork || !walletAddress || !isConnected) return;
    
    const tokenAddresses: string[] = [];
    if (swapForm.fromToken) tokenAddresses.push(swapForm.fromToken.token.address);
    if (swapForm.toToken) tokenAddresses.push(swapForm.toToken.token.address);
    
    if (tokenAddresses.length === 0) return;

    try {
      if (showLoading) setIsRefreshingToken(true);
      
      await refreshSpecificTokens({
        tokenAddresses,
        userAddress: walletAddress,
        chainId: selectedNetwork.chainId,
      });
    } catch (error) {
      // Silent fail for auto-refresh, only show error for manual refresh
      if (showLoading) {
        toast.error('Failed to refresh token balance', 'Please try again');
      }
    } finally {
      if (showLoading) setIsRefreshingToken(false);
    }
  };

  // Manual refresh function for UI button
  const handleManualRefresh = () => {
    refreshSelectedTokens(true);
  };

  // Auto-get quote when form inputs change (not when quote is manually cleared)
  useEffect(() => {
    if (swapForm.fromToken && swapForm.toToken && swapForm.fromAmount && !loading.isLoading && !hasValidQuote) {
      const timer = setTimeout(() => {
        getSwapQuote();
      }, 500); // Debounce to avoid too many API calls
      
      return () => clearTimeout(timer);
    }
  }, [swapForm.fromToken, swapForm.toToken, swapForm.fromAmount, loading.isLoading, hasValidQuote, getSwapQuote]); // Include all used values

  // Auto-refresh selected token balances every 30 seconds
  useEffect(() => {
    // Clear existing interval
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }

    // Only start interval if user has selected tokens and is connected
    if (isConnected && walletAddress && selectedNetwork && (swapForm.fromToken || swapForm.toToken)) {
      // Initial refresh
      refreshSelectedTokens(false);
      
      // Set up 30-second interval
      tokenRefreshIntervalRef.current = setInterval(() => {
        refreshSelectedTokens(false);
      }, 30000); // 30 seconds
    }

    // Cleanup on unmount or dependency change
    return () => {
      if (tokenRefreshIntervalRef.current) {
        clearInterval(tokenRefreshIntervalRef.current);
        tokenRefreshIntervalRef.current = null;
      }
    };
  }, [isConnected, walletAddress, selectedNetwork, swapForm.fromToken, swapForm.toToken]); // Only depend on essential values

  // Quote countdown timer - 30 seconds (pause when swap is pending)
  useEffect(() => {
    if (hasValidQuote && quote && swapExecution.status !== 'pending') {
      setQuoteCountdown(30); // Start with 30 seconds
      
      const interval = setInterval(() => {
        setQuoteCountdown((prev) => {
          // Don't countdown if swap is pending
          if (swapExecution.status === 'pending') {
            return prev;
          }
          
          if (prev <= 1) {
            // Quote expired, auto refresh if possible
            if (swapForm.fromToken && swapForm.toToken && swapForm.fromAmount && !loading.isLoading) {
              // Clear quote first to show shimmer for auto-refresh
              clearQuote();
              setTimeout(() => {
                getSwapQuote();
              }, 50);
            }
            return 30; // Reset countdown
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    } else if (swapExecution.status === 'pending') {
      // Keep countdown frozen when pending
      return;
    } else {
      setQuoteCountdown(0);
    }
  }, [quote, swapExecution.status, clearQuote, getSwapQuote, swapForm.fromToken, swapForm.toToken, swapForm.fromAmount, loading.isLoading]); // Include swapExecution.status

  const handleSwap = async () => {
    if (!hasValidQuote || swapExecution.status === 'pending') return;
    
    try {
      // Lock the quote before starting swap
      setSwapPending(quote);
      
      const result = await executeSwapTransaction();
      
      if (result && typeof result === 'string') {
        // Transaction successful - show success with explorer link
        const explorerUrl = selectedNetwork ? buildTransactionUrl(selectedNetwork, result) : null;
        
        toast.showToast('success', 'Swap Completed!', {
          message: `Successfully swapped ${swapForm.fromToken?.token.symbol} → ${swapForm.toToken?.token.symbol}`,
          action: explorerUrl ? {
            label: 'View Transaction',
            onClick: () => window.open(explorerUrl, '_blank', 'noopener,noreferrer')
          } : undefined
        });
        
        // Complete "first-swap" tutorial step
        if (tutorial.isActive) {
          const swapStep = tutorial.steps.find(step => step.id === 'first-swap');
          if (swapStep && !swapStep.completed && !swapStep.skipped) {
            completeTutorialStep('first-swap');
            // Dispatch event for tutorial guide
            window.dispatchEvent(new CustomEvent('tutorial-swap-completed'));
          }
        }
        
        // Clear quote on successful swap
        clearQuote();
      } else {
        toast.error('Swap Failed', 'Transaction was not completed');
      }
    } catch (error: any) {
      // Check if error contains transaction hash (failed transaction but still submitted)
      const txHash = error?.transactionHash || error?.hash;
      const explorerUrl = selectedNetwork && txHash ? buildTransactionUrl(selectedNetwork, txHash) : null;
      
      toast.showToast('error', 'Swap Failed', {
        message: 'An unexpected error occurred during the swap',
        action: explorerUrl ? {
          label: 'View Transaction',
          onClick: () => window.open(explorerUrl, '_blank', 'noopener,noreferrer')
        } : undefined
      });
    } finally {
      // Always unlock swap state when completed (success or fail)
      setSwapCompleted();
      // Reset execution state after short delay to allow UI updates
      setTimeout(() => {
        resetSwapExecution();
      }, 1000);
    }
  };

  // Quick amount selection handlers
  const handleQuickAmount = (percentage: number) => {
    if (swapForm.fromToken && fromTokenBalance) {
      const balance = parseFloat(fromTokenBalance);
      const amount = (balance * percentage / 100).toString();
      updateFromAmount(amount);
    }
  };

  const formatQuotePrice = (quote: any) => {
    if (!quote) return '0';
    return parseFloat(quote.toAmount).toFixed(6);
  };

  return (
    <div className="w-full">
      {/* Swap Interface Card */}
      <div className="bg-gradient-to-br from-[#1a1b23] to-[#141520] rounded-xl sm:rounded-2xl border border-gray-800/60 p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4 shadow-2xl backdrop-blur-lg ring-1 ring-orange-500/10">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base md:text-lg font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Swap Tokens
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-400 hidden sm:block leading-tight">Trade instantly with best rates</p>
            </div>
          </div>
          <button
            onClick={() => setShowSlippageModal(true)}
            className="p-1.5 sm:p-2 text-gray-400 hover:text-white hover:bg-gray-800/60 rounded-lg transition-all duration-200 hover:scale-105 border border-gray-700/50 hover:border-gray-600"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* From Token */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm font-medium text-gray-300">You pay</label>
            <div className="flex items-center space-x-1.5">
              <div 
                className="text-[10px] sm:text-xs text-gray-400"
                data-tutorial="token-balance"
              >
                Balance: <span className="text-white font-medium">{fromTokenBalance}</span>
              </div>
              {/* Manual Refresh Button */}
              {swapForm.fromToken && isConnected && (
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshingToken}
                  className="p-1 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Refresh token balance"
                >
                  <RotateCcw className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${isRefreshingToken ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>
          
          <div className="relative bg-gradient-to-br from-gray-800/70 to-gray-900/50 border border-gray-700/60 hover:border-gray-600 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 transition-all duration-300 shadow-lg backdrop-blur-sm">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex-1">
                <TokenInput
                  value={swapForm.fromAmount}
                  onChange={updateFromAmount}
                  placeholder="0.00"
                  decimals={swapForm.fromToken?.token.decimals || 18}
                  className="text-lg sm:text-xl md:text-2xl font-bold bg-transparent border-0 p-0 text-white placeholder-gray-500"
                />
              </div>
              <div className="flex flex-col items-end">
                <TokenSelector
                  selectedToken={swapForm.fromToken}
                  tokens={tokens}
                  onSelectToken={setFromToken}
                  label="Select token"
                  showBalance={true}
                />
              </div>
            </div>
          </div>

          {/* Quick Amount Selection */}
          {swapForm.fromToken && parseFloat(fromTokenBalance) > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs text-gray-400">Quick:</span>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <button
                  onClick={() => handleQuickAmount(30)}
                  className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium text-gray-300 hover:text-white bg-gradient-to-r from-gray-800/60 to-gray-700/60 hover:from-gray-700 hover:to-gray-600 rounded-md transition-all duration-200 border border-gray-700/50 hover:border-gray-600"
                >
                  30%
                </button>
                <button
                  onClick={() => handleQuickAmount(50)}
                  className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium text-gray-300 hover:text-white bg-gradient-to-r from-gray-800/60 to-gray-700/60 hover:from-gray-700 hover:to-gray-600 rounded-md transition-all duration-200 border border-gray-700/50 hover:border-gray-600"
                >
                  50%
                </button>
                <button
                  onClick={() => handleQuickAmount(100)}
                  className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium text-orange-400 hover:text-orange-300 bg-gradient-to-r from-orange-500/20 to-orange-600/20 hover:from-orange-500/30 hover:to-orange-600/30 rounded-md transition-all duration-200 border border-orange-500/40 hover:border-orange-500/60"
                >
                  MAX
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center -my-1 relative z-10">
          <button
            onClick={swapTokenPositions}
            className="p-2 sm:p-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 border-2 border-[#1a1b23] rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-110 shadow-xl group hover:shadow-orange-500/25"
          >
            <ArrowDownUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white group-hover:rotate-180 transition-transform duration-300" />
          </button>
        </div>

        {/* To Token */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm font-medium text-gray-300">You receive</label>
            <div className="text-[10px] sm:text-xs text-gray-400">
              Balance: <span className="text-white font-medium">{toTokenBalance}</span>
            </div>
          </div>
          
          <div className="relative bg-gradient-to-br from-gray-800/70 to-gray-900/50 border border-gray-700/60 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 transition-all duration-300 shadow-lg backdrop-blur-sm">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex-1">
                <TokenInput
                  value={hasValidQuote ? formatQuotePrice(quote) : ''}
                  onChange={() => {}} // Read-only for output
                  placeholder="0.00"
                  disabled={true}
                  decimals={swapForm.toToken?.token.decimals || 18}
                  className="text-lg sm:text-xl md:text-2xl font-bold bg-transparent border-0 p-0 text-gray-300 placeholder-gray-600"
                />
              </div>
              <div>
                <TokenSelector
                  selectedToken={swapForm.toToken}
                  tokens={tokens}
                  onSelectToken={setToToken}
                  label="Select token"
                  showBalance={true}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quote Loading Skeleton */}
        {loading.isLoading && swapForm.fromToken && swapForm.toToken && swapForm.fromAmount && (
          <div className="relative p-2.5 sm:p-3 bg-gradient-to-br from-gray-800/70 to-gray-900/50 rounded-xl sm:rounded-2xl border border-gray-700/50 backdrop-blur-sm shadow-xl animate-pulse">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center space-x-1.5">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-gray-700 rounded"></div>
                <div className="h-3 sm:h-4 bg-gray-700 rounded w-20 sm:w-24"></div>
              </div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <div className="h-3 bg-gray-700 rounded w-8"></div>
                <div className="w-8 sm:w-10 h-0.5 sm:h-1 bg-gray-700 rounded-full"></div>
              </div>
            </div>
            
            {/* Main Quote Skeleton */}
            <div className="bg-gray-800/40 rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-gray-700/30 mb-2 sm:mb-3">
              <div className="flex items-center justify-between">
                <div className="h-3 bg-gray-700 rounded w-16"></div>
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <div className="h-5 sm:h-6 bg-gray-700 rounded w-12 sm:w-16"></div>
                  <div className="h-3 bg-gray-700 rounded w-6 sm:w-8"></div>
                </div>
              </div>
            </div>
            
            {/* Details Grid Skeleton */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="text-center bg-gray-800/30 rounded-lg p-1.5 sm:p-2 border border-gray-700/20">
                  <div className="h-2.5 bg-gray-700 rounded w-12 mx-auto mb-0.5"></div>
                  <div className="h-3 bg-gray-700 rounded w-8 mx-auto"></div>
                </div>
              ))}
            </div>
            
            {/* Loading Message */}
            <div className="text-center mt-2 sm:mt-3">
              <div className="flex items-center justify-center space-x-1.5">
                <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-gray-400">Getting best quote...</span>
              </div>
            </div>
          </div>
        )}

        {/* Quote Info - Enhanced with Countdown */}
        {hasValidQuote && quote && !loading.isLoading && (
          <div className="relative p-2.5 sm:p-3 bg-gradient-to-br from-gray-800/70 to-gray-900/50 rounded-xl sm:rounded-2xl border border-gray-700/50 backdrop-blur-sm shadow-xl">
            {/* Quote Header with Countdown */}
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center space-x-1.5">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-400" />
                <span className="text-gray-300 font-medium text-xs sm:text-sm">Best Route Found</span>
              </div>
              
              {/* Countdown Timer with Refresh */}
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <div className="flex items-center space-x-1">
                  <Clock className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${quoteCountdown <= 5 ? 'text-red-400' : quoteCountdown <= 15 ? 'text-yellow-400' : 'text-green-400'}`} />
                  <span className={`text-[10px] sm:text-xs font-mono font-bold ${quoteCountdown <= 5 ? 'text-red-400' : quoteCountdown <= 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                    0:{quoteCountdown.toString().padStart(2, '0')}
                  </span>
                </div>
                {/* Progress Bar */}
                <div className="w-8 sm:w-10 h-0.5 sm:h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ease-linear ${
                      quoteCountdown <= 5 ? 'bg-red-400' : 
                      quoteCountdown <= 15 ? 'bg-yellow-400' : 'bg-green-400'
                    }`}
                    style={{ 
                      width: `${(quoteCountdown / 30) * 100}%`,
                      transition: quoteCountdown === 30 ? 'none' : 'width 1s linear'
                    }}
                  />
                </div>
                {/* Refresh Button */}
                <button
                  onClick={() => {
                    if (!loading.isLoading && swapExecution.status !== 'pending' && swapForm.fromToken && swapForm.toToken && swapForm.fromAmount) {
                      // Clear quote first to show shimmer, then get new quote
                      clearQuote();
                      // Small delay to ensure UI updates before API call
                      setTimeout(() => {
                        getSwapQuote();
                      }, 50);
                    }
                  }}
                  disabled={loading.isLoading || swapExecution.status === 'pending'}
                  className="p-1 sm:p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={swapExecution.status === 'pending' ? 'Quote locked during swap' : 'Refresh Quote'}
                >
                  <RefreshCw className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${loading.isLoading ? 'animate-spin' : swapExecution.status === 'pending' ? 'text-orange-400' : ''}`} />
                </button>
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3">
              {/* Main Quote Display */}
              <div className="bg-gray-800/40 rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-gray-700/30">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium text-xs sm:text-sm">You receive</span>
                  <div className="text-right">
                    <span className="text-white font-bold text-sm sm:text-base md:text-lg">
                      {parseFloat(quote?.toAmount || '0').toFixed(6)}
                    </span>
                    <span className="text-gray-300 ml-1.5 sm:ml-2 text-xs sm:text-sm">{swapForm.toToken?.token.symbol}</span>
                  </div>
                </div>
              </div>
              
              {/* Quote Details Grid */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <div className="text-center bg-gray-800/30 rounded-lg p-1.5 sm:p-2 border border-gray-700/20">
                  <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Minimum received</p>
                  <p className="text-[10px] sm:text-xs text-gray-200 font-bold">
                    {parseFloat(quote?.minToAmount || '0').toFixed(4)}
                  </p>
                </div>
                <div className="text-center bg-gray-800/30 rounded-lg p-1.5 sm:p-2 border border-gray-700/20">
                  <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Slippage</p>
                  <p className="text-[10px] sm:text-xs text-orange-400 font-bold">{swapForm.slippage}%</p>
                </div>
                <div className="text-center bg-gray-800/30 rounded-lg p-1.5 sm:p-2 border border-gray-700/20">
                  <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Network fee</p>
                  <p className="text-[10px] sm:text-xs text-blue-400 font-bold">~$0.50</p>
                </div>
              </div>
              
              {/* Price Impact */}
              {quote?.priceImpact && parseFloat(quote.priceImpact) > 0 && (
                <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t border-gray-700/30">
                  <span className="text-gray-400 text-[10px] sm:text-xs font-medium">Price impact</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${parseFloat(quote.priceImpact) > 5 ? 'bg-red-400' : parseFloat(quote.priceImpact) > 3 ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
                    <span className={`font-bold text-[10px] sm:text-xs ${parseFloat(quote.priceImpact) > 5 ? 'text-red-400' : parseFloat(quote.priceImpact) > 3 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {parseFloat(quote.priceImpact).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Auto Refresh Notice */}
              {quoteCountdown <= 5 && (
                <div className="text-center p-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                  <p className="text-[9px] sm:text-[10px] text-yellow-400">
                    Quote expires soon - will auto-refresh
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error.hasError && (
          <ErrorCard
            message={error.errorMessage || 'An error occurred'}
            type={error.errorMessage?.includes('network') || error.errorMessage?.includes('connection') ? 'network' : 
                  error.errorMessage?.includes('not found') || error.errorMessage?.includes('supported') ? 'notfound' : 'error'}
            onRetry={() => {
              clearError();
              if (!quote && swapForm.fromToken && swapForm.toToken && swapForm.fromAmount) {
                getSwapQuote();
              }
            }}
            onReset={() => {
              clearError();
              resetSwapForm();
            }}
            showRetry={!!(swapForm.fromToken && swapForm.toToken && swapForm.fromAmount)}
            className="mb-4"
          />
        )}

        {/* Swap Button */}
        <div className="pt-1.5 sm:pt-2">
          {!isConnected ? (
            <Button
              onClick={() => openWalletModal('connect')}
              data-tutorial="connect-wallet"
              className="w-full py-2.5 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-lg sm:rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.01] transform"
            >
              Connect Wallet
            </Button>
          ) : hasInsufficientBalance ? (
            <Button
              disabled
              className="w-full py-2.5 sm:py-3 text-sm sm:text-base bg-gray-800 text-gray-500 font-semibold rounded-lg sm:rounded-xl cursor-not-allowed border border-gray-700"
            >
              Insufficient Balance
            </Button>
          ) : !canSwap ? (
            <Button
              disabled
              className="w-full py-2.5 sm:py-3 text-sm sm:text-base bg-gray-800 text-gray-500 font-semibold rounded-lg sm:rounded-xl cursor-not-allowed border border-gray-700"
            >
              {swapForm.fromAmount === '' ? 'Enter Amount' : 
               !swapForm.fromToken ? 'Select Token' :
               !swapForm.toToken ? 'Select Token' : 'Loading...'}
            </Button>
          ) : hasValidQuote ? (
            <Button
              onClick={handleSwap}
              disabled={loading.isLoading || swapExecution.status === 'pending'}
              data-tutorial="swap-button"
              className={`w-full py-2.5 sm:py-3 text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.01] transform ${
                swapExecution.status === 'pending' 
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                  : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
              }`}
            >
              {loading.isLoading || swapExecution.status === 'pending' ? (
                <div className="flex items-center justify-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
                  <span className="text-xs sm:text-sm">{swapExecution.status === 'pending' ? 'Swapping...' : 'Loading...'}</span>
                </div>
              ) : (
                <span className="flex items-center justify-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline text-sm">Swap {swapForm.fromToken?.token.symbol || ''} → {swapForm.toToken?.token.symbol || ''}</span>
                  <span className="sm:hidden text-sm">Swap</span>
                </span>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Slippage Settings Modal */}
      <SlippageModal
        isOpen={showSlippageModal}
        onClose={() => setShowSlippageModal(false)}
        currentSlippage={swapForm.slippage}
        onSlippageChange={setSlippage}
      />
    </div>
  );
};

export default SwapContainer; 