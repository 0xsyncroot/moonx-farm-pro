'use client';

import { NumericFormat } from 'react-number-format';
import { clsx } from 'clsx';

interface TokenAmountDisplayProps {
  value: string | number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'default' | 'muted' | 'accent' | 'error';
  showFullPrecision?: boolean;
}

const TokenAmountDisplay: React.FC<TokenAmountDisplayProps> = ({
  value,
  decimals = 6,
  prefix,
  suffix,
  className,
  size = 'md',
  color = 'default',
  showFullPrecision = false,
}) => {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-2xl',
  };

  const colorClasses = {
    default: 'text-white',
    muted: 'text-gray-400',
    accent: 'text-orange-400',
    error: 'text-red-400',
  };

  // Format very small numbers to show more precision
  const formatValue = (val: string | number) => {
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    
    if (isNaN(numVal) || numVal === 0) return '0';
    
    // For very small numbers, show more decimals
    if (numVal > 0 && numVal < 0.000001 && !showFullPrecision) {
      return `< 0.000001`;
    }
    
    return numVal;
  };

  const displayValue = formatValue(value);

  return (
    <span className={clsx(
      sizeClasses[size],
      colorClasses[color],
      'font-medium',
      className
    )}>
      {typeof displayValue === 'string' ? (
        displayValue
      ) : (
        <NumericFormat
          value={displayValue}
          displayType="text"
          thousandSeparator={true}
          decimalScale={decimals}
          fixedDecimalScale={false}
          prefix={prefix}
          suffix={suffix}
        />
      )}
    </span>
  );
};

export default TokenAmountDisplay; 