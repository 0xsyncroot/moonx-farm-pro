'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toast: ToastData;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Enter animation
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 200);
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getColors = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-900/90 border-green-800 text-green-100';
      case 'error':
        return 'bg-red-900/90 border-red-800 text-red-100';
      case 'warning':
        return 'bg-yellow-900/90 border-yellow-800 text-yellow-100';
      case 'info':
        return 'bg-blue-900/90 border-blue-800 text-blue-100';
    }
  };

  return (
    <div
      className={`
        relative flex items-start space-x-3 p-4 rounded-xl border backdrop-blur-sm shadow-lg
        transition-all duration-200 ease-out min-w-[320px] max-w-[420px]
        ${getColors()}
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {getIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {toast.title}
        </div>
        {toast.message && (
          <div className="mt-1 text-sm opacity-90">
            {toast.message}
          </div>
        )}
        {toast.action && (
          <div className="mt-3">
            <button
              onClick={toast.action.onClick}
              className={`
                text-xs font-medium px-3 py-1.5 rounded-lg
                transition-colors duration-200
                ${toast.type === 'success' ? 'bg-green-800 hover:bg-green-700 text-green-100' :
                  toast.type === 'error' ? 'bg-red-800 hover:bg-red-700 text-red-100' :
                  toast.type === 'warning' ? 'bg-yellow-800 hover:bg-yellow-700 text-yellow-100' :
                  'bg-blue-800 hover:bg-blue-700 text-blue-100'}
              `}
            >
              {toast.action.label}
            </button>
          </div>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={handleClose}
        className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Toast;