import { Fragment, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import type { ModalProps } from '@/types';

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  children, 
  title, 
  size = 'md',
  className 
}) => {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      // Store original styles
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      
      // Calculate scrollbar width
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      // Apply styles to prevent scroll
      document.body.style.overflow = 'hidden';
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }
      
      return () => {
        // Restore original styles
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  const modalContent = (
    <Fragment>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal Container */}
      <div 
        className="fixed inset-0 z-[101] flex items-center justify-center p-4"
        role="dialog" 
        aria-modal="true"
      >
        <div 
          className={clsx(
            'bg-gray-900 rounded-xl sm:rounded-2xl border border-gray-700/50 shadow-2xl w-full transition-all duration-300 transform',
            'max-h-[90vh] flex flex-col',
            sizeClasses[size],
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - Fixed */}
          {title && (
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700/50 flex-shrink-0">
              <h3 className="text-lg sm:text-xl font-bold text-white">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          )}
          
          {/* Content - Scrollable */}
          <div className={clsx(
            'p-4 sm:p-6 overflow-y-auto flex-1', // Enable scrolling on content
            !title && 'pt-6 sm:pt-8' // Extra padding top if no title
          )}>
            {!title && (
              <button
                onClick={onClose}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors z-10"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
            {children}
          </div>
        </div>
      </div>
    </Fragment>
  );

  // Use createPortal to render the modal at the document body level
  return typeof window !== 'undefined' 
    ? createPortal(modalContent, document.body)
    : null;
};

export default Modal; 