import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { networkService, type NetworkServiceResult } from '@/services';
import type { Network, RPCSettings, WalletConfig } from '@/types/api';

// Re-export types for convenience
export type { RPCSettings, WalletConfig } from '@/types/api';

// Network state
interface NetworkState {
  networks: Network[];
  selectedNetwork: Network | null;
  rpcSettings: RPCSettings;
  walletConfig: WalletConfig;
}

// Network actions
interface NetworkActions {
  setNetworks: (networks: Network[]) => void;
  setSelectedNetwork: (network: Network | null) => void;
  setRpcSettings: (settings: RPCSettings) => void;
  setWalletConfig: (config: WalletConfig) => void;
  loadNetworks: () => Promise<void>;
  resetNetworkState: () => void;
}

type NetworkStore = NetworkState & NetworkActions;

const initialState: NetworkState = {
  networks: [],
  selectedNetwork: null,
  rpcSettings: {
    baseRpcUrl: 'https://mainnet.base.org',
    customRpcUrl: undefined,
    useCustomRpc: false,
  },
  walletConfig: {
    walletType: 'privy',
    privateKey: undefined,
  },
};

export const useNetworkStore = create<NetworkStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Basic setters
      setNetworks: (networks) => set({ networks }),
      setSelectedNetwork: (selectedNetwork) => set({ selectedNetwork }),
      setRpcSettings: (rpcSettings) => set({ rpcSettings }),
      setWalletConfig: (walletConfig) => set({ walletConfig }),

      // Load networks using NetworkService
      loadNetworks: async () => {
        try {
          const result: NetworkServiceResult<Network[]> = await networkService.loadNetworks();
          
          if (result.success && result.data) {
            set({ networks: result.data });
            
            // Set default network if none selected
            const { selectedNetwork: currentNetwork } = get();
            if (result.data.length > 0 && !currentNetwork) {
              const defaultNetwork = networkService.getDefaultNetwork(result.data);
              set({ selectedNetwork: defaultNetwork });
            }
          } else {
            // Even if not success, we might have fallback data
            if (result.data) {
              set({ networks: result.data });
              
              // Try to set default network even with fallback data
              const { selectedNetwork: currentNetwork } = get();
              if (result.data.length > 0 && !currentNetwork) {
                const defaultNetwork = networkService.getDefaultNetwork(result.data);
                console.log('🔧 NetworkStore: Setting fallback default network:', defaultNetwork?.name);
                set({ selectedNetwork: defaultNetwork });
              }
            }
          }
        } catch (error) {
          console.error('🚨 NetworkStore: loadNetworks failed:', error);
          // Silent error handling - errors will be shown in UI via store
        }
      },

      // Reset state
      resetNetworkState: () => set(initialState),
    }),
    { name: 'network-store' }
  )
);

// Selectors
export const useNetworkState = () => useNetworkStore(useShallow((state) => ({
  networks: state.networks,
  selectedNetwork: state.selectedNetwork,
  rpcSettings: state.rpcSettings,
  walletConfig: state.walletConfig,
  setNetworks: state.setNetworks,
  setSelectedNetwork: state.setSelectedNetwork,
  setRpcSettings: state.setRpcSettings,
  setWalletConfig: state.setWalletConfig,
  loadNetworks: state.loadNetworks,
  resetNetworkState: state.resetNetworkState,
})));

export const useSelectedNetwork = () => useNetworkStore(state => state.selectedNetwork);
export const useNetworks = () => useNetworkStore(state => state.networks);
export const useRpcSettings = () => useNetworkStore(state => state.rpcSettings);
export const useWalletConfig = () => useNetworkStore(state => state.walletConfig);