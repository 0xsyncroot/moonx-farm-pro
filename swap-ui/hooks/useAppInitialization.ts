'use client';

import { useEffect, useRef } from 'react';
import { useNetworkState } from '@/stores';

/**
 * App Initialization Hook
 * 
 * Following Clean Architecture pattern: UI → Hook → Store → Service
 * 
 * Responsibilities:
 * - Load critical app data when app starts
 * - Initialize network data for Header and other components
 * - Ensure proper data flow according to Clean Architecture
 * 
 * Usage:
 * - Call this in layout.tsx to ensure data is loaded before components render
 * - Hook orchestrates stores, stores use services
 */
export const useAppInitialization = () => {
  const { networks, loadNetworks } = useNetworkState();
  const hasInitialized = useRef(false);
  const isLoading = useRef(false);

  useEffect(() => {
    // Prevent double initialization in dev mode (StrictMode) or if already loading
    if (hasInitialized.current || isLoading.current) return;
    
    const initializeApp = async () => {
      try {
        isLoading.current = true;
        
        // Load networks if not already loaded
        if (networks.length === 0) {
          await loadNetworks();
        }
        
        hasInitialized.current = true;
      } catch (error) {
        console.error('❌ AppInitialization failed:', error);
      } finally {
        isLoading.current = false;
      }
    };

    initializeApp();
  }, []); // Empty dependency array - run only once

  return {
    isInitialized: hasInitialized.current,
    networksLoaded: networks.length > 0,
    isLoading: isLoading.current,
  };
};

export default useAppInitialization;