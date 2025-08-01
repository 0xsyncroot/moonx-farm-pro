'use client';

import { useState } from 'react';
import { 
  BookOpen, 
  Wallet, 
  Plus, 
  ArrowUpDown, 
  CheckCircle, 
  SkipForward,
  ArrowRight,
  X,
  Sparkles,
  ShieldCheck,
  Coins
} from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { useTutorial, useTutorialActions } from '@/stores/useUIStore';
import { useWalletState } from '@/stores';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const tutorial = useTutorial();
  const { nextTutorialStep, skipTutorialStep, endTutorial } = useTutorialActions();
  const { isConnected } = useWalletState();

  const currentStep = tutorial.steps[tutorial.currentStepIndex];
  if (!currentStep) return null;

  const handleNext = () => {
    if (tutorial.currentStepIndex === tutorial.steps.length - 1) {
      // Last step - end tutorial
      endTutorial();
      onClose();
    } else {
      nextTutorialStep();
    }
  };

  const handleSkip = () => {
    skipTutorialStep();
    if (!tutorial.isActive) {
      // Tutorial ended due to required step skip
      onClose();
    }
  };

  const getStepIcon = (stepId: string) => {
    switch (stepId) {
      case 'connect-wallet':
        return <Wallet className="w-8 h-8 text-orange-400" />;
      case 'add-funds':
        return <Plus className="w-8 h-8 text-green-400" />;
      case 'first-swap':
        return <ArrowUpDown className="w-8 h-8 text-blue-400" />;
      default:
        return <BookOpen className="w-8 h-8 text-purple-400" />;
    }
  };

  const getStepContent = (stepId: string) => {
    switch (stepId) {
      case 'connect-wallet':
        return (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/20 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <ShieldCheck className="w-6 h-6 text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-orange-400 mb-2">Private Key Mode</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Connect using your private key for maximum security and control. Your private key is encrypted 
                    locally and never shared with our servers.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-gray-200">What you'll do:</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-orange-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Click "Connect Wallet" button</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-orange-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Choose "Private Key" option</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-orange-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Enter your private key or generate a new wallet</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-orange-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Confirm and secure your wallet</span>
                </li>
              </ul>
            </div>
          </div>
        );

      case 'add-funds':
        return (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <Coins className="w-6 h-6 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-green-400 mb-2">Fund Your Wallet</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Add tokens to your wallet to start trading. You can deposit from exchanges, 
                    other wallets, or purchase directly.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-gray-200">Funding options:</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Send tokens from another wallet or exchange</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Bridge from other networks</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Purchase directly with fiat</span>
                </li>
              </ul>
            </div>
            
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                💡 <strong>Tip:</strong> You'll need some ETH for gas fees to perform swaps on Base network.
              </p>
            </div>
          </div>
        );

      case 'first-swap':
        return (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <Sparkles className="w-6 h-6 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-400 mb-2">Your First Swap</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Experience seamless token swapping with the best rates from MoonX aggregator. 
                    Trade any supported tokens instantly.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-gray-200">How to swap:</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Select the token you want to swap (from)</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Choose what token you want to receive (to)</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Enter the amount you want to swap</span>
                </li>
                <li className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Review the quote and click "Swap"</span>
                </li>
              </ul>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="text-xs text-yellow-300">
                  ⚡ <strong>Best Rates:</strong> Always get the best available rates
                </p>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                <p className="text-xs text-purple-300">
                  🔒 <strong>Secure:</strong> Non-custodial and private
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="lg"
      className="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            {getStepIcon(currentStep.id)}
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {currentStep.title}
            </h2>
            <p className="text-gray-400">
              {currentStep.description}
            </p>
          </div>
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center space-x-2">
            {tutorial.steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === tutorial.currentStepIndex
                    ? 'bg-orange-400'
                    : index < tutorial.currentStepIndex
                    ? 'bg-green-400'
                    : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
          
          <p className="text-sm text-gray-500">
            Step {tutorial.currentStepIndex + 1} of {tutorial.steps.length}
          </p>
        </div>

        {/* Content */}
        <div className="min-h-[300px]">
          {getStepContent(currentStep.id)}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <Button
            onClick={handleSkip}
            variant="ghost"
            className="text-gray-400 hover:text-white order-2 sm:order-1"
          >
            <SkipForward className="w-4 h-4 mr-2" />
            {currentStep.required ? 'Skip Tutorial' : 'Skip Step'}
          </Button>
          
          <div className="flex items-center space-x-3 order-1 sm:order-2">
            <Button
              onClick={handleNext}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-6"
            >
              {tutorial.currentStepIndex === tutorial.steps.length - 1 ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Finish Tutorial
                </>
              ) : (
                <>
                  Next Step
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Skip warning for required steps */}
        {currentStep.required && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <p className="text-xs text-yellow-300 text-center">
              ⚠️ <strong>Notice:</strong> This is a required step. Skipping will end the tutorial.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TutorialModal;