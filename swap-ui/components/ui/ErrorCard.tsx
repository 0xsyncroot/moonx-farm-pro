'use client';

import { AlertTriangle, RefreshCw, Wifi } from 'lucide-react';
import Button from './Button';

interface ErrorCardProps {
  title?: string;
  message: string;
  type?: 'error' | 'warning' | 'network' | 'notfound';
  onRetry?: () => void;
  onReset?: () => void;
  showRetry?: boolean;
  className?: string;
}

const ErrorCard: React.FC<ErrorCardProps> = ({
  title,
  message,
  type = 'error',
  onRetry,
  onReset,
  showRetry = true,
  className = ''
}) => {
  const getIcon = () => {
    switch (type) {
      case 'network':
        return <Wifi className="w-8 h-8" />;
      case 'warning':
        return <AlertTriangle className="w-8 h-8" />;
      case 'notfound':
        return <span className="text-4xl">🔍</span>;
      default:
        return <AlertTriangle className="w-8 h-8" />;
    }
  };

  const getColors = () => {
    switch (type) {
      case 'network':
        return {
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/20',
          text: 'text-blue-400',
          icon: 'text-blue-400'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/20',
          text: 'text-yellow-400',
          icon: 'text-yellow-400'
        };
      case 'notfound':
        return {
          bg: 'bg-gray-500/10',
          border: 'border-gray-500/20',
          text: 'text-gray-400',
          icon: 'text-gray-400'
        };
      default:
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/20',
          text: 'text-red-400',
          icon: 'text-red-400'
        };
    }
  };

  const colors = getColors();

  const getDefaultTitle = () => {
    switch (type) {
      case 'network':
        return 'Network Error';
      case 'warning':
        return 'Warning';
      case 'notfound':
        return 'Not Found';
      default:
        return 'Error';
    }
  };

  return (
    <div className={`p-6 ${colors.bg} ${colors.border} border rounded-xl ${className}`}>
      <div className="flex flex-col items-center text-center space-y-4">
        {/* Icon */}
        <div className={colors.icon}>
          {getIcon()}
        </div>

        {/* Title and Message */}
        <div className="space-y-2">
          <h3 className={`text-lg font-semibold ${colors.text}`}>
            {title || getDefaultTitle()}
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed max-w-md">
            {message}
          </p>
        </div>

        {/* Actions */}
        {(showRetry || onReset) && (
          <div className="flex space-x-3 pt-2">
            {onReset && (
              <Button
                onClick={onReset}
                variant="secondary"
                size="sm"
                className="text-gray-400 hover:text-white border-gray-600 hover:border-gray-500"
              >
                Reset
              </Button>
            )}
            {showRetry && onRetry && (
              <Button
                onClick={onRetry}
                variant="primary"
                size="sm"
                className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorCard; 