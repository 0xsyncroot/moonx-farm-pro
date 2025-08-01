'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import Toast, { ToastData, ToastType } from './Toast';

interface ToastContextType {
  showToast: (type: ToastType, title: string, options?: {
    message?: string;
    duration?: number;
    action?: { label: string; onClick: () => void };
  }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((
    type: ToastType, 
    title: string, 
    options?: {
      message?: string;
      duration?: number;
      action?: { label: string; onClick: () => void };
    }
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newToast: ToastData = {
      id,
      type,
      title,
      message: options?.message,
      duration: options?.duration ?? (type === 'error' ? 8000 : 5000), // Error toasts stay longer
      action: options?.action,
    };

    setToasts(prev => [...prev, newToast]);
  }, []);

  const success = useCallback((title: string, message?: string) => {
    showToast('success', title, { message });
  }, [showToast]);

  const error = useCallback((title: string, message?: string) => {
    showToast('error', title, { message });
  }, [showToast]);

  const warning = useCallback((title: string, message?: string) => {
    showToast('warning', title, { message });
  }, [showToast]);

  const info = useCallback((title: string, message?: string) => {
    showToast('info', title, { message });
  }, [showToast]);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value: ToastContextType = {
    showToast,
    success,
    error,
    warning,
    info,
    clearAll,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onClose={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};