# MoonX Swap - Tech Stack & Architecture

## Backend Technology Stack
- **Framework**: Fastify v5.4.0
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js (CommonJS modules)
- **Blockchain**: Ethers.js v6.15.0
- **HTTP Client**: Axios v1.11.0
- **Environment**: dotenv for configuration
- **Architecture**: Clean Architecture pattern

### Backend Architecture Layers
```
Controllers → Services → Repositories
```
- **Controllers**: HTTP request handlers (`SwapController`)
- **Services**: Business logic (`SwapService`) 
- **Repositories**: Blockchain interactions (`BlockchainRepository`)
- **Types**: TypeScript type definitions
- **Utils**: Helper functions and contract utilities
- **Config**: Network configurations

## Frontend Technology Stack
- **Framework**: Next.js 15.1.7 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v3.4.1
- **State Management**: Zustand v5.0.2
- **Authentication**: @privy-io/react-auth v1.93.0 (Passkey/WebAuthn)
- **Blockchain**: ethers v6.13.4, viem v2.21.53, wagmi v2.16.0
- **HTTP Client**: Axios v1.11.0
- **Queries**: @tanstack/react-query v5.83.0
- **Encryption**: crypto-js v4.2.0
- **UI Components**: lucide-react (icons), react-number-format
- **Utils**: clsx, tailwind-merge, numeral

### Frontend Architecture
```
app/                 # Next.js App Router
├── components/      # Reusable UI components  
├── hooks/          # Custom React hooks
├── stores/         # Zustand state stores
├── services/       # API service layer
├── types/          # TypeScript type definitions
├── utils/          # Helper functions
├── providers/      # React context providers
└── libs/           # Library configurations
```

## Package Management
- **Package Manager**: pnpm (v9.0.0+)
- **Node Version**: >=18.0.0
- **Workspace**: Monorepo structure with separate lock files
- **Build Target**: ES2020 (backend), ES2017 (frontend)

## Key Development Tools
- **TypeScript**: v5+ with strict mode enabled
- **ESLint**: Next.js configuration with TypeScript support
- **Dev Server**: nodemon + ts-node (backend), Next.js dev (frontend)
- **Build System**: TypeScript compiler (backend), Next.js build (frontend)