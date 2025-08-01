'use client';

import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

interface PrivyProviderProps {
  children: React.ReactNode;
}

const PrivyProvider: React.FC<PrivyProviderProps> = ({ children }) => {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Show error if Privy is not configured
  if (!privyAppId) {
    console.warn('Privy App ID not configured. Set NEXT_PUBLIC_PRIVY_APP_ID in your .env.local file');
    return <>{children}</>;
  }

  return (
    <BasePrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#ff4d00',
          logo: '/icons/logo.png',
        },
        embeddedWallets: {
          createOnLogin: 'off',
          requireUserPasswordOnCreate: false,
        },
        loginMethods: ['wallet'],
        defaultChain: base,
        supportedChains: [base, baseSepolia, sepolia, mainnet], // Start with Base, expand later
        mfa: {
          noPromptOnMfaRequired: false,
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
};

export default PrivyProvider; 