'use client';

import { useState, useEffect } from 'react';
import { Settings, X, AlertTriangle, Zap, Fuel, DollarSign } from 'lucide-react';
import { Modal } from '@/components/ui';
import { useGasSettings } from '@/hooks/useGasSettings';
import { useNetworkState } from '@/stores';

interface SlippageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSlippage: number;
  onSlippageChange: (slippage: number) => void;
}

const SlippageModal: React.FC<SlippageModalProps> = ({
  isOpen,
  onClose,
  currentSlippage,
  onSlippageChange
}) => {
  // Follow Clean Architecture: UI → Hook → Store → Service
  const {
    gasSettings,
    setGasSpeedPreset,
    toggleCustomGas,
    setGasLimitBoost,
    setPriorityFeeTip,
    validateGasInput,
    formatGasForDisplay,
    getGasRecommendations,
    isCustomGasMode,
    gasSpeedLabel,
    maxFeePerGas,
  } = useGasSettings();
  
  const { selectedNetwork } = useNetworkState();
  
  const [customSlippage, setCustomSlippage] = useState(currentSlippage.toString());
  const [selectedPreset, setSelectedPreset] = useState<number | null>(
    [0.1, 0.5, 1.0].includes(currentSlippage) ? currentSlippage : null
  );
  const [gasCostEstimate, setGasCostEstimate] = useState<string>('');
  const [gasRecommendations, setGasRecommendations] = useState<any>(null);

  // Load gas recommendations when modal opens or settings change
  useEffect(() => {
    if (isOpen && selectedNetwork) {
      // Load gas recommendations for custom inputs
      getGasRecommendations(selectedNetwork.chainId).then((recommendations) => {
        setGasRecommendations(recommendations);
        
        // Set estimated cost based on current gas settings
        if (recommendations) {
          const preset = recommendations[gasSettings.gasSpeed];
          if (preset) {
            // Rough estimate based on average gas limit for swaps (~200k gas)
            const estimatedGasLimit = 200000;
            const maxFeeWei = parseFloat(preset.maxFeePerGas) * 1e9; // gwei to wei
            const costWei = estimatedGasLimit * maxFeeWei;
            const costEth = costWei / 1e18;
            setGasCostEstimate(`~${costEth.toFixed(6)} ETH`);
          }
        }
      });
    }
  }, [isOpen, selectedNetwork, gasSettings, getGasRecommendations]);

  const presetSlippages = [
    { value: 0.1, label: '0.1%' },
    { value: 0.5, label: '0.5%' },
    { value: 1.0, label: '1.0%' },
  ];

  const handlePresetClick = (value: number) => {
    setSelectedPreset(value);
    setCustomSlippage(value.toString());
    onSlippageChange(value);
  };

  const handleCustomSlippageChange = (value: string) => {
    setCustomSlippage(value);
    setSelectedPreset(null);
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 50) {
      onSlippageChange(numValue);
    }
  };

  const getSlippageWarning = (slippage: number) => {
    if (slippage < 0.1) return { type: 'info', message: 'Your transaction may fail' };
    if (slippage > 5) return { type: 'warning', message: 'Your transaction may be frontrun' };
    if (slippage > 1) return { type: 'caution', message: 'High slippage tolerance' };
    return null;
  };

  const warning = getSlippageWarning(parseFloat(customSlippage) || 0);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Swap Settings"
      size="sm"
    >
      <div className="space-y-6">
        {/* Slippage Tolerance Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-white">Slippage Tolerance</label>
            <div className="flex items-center space-x-1 text-xs text-gray-400">
              <Settings className="w-3 h-3" />
              <span>Auto</span>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex space-x-2 mb-3">
            {presetSlippages.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset.value)}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                  selectedPreset === preset.value
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Input */}
          <div className="relative">
            <input
              type="number"
              value={customSlippage}
              onChange={(e) => handleCustomSlippageChange(e.target.value)}
              placeholder="Custom"
              min="0"
              max="50"
              step="0.1"
              className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
                warning?.type === 'warning' 
                  ? 'border-red-500 focus:ring-red-500/20' 
                  : warning?.type === 'caution'
                  ? 'border-yellow-500 focus:ring-yellow-500/20'
                  : 'border-gray-700 focus:ring-orange-500/20'
              }`}
            />
            <span className="absolute right-3 top-2 text-gray-400 text-sm">%</span>
          </div>

          {/* Warning Message */}
          {warning && (
            <div className={`flex items-center space-x-2 mt-2 p-2 rounded-lg text-xs ${
              warning.type === 'warning' 
                ? 'bg-red-500/10 text-red-400' 
                : warning.type === 'caution'
                ? 'bg-yellow-500/10 text-yellow-400'
                : 'bg-blue-500/10 text-blue-400'
            }`}>
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>{warning.message}</span>
            </div>
          )}
        </div>

        {/* Transaction Deadline */}
        <div>
          <label className="block text-sm font-medium text-white mb-3">
            Transaction Deadline
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              defaultValue="20"
              min="1"
              max="180"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
            <span className="text-gray-400 text-sm">minutes</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Your transaction will revert if it is pending for more than this long.
          </p>
        </div>

        {/* Gas Settings Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-white">Gas Settings</label>
            <div className="flex items-center space-x-1 text-xs text-gray-400">
              <Fuel className="w-3 h-3" />
              <span>EIP-1559</span>
            </div>
          </div>

          {/* Gas Speed Presets */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">Transaction Speed</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'standard', label: 'Standard', desc: 'Normal speed', icon: '🐌' },
                  { value: 'fast', label: 'Fast', desc: '+25% faster', icon: '🚗' },
                  { value: 'instant', label: 'Instant', desc: '+50% faster', icon: '🚀' },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setGasSpeedPreset(preset.value as any)}
                    className={`p-3 rounded-lg text-center transition-all duration-200 border ${
                      gasSettings.gasSpeed === preset.value
                        ? 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <div className="text-lg mb-1">{preset.icon}</div>
                    <div className="text-xs font-semibold">{preset.label}</div>
                    <div className="text-[10px] text-gray-400">{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Gas Toggle */}
            <div className="flex items-center justify-between p-2 bg-gray-800/30 rounded-lg">
              <div>
                <div className="text-xs font-medium text-white">Custom Gas Settings</div>
                <div className="text-[10px] text-gray-400">Set specific gas prices in gwei</div>
              </div>
              <button 
                onClick={() => toggleCustomGas(!isCustomGasMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isCustomGasMode ? 'bg-orange-500' : 'bg-gray-600'
                }`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  isCustomGasMode ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Custom Gas Inputs */}
            {isCustomGasMode && (
              <div className="space-y-3 p-3 bg-gray-800/20 rounded-lg border border-gray-700/50">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Priority Fee Tip for Miners
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={gasSettings.priorityFeeTip}
                      onChange={(e) => {
                        if (validateGasInput(e.target.value)) {
                          setPriorityFeeTip(e.target.value);
                        }
                      }}
                      placeholder="1.0"
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 pr-12"
                    />
                    <span className="absolute right-3 top-2 text-gray-400 text-xs">gwei</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    This tip will be added to the network base fee. Higher tip = faster confirmation.
                  </div>
                </div>
                
                {/* Display current gas calculation */}
                {gasSettings.baseFeePerGas && parseFloat(gasSettings.baseFeePerGas) > 0 && (
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="text-xs text-blue-400 mb-1">Gas Calculation:</div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="text-gray-400">
                        Base Fee: <span className="text-white">{gasSettings.baseFeePerGas} gwei</span>
                      </div>
                      <div className="text-gray-400">
                        Your Tip: <span className="text-white">{gasSettings.priorityFeeTip || '0'} gwei</span>
                      </div>
                    </div>
                    <div className="text-xs text-blue-300 mt-1 font-medium">
                      Total Max Fee: {maxFeePerGas || 'Auto'} gwei
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Gas Limit Boost */}
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">
                Gas Limit Boost: {gasSettings.gasLimitBoost}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={gasSettings.gasLimitBoost}
                onChange={(e) => setGasLimitBoost(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>Normal</span>
                <span>+100% Safety</span>
              </div>
            </div>

            {/* Gas Cost Estimate */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1">
                  <DollarSign className="w-3 h-3 text-blue-400" />
                  <span className="text-xs text-blue-400">Estimated Cost:</span>
                </div>
                <span className="text-xs font-semibold text-blue-300">
                  {gasCostEstimate || 'Loading...'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="text-gray-400">
                  Speed: <span className="text-white">{gasSpeedLabel}</span>
                </div>
                <div className="text-gray-400">
                  Gas Boost: <span className="text-white">+{gasSettings.gasLimitBoost}%</span>
                </div>
              </div>
              <div className="text-[10px] text-blue-300/70 mt-2">
                {isCustomGasMode ? 'Using custom gas settings' : 'Using recommended gas prices'}
              </div>
            </div>
          </div>
        </div>

        {/* Expert Mode Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
          <div>
            <div className="text-sm font-medium text-white">Expert Mode</div>
            <div className="text-xs text-gray-400">Allow high price impact trades</div>
          </div>
          <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-600 transition-colors">
            <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-medium text-sm transition-all duration-200"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SlippageModal; 