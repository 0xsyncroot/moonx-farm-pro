# MoonX Swap - Project Overview

## Project Purpose
MoonX Swap là một ứng dụng swap token đa chuỗi với giao diện đẹp, tích hợp MoonX contract và hỗ trợ quản lý private key bảo mật.

## Key Features
- **Multi-chain token swapping** - Currently supports Base chain (Chain ID: 8453), ready for expansion
- **Passkey Authentication** - WebAuthn/biometric protection for private keys
- **Real contract integration** - No mocking, direct integration with MoonX contract at `0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630`
- **Advanced wallet management** - Generate random wallets, encrypted storage, multiple wallet support
- **Real-time token balances** - Using Multicall3 for efficient batch operations
- **Smart routing** - MEV protection and optimal swap routes
- **Beautiful UI** - MoonX Farm style (black/green/purple theme, now orange/black)

## Project Structure
This is a monorepo with two main applications:
- `swap-backend/` - Fastify API server
- `swap-ui/` - Next.js frontend application

## Target Networks
- **Primary**: Base Chain (8453)
- **Planned**: Ethereum, Polygon, Arbitrum, BSC

## Key Contracts
- **MoonX Swap Contract**: `0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630`
- **Multicall3**: Used for efficient token balance fetching
- **Supports versions 2, 3, and 4** of various DEX protocols

## Development Philosophy
- Clean Architecture pattern
- No mocking/faking - real integrations only
- Type-safe throughout (TypeScript strict mode)
- Modular component structure
- Security-first approach for private key handling