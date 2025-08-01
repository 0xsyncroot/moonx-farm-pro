'use client';

import dynamic from 'next/dynamic';

// Dynamic import để tránh SSR issues với Zustand
const SwapContainer = dynamic(() => import('@/components/swap').then(mod => ({ default: mod.SwapContainer })), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-sm sm:max-w-md md:max-w-lg mx-auto px-2 sm:px-3 md:px-4">
      <div className="bg-gradient-to-br from-[#1a1b23] to-[#141520] rounded-xl sm:rounded-2xl border border-gray-800/60 p-3 sm:p-4 md:p-5 animate-pulse shadow-2xl backdrop-blur-lg">
        <div className="h-4 sm:h-5 bg-gray-800 rounded-lg mb-3 sm:mb-4"></div>
        <div className="h-12 sm:h-14 bg-gray-800 rounded-xl mb-3 sm:mb-4"></div>
        <div className="h-3 sm:h-4 bg-gray-800 rounded-md mb-3 sm:mb-4"></div>
        <div className="h-12 sm:h-14 bg-gray-800 rounded-xl mb-3 sm:mb-4"></div>
        <div className="h-8 sm:h-10 bg-gray-800 rounded-lg"></div>
      </div>
    </div>
  )
});

export default function SwapPage() {
  return (
    <div className="w-full max-w-sm sm:max-w-md md:max-w-lg mx-auto px-2 sm:px-3 md:px-4">
      {/* Swap Interface */}
      <SwapContainer />

      {/* Enhanced Info Section */}
      <div className="mt-3 sm:mt-4 text-center">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-3">
          <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
              <span className="text-orange-400 text-[9px] sm:text-[10px] font-bold">0%</span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-gray-400">Platform Fee</span>
          </div>
          <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-green-400 text-[9px] sm:text-[10px] font-bold">✓</span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-gray-400">MEV Protected</span>
          </div>
          <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="text-blue-400 text-[9px] sm:text-[10px] font-bold">🔒</span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-gray-400">Secure</span>
          </div>
        </div>
        <p className="text-[10px] sm:text-xs text-gray-500 font-medium">
          Powered by MoonX DEX • Best prices guaranteed
        </p>
      </div>
    </div>
  );
}
