// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IV4Quoter} from "@uniswap/v4-periphery/src/interfaces/IV4Quoter.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {RouterErrors} from "../errors/RouterErrors.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {ICoinV4} from "../interfaces/ICoinV4.sol";
import {PathKey, PathKeyLibrary} from "../libraries/uniswap/PathKey.sol";

// Uniswap V2 Interfaces
interface IUniswapV2Factory {
    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair);
}

interface IUniswapV2Router02 {
    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) external view returns (uint[] memory amounts);
}

interface IUniswapV2Pair {
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function token0() external view returns (address);

    function token1() external view returns (address);
}

// Uniswap V3 Interfaces
interface IUniswapV3Factory {
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);
}

interface IUniswapV3Pool {
    function liquidity() external view returns (uint128);

    function token0() external view returns (address);

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(
        QuoteExactInputSingleParams calldata params
    )
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}

// V4 State Library for liquidity checks
interface IStateLibrary {
    function getLiquidity(
        bytes32 poolId
    ) external view returns (uint128 liquidity);

    function getSlot0(
        bytes32 poolId
    ) external view returns (uint160 sqrtPriceX96, int24 tick);
}

contract MoonxAggregator {
    address public constant ETH_ADDRESS =
        0x0000000000000000000000000000000000000000;

    // WETH address for ETH conversion
    address public immutable WETH;

    // Uniswap V2
    IUniswapV2Factory public immutable v2Factory;
    IUniswapV2Router02 public immutable v2Router;

    // Uniswap V3
    IUniswapV3Factory public immutable v3Factory;
    IQuoterV2 public immutable v3Quoter;

    // Uniswap V4
    IV4Quoter public immutable v4Quoter;
    IStateLibrary public immutable stateLibrary;

    struct QuoteResult {
        uint256 amountOut; // Most important field first
        uint128 liquidity; // Pool liquidity
        uint24 fee; // For V3/V4 (packed with next fields)
        uint8 version; // 2, 3, or 4 (packed)
        address hooks; // For V4 (160 bits)
        address[] path; // For V2 (keep dynamic at end)
        bytes routeData; // For V4 (keep dynamic at end)
    }

    // Simple route input for auto-discovery
    struct QuoteParams {
        address[] path; // Token path: [tokenA, tokenB, tokenC, ...]
        uint256 amountIn; // Input amount
        bytes v4Data; // Optional: PathKey[] encoded data for V4 specific routing
    }

    constructor(
        address _weth,
        address _v2Factory,
        address _v2Router,
        address _v3Factory,
        address _v3Quoter,
        address _v4Quoter,
        address _stateLibrary
    ) {
        require(_weth != address(0), "Invalid WETH address");
        WETH = _weth;
        v2Factory = IUniswapV2Factory(_v2Factory);
        v2Router = IUniswapV2Router02(_v2Router);
        v3Factory = IUniswapV3Factory(_v3Factory);
        v3Quoter = IQuoterV2(_v3Quoter);
        v4Quoter = IV4Quoter(_v4Quoter);
        stateLibrary = IStateLibrary(_stateLibrary);

        // V4 uses direct poolKey lookup instead of scanning
    }

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

    /**
     * @notice Get best quote across all Uniswap versions with automatic discovery
     * @param args: params for quote
     */
    function moonxGetQuote(
        bytes[] calldata args
    ) external returns (QuoteResult memory result) {
        if (args.length == 0) {
            revert RouterErrors.InvalidArgsLength();
        }

        // Decode QuoteParams from args[0]
        QuoteParams memory params = abi.decode(args[0], (QuoteParams));
        
        if (params.path.length < 2 || params.amountIn == 0) {
            revert RouterErrors.InvalidArgsLength();
        }

        uint256 bestAmountOut;

        // Convert ETH addresses to WETH for Uniswap compatibility
        address[] memory uniPath = new address[](params.path.length);
        for (uint256 i; i < params.path.length;) {
            uniPath[i] = _convertToken(params.path[i]);
            unchecked { ++i; }
        }

        // 1. Try V2 multihop
        {
            QuoteResult memory v2Quote = _quoteV2Multihop(uniPath, params.amountIn);
            if (v2Quote.amountOut > bestAmountOut) {
                result = v2Quote;
                bestAmountOut = v2Quote.amountOut;
            }
        }

        // 2. Try V3 multihop with common fee tiers
        {
            QuoteResult memory v3Quote = _quoteV3Multihop(uniPath, params.amountIn);
            if (v3Quote.amountOut > bestAmountOut) {
                result = v3Quote;
                bestAmountOut = v3Quote.amountOut;
            }
        }

        // 3. Try V4 with direct lookup (existing logic)
        if (uniPath.length == 2) {
            QuoteResult memory v4Quote = _quoteV4(
                uniPath[0],
                uniPath[1],
                params.amountIn
            );
            if (v4Quote.amountOut > bestAmountOut) {
                result = v4Quote;
                bestAmountOut = v4Quote.amountOut;
            }
        }

        // 4. Try V4 with provided PathKey data (if available)
        if (params.v4Data.length > 0) {
            QuoteResult memory v4CustomQuote = _quoteV4WithPathKeys(
                uniPath,
                params.amountIn,
                params.v4Data
            );
            if (v4CustomQuote.amountOut > bestAmountOut) {
                result = v4CustomQuote;
            }
        }
    }



    /**
     * @notice Quote V2 multihop automatically
     */
    function _quoteV2Multihop(
        address[] memory path,
        uint256 amountIn
    ) internal view returns (QuoteResult memory result) {
        if (path.length < 2) return result;

        uint256 amountOut = amountIn;
        
        // Process multihop: path[0] -> path[1] -> path[2] -> ...
        for (uint256 i; i < path.length - 1;) {
            QuoteResult memory stepResult = _quoteV2(
                path[i],
                path[i + 1],
                amountOut
            );
            
            if (stepResult.amountOut == 0) {
                return result; // Failed step, return empty result
            }
            
            amountOut = stepResult.amountOut;
            unchecked { ++i; }
        }

        result.version = 2;
        result.amountOut = amountOut;
        result.path = path;
    }

    /**
     * @notice Quote V3 multihop with automatic fee discovery
     */
    function _quoteV3Multihop(
        address[] memory path,
        uint256 amountIn
    ) internal returns (QuoteResult memory result) {
        if (path.length < 2) return result;

        uint24[] memory commonFees = new uint24[](4);
        commonFees[0] = 100;    // 0.01%
        commonFees[1] = 500;    // 0.05%
        commonFees[2] = 3000;   // 0.3%
        commonFees[3] = 10000;  // 1%

        uint256 bestAmountOut;
        QuoteResult memory bestResult;

        // Try different fee combinations for multihop
        if (path.length == 2) {
            // Simple hop - try all fee tiers
            for (uint256 i; i < commonFees.length;) {
                QuoteResult memory stepResult = _quoteV3(
                    path[0],
                    path[1],
                    amountIn,
                    commonFees[i]
                );
                
                if (stepResult.amountOut > bestAmountOut) {
                    bestResult = stepResult;
                    bestAmountOut = stepResult.amountOut;
                    // Ensure path is set for simple hop
                    bestResult.path = path;
                }
                
                unchecked { ++i; }
            }
        } else {
            // Multihop - try common fee for all hops
            for (uint256 feeIdx; feeIdx < commonFees.length;) {
                uint256 amountOut = amountIn;
                bool failed = false;
                uint128 totalLiquidity;
                
                // Try this fee for all hops
                for (uint256 i; i < path.length - 1;) {
                    QuoteResult memory stepResult = _quoteV3(
                        path[i],
                        path[i + 1],
                        amountOut,
                        commonFees[feeIdx]
                    );
                    
                    if (stepResult.amountOut == 0) {
                        failed = true;
                        break;
                    }
                    
                    amountOut = stepResult.amountOut;
                    totalLiquidity += stepResult.liquidity;
                    unchecked { ++i; }
                }
                
                if (!failed && amountOut > bestAmountOut) {
                    bestResult.version = 3;
                    bestResult.amountOut = amountOut;
                    bestResult.path = path;
                    bestResult.fee = commonFees[feeIdx];
                    bestResult.liquidity = totalLiquidity / uint128(path.length - 1);
                    bestAmountOut = amountOut;
                }
                
                unchecked { ++feeIdx; }
            }
        }

        return bestResult;
    }

    /**
     * @notice Quote V4 with custom PathKey data
     */
    function _quoteV4WithPathKeys(
        address[] memory path,
        uint256 amountIn,
        bytes memory pathKeyData
    ) internal returns (QuoteResult memory result) {
        if (pathKeyData.length == 0) return result;

        try this._decodeAndQuoteV4PathKeys(pathKeyData, path, amountIn) returns (
            uint256 amountOut
        ) {
            if (amountOut > 0) {
                result.version = 4;
                result.amountOut = amountOut;
                result.path = path;
                result.routeData = pathKeyData;
            }
        } catch {
            // Failed to decode or quote with PathKeys
        }
    }

    /**
     * @notice External function for try/catch with PathKey decoding
     */
    function _decodeAndQuoteV4PathKeys(
        bytes memory pathKeyData,
        address[] memory path,
        uint256 amountIn
    ) external returns (uint256 amountOut) {
        PathKey[] memory pathKeys = abi.decode(pathKeyData, (PathKey[]));
        
        if (pathKeys.length == 0) return 0;

        uint256 currentAmount = amountIn;
        Currency currentCurrency = Currency.wrap(path[0]);
        
        // Process multihop using PathKeys
        for (uint256 i; i < pathKeys.length;) {
            PathKey memory pathKey = pathKeys[i];
            
            // Get pool and swap direction
            (PoolKey memory poolKey, ) = 
                PathKeyLibrary.getPoolAndSwapDirection(pathKey, currentCurrency);

            // Quote this hop
            QuoteResult memory stepResult = _quoteV4Pool(
                poolKey,
                Currency.unwrap(currentCurrency),
                Currency.unwrap(pathKey.intermediateCurrency),
                currentAmount
            );
            
            if (stepResult.amountOut == 0) {
                return 0; // Failed step
            }
            
            currentAmount = stepResult.amountOut;
            currentCurrency = pathKey.intermediateCurrency;
            
            unchecked { ++i; }
        }

        return currentAmount;
    }

    /**
     * @notice Convert ETH address to WETH for Uniswap compatibility
     */
    function _convertToken(
        address token
    ) internal view returns (address) {
        return token == ETH_ADDRESS ? WETH : token;
    }

    /**
     * @notice Quote Uniswap V2 using manual calculation from reserves
     */
    function _quoteV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (QuoteResult memory result) {
        address pair = v2Factory.getPair(tokenIn, tokenOut);
        if (pair == address(0)) return result;

        try IUniswapV2Pair(pair).getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32
        ) {
            address token0 = IUniswapV2Pair(pair).token0();

            (uint256 reserveIn, uint256 reserveOut) = tokenIn == token0
                ? (uint256(reserve0), uint256(reserve1))
                : (uint256(reserve1), uint256(reserve0));

            if (reserveIn > 0 && reserveOut > 0) {
                uint256 amountInWithFee = amountIn * 997;
                uint256 numerator = amountInWithFee * reserveOut;
                uint256 denominator = (reserveIn * 1000) + amountInWithFee;
                uint256 amountOut = numerator / denominator;

                address[] memory path = new address[](2);
                path[0] = tokenIn;
                path[1] = tokenOut;

                result.version = 2;
                result.amountOut = amountOut;
                result.path = path;
            }
        } catch {
            // Calculation failed, return empty result
        }
    }

    /**
     * @notice Quote Uniswap V3
     */
    function _quoteV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee
    ) internal returns (QuoteResult memory result) {
        address pool = v3Factory.getPool(tokenIn, tokenOut, fee);
        if (pool == address(0)) return result;

        // Check if pool has liquidity and get pool info
        try IUniswapV3Pool(pool).liquidity() returns (uint128 liquidity) {
            if (liquidity == 0) return result;

            // Get current sqrt price and pool tokens
            (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
            if (sqrtPriceX96 == 0) return result;

            address token0 = IUniswapV3Pool(pool).token0();

            // Determine swap direction: zeroForOne = true if swapping token0 -> token1
            bool zeroForOne = tokenIn == token0;

            // Set price limit to prevent excessive slippage (5% from current price)
            // zeroForOne = true: price decreases, set lower limit
            // zeroForOne = false: price increases, set upper limit
            uint160 sqrtPriceLimitX96;
            if (zeroForOne) {
                // Swapping token0 -> token1: price decreases, set 5% lower limit
                sqrtPriceLimitX96 = (sqrtPriceX96 * 95) / 100;
                // Ensure limit is not zero
                if (sqrtPriceLimitX96 == 0) sqrtPriceLimitX96 = 1;
            } else {
                // Swapping token1 -> token0: price increases, set 5% upper limit
                sqrtPriceLimitX96 = (sqrtPriceX96 * 105) / 100;
                // Ensure limit doesn't overflow
                if (sqrtPriceLimitX96 < sqrtPriceX96)
                    sqrtPriceLimitX96 = type(uint160).max;
            }

            try
                v3Quoter.quoteExactInputSingle(
                    IQuoterV2.QuoteExactInputSingleParams({
                        tokenIn: tokenIn,
                        tokenOut: tokenOut,
                        amountIn: amountIn,
                        fee: fee,
                        sqrtPriceLimitX96: sqrtPriceLimitX96
                    })
                )
            returns (
                uint256 amountOut,
                uint160 /* sqrtPriceX96After */,
                uint32 /* initializedTicksCrossed */,
                uint256 /* gasEstimate */
            ) {
                result.version = 3;
                result.amountOut = amountOut;
                result.fee = fee;
                result.liquidity = liquidity;
                // Optional: Store additional QuoterV2 data for analysis
                // sqrtPriceX96After, initializedTicksCrossed, gasEstimate can be used if needed
            } catch {
                // Quote failed, return empty result
            }
        } catch {
            // Pool state check failed, return empty result
        }
    }

    /**
     * @notice Quote Uniswap V4 - Simplified with only direct token lookup
     */
    function _quoteV4(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (QuoteResult memory result) {
        // Only try direct ICoinV4 lookup for special V4 tokens
        return _tryDirectV4Quote(tokenIn, tokenOut, amountIn);
    }

    /**
     * @notice Try to get V4 quote directly from ICoinV4 coins
     */
    function _tryDirectV4Quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (QuoteResult memory result) {
        // Check tokenIn first
        if (_hasValidHooks(tokenIn)) {
            try ICoinV4(tokenIn).getPoolKey() returns (PoolKey memory poolKey) {
                return _quoteV4Pool(poolKey, tokenIn, tokenOut, amountIn);
            } catch {}
        }

        // Check tokenOut if tokenIn failed
        if (_hasValidHooks(tokenOut)) {
            try ICoinV4(tokenOut).getPoolKey() returns (
                PoolKey memory poolKey
            ) {
                return _quoteV4Pool(poolKey, tokenIn, tokenOut, amountIn);
            } catch {}
        }

        return result; // Empty result
    }

    /**
     * @notice Check if token has valid hooks (gas optimized)
     */
    function _hasValidHooks(address token) internal view returns (bool) {
        if (token == address(0) || token == ETH_ADDRESS) return false;

        // Skip WETH and other known non-hook tokens to avoid StateChangeDuringStaticCall
        if (token == WETH) return false;

        try ICoinV4(token).hooks() returns (IHooks hooks) {
            return address(hooks) != address(0);
        } catch {
            return false;
        }
    }

    /**
     * @notice Quote a specific V4 pool
     */
    function _quoteV4Pool(
        PoolKey memory poolKey,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (QuoteResult memory result) {
        bool zeroForOne = tokenIn < tokenOut;
        bytes32 poolId = keccak256(abi.encode(poolKey));

        try stateLibrary.getLiquidity(poolId) returns (uint128 liquidity) {
            if (liquidity == 0) return result;

            try
                v4Quoter.quoteExactInputSingle(
                    IV4Quoter.QuoteExactSingleParams({
                        poolKey: poolKey,
                        zeroForOne: zeroForOne,
                        exactAmount: uint128(amountIn),
                        hookData: ""
                    })
                )
            returns (uint256 amountOut, uint256) {
                result.version = 4;
                result.amountOut = amountOut;
                result.fee = poolKey.fee;
                result.routeData = abi.encode(poolKey, zeroForOne);
                result.hooks = address(poolKey.hooks);
                result.liquidity = liquidity;
            } catch (bytes memory reason) {
                // Handle specific hook errors gracefully
                if (reason.length >= 4) {
                    bytes4 errorSelector = bytes4(reason);
                    // QuoteSwap error (0xecbd9804) - hook/quoter issue, skip this pool
                    if (errorSelector == 0xecbd9804) {
                        return result; // Return empty result, continue with other pools
                    }
                }
                // Other quote failures - also skip
            }
        } catch {
            // Pool doesn't exist
        }
    }

    /**
     * @notice Get direct quote from specific version and parameters (Legacy support for MoonXFacet)
     */
    function _getDirectQuote(
        uint8 version,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee
    ) internal returns (uint256 amountOut) {
        address uniTokenIn = _convertToken(tokenIn);
        address uniTokenOut = _convertToken(tokenOut);

        if (version == 2) {
            QuoteResult memory result = _quoteV2(
                uniTokenIn,
                uniTokenOut,
                amountIn
            );
            return result.amountOut;
        } else if (version == 3) {
            QuoteResult memory result = _quoteV3(
                uniTokenIn,
                uniTokenOut,
                amountIn,
                fee
            );
            return result.amountOut;
        } else if (version == 4) {
            QuoteResult memory result = _quoteV4(
                uniTokenIn,
                uniTokenOut,
                amountIn
            );
            return result.amountOut;
        }
        return 0;
    }

    /**
     * @notice Get direct quote with optional poolKey for V4 (Legacy support for MoonXFacet)
     */
    function _getDirectQuoteWithPoolKey(
        uint8 version,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        bytes memory poolKeyData
    ) internal returns (uint256 amountOut) {
        address uniTokenIn = _convertToken(tokenIn);
        address uniTokenOut = _convertToken(tokenOut);

        if (version == 4 && poolKeyData.length > 0) {
            return _decodeAndQuoteV4Pool(
                poolKeyData,
                uniTokenIn,
                uniTokenOut,
                amountIn
            );
        }

        return _getDirectQuote(version, tokenIn, tokenOut, amountIn, fee);
    }

    /**
     * @notice Decode poolKey and quote specific V4 pool (Legacy support for MoonXFacet)
     */
    function _decodeAndQuoteV4Pool(
        bytes memory poolKeyData,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        (PoolKey memory poolKey, ) = abi.decode(poolKeyData, (PoolKey, bool));
        QuoteResult memory result = _quoteV4Pool(
            poolKey,
            tokenIn,
            tokenOut,
            amountIn
        );
        return result.amountOut;
    }
}
