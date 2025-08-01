import { forwardRef } from 'react';
import { clsx } from 'clsx';
import type { ButtonProps } from '@/types';

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    children, 
    onClick, 
    disabled = false, 
    loading = false, 
    variant = 'primary', 
    size = 'md', 
    className,
    ...props 
  }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed border';
    
    const variantClasses = {
      primary: 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:from-orange-700 active:to-orange-800 text-white shadow-lg hover:shadow-xl focus:ring-orange-500 disabled:from-gray-600 disabled:to-gray-600 disabled:shadow-none border-transparent',
      secondary: 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white border-gray-600 hover:border-gray-500 focus:ring-gray-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:border-gray-700',
      danger: 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800 text-white shadow-lg hover:shadow-xl focus:ring-red-500 disabled:from-gray-600 disabled:to-gray-600 disabled:shadow-none border-transparent',
      ghost: 'bg-transparent hover:bg-gray-800/50 active:bg-gray-800 text-gray-300 hover:text-white border-gray-700 hover:border-gray-600 focus:ring-gray-500 disabled:text-gray-500 disabled:border-gray-700',
      success: 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:from-green-700 active:to-green-800 text-white shadow-lg hover:shadow-xl focus:ring-green-500 disabled:from-gray-600 disabled:to-gray-600 disabled:shadow-none border-transparent',
    };
    
    const sizeClasses = {
      xs: 'px-2 py-1.5 text-xs',
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-2.5 text-base',
      lg: 'px-6 py-3 text-lg',
      xl: 'px-8 py-4 text-xl',
    };

    const isDisabled = disabled || loading;
    const hasScaleEffect = !isDisabled && ['primary', 'danger', 'success'].includes(variant);

    return (
      <button
        ref={ref}
        onClick={onClick}
        disabled={isDisabled}
        className={clsx(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          {
            'opacity-50': isDisabled,
            'transform hover:scale-105': hasScaleEffect,
            'cursor-wait': loading,
          },
          className
        )}
        {...props}
      >
        {loading && (
          <svg 
            className="animate-spin -ml-1 mr-2 h-4 w-4" 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24"
          >
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button; 