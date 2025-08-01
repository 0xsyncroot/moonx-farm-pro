'use client';

import { ReactNode } from 'react';
import { Header } from '@/components/layout';
import { WalletModal } from '@/components/wallet';
import { useAppInitialization } from '@/hooks/useAppInitialization';

interface AppInitializerProps {
  children: ReactNode;
}

/**
 * App Initializer Component with Full Layout Shimmer
 * 
 * Following Clean Architecture pattern:
 * - Component uses Hook (useAppInitialization)
 * - Hook orchestrates Stores (NetworkStore, etc.)
 * - Stores use Services (NetworkService, etc.)
 * - Services use HTTP Client (ApiClient)
 * 
 * Features:
 * - Initialize critical app data when app starts
 * - Show full layout shimmer while networks are loading
 * - Seamless transition to real content when ready
 */
export const AppInitializer: React.FC<AppInitializerProps> = ({ children }) => {
  const { isInitialized, networksLoaded } = useAppInitialization();

  // Show layout shimmer while networks are loading
  if (!networksLoaded) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Header Shimmer */}
        <header className="w-full bg-[#1a1b23] border-b border-gray-800 sticky top-0 z-40 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Left Side - Logo & Navigation Shimmer */}
              <div className="flex items-center space-x-8">
                {/* Logo Shimmer */}
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-700 rounded-lg shimmer"></div>
                  <div className="w-16 h-6 bg-gray-700 rounded shimmer"></div>
                </div>

                {/* Navigation Tabs Shimmer */}
                <nav className="hidden md:flex items-center space-x-1">
                  <div className="w-12 h-8 bg-gray-700 rounded-lg shimmer"></div>
                  <div className="w-12 h-8 bg-gray-700 rounded-lg shimmer"></div>
                  <div className="w-16 h-8 bg-gray-700 rounded-lg shimmer"></div>
                </nav>
              </div>

              {/* Right Side - Chain Selector & Wallet Shimmer */}
              <div className="flex items-center space-x-3">
                {/* Chain Selector Shimmer */}
                <div className="flex items-center space-x-2 px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-xl">
                  <div className="w-5 h-5 rounded-full bg-gray-700 shimmer"></div>
                  <div className="hidden sm:block w-16 h-4 bg-gray-700 rounded shimmer"></div>
                  <div className="w-4 h-4 bg-gray-700 rounded shimmer"></div>
                </div>

                {/* Settings Button Shimmer */}
                <div className="w-10 h-10 bg-gray-700 rounded-xl shimmer"></div>

                {/* Wallet Button Shimmer */}
                <div className="w-32 h-10 bg-gray-700 rounded-xl shimmer"></div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Shimmer */}
        <main className="flex-1 flex items-start justify-center p-4 pt-8 pb-8 min-h-0">
          <div className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl mx-auto px-3 sm:px-4 md:px-6">
            {/* Swap Interface Shimmer */}
            <div className="bg-[#1a1b23] rounded-2xl border border-gray-800 p-6 space-y-4 shadow-2xl">
              <div className="h-6 bg-gray-700 rounded shimmer"></div>
              <div className="h-20 bg-gray-700 rounded shimmer"></div>
              <div className="h-4 bg-gray-700 rounded shimmer"></div>
              <div className="h-20 bg-gray-700 rounded shimmer"></div>
              <div className="h-12 bg-gray-700 rounded shimmer"></div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-auto py-6 border-t border-gray-800/30 bg-black/20 backdrop-blur-sm">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="text-xs text-gray-500 mb-2">
              © 2025 MoonX • Built for DeFi
            </div>
            <div className="text-xs">
              <span className="text-gray-600">Need support? </span>
              <a 
                href="https://x.com/0xsyncroot" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300 transition-colors"
              >
                Contact us on X
              </a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // Networks loaded - show real layout
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <Header />

      {/* Main Content - Grows to fill available space */}
      <main className="flex-1 flex items-start justify-center p-4 pt-8 pb-8 min-h-0">
        <div className="w-full max-w-4xl">
          {children}
        </div>
      </main>

      {/* Footer - Always at bottom */}
      <footer className="mt-auto py-6 border-t border-gray-800/30 bg-black/20 backdrop-blur-sm">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="text-xs text-gray-500 mb-2">
            © 2025 MoonX • Built for DeFi
          </div>
          <div className="text-xs">
            <span className="text-gray-600">Need support? </span>
            <a 
              href="https://x.com/0xsyncroot" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 transition-colors"
            >
              Contact us on X
            </a>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <WalletModal />
    </div>
  );
};

export default AppInitializer;