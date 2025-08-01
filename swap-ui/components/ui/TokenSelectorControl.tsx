'use client';

import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import TokenAmountDisplay from './TokenAmountDisplay';
import type { TokenBalance } from '@/types';

interface TokenSelectorControlProps {
  selectedToken: TokenBalance | null;
  onOpen: () => void;
  label: string;
  showBalance?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'minimal';
  className?: string;
}

const TokenSelectorControl: React.FC<TokenSelectorControlProps> = ({
  selectedToken,
  onOpen,
  label,
  showBalance = true,
  disabled = false,
  variant = 'default',
  className,
}) => {
  const isMinimal = variant === 'minimal';

  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      className={clsx(
        'flex items-center justify-between w-full transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isMinimal 
          ? 'p-3 hover:bg-gray-800/50 rounded-lg'
          : 'p-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl',
        className
      )}
    >
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        {selectedToken ? (
          <>
            {/* Token Icon */}
            {selectedToken.token.logoURI && (
              <div className="flex-shrink-0">
                <img
                  src={selectedToken.token.logoURI}
                  alt={selectedToken.token.name}
                  className={clsx(
                    'rounded-full',
                    isMinimal ? 'w-6 h-6' : 'w-8 h-8'
                  )}
                  onError={(e) => {
                    // Fallback to default icon if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            )}
            
            {/* Token Info */}
            <div className="text-left min-w-0 flex-1">
              <div className={clsx(
                'text-white font-medium truncate',
                isMinimal ? 'text-sm' : 'text-base'
              )}>
                {selectedToken.token.symbol}
              </div>
              
              {showBalance && !isMinimal && (
                <div className="flex items-center space-x-1 text-gray-400 text-xs">
                  <span>Balance:</span>
                  <TokenAmountDisplay
                    value={selectedToken.formattedBalance}
                    decimals={4}
                    size="sm"
                    color="muted"
                  />
                </div>
              )}
            </div>

            {/* Balance for minimal variant */}
            {showBalance && isMinimal && (
              <div className="flex-shrink-0 text-right">
                <TokenAmountDisplay
                  value={selectedToken.formattedBalance}
                  decimals={4}
                  size="sm"
                  color="muted"
                />
              </div>
            )}
          </>
        ) : (
          <div className={clsx(
            'text-gray-400',
            isMinimal ? 'text-sm' : 'text-base'
          )}>
            Select {label}
          </div>
        )}
      </div>

      {/* Chevron */}
      <div className="flex-shrink-0 ml-2">
        <ChevronDown className={clsx(
          'text-gray-400 transition-transform duration-200',
          isMinimal ? 'w-4 h-4' : 'w-5 h-5'
        )} />
      </div>
    </button>
  );
};

export default TokenSelectorControl; 