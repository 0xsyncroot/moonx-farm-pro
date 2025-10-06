// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IMoonXTypes
 * @dev Interface containing all data structures used by MoonX Aggregator
 * @notice This interface defines the data structures for extensible aggregator functionality
 */
interface IMoonXTypes {
    /**
     * @dev Data structures for extensible aggregator functionality
     */
    
    /// @dev Route information for swap execution
    struct SwapRoute {
        address tokenIn;        // 20 bytes - Input token
        address tokenOut;       // 20 bytes - Output token  
        uint8 version;          // 1 byte - DEX version (2=V2, 3=V3, 4=V4)
        uint24 poolFee;         // 3 bytes - Pool fee for V3/V4
        address[] path;         // Dynamic path for V2 or multi-hop
        bytes routeData;        // Additional route data (PoolKey for V4, etc.)
        bytes hookData;         // Hook data for V4 (future extensibility)
    }

    /// @dev Swap execution parameters
    struct SwapExecution {
        uint256 amountIn;       // 32 bytes - Input amount
        uint256 amountOut;      // 32 bytes - Expected output amount  
        uint256 slippage;       // 32 bytes - Slippage tolerance in basis points
        uint256 deadline;       // 32 bytes - Transaction deadline
        address recipient;      // 20 bytes - Final recipient
        bool exactInput;        // 1 byte - true for exact input, false for exact output
        bool useProvidedQuote;  // 1 byte - true: use provided amountOut, false: fetch fresh quote
    }

    /// @dev Referral configuration from external input (only what users can control)
    struct RefConfiguration {
        address refAddress;     // 20 bytes - Referral address
        uint256 refFee;         // 32 bytes - Referral fee in basis points
    }

    /// @dev Internal fee processing data (calculated by contract)
    struct FeeProcessing {
        address refAddress;     // 20 bytes - Referral address (copied from RefConfiguration)
        uint256 refFee;         // 32 bytes - Referral fee in basis points (copied from RefConfiguration)
        uint256 platformFeeAmount; // 32 bytes - Calculated platform fee amount
        uint256 refAmount;      // 32 bytes - Calculated referral amount
        bool feeFromOutput;     // 1 byte - Take fee from output instead of input
    }

    /// @dev Platform configuration and optimization settings
    struct PlatformConfig {
        bool gasOptimization;   // 1 byte - Enable gas optimization
        bool mevProtection;     // 1 byte - Enable MEV protection
        uint8 routeType;        // 1 byte - Route optimization type (0=best_price, 1=fastest, 2=safest)
    }

    /// @dev Cache data for gas optimization and tracking
    struct SwapCache {
        uint256 gasStart;       // 32 bytes - Gas at start
        uint256 balanceBefore;  // 32 bytes - Token balance before swap
        uint256 balanceAfter;   // 32 bytes - Token balance after swap
        bytes32 swapHash;       // 32 bytes - Unique swap identifier
        uint48 timestamp;       // 6 bytes - Swap timestamp
    }

    /// @dev Additional metadata for integrators and advanced features
    struct SwapMetadata {
        string integratorId;    // Integrator identifier
        bytes userData;         // Custom user data
        uint256 nonce;          // User nonce for replay protection
        bytes signature;        // Optional signature for permit
        bool isPermit2;         // Use Permit2 for token approval
        uint8 aggregatorVersion; // Aggregator version for tracking
    }

}