import { forwardRef } from 'react';
import { clsx } from 'clsx';
import type { InputProps } from '@/types';

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ 
    value, 
    onChange, 
    placeholder, 
    disabled = false, 
    error, 
    type = 'text', 
    className,
    ...props 
  }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={clsx(
            'w-full px-4 py-3 bg-gray-800 border rounded-xl text-white placeholder-gray-400 transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent',
            'disabled:bg-gray-900 disabled:text-gray-500 disabled:cursor-not-allowed',
            error 
              ? 'border-red-500 focus:ring-red-500' 
              : 'border-gray-600 hover:border-gray-500',
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

Input.displayName = 'Input';

export default Input; 