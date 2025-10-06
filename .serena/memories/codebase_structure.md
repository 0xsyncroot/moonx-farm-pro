# MoonX Swap - Codebase Structure

## Root Directory Structure
```
/root/develop/moonx-farm-pro/
├── swap-backend/           # Fastify API server
├── swap-ui/               # Next.js frontend application  
├── .serena/               # Serena AI configuration
├── README.md              # Main project documentation
├── MoonX-Swap-Guide.md    # MoonX contract integration guide
└── .gitignore             # Git ignore rules
```

## Backend Structure (`swap-backend/`)
```
swap-backend/
├── src/
│   ├── controllers/       # HTTP request handlers
│   │   └── SwapController.ts
│   ├── services/          # Business logic layer
│   │   └── SwapService.ts
│   ├── repositories/      # Blockchain interaction layer
│   │   └── BlockchainRepository.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/            # Helper functions and utilities
│   │   └── contracts.ts
│   ├── config/           # Network and environment configuration
│   │   └── networks.ts
│   └── server.ts         # Main application entry point
├── dist/                 # Compiled TypeScript output
├── package.json          # Backend dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── pnpm-lock.yaml        # Package manager lock file
└── README.md             # Backend-specific documentation
```

### Backend Architecture Layers
- **Controllers** (`/controllers`): Handle HTTP requests, validate input, call services
- **Services** (`/services`): Implement business logic, orchestrate operations
- **Repositories** (`/repositories`): Handle blockchain interactions, data persistence
- **Types** (`/types`): TypeScript type definitions and interfaces
- **Utils** (`/utils`): Helper functions, contract ABIs, common utilities
- **Config** (`/config`): Network configurations, constants

### Backend Key Files
- `server.ts`: Fastify server setup, routes, middleware
- `SwapController.ts`: API endpoints for swap operations
- `SwapService.ts`: Business logic for swap operations
- `BlockchainRepository.ts`: Ethers.js blockchain interactions
- `contracts.ts`: Contract ABIs and addresses
- `networks.ts`: Network configurations (Base, etc.)

## Frontend Structure (`swap-ui/`)
```
swap-ui/
├── app/                  # Next.js App Router
│   ├── (pages)/         # Route groups
│   ├── globals.css      # Global styles
│   ├── layout.tsx       # Root layout component
│   └── page.tsx         # Home page
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components
│   ├── forms/          # Form components
│   └── swap/           # Swap-specific components
├── hooks/              # Custom React hooks
│   ├── useWallet.ts    # Wallet management hook
│   └── useTokens.ts    # Token data hook
├── stores/             # Zustand state management
│   ├── walletStore.ts  # Wallet state
│   └── swapStore.ts    # Swap state
├── services/           # API service layer
│   ├── apiService.ts   # Backend API client
│   └── swapService.ts  # Swap operations
├── types/              # TypeScript type definitions
│   └── index.ts
├── utils/              # Helper functions
│   ├── crypto.ts       # Encryption utilities
│   ├── format.ts       # Formatting utilities
│   └── constants.ts    # Application constants
├── providers/          # React context providers
│   └── PrivyProvider.tsx
├── libs/               # Library configurations
├── public/             # Static assets
│   ├── icons/          # Icon files
│   └── images/         # Image assets
├── styles/             # Additional styles (if any)
├── package.json        # Frontend dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── tailwind.config.js  # Tailwind CSS configuration
├── next.config.ts      # Next.js configuration
├── eslint.config.mjs   # ESLint configuration
├── postcss.config.mjs  # PostCSS configuration
├── pnpm-lock.yaml      # Package manager lock file
└── README.md           # Frontend-specific documentation
```

### Frontend Architecture Patterns
- **App Router** (`/app`): Next.js 13+ App Router for pages and layouts
- **Components** (`/components`): Reusable UI components, organized by domain
- **Hooks** (`/hooks`): Custom React hooks for state logic and side effects
- **Stores** (`/stores`): Zustand stores for global state management
- **Services** (`/services`): API clients and business logic
- **Providers** (`/providers`): React context providers for app-wide state
- **Utils** (`/utils`): Pure functions, formatting, validation

### Frontend Key Files
- `layout.tsx`: Root application layout with providers
- `page.tsx`: Main swap interface
- `useWallet.ts`: Wallet connection and management
- `walletStore.ts`: Global wallet state
- `apiService.ts`: Backend API communication
- `crypto.ts`: Client-side encryption for private keys
- `tailwind.config.js`: Custom theme configuration

## Configuration Files

### TypeScript Configuration
- `swap-backend/tsconfig.json`: Backend TS config (CommonJS, ES2020)
- `swap-ui/tsconfig.json`: Frontend TS config (ESNext, DOM types)

### Build Configuration
- `swap-backend/package.json`: Backend scripts and dependencies
- `swap-ui/package.json`: Frontend scripts and dependencies
- `swap-ui/next.config.ts`: Next.js build configuration
- `swap-ui/tailwind.config.js`: Tailwind CSS customization

### Development Configuration
- `swap-ui/eslint.config.mjs`: ESLint rules for code quality
- `swap-ui/postcss.config.mjs`: PostCSS for Tailwind processing

## Documentation Files
- `README.md`: Main project overview and setup instructions
- `MoonX-Swap-Guide.md`: Detailed MoonX contract integration guide
- `swap-backend/README.md`: Backend-specific documentation
- `swap-ui/README.md`: Frontend-specific documentation
- `swap-ui/CONFIGURATION.md`: Configuration details
- `swap-ui/SECURITY-IMPROVEMENTS.md`: Security implementation notes
- `swap-ui/WALLET_AUTO_RECONNECT.md`: Wallet reconnection features

## Environment Files (Not in repo)
```
# Backend environment (.env)
swap-backend/.env:
  - BASE_RPC=https://mainnet.base.org
  - PORT=3001
  - HOST=0.0.0.0

# Frontend environment (.env.local)  
swap-ui/.env.local:
  - NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Development Workflow
1. **Backend**: `cd swap-backend && pnpm dev` (port 3001)
2. **Frontend**: `cd swap-ui && pnpm dev` (port 3000)
3. **Build**: `pnpm build` in respective directories
4. **Type Check**: `pnpm type-check` (frontend), build check (backend)
5. **Lint**: `pnpm lint` (frontend only)