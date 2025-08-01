import { useCallback, useEffect, useRef, useMemo } from 'react';
import { 
  useNetworkState, 
  useSwapState, 
  useUIState, 
  useWalletState,
  useTokenState 
} from '@/stores';
import { useUnifiedWallet } from '@/libs/wallet-provider';
import { tokenService } from '@/services';
import type { TokenBalance } from '@/types/api';

export const useSwap = () => {
  const { selectedNetwork, rpcSettings, loadNetworks } = useNetworkState();
  const { tokens, loadTokens, refreshSpecificTokens, setDefaultTokens } = useTokenState();
  const { gasSettings } = useUIState();
  const {
    swapForm,
    quote,
    setFromToken,
    setToToken,
    setFromAmount,
    setSlippage,
    swapTokens,
    resetSwapForm,
    getSwapQuote,
    executeSwap,
    setQuote,
  } = useSwapState();
  
  const { walletAddress } = useWalletState();
  const { setError, clearError, setLoading } = useUIState();
  const { privyAuthenticated, getWalletType, createWalletConfig } = useUnifiedWallet();
  
  const quoteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const quoteRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const lastQuoteParamsRef = useRef<string | null>(null);

  // ❌ REMOVED: Auto-load tokens on page load - now loaded only when user opens TokenSelector
  // useEffect(() => {
  //   if (selectedNetwork) {
  //     loadTokens({
  //       chainId: selectedNetwork.chainId,
  //       userAddress: walletAddress || undefined,
  //     });
  //   }
  // }, [selectedNetwork, walletAddress, loadTokens]);

  // Auto-set default tokens when tokens are loaded
  useEffect(() => {
    if (tokens.length > 0 && !swapForm.fromToken && !swapForm.toToken) {
      setDefaultTokens();
    }
  }, [tokens, swapForm.fromToken, swapForm.toToken, setDefaultTokens]);

  // Auto-sync selected tokens with latest data when tokens array updates
  useEffect(() => {
    if (tokens.length === 0) return;

    let needsUpdate = false;

    // Update fromToken with latest balance if selected
    if (swapForm.fromToken) {
      const latestFromToken = tokens.find(t => 
        t.token.address.toLowerCase() === swapForm.fromToken!.token.address.toLowerCase()
      );
      if (latestFromToken && latestFromToken.balance !== swapForm.fromToken.balance) {
        setFromToken(latestFromToken);
        needsUpdate = true;
      }
    }

    // Update toToken with latest balance if selected
    if (swapForm.toToken) {
      const latestToToken = tokens.find(t => 
        t.token.address.toLowerCase() === swapForm.toToken!.token.address.toLowerCase()
      );
      if (latestToToken && latestToToken.balance !== swapForm.toToken.balance) {
        setToToken(latestToToken);
        needsUpdate = true;
      }
    }

    // Auto-sync completed
  }, [tokens, swapForm.fromToken, swapForm.toToken, setFromToken, setToToken]);


  useEffect(() => {
    // Clear existing timeout
    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current);
    }

    // Must have basic requirements
    if (!swapForm.fromToken || !swapForm.toToken || !swapForm.fromAmount) {
      return;
    }

    // ✅ SIMPLIFIED: Must have walletAddress for ALL wallet types
    if (!walletAddress) {
      return; // Skip auto-quote if no wallet
    }

    // Additional check for Privy authentication
    const currentWalletType = getWalletType();
    if (currentWalletType === 'privy' && !privyAuthenticated) {
      return; // Skip if Privy not authenticated
    }

    const amount = parseFloat(swapForm.fromAmount);
    if (amount <= 0) {
      return;
    }

    // Create unique key for current quote params
    const quoteKey = `${swapForm.fromToken.token.address}-${swapForm.toToken.token.address}-${amount}`;
    
    // Skip if same params as last quote
    if (quoteKey === lastQuoteParamsRef.current) {
      return;
    }



    // Debounce: 800ms (Uniswap uses ~500-1000ms)
    quoteTimeoutRef.current = setTimeout(async () => {
      lastQuoteParamsRef.current = quoteKey;
      
      try {
        if (selectedNetwork) {
          await getSwapQuote({
            fromToken: swapForm.fromToken!,
            toToken: swapForm.toToken!,
            fromAmount: swapForm.fromAmount,
            slippage: swapForm.slippage,
            chainId: selectedNetwork.chainId,
            userAddress: walletAddress!,
          });
        }
      } catch (error) {
        // User can still manually get quote
      }
    }, 800);

    // Cleanup timeout on unmount/change
    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current);
      }
    };
  }, [swapForm.fromToken, swapForm.toToken, swapForm.fromAmount, walletAddress, selectedNetwork, getWalletType, privyAuthenticated, getSwapQuote]);

  // ✅ AUTO-REFRESH QUOTE - Like Uniswap (every 15 seconds)
  useEffect(() => {
    // Clear existing refresh interval
    if (quoteRefreshRef.current) {
      clearInterval(quoteRefreshRef.current);
    }

    // Only auto-refresh if we have an active quote
    if (!quote || !swapForm.fromToken || !swapForm.toToken || !swapForm.fromAmount || !walletAddress) {
      return;
    }

    // Refresh every 15 seconds (Uniswap uses 10-15s)
    quoteRefreshRef.current = setInterval(async () => {
      try {
        if (selectedNetwork && swapForm.fromToken && swapForm.toToken && swapForm.fromAmount && walletAddress) {
          await getSwapQuote({
            fromToken: swapForm.fromToken,
            toToken: swapForm.toToken,
            fromAmount: swapForm.fromAmount,
            slippage: swapForm.slippage,
            chainId: selectedNetwork.chainId,
            userAddress: walletAddress,
          });
        }
      } catch (error) {
        // Silent error - quote refresh is not critical
      }
    }, 15000);

    // Cleanup interval
    return () => {
      if (quoteRefreshRef.current) {
        clearInterval(quoteRefreshRef.current);
      }
    };
  }, [quote, swapForm.fromToken, swapForm.toToken, swapForm.fromAmount, walletAddress, selectedNetwork, getSwapQuote]);

  // ✅ REMOVED: executeSwapTransaction function - now handled by store action executeSwap

  // Update token amount with balance validation using tokenService
  const updateFromAmount = useCallback((amount: string) => {
    setFromAmount(amount);

    // Validate amount using tokenService if token is selected
    if (swapForm.fromToken && amount) {
      // Get latest token data
      const latestToken = tokenService.getLatestTokenData(
        swapForm.fromToken.token.address, 
        tokens
      ) || swapForm.fromToken;

      const validation = tokenService.validateTokenBalance(latestToken, amount);
      
      if (!validation.isValid && validation.error) {
        setError(true, validation.error);
      } else {
        clearError();
      }
    }

    // Note: Auto-quote is handled by separate useEffect above
  }, [swapForm.fromToken, tokens, setFromAmount, setError, clearError]);

  // Set max balance as from amount using tokenService
  const setMaxAmount = useCallback(() => {
    if (swapForm.fromToken) {
      // Get latest token data using tokenService
      const latestToken = tokenService.getLatestTokenData(
        swapForm.fromToken.token.address, 
        tokens
      ) || swapForm.fromToken;
      
      const maxAmount = latestToken.formattedBalance || '0';
      updateFromAmount(maxAmount);
    }
  }, [swapForm.fromToken, tokens, updateFromAmount]);

  // Swap from and to tokens (simplified - quote clearing handled by store)
  const swapTokenPositions = useCallback(() => {
    swapTokens();
  }, [swapTokens]);

  // Check if swap prerequisites are met (excluding balance) - SIMPLIFIED
  const canSwap = !!(
    swapForm.fromToken &&
    swapForm.toToken &&
    swapForm.fromAmount &&
    parseFloat(swapForm.fromAmount) > 0 &&
    walletAddress // Only need wallet address - MoonXService created on demand
  );

  // Separate balance check logic using tokenService
  const hasInsufficientBalance = useMemo(() => {
    if (!swapForm.fromToken || !swapForm.fromAmount) return false;
    
    // Get latest token data using tokenService
    const latestToken = tokenService.getLatestTokenData(
      swapForm.fromToken.token.address, 
      tokens
    ) || swapForm.fromToken;

    const validation = tokenService.validateTokenBalance(latestToken, swapForm.fromAmount);
    
    return validation.hasInsufficientBalance;
  }, [swapForm.fromToken, swapForm.fromAmount, tokens]);

  const hasValidQuote = !!(quote && canSwap && !hasInsufficientBalance);

  // Clear quote function
  const clearQuote = useCallback(() => {
    setQuote(null);
  }, [setQuote]);

  // Manual quote function for UI buttons with proper clearing
  const getSwapQuoteManual = useCallback(async () => {
    if (!swapForm.fromToken || !swapForm.toToken || !swapForm.fromAmount || !walletAddress || !selectedNetwork) {
      setError(true, 'Please complete all fields');
      return;
    }

    try {
      // Clear existing quote first to show loading state
      clearQuote();
      clearError();
      setLoading(true, 'Getting best quote...');

      await getSwapQuote({
        fromToken: swapForm.fromToken,
        toToken: swapForm.toToken,
        fromAmount: swapForm.fromAmount,
        slippage: swapForm.slippage,
        chainId: selectedNetwork.chainId,
        userAddress: walletAddress,
      });
    } catch (error) {
      setError(true, 'Failed to get quote. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getSwapQuote, swapForm, walletAddress, selectedNetwork, setError, clearQuote, clearError, setLoading]);

  // Wrapper for executeSwap to maintain compatibility
  const executeSwapTransaction = useCallback(async () => {
    if (!quote || !swapForm.fromToken || !swapForm.toToken || !walletAddress || !selectedNetwork) {
      setError(true, 'Missing required data for swap');
      return false;
    }

    // Create proper wallet config based on actual wallet type
    // Use RPC settings from store - either custom RPC or default Base RPC
    const effectiveRpcUrl = rpcSettings.useCustomRpc && rpcSettings.customRpcUrl 
      ? rpcSettings.customRpcUrl 
      : rpcSettings.baseRpcUrl;
    
    const effectiveRpcSettings = { 
      baseRpcUrl: effectiveRpcUrl, 
      useCustomRpc: rpcSettings.useCustomRpc,
      customRpcUrl: rpcSettings.customRpcUrl
    };
    
    const currentWalletType = getWalletType();
    const walletType = (currentWalletType === 'privy' || currentWalletType === 'private') 
      ? currentWalletType 
      : 'privy'; // Default to privy for backward compatibility
    
    const walletConfig = createWalletConfig(effectiveRpcSettings, walletType, selectedNetwork.chainId);

    const result = await executeSwap({
      quote,
      fromToken: swapForm.fromToken,
      toToken: swapForm.toToken,
      fromAmount: swapForm.fromAmount,
      slippage: swapForm.slippage,
      userAddress: walletAddress,
      rpcSettings: effectiveRpcSettings,
      walletConfig,
      getWalletType,
      gasSettings, // Add gas settings to swap execution
    });

    if (result) {
      // Refresh token balances after successful swap
      await refreshSpecificTokens({
        chainId: selectedNetwork.chainId,
        userAddress: walletAddress,
        tokenAddresses: [swapForm.fromToken.token.address, swapForm.toToken.token.address],
      });
    }

    return result;
  }, [
    executeSwap, 
    quote, 
    swapForm, 
    walletAddress, 
    selectedNetwork, 
    getWalletType, 
    refreshSpecificTokens, 
    setError
  ]);

  return {
    // State
    tokens,
    swapForm,
    quote,
    canSwap,
    hasInsufficientBalance,
    hasValidQuote,
    
    // Wallet connection state for UI
    walletAddress,
    isConnected: !!walletAddress,
    
    // Actions
    setFromToken,
    setToToken,
    updateFromAmount,
    setSlippage,
    setMaxAmount,
    swapTokenPositions,
    getSwapQuote: getSwapQuoteManual,
    executeSwapTransaction,
    resetSwapForm,
    clearQuote,
  };
}; 