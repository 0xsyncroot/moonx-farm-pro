'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui';

interface ElementPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TutorialOverlayProps {
  isActive: boolean;
  targetSelector: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  onNext?: () => void;
  onSkip?: () => void;
  onClose?: () => void;
  showSkip?: boolean;
  isLastStep?: boolean;
  stepNumber?: number;
  totalSteps?: number;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isActive,
  targetSelector,
  title,
  description,
  position = 'auto',
  onNext,
  onSkip,
  onClose,
  showSkip = true,
  isLastStep = false,
  stepNumber = 1,
  totalSteps = 1,
}) => {
  const [elementPosition, setElementPosition] = useState<ElementPosition | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !targetSelector) return;

    const updatePosition = () => {
      const element = document.querySelector(targetSelector) as HTMLElement;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      setElementPosition({
        top: rect.top + scrollTop,
        left: rect.left + scrollLeft,
        width: rect.width,
        height: rect.height,
      });

      // Auto-determine tooltip position
      if (position === 'auto') {
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        if (rect.bottom + 200 > viewportHeight && rect.top > 200) {
          setTooltipPosition('top');
        } else if (rect.right + 300 > viewportWidth && rect.left > 300) {
          setTooltipPosition('left');
        } else if (rect.left - 300 < 0 && rect.right + 300 < viewportWidth) {
          setTooltipPosition('right');
        } else {
          setTooltipPosition('bottom');
        }
      } else {
        setTooltipPosition(position);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [isActive, targetSelector, position]);

  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isActive]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Only allow clicks on the highlighted element
    if (elementPosition) {
      const clickX = e.clientX + window.scrollX;
      const clickY = e.clientY + window.scrollY;
      
      const isInsideElement = 
        clickX >= elementPosition.left &&
        clickX <= elementPosition.left + elementPosition.width &&
        clickY >= elementPosition.top &&
        clickY <= elementPosition.top + elementPosition.height;

      if (!isInsideElement) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  const getTooltipStyle = (): React.CSSProperties => {
    if (!elementPosition) return {};

    const spacing = 20;
    let tooltipStyle: React.CSSProperties = {
      position: 'absolute',
      zIndex: 1002,
      maxWidth: '320px',
    };

    switch (tooltipPosition) {
      case 'top':
        tooltipStyle = {
          ...tooltipStyle,
          bottom: window.innerHeight - elementPosition.top + spacing,
          left: elementPosition.left + elementPosition.width / 2,
          transform: 'translateX(-50%)',
        };
        break;
      case 'bottom':
        tooltipStyle = {
          ...tooltipStyle,
          top: elementPosition.top + elementPosition.height + spacing,
          left: elementPosition.left + elementPosition.width / 2,
          transform: 'translateX(-50%)',
        };
        break;
      case 'left':
        tooltipStyle = {
          ...tooltipStyle,
          top: elementPosition.top + elementPosition.height / 2,
          right: window.innerWidth - elementPosition.left + spacing,
          transform: 'translateY(-50%)',
        };
        break;
      case 'right':
        tooltipStyle = {
          ...tooltipStyle,
          top: elementPosition.top + elementPosition.height / 2,
          left: elementPosition.left + elementPosition.width + spacing,
          transform: 'translateY(-50%)',
        };
        break;
    }

    return tooltipStyle;
  };

  const getArrowStyle = (): React.CSSProperties => {
    const arrowSize = 8;
    
    switch (tooltipPosition) {
      case 'top':
        return {
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderTop: `${arrowSize}px solid rgb(31, 41, 55)`,
        };
      case 'bottom':
        return {
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid rgb(31, 41, 55)`,
        };
      case 'left':
        return {
          position: 'absolute',
          top: '50%',
          left: '100%',
          transform: 'translateY(-50%)',
          width: 0,
          height: 0,
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderLeft: `${arrowSize}px solid rgb(31, 41, 55)`,
        };
      case 'right':
        return {
          position: 'absolute',
          top: '50%',
          right: '100%',
          transform: 'translateY(-50%)',
          width: 0,
          height: 0,
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid rgb(31, 41, 55)`,
        };
      default:
        return {};
    }
  };

  if (!isActive || !elementPosition) return null;

  const overlayContent = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000]"
      onClick={handleOverlayClick}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Dark overlay with spotlight */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{
          opacity: 0.7,
          clipPath: `polygon(
            0% 0%, 
            0% 100%, 
            ${elementPosition.left}px 100%, 
            ${elementPosition.left}px ${elementPosition.top}px, 
            ${elementPosition.left + elementPosition.width}px ${elementPosition.top}px, 
            ${elementPosition.left + elementPosition.width}px ${elementPosition.top + elementPosition.height}px, 
            ${elementPosition.left}px ${elementPosition.top + elementPosition.height}px, 
            ${elementPosition.left}px 100%, 
            100% 100%, 
            100% 0%
          )`,
        }}
      />

      {/* Spotlight ring */}
      <div
        className="absolute border-4 border-orange-400 rounded-lg shadow-lg animate-pulse"
        style={{
          top: elementPosition.top - 4,
          left: elementPosition.left - 4,
          width: elementPosition.width + 8,
          height: elementPosition.height + 8,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 20px rgba(249, 115, 22, 0.5)',
          pointerEvents: 'none',
        }}
      />

      {/* Tooltip */}
      <div
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-4"
        style={getTooltipStyle()}
      >
        {/* Arrow */}
        <div style={getArrowStyle()} />
        
        {/* Content */}
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {stepNumber}
              </div>
              <h3 className="text-white font-semibold text-sm">{title}</h3>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Description */}
          <p className="text-gray-300 text-sm leading-relaxed">{description}</p>

          {/* Progress */}
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1">
              {Array.from({ length: totalSteps }).map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index + 1 === stepNumber
                      ? 'bg-orange-400'
                      : index + 1 < stepNumber
                      ? 'bg-green-400'
                      : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400">
              {stepNumber} of {totalSteps}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {showSkip && onSkip && (
              <button
                onClick={onSkip}
                className="text-gray-400 hover:text-white text-xs flex items-center space-x-1 transition-colors"
              >
                <SkipForward className="w-3 h-3" />
                <span>Skip</span>
              </button>
            )}
            
            {onNext && (
              <Button
                onClick={onNext}
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 ml-auto"
              >
                {isLastStep ? 'Finish' : 'Next'}
                {!isLastStep && <ArrowRight className="w-3 h-3 ml-1" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlayContent, document.body);
};

export default TutorialOverlay;