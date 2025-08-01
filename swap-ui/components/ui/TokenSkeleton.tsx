'use client';

import React from 'react';

interface TokenSkeletonProps {
  count?: number;
  showBalance?: boolean;
}

// Single token skeleton item
const TokenSkeletonItem: React.FC<{ showBalance?: boolean }> = ({ showBalance = true }) => {
  return (
    <div className="flex items-center justify-between w-full p-3 rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="flex items-center space-x-3">
        {/* Token logo skeleton */}
        <div className="w-10 h-10 rounded-full bg-gray-700 animate-pulse shimmer" />
        
        <div className="space-y-2">
          {/* Token symbol skeleton */}
          <div className="h-4 w-16 bg-gray-700 rounded animate-pulse shimmer" />
          {/* Token name skeleton */}
          <div className="h-3 w-24 bg-gray-700 rounded animate-pulse shimmer" />
        </div>
      </div>
      
      {showBalance && (
        <div className="text-right space-y-2">
          {/* Balance amount skeleton */}
          <div className="h-4 w-20 bg-gray-700 rounded animate-pulse shimmer ml-auto" />
          {/* Balance symbol skeleton */}
          <div className="h-3 w-12 bg-gray-700 rounded animate-pulse shimmer ml-auto" />
        </div>
      )}
    </div>
  );
};

// Multiple token skeletons
const TokenSkeleton: React.FC<TokenSkeletonProps> = ({ count = 8, showBalance = true }) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <TokenSkeletonItem key={index} showBalance={showBalance} />
      ))}
    </div>
  );
};

export default TokenSkeleton;
export { TokenSkeletonItem };