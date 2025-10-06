# MoonX Swap - Code Style & Conventions

## TypeScript Configuration

### Backend (swap-backend)
- **Target**: ES2020
- **Module**: CommonJS  
- **Strict Mode**: Enabled
- **Output**: `./dist` directory
- **Source Maps**: Enabled
- **Declarations**: Generated with maps

### Frontend (swap-ui)  
- **Target**: ES2017
- **Module**: ESNext with bundler resolution
- **Strict Mode**: Enabled
- **JSX**: Preserve (handled by Next.js)
- **Path Aliases**: `@/*` → `./*`
- **No Emit**: true (handled by Next.js)

## Code Style Guidelines

### General Principles
- **No mocking/faking solutions** - Always use real integrations
- **Clean Architecture** - Proper separation of concerns
- **Type Safety First** - Full TypeScript with strict mode
- **Modular Structure** - Separated components, hooks, stores
- **Security Focused** - Especially for private key handling
- **Error Reporting** - Immediate error reporting, no silent failures

### Naming Conventions
- **Files**: PascalCase for components (`SwapController.ts`, `SwapService.ts`)
- **Directories**: lowercase with hyphens (`swap-backend`, `swap-ui`)
- **Components**: PascalCase (`SwapButton`, `TokenSelector`)
- **Variables/Functions**: camelCase (`getTokenBalance`, `swapService`)
- **Constants**: UPPER_SNAKE_CASE (`BASE_RPC`, `MOONX_CONTRACT`)
- **Types/Interfaces**: PascalCase (`SwapQuote`, `TokenInfo`)

### File Organization

#### Backend Structure
```
src/
├── controllers/    # HTTP request handlers (PascalCase)
├── services/      # Business logic (PascalCase) 
├── repositories/  # Blockchain interactions (PascalCase)
├── types/         # TypeScript type definitions
├── utils/         # Helper functions and utilities
├── config/        # Network and environment configuration
└── server.ts      # Main application entry point
```

#### Frontend Structure
```
app/              # Next.js App Router pages
components/       # Reusable UI components (PascalCase)
hooks/           # Custom React hooks (use prefix)
stores/          # Zustand state stores (PascalCase + 'Store')
services/        # API service layer (PascalCase + 'Service')
types/           # TypeScript type definitions
utils/           # Helper functions
providers/       # React context providers (PascalCase + 'Provider')
libs/            # Library configurations
```

## ESLint Configuration
- **Base**: Next.js Core Web Vitals
- **TypeScript**: Next.js TypeScript rules
- **Config Format**: Flat config (ESM)

## Import/Export Conventions
```typescript
// Prefer named exports
export const SwapService = {
  // ...
};

// Default exports for components
export default function SwapButton() {
  // ...
}

// Type imports
import type { SwapQuote } from '@/types';

// Regular imports
import { ethers } from 'ethers';
```

## Component Conventions

### React Components
- Use function components with hooks
- Props interface with descriptive names
- Proper TypeScript typing for all props
- Consistent file naming (PascalCase)

### State Management (Zustand)
```typescript
// Store naming: PascalCase + 'Store'
export const useWalletStore = create<WalletState>((set) => ({
  // ...
}));
```

### API Services
```typescript
// Service naming: PascalCase + 'Service'
export class SwapService {
  // Methods in camelCase
  async getQuote(): Promise<SwapQuote> {
    // ...
  }
}
```

## Environment Configuration
- **Backend**: `.env` file with uppercase variables
- **Frontend**: `.env.local` with `NEXT_PUBLIC_` prefix for client-side
- **No hardcoded values** - Use environment variables
- **Validation**: Check required environment variables on startup

## Error Handling
- **Comprehensive error handling** with proper HTTP status codes
- **Type-safe error responses**
- **No silent failures** - Always report errors immediately
- **User-friendly error messages** for frontend
- **Detailed logging** for backend debugging

## Security Conventions
- **Private keys**: Client-side encryption only, never transmitted
- **Input validation**: Validate all user inputs
- **CORS**: Properly configured for API endpoints
- **Headers**: Remove unnecessary headers (`poweredByHeader: false`)
- **Console cleanup**: Remove console.log in production builds

## Documentation Standards
- **Clear, concise comments** for complex logic
- **Type documentation** for complex types
- **API documentation** with exact inputs/outputs
- **No irrelevant examples** - focus on actual usage
- **Update README** when adding new features