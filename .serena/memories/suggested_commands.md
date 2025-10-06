# MoonX Swap - Suggested Commands

## Project Setup Commands
```bash
# Navigate to project root
cd /root/develop/moonx-farm-pro

# Install dependencies for both backend and frontend
cd swap-backend && pnpm install
cd ../swap-ui && pnpm install
```

## Backend Development Commands
```bash
cd swap-backend

# Development
pnpm dev              # Start development server with nodemon + ts-node
pnpm build            # Compile TypeScript to dist/
pnpm start            # Run compiled production build

# Environment setup
# Create .env file with:
# BASE_RPC=https://mainnet.base.org
# PORT=3001
# HOST=0.0.0.0
```

## Frontend Development Commands
```bash
cd swap-ui

# Development
pnpm dev              # Start Next.js development server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm type-check       # Run TypeScript type checking
pnpm clean            # Clean build artifacts

# Environment setup  
# Create .env.local file with:
# NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Quality Assurance Commands
```bash
# TypeScript type checking
cd swap-backend && pnpm build    # Builds and type-checks backend
cd swap-ui && pnpm type-check    # Type-check frontend without build

# Linting
cd swap-ui && pnpm lint          # ESLint for frontend (Next.js rules)

# Build verification
cd swap-backend && pnpm build    # Verify backend builds successfully
cd swap-ui && pnpm build         # Verify frontend builds successfully
```

## Running the Full Application
```bash
# Terminal 1 - Backend
cd swap-backend
pnpm dev

# Terminal 2 - Frontend  
cd swap-ui
pnpm dev

# Access application at http://localhost:3000
# API available at http://localhost:3001
```

## System Commands (Linux/WSL2)
```bash
# File operations
ls -la                # List files with details
find . -name "*.ts"   # Find TypeScript files
grep -r "pattern"     # Search in files
cd /path/to/dir       # Change directory

# Git operations
git status            # Check git status
git add .             # Stage changes
git commit -m "msg"   # Commit changes
git push              # Push to remote
git pull              # Pull from remote

# Process management
ps aux | grep node    # Find running Node processes
kill -9 <PID>         # Kill process by PID
netstat -tulpn        # Check port usage
```

## Debugging Commands
```bash
# Check running processes
ps aux | grep -E "(node|next)"

# Check port usage
netstat -tulpn | grep -E "(3000|3001)"

# View logs
cd swap-backend && pnpm dev     # Backend logs with Fastify logger
cd swap-ui && pnpm dev          # Frontend logs with Next.js

# Build troubleshooting
cd swap-backend && pnpm build 2>&1 | tee build.log
cd swap-ui && pnpm build 2>&1 | tee build.log
```

## Package Management
```bash
# Update dependencies
pnpm update           # Update packages
pnpm outdated         # Check outdated packages
pnpm audit            # Security audit

# Add new packages
pnpm add <package>    # Add runtime dependency
pnpm add -D <package> # Add dev dependency

# Clean and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install          # Fresh install
```