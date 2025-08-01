import { useCallback } from 'react';
import { useUIState } from '@/stores';
import { useNetworkState } from '@/stores/useNetworkStore';
import { gasService } from '@/services';

/**
 * Hook for gas settings management following Clean Architecture
 * UI → Hook → Store → Service → HTTP Client → API
 */
export const useGasSettings = () => {
  const { 
    gasSettings, 
    setGasLimitBoost,
    setPriorityFeeTip,
    setBaseFeePerGas,
    setUseCustomGas,
    setGasSpeed,
    resetGasSettings,
  } = useUIState();
  
  const { rpcSettings } = useNetworkState();

  // Presentation logic for gas speed presets
  const setGasSpeedPreset = useCallback((speed: 'standard' | 'fast' | 'instant') => {
    setGasSpeed(speed);
    
    // Auto-set gas limit boost based on speed
    const boostMap = {
      standard: 0,   // No boost
      fast: 25,      // +25% gas limit
      instant: 50,   // +50% gas limit
    };
    
    setGasLimitBoost(boostMap[speed]);
    
    // If using custom gas, reset tip to default when switching to presets
    if (!gasSettings.useCustomGas) {
      setPriorityFeeTip('1.0'); // Reset to default tip
    }
  }, [setGasSpeed, setGasLimitBoost, setPriorityFeeTip, gasSettings.useCustomGas]);

  // Presentation logic for custom gas toggle
  const toggleCustomGas = useCallback((useCustom: boolean) => {
    setUseCustomGas(useCustom);
    
    if (!useCustom) {
      // Reset to default tip when disabling custom
      setPriorityFeeTip('1.0');
    }
  }, [setUseCustomGas, setPriorityFeeTip]);

  // Validation logic for gas inputs
  const validateGasInput = useCallback((value: string): boolean => {
    if (!value) return true; // Empty is valid (auto-calculate)
    
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue >= 0 && numValue <= 1000; // Max 1000 gwei
  }, []);

  // Format gas values for display
  const formatGasForDisplay = useCallback((gweiValue: string): string => {
    if (!gweiValue) return 'Auto';
    return `${gweiValue} gwei`;
  }, []);

  // Note: For gas cost estimation, use gasService.estimateGasCost() directly 
  // with specific transaction context (provider + transaction details)

  // Get gas recommendations from service using user's RPC settings
  const getGasRecommendations = useCallback(async (chainId: number) => {
    try {
      // Get effective RPC URL based on user settings
      const rpcUrl = gasService.getRpcUrl(chainId, rpcSettings);
      const recommendations = await gasService.getGasRecommendations(chainId, rpcUrl);
      
      // Auto-update base fee when we get fresh recommendations
      if (recommendations) {
        setBaseFeePerGas(recommendations.baseFeePerGas);
      }
      
      return recommendations;
    } catch (error) {
      console.warn('Failed to get gas recommendations:', error);
      return null;
    }
  }, [rpcSettings, setBaseFeePerGas]);

  // Calculate effective maxFeePerGas = baseFee + tip
  const calculateMaxFeePerGas = useCallback((): string => {
    if (!gasSettings.useCustomGas) {
      return ''; // Auto mode - let ethers handle it
    }
    
    const baseFee = parseFloat(gasSettings.baseFeePerGas || '0');
    const tip = parseFloat(gasSettings.priorityFeeTip || '0');
    
    if (baseFee <= 0) {
      return gasSettings.priorityFeeTip; // If no base fee, just use tip
    }
    
    return (baseFee + tip).toFixed(1); // baseFee + tip
  }, [gasSettings.baseFeePerGas, gasSettings.priorityFeeTip, gasSettings.useCustomGas]);

  return {
    // Current gas settings state
    gasSettings,
    
    // Validation helpers
    validateGasInput,
    formatGasForDisplay,
    
    // Preset actions (presentation logic)
    setGasSpeedPreset,
    toggleCustomGas,
    
    // Direct store actions
    setGasLimitBoost,
    setPriorityFeeTip,
    setBaseFeePerGas,
    resetGasSettings,
    
    // Service layer integration
    getGasRecommendations,
    
    // Gas calculation logic
    calculateMaxFeePerGas,
    
    // Computed properties
    isCustomGasMode: gasSettings.useCustomGas,
    hasCustomGasValues: !!(gasSettings.priorityFeeTip && parseFloat(gasSettings.priorityFeeTip) > 0),
    gasSpeedLabel: gasSettings.gasSpeed.charAt(0).toUpperCase() + gasSettings.gasSpeed.slice(1),
    maxFeePerGas: calculateMaxFeePerGas(), // Computed max fee
  };
};