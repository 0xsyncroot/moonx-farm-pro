'use client';

import React, { useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { sessionManager } from '@/libs/session-manager';

interface SessionInfo {
  isActive: boolean;
  expiresAt?: number;
  lastActivity?: number;
  address?: string;
}

export const WalletSessionStatus: React.FC = () => {
  const { walletAddress, hasActiveSession, lockWallet, activeWallet } = useWallet();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({ isActive: false });
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Update session info
  useEffect(() => {
    const updateSessionInfo = () => {
      const session = sessionManager.getCurrentSession();
      const isActive = hasActiveSession();
      
      setSessionInfo({
        isActive,
        expiresAt: session?.expiresAt,
        lastActivity: session?.lastActivity,
        address: session?.address,
      });
    };

    updateSessionInfo();
    
    // Update every 30 seconds
    const interval = setInterval(updateSessionInfo, 30000);
    
    return () => clearInterval(interval);
  }, [hasActiveSession, walletAddress]);

  // Calculate time left
  useEffect(() => {
    if (!sessionInfo.isActive || !sessionInfo.expiresAt) {
      setTimeLeft('');
      return;
    }

    const updateTimeLeft = () => {
      const now = Date.now();
      const remaining = sessionInfo.expiresAt! - now;
      
      if (remaining <= 0) {
        setTimeLeft('Expired');
        return;
      }
      
      const minutes = Math.floor(remaining / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      
      if (minutes > 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        setTimeLeft(`${hours}h ${remainingMinutes}m`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    
    return () => clearInterval(interval);
  }, [sessionInfo.isActive, sessionInfo.expiresAt]);

  const handleLockWallet = () => {
    lockWallet();
  };

  const handleExtendSession = () => {
    sessionManager.extendSession();
    // Force update session info
    const session = sessionManager.getCurrentSession();
    if (session) {
      setSessionInfo(prev => ({
        ...prev,
        expiresAt: session.expiresAt,
        lastActivity: session.lastActivity,
      }));
    }
  };

  // Don't render anything on server-side or without wallet
  if (typeof window === 'undefined' || !walletAddress || !activeWallet) {
    return null;
  }

  // Only show if there's an active session
  if (!sessionInfo.isActive) {
    return null;
  }

  const isExpiringSoon = sessionInfo.expiresAt && (sessionInfo.expiresAt - Date.now()) < 5 * 60 * 1000; // 5 minutes

  // Determine display style based on session state
  const getDisplayStyle = () => {
    if (isExpiringSoon) {
      return {
        containerClass: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400',
        indicatorClass: 'bg-orange-500',
        statusText: '🔒 Wallet Session',
        statusMessage: 'Session expiring soon. Extend or re-authenticate when needed.'
      };
    } else {
      return {
        containerClass: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400',
        indicatorClass: 'bg-green-500',
        statusText: '🔒 Wallet Session',
        statusMessage: null
      };
    }
  };

  const displayStyle = getDisplayStyle();

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${displayStyle.containerClass}`}>
      {/* Session Status Indicator */}
      <div className={`w-2 h-2 rounded-full ${displayStyle.indicatorClass}`} />
      
      {/* Session Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {displayStyle.statusText}
          </span>
          {timeLeft && sessionInfo.isActive && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isExpiringSoon
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-800 dark:text-orange-300'
                : 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300'
            }`}>
              {timeLeft}
            </span>
          )}
        </div>
        
        {displayStyle.statusMessage && (
          <div className="text-xs mt-1 opacity-80">
            {displayStyle.statusMessage}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {sessionInfo.isActive && isExpiringSoon && (
          <button
            onClick={handleExtendSession}
            className="text-xs px-2 py-1 rounded bg-orange-100 hover:bg-orange-200 text-orange-700 transition-colors dark:bg-orange-800 dark:hover:bg-orange-700 dark:text-orange-300"
          >
            Extend
          </button>
        )}
        
        {sessionInfo.isActive && (
          <button
            onClick={handleLockWallet}
            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
            title="Lock wallet"
          >
            🔒 Lock
          </button>
        )}
      </div>
    </div>
  );
};

export default WalletSessionStatus;