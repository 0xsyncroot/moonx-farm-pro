'use client';

import { forwardRef } from 'react';
import { NumericFormat } from 'react-number-format';
import { clsx } from 'clsx';

interface TokenInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  decimals?: number;
  allowNegative?: boolean;
  prefix?: string;
  suffix?: string;
}

const TokenInput = forwardRef<HTMLInputElement, TokenInputProps>(
  ({ 
    value, 
    onChange, 
    placeholder = "0.0", 
    disabled = false, 
    error, 
    className,
    decimals = 18,
    allowNegative = false,
    prefix,
    suffix,
    ...props 
  }, ref) => {
    return (
      <div className="w-full">
        <NumericFormat
          getInputRef={ref}
          value={value}
          onValueChange={(values) => {
            onChange(values.value);
          }}
          placeholder={placeholder}
          disabled={disabled}
          allowNegative={allowNegative}
          decimalScale={decimals}
          prefix={prefix}
          suffix={suffix}
          thousandSeparator={true}
          className={clsx(
            'w-full px-4 py-3 bg-transparent border-0 text-white placeholder-gray-400 transition-all duration-200',
            'focus:outline-none focus:ring-0',
            'disabled:text-gray-500 disabled:cursor-not-allowed',
            error && 'text-red-400',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }
);

TokenInput.displayName = 'TokenInput';

export default TokenInput; 