import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { networkService, type NetworkServiceResult } from '@/services';
import type { Network, RPCSettings } from '@/types/api';

// Re-export types for convenience
export type { RPCSettings } from '@/types/api';

// Network state
interface NetworkState {
  networks: Network[];
  selectedNetwork: Network | null;
  rpcSettings: RPCSettings;
}

// Network actions
interface NetworkActions {
  setNetworks: (networks: Network[]) => void;
  setSelectedNetwork: (network: Network | null) => void;
  setRpcSettings: (settings: RPCSettings) => void;
  loadNetworks: () => Promise<void>;
  resetNetworkState: () => void;
  // Force sync selectedNetwork with available networks
  syncSelectedNetwork: () => void;
}

type NetworkStore = NetworkState & NetworkActions;

// Helper function to validate selectedNetwork against available networks
const validateSelectedNetwork = (currentNetwork: Network | null, availableNetworks: Network[]): Network | null => {
  if (!availableNetworks.length) return null;
  
  // If no current network, use default
  if (!currentNetwork) {
    return networkService.getDefaultNetwork(availableNetworks);
  }
  
  // Check if current network still exists in available networks by id
  const foundNetwork = availableNetworks.find(network => network.id === currentNetwork.id);
  
  // If found, return the fresh network object (in case of updates)
  if (foundNetwork) {
    return foundNetwork;
  }
  
  // If not found, fallback to default
  console.warn('🚨 NetworkStore: Selected network not found in available networks:', {
    selected: { id: currentNetwork.id, name: currentNetwork.name, chainId: currentNetwork.chainId },
    available: availableNetworks.map(n => ({ id: n.id, name: n.name, chainId: n.chainId }))
  });
  return networkService.getDefaultNetwork(availableNetworks);
};

const initialState: NetworkState = {
  networks: [],
  selectedNetwork: null,
  rpcSettings: {
    baseRpcUrl: '', // Will be set dynamically from selectedNetwork.rpc
    customRpcUrl: undefined,
    useCustomRpc: false,
  },
};

export const useNetworkStore = create<NetworkStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Basic setters
        setNetworks: (networks: Network[]) => set({ networks }),
        setSelectedNetwork: (selectedNetwork: Network | null) => {
          const { selectedNetwork: currentNetwork, rpcSettings } = get();
          console.log('🔧 NetworkStore: setSelectedNetwork called:', {
            from: currentNetwork ? { id: currentNetwork.id, name: currentNetwork.name, chainId: currentNetwork.chainId, rpc: currentNetwork.rpc } : null,
            to: selectedNetwork ? { id: selectedNetwork.id, name: selectedNetwork.name, chainId: selectedNetwork.chainId, rpc: selectedNetwork.rpc } : null
          });
          
          // Update RPC settings when network changes (only if not using custom RPC)
          const newRpcSettings = rpcSettings.useCustomRpc ? rpcSettings : {
            ...rpcSettings,
            baseRpcUrl: selectedNetwork?.rpc || rpcSettings.baseRpcUrl
          };
          
          if (!rpcSettings.useCustomRpc && selectedNetwork?.rpc !== rpcSettings.baseRpcUrl) {
            console.log('🔧 NetworkStore: Updating baseRpcUrl:', {
              from: rpcSettings.baseRpcUrl,
              to: selectedNetwork?.rpc || rpcSettings.baseRpcUrl
            });
          }
          
          set({ selectedNetwork, rpcSettings: newRpcSettings });
        },
        setRpcSettings: (rpcSettings: RPCSettings) => set({ rpcSettings }),

        // Load networks using NetworkService
        loadNetworks: async () => {
          try {
            const result: NetworkServiceResult<Network[]> = await networkService.loadNetworks();
            if (result.success && result.data) {
              set({ networks: result.data });
              
              // Validate and sync selectedNetwork with loaded networks
              const { selectedNetwork: currentNetwork } = get();
              const validatedNetwork = validateSelectedNetwork(currentNetwork, result.data);
              
              if (validatedNetwork !== currentNetwork) {
                console.log('🔧 NetworkStore: Updating selectedNetwork:', {
                  from: currentNetwork ? { id: currentNetwork.id, name: currentNetwork.name } : null,
                  to: validatedNetwork ? { id: validatedNetwork.id, name: validatedNetwork.name } : null,
                  reason: !currentNetwork ? 'no_selection' : 'network_not_found'
                });
                // Use setSelectedNetwork to trigger RPC update
                get().setSelectedNetwork(validatedNetwork);
              }
            } else {
              // Even if not success, we might have fallback data
              if (result.data) {
                set({ networks: result.data });
                
                // Validate and sync selectedNetwork with fallback data
                const { selectedNetwork: currentNetwork } = get();
                const validatedNetwork = validateSelectedNetwork(currentNetwork, result.data);
                
                if (validatedNetwork !== currentNetwork) {
                  console.log('🔧 NetworkStore: Setting fallback network:', 
                    validatedNetwork ? { id: validatedNetwork.id, name: validatedNetwork.name } : null
                  );
                  // Use setSelectedNetwork to trigger RPC update
                  get().setSelectedNetwork(validatedNetwork);
                }
              }
            }
          } catch (error) {
            console.error('🚨 NetworkStore: loadNetworks failed:', error);
            // Silent error handling - errors will be shown in UI via store
          }
        },

        // Force sync selectedNetwork with available networks
        syncSelectedNetwork: () => {
          const { selectedNetwork: currentNetwork, networks } = get();
          const validatedNetwork = validateSelectedNetwork(currentNetwork, networks);
          
          if (validatedNetwork !== currentNetwork) {
            console.log('🔧 NetworkStore: Syncing selectedNetwork:', {
              from: currentNetwork ? { id: currentNetwork.id, name: currentNetwork.name } : null,
              to: validatedNetwork ? { id: validatedNetwork.id, name: validatedNetwork.name } : null
            });
            set({ selectedNetwork: validatedNetwork });
          }
        },

        // Reset state
        resetNetworkState: () => set(initialState),
      }),
      {
        name: 'moonx-network-store',
        // Only persist settings that should survive page refresh
        partialize: (state) => ({
          rpcSettings: state.rpcSettings,
          selectedNetwork: state.selectedNetwork,
        }),
        // Custom merge function to validate persisted selectedNetwork
        merge: (persistedState: any, currentState: any) => {
          console.log('🔧 NetworkStore: Merging persisted state:', {
            persisted: persistedState?.selectedNetwork ? {
              id: persistedState.selectedNetwork.id,
              name: persistedState.selectedNetwork.name,
              chainId: persistedState.selectedNetwork.chainId
            } : null
          });
          
          return {
            ...currentState,
            ...persistedState,
            // Note: selectedNetwork validation will happen in loadNetworks()
          };
        },
      }
    ),
    { name: 'network-store' }
  )
);

// Selectors
export const useNetworkState = () => useNetworkStore(useShallow((state) => ({
  networks: state.networks,
  selectedNetwork: state.selectedNetwork,
  rpcSettings: state.rpcSettings,
  setNetworks: state.setNetworks,
  setSelectedNetwork: state.setSelectedNetwork,
  setRpcSettings: state.setRpcSettings,
  loadNetworks: state.loadNetworks,
  syncSelectedNetwork: state.syncSelectedNetwork,
  resetNetworkState: state.resetNetworkState,
})));

export const useSelectedNetwork = () => useNetworkStore(state => state.selectedNetwork);
export const useNetworks = () => useNetworkStore(state => state.networks);
export const useRpcSettings = () => useNetworkStore(state => state.rpcSettings);