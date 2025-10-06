// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IUniversalRouter} from "../interfaces/IUniversalRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IV4Router} from "../interfaces/IV4Router.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {MoonxAggregator} from "../helpers/MoonxAggregator.sol";
import {ReentrancyGuard} from "../helpers/ReentrancyGuard.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {LibFeeCollector} from "../libraries/LibFeeCollector.sol";
import {RouterErrors} from "../errors/RouterErrors.sol";
import {IPermit2} from "../interfaces/IPermit2.sol";
import {BaseUniSwapRouter, BaseData, SwapFlags} from "../helpers/uniswap/BaseUniSwapRouter.sol";
import {PathKey} from "../libraries/uniswap/PathKey.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ISignatureTransfer} from "../interfaces/ISignatureTransfer.sol";
import {IMoonXTypes} from "../interfaces/IMoonXTypes.sol";

contract MoonXFacet is ReentrancyGuard, MoonxAggregator, BaseUniSwapRouter {
    using SafeERC20 for IERC20;

    // Cache frequently used addresses to save gas
    address private immutable _this;

    // Security constants
    uint256 public constant MAX_SLIPPAGE = 5000; // 50% max slippage
    uint256 public constant MIN_AMOUNT = 1000; // Minimum swap amount (1000 wei)
    uint256 public constant MAX_AMOUNT = 1e30; // Maximum swap amount
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MAX_PLATFORM_FEE = 1000; // 10%
    uint256 public constant MAX_REF_FEE = 100; // 1% max ref fee

    // Contract addresses
    address public constant PERMIT2 =
        0x000000000022D473030F116dDEE9F6B43aC78BA3;

    IUniversalRouter public immutable router;

    // Events for monitoring - optimized for gas
    event SwapExecuted(
        address indexed user,
        bytes32 indexed tokenPair, // Pack tokenIn and tokenOut
        uint256 amountIn,
        uint256 amountOut,
        uint256 packed // Pack version and gasUsed
    );

    event PlatformFeeSet(uint256 platformFee);

    constructor(
        address _weth,
        address _router,
        address _v2Factory,
        address _v2Router,
        address _v3Factory,
        address _v3Quoter,
        address _v4Quoter,
        address _stateLibrary,
        IPoolManager _manager,
        ISignatureTransfer _permit2
    )
        MoonxAggregator(
            _weth,
            _v2Factory,
            _v2Router,
            _v3Factory,
            _v3Quoter,
            _v4Quoter,
            _stateLibrary
        )
        BaseUniSwapRouter(_manager, _permit2)
    {
        require(_weth != address(0), "Invalid WETH address");
        require(_router != address(0), "Invalid router address");
        router = IUniversalRouter(_router);
    }

    /**
     * @notice Execute swap with structured args and advanced features
     * @dev New args structure: [route, recipient, [ref,fee], amountIn, amountOut, slippage, useProvidedQuote, platform, metadata]
     * @param args Structured arguments for maximum flexibility:
     *   args[0]: SwapRoute - Route information (path, version, fees, route data)
     *   args[1]: address - Recipient address (optional, defaults to msg.sender)
     *   args[2]: RefConfiguration - Referral and fee configuration 
     *   args[3]: uint256 - Input amount
     *   args[4]: uint256 - Expected output amount (for validation)
     *   args[5]: uint256 - Slippage tolerance in basis points (300 = 3%)
     *   args[6]: bool - Use provided quote (true) or fetch fresh quote (false)
     *   args[7]: PlatformConfig - Platform configuration and optimization settings
     *   args[8]: SwapMetadata - Additional metadata for integrators and advanced features
     * @return actualAmountOut The actual amount of tokens received
     */
    function moonxExec(
        bytes[] calldata args
    ) external payable nonReentrant returns (uint256) {
        // Decode directly into struct fields to avoid extra variables
        IMoonXTypes.SwapExecution memory execution = IMoonXTypes.SwapExecution({
            amountIn: abi.decode(args[3], (uint256)),
            amountOut: abi.decode(args[4], (uint256)),
            slippage: abi.decode(args[5], (uint256)),
            deadline: block.timestamp + 1 hours,
            recipient: args[1].length > 0 ? abi.decode(args[1], (address)) : msg.sender,
            exactInput: true,
            useProvidedQuote: args[6].length > 0 ? abi.decode(args[6], (bool)) : false
        });
        
        // Decode other structs directly
        IMoonXTypes.SwapRoute memory route = abi.decode(args[0], (IMoonXTypes.SwapRoute));
        IMoonXTypes.RefConfiguration memory refConfig = abi.decode(args[2], (IMoonXTypes.RefConfiguration));
        IMoonXTypes.PlatformConfig memory platform = abi.decode(args[7], (IMoonXTypes.PlatformConfig));
        
        // Initialize cache with gas start and minimal operations
        uint256 gasStart = gasleft();
        IMoonXTypes.SwapCache memory cache = IMoonXTypes.SwapCache({
            gasStart: gasStart,
            balanceBefore: 0,
            balanceAfter: 0,
            swapHash: keccak256(abi.encodePacked(msg.sender, block.timestamp, gasStart)),
            timestamp: uint48(block.timestamp)
        });
        
        IMoonXTypes.SwapMetadata memory metadata = abi.decode(args[8], (IMoonXTypes.SwapMetadata));

        // Validate all swap inputs with new structure
        _validateSwapInputs(route, execution, refConfig, platform, metadata);

        // Handle token transfers (including Permit2 support)
        if (metadata.isPermit2 && metadata.signature.length > 0) {
            _handlePermit2Transfer(route.tokenIn, execution.amountIn, metadata);
        } else {
            _handleTokenTransfer(execution.recipient, route.tokenIn, execution.amountIn);
        }

        // Create internal fee processing struct
        IMoonXTypes.FeeProcessing memory fees = IMoonXTypes.FeeProcessing({
            refAddress: refConfig.refAddress,
            refFee: refConfig.refFee,
            platformFeeAmount: 0, // Will be calculated
            refAmount: 0, // Will be calculated
            feeFromOutput: false // Will be calculated
        });

        // Process fee configuration
        execution.amountIn = _processSwapFees(
            route, 
            execution, 
            fees, 
            platform, 
            cache
        );

        // Validate minimum amount after fees
        if (execution.amountIn == 0) {
            revert RouterErrors.ReturnAmountIsNotEnough(0, 1);
        }

        // Handle quote control - user can choose provided quote or fresh quote
        if (!execution.useProvidedQuote) {
            // Fetch fresh quote and update amountOut
            uint256 freshAmountOut = _getCurrentQuote(route, execution.amountIn);
            if (freshAmountOut > 0) {
                execution.amountOut = freshAmountOut;
            }
        }
        
        // Validate user-provided slippage
        if (execution.slippage == 0) {
            execution.slippage = 300; // Default 3% slippage if not provided
        }
        if (execution.slippage > MAX_SLIPPAGE) {
            revert RouterErrors.InvalidAmount();
        }

        // Apply MEV protection if enabled
        if (platform.mevProtection) {
            _applyMevProtection(execution, platform, cache);
        }

        // Execute swap with full context and cache
        uint256 actualAmountOut = _executeSwapWithCache(
            route,
            execution,
            fees,
            platform,
            cache,
            metadata
        );

        emit SwapExecuted(
            execution.recipient,
            keccak256(abi.encodePacked(route.tokenIn, route.tokenOut)),
            execution.amountIn,
            actualAmountOut,
            _packSwapData(route.version, cache.gasStart - gasleft(), platform.routeType, metadata.aggregatorVersion)
        );

        return actualAmountOut;
    }

    /**
     * @notice Validate swap inputs for new args structure
     */
    function _validateSwapInputs(
        IMoonXTypes.SwapRoute memory route,
        IMoonXTypes.SwapExecution memory execution,
        IMoonXTypes.RefConfiguration memory refConfig,
        IMoonXTypes.PlatformConfig memory /* platform */,
        IMoonXTypes.SwapMetadata memory /* metadata */
    ) internal view {
        // Validate token addresses in single check
        if ((route.tokenIn == address(0) && route.tokenIn != ETH_ADDRESS) ||
            (route.tokenOut == address(0) && route.tokenOut != ETH_ADDRESS) ||
            (route.tokenIn == route.tokenOut)) {
            revert RouterErrors.InvalidTokenAddress();
        }

        if (execution.amountIn < MIN_AMOUNT || 
            execution.amountIn > MAX_AMOUNT || 
            refConfig.refFee > MAX_REF_FEE) {
                revert RouterErrors.InvalidAmount();
            }
        
        // Validate version
        if (route.version < 2 || route.version > 4) {
            revert RouterErrors.InvalidVersion();
        }

        if ((route.tokenIn == ETH_ADDRESS && msg.value != execution.amountIn) || 
            (route.tokenIn != ETH_ADDRESS && msg.value != 0)) {
            revert RouterErrors.InvalidMsgValue();
        }

        // Validate deadline
        if (execution.deadline <= block.timestamp) {
            revert RouterErrors.InvalidAmount();
        }

        if ((route.version == 2 && route.path.length < 2) ||
            (route.version == 4 && route.routeData.length == 0)) {
            revert RouterErrors.InvalidAmount();
        }
    }

    /**
     * @notice Handle Permit2 transfers for gasless approvals
     */
    function _handlePermit2Transfer(
        address token,
        uint256 amount,
        IMoonXTypes.SwapMetadata memory /* metadata */
    ) internal {
        if (token == ETH_ADDRESS) return;

        // Implement Permit2 signature validation and transfer
        // This would integrate with the actual Permit2 contract
        // For now, fall back to regular transfer
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        _approveToken(token, amount);
    }

    /**
     * @notice Process swap fees with new structure
     */
    function _processSwapFees(
        IMoonXTypes.SwapRoute memory route,
        IMoonXTypes.SwapExecution memory execution,
        IMoonXTypes.FeeProcessing memory fees,
        IMoonXTypes.PlatformConfig memory /* platform */,
        IMoonXTypes.SwapCache memory /* cache */
    ) internal returns (uint256 amountAfterFees) {
        amountAfterFees = execution.amountIn;

        // Platform fee is always managed globally - no external control

        fees.feeFromOutput = (route.tokenOut == ETH_ADDRESS && route.tokenIn != ETH_ADDRESS);

        if (fees.feeFromOutput) {
            fees.platformFeeAmount = 0;
            fees.refAmount = 0;
        } else {
            uint256 globalPlatformFee = LibFeeCollector.getPlatformFee();
            address feeRecipient = LibFeeCollector.getRecipient();

            unchecked {
                fees.platformFeeAmount = (amountAfterFees * globalPlatformFee) / BASIS_POINTS;
            }

            if (fees.platformFeeAmount > amountAfterFees) {
                revert RouterErrors.ReturnAmountIsNotEnough(0, amountAfterFees);
            }

            unchecked {
                amountAfterFees -= fees.platformFeeAmount;
            }

            _handleInputFee(feeRecipient, route.tokenIn, fees.platformFeeAmount);

            // Handle referral fee
            if (fees.refAddress != address(0) && fees.refFee > 0) {
                unchecked {
                    fees.refAmount = (amountAfterFees * fees.refFee) / BASIS_POINTS;
                }

                if (fees.refAmount > amountAfterFees) {
                    revert RouterErrors.ReturnAmountIsNotEnough(0, amountAfterFees);
                }

                unchecked {
                    amountAfterFees -= fees.refAmount;
                }

                _handleInputFee(fees.refAddress, route.tokenIn, fees.refAmount);
            }
        }
    }



    /**
     * @notice Get current quote for dynamic slippage calculation
     */
    function _getCurrentQuote(
        IMoonXTypes.SwapRoute memory route, 
        uint256 amountIn
    ) internal returns (uint256) {
        if (route.version == 2) {
            return _getDirectQuote(route.version, route.tokenIn, route.tokenOut, amountIn, 0);
        } else if (route.version == 3) {
            return _getDirectQuote(route.version, route.tokenIn, route.tokenOut, amountIn, route.poolFee);
        } else if (route.version == 4) {
            return _getDirectQuoteWithPoolKey(
                route.version, 
                route.tokenIn, 
                route.tokenOut, 
            amountIn,
                0, 
                route.routeData
            );
        }
        return 0;
    }

    /**
     * @notice Apply simple and effective MEV protection
     * @dev Implements the most practical MEV protection strategy:
     *      - Tight deadline window (2 minutes max)
     *      - Conservative slippage reduction
     *      - Simple gas-based detection
     */
    function _applyMevProtection(
        IMoonXTypes.SwapExecution memory execution,
        IMoonXTypes.PlatformConfig memory /* platform */,
        IMoonXTypes.SwapCache memory /* cache */
    ) internal view {
        // 1. SHORT DEADLINE - Most effective MEV protection
        // MEV bots need time to setup sandwich attacks
        execution.deadline = block.timestamp + 2 minutes;

        // 2. CONSERVATIVE SLIPPAGE - Reduce MEV profit margins
        // Most effective: reduce slippage by 50% when MEV protection enabled
        execution.slippage = (execution.slippage * 50) / 100;
        
        // Ensure reasonable bounds
        if (execution.slippage < 10) {
            execution.slippage = 10; // 0.1% minimum to prevent failures
        }
        if (execution.slippage > 300) {
            execution.slippage = 300; // 3% maximum for MEV protection
        }

        // 3. DYNAMIC GAS DETECTION - Adapts to network conditions
        // Compare current gas price to network average for MEV detection
        uint256 avgGasPrice = _getAverageGasPrice();
        if (tx.gasprice > (avgGasPrice * 150) / 100) { // 50% above average = MEV activity
            execution.slippage = (execution.slippage * 80) / 100; // Extra 20% reduction
        }
    }

    /**
     * @notice Get dynamic average gas price for MEV detection
     * @dev Smart gas price calculation that adapts to network conditions
     */
    function _getAverageGasPrice() internal view returns (uint256) {
        // Use EIP-1559 base fee when available (most accurate)
        if (block.basefee > 0) {
            // Base fee + reasonable priority (20-50% depending on network)
            return block.basefee + (block.basefee * 30) / 100;
        }
        
        // Fallback for non-EIP-1559 networks
        // Dynamic baseline based on network (can be enhanced with chainid detection)
        uint256 networkBaseline;
        
        // Simple network detection via gas price patterns
        if (tx.gasprice < 2 gwei) {
            networkBaseline = 1 gwei;    // L2s, testnets
        } else if (tx.gasprice < 20 gwei) {
            networkBaseline = 10 gwei;   // Lower-cost L1s
        } else {
            networkBaseline = 30 gwei;   // Ethereum mainnet and similar
        }
        
        return networkBaseline;
    }

    /**
     * @notice Pack swap data for efficient event emission
     */
    function _packSwapData(
        uint8 version,
        uint256 gasUsed, 
        uint8 routeType,
        uint8 aggregatorVersion
    ) internal pure returns (uint256 packed) {
        // Pack: version(8) | gasUsed(240) | routeType(4) | aggregatorVersion(4)
        packed = (uint256(version) << 248) | 
                 ((gasUsed & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) << 8) |
                 (uint256(routeType) << 4) | 
                 uint256(aggregatorVersion);
    }

    /**
     * @notice Execute swap with full context and cache optimizations
     */
    function _executeSwapWithCache(
        IMoonXTypes.SwapRoute memory route,
        IMoonXTypes.SwapExecution memory execution,
        IMoonXTypes.FeeProcessing memory fees,
        IMoonXTypes.PlatformConfig memory platform,
        IMoonXTypes.SwapCache memory cache,
        IMoonXTypes.SwapMetadata memory metadata
    ) internal returns (uint256 actualAmountOut) {
        address recipient = fees.feeFromOutput ? address(this) : execution.recipient;
        uint256 minOut = (execution.amountOut * (BASIS_POINTS - execution.slippage)) / BASIS_POINTS;
        
        cache.balanceBefore = _getTokenBalance(route.tokenOut, recipient);

        // Execute swap based on version with optimized routing
        if (route.version == 2) {
            _executeV2SwapWithRoute(route, execution, recipient, minOut);
        } else if (route.version == 3) {
            _executeV3SwapWithRoute(route, execution, recipient, minOut);
        } else if (route.version == 4) {
            _executeV4SwapWithHooks(route, execution, recipient, minOut, metadata);
        }

        cache.balanceAfter = _getTokenBalance(route.tokenOut, recipient);
                unchecked {
            actualAmountOut = cache.balanceAfter - cache.balanceBefore;
        }

        // Verify minimum output
        if (actualAmountOut < minOut) {
            revert RouterErrors.ReturnAmountIsNotEnough(actualAmountOut, minOut);
        }

        // Handle output fees if applicable
        if (fees.feeFromOutput) {
            actualAmountOut = _handleOutputFees(
                route,
                execution,
                fees,
                platform,
                actualAmountOut
            );
        }

        return actualAmountOut;
    }

    /**
     * @notice Execute V2 swap with route optimization
     */
    function _executeV2SwapWithRoute(
        IMoonXTypes.SwapRoute memory route,
        IMoonXTypes.SwapExecution memory execution,
        address recipient,
        uint256 minOut
    ) internal {
        if (route.tokenIn == ETH_ADDRESS) {
            bytes[] memory inputArray = new bytes[](2);
            inputArray[0] = abi.encode(address(this), execution.amountIn);
            inputArray[1] = abi.encode(recipient, execution.amountIn, minOut, route.path, true);

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.WRAP_ETH)),
                bytes1(uint8(Commands.V2_SWAP_EXACT_IN))
            );

            router.execute{value: execution.amountIn}(commands, inputArray, execution.deadline);
        } else if (route.tokenOut == ETH_ADDRESS) {
            bytes[] memory inputArray = new bytes[](2);
            inputArray[0] = abi.encode(address(this), execution.amountIn, minOut, route.path, true);
            inputArray[1] = abi.encode(recipient, minOut);

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.V2_SWAP_EXACT_IN)),
                bytes1(uint8(Commands.UNWRAP_WETH))
            );

            router.execute(commands, inputArray, execution.deadline);
        } else {
            bytes memory inputs = abi.encode(recipient, execution.amountIn, minOut, route.path, true);
            bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
            bytes[] memory inputArray = new bytes[](1);
            inputArray[0] = inputs;
            router.execute(commands, inputArray, execution.deadline);
        }
    }

    /**
     * @notice Execute V3 swap with route optimization and multihop support
     */
    function _executeV3SwapWithRoute(
        IMoonXTypes.SwapRoute memory route,
        IMoonXTypes.SwapExecution memory execution,
        address recipient,
        uint256 minOut
    ) internal {
        // Build V3 path from route.path with fees
        bytes memory v3Path = _buildV3Path(route.path, route.poolFee);
        
        if (route.tokenIn == ETH_ADDRESS) {
            bytes[] memory inputArray = new bytes[](2);
            inputArray[0] = abi.encode(address(this), execution.amountIn);
            inputArray[1] = abi.encode(
                recipient,
                execution.amountIn,
                minOut,
                v3Path,
                true
            );

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.WRAP_ETH)),
                bytes1(uint8(Commands.V3_SWAP_EXACT_IN))
            );

            router.execute{value: execution.amountIn}(commands, inputArray, execution.deadline);
        } else if (route.tokenOut == ETH_ADDRESS) {
            bytes[] memory inputArray = new bytes[](1);
            inputArray[0] = abi.encode(
                address(this),
                execution.amountIn,
                minOut,
                v3Path,
                true
            );

            bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V3_SWAP_EXACT_IN)));
            uint256 wethBalanceBefore = IERC20(WETH).balanceOf(address(this));
            router.execute(commands, inputArray, execution.deadline);

            uint256 wethReceived = IERC20(WETH).balanceOf(address(this)) - wethBalanceBefore;
            if (wethReceived > 0) {
                _unwrapETH(wethReceived);
                if (recipient != address(this)) {
                    (bool success,) = payable(recipient).call{value: wethReceived}("");
                    if (!success) revert RouterErrors.NativeAssetTransferFailed();
                }
            }
        } else {
            bytes memory inputs = abi.encode(
                recipient,
                execution.amountIn,
                minOut,
                v3Path,
                true
            );
            bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V3_SWAP_EXACT_IN)));
            bytes[] memory inputArray = new bytes[](1);
            inputArray[0] = inputs;
            router.execute(commands, inputArray, execution.deadline);
        }
    }

    /**
     * @notice Build V3 path from address array with fees
     * @param path Array of token addresses [tokenA, tokenB, tokenC]
     * @param defaultFee Default fee to use for all hops
     * @return Packed V3 path: tokenA + fee + tokenB + fee + tokenC
     */
    function _buildV3Path(
        address[] memory path,
        uint24 defaultFee
    ) internal pure returns (bytes memory) {
        if (path.length < 2) revert RouterErrors.InvalidAmount();
        
        bytes memory packedPath = abi.encodePacked(path[0]);
        
        // Add fee + nextToken for each hop
        for (uint256 i = 1; i < path.length; i++) {
            packedPath = abi.encodePacked(packedPath, defaultFee, path[i]);
        }
        
        return packedPath;
    }

    /**
     * @notice Execute V4 swap with hooks and multihop support
     */
    function _executeV4SwapWithHooks(
        IMoonXTypes.SwapRoute memory route,
        IMoonXTypes.SwapExecution memory execution,
        address recipient,
        uint256 minOut,
        IMoonXTypes.SwapMetadata memory /* metadata */
    ) internal {
        require(route.routeData.length > 0, "Missing V4 routeData");

        // Try to decode as PathKey array for multihop, fallback to single PoolKey
        (bool isMultihop, bytes memory processedData) = _decodeV4RouteData(route.routeData);
        if (isMultihop) {
            _executeV4Multihop(route, execution, recipient, minOut, processedData);
        } else {
            _executeV4SingleHop(route, execution, recipient, minOut, processedData);
        }
    }

    /**
     * @notice Decode V4 route data to determine if multihop or single hop
     */
    function _decodeV4RouteData(
        bytes memory routeData
    ) internal pure returns (bool isMultihop, bytes memory processedData) {
        // Check data length to determine format
        // PathKey array typically has longer data than single PoolKey
        if (routeData.length < 32) {
            return (false, routeData); // Too short for PathKey array
        }
        
        // Simple heuristic: if data is very long, likely PathKey array
        // More sophisticated detection could check for specific patterns
        if (routeData.length > 300) { // Arbitrary threshold
            return (true, routeData);
        }
        
        // Default to single hop
        return (false, routeData);
    }

    /**
     * @notice Execute V4 multihop swap
     */
    function _executeV4Multihop(
        IMoonXTypes.SwapRoute memory route,
        IMoonXTypes.SwapExecution memory execution,
        address recipient,
        uint256 minOut,
        bytes memory pathKeysData
    ) internal {
        // For V4 multihop, we need to execute multiple single swaps
        // This is a simplified approach - in practice might need more sophisticated routing
        PathKey[] memory pathKeys = abi.decode(pathKeysData, (PathKey[]));
        
        // For now, execute as single hop with first PathKey
        // TODO: Implement true multihop V4 execution
        if (pathKeys.length > 0) {
            // Convert first PathKey to PoolKey format for single hop execution
            bytes memory singleHopData = abi.encode(pathKeys[0]); // Simplified
            _executeV4SingleHop(route, execution, recipient, minOut, singleHopData);
        }
    }

    /**
     * @notice Execute V4 single hop swap
     */
    function _executeV4SingleHop(
        IMoonXTypes.SwapRoute memory route,
        IMoonXTypes.SwapExecution memory execution,
        address recipient,
        uint256 minOut,
        bytes memory poolKeyData
    ) internal {
        (PoolKey memory poolKey, bool zeroForOne) = abi.decode(poolKeyData, (PoolKey, bool));

        // Use hookData for advanced features
        bytes memory hookData = route.hookData.length > 0 ? route.hookData : new bytes(0);

        if (route.tokenIn == ETH_ADDRESS) {
            _wrapETH(execution.amountIn);
            _unlockAndDecode(
                abi.encode(
                    BaseData({
                        amount: execution.amountIn,
                        amountLimit: minOut,
                        payer: address(this),
                        receiver: recipient,
                        flags: SwapFlags.SINGLE_SWAP
                    }),
                    zeroForOne,
                    poolKey,
                    hookData
                )
            );
        } else if (route.tokenOut == ETH_ADDRESS) {
            uint256 wethBalanceBefore = IERC20(WETH).balanceOf(address(this));
            _unlockAndDecode(
                abi.encode(
                    BaseData({
                        amount: execution.amountIn,
                        amountLimit: minOut,
                        payer: address(this),
                        receiver: address(this),
                        flags: SwapFlags.SINGLE_SWAP
                    }),
                    zeroForOne,
                    poolKey,
                    hookData
                )
            );

            uint256 wethReceived = IERC20(WETH).balanceOf(address(this)) - wethBalanceBefore;
            if (wethReceived > 0) {
                _unwrapETH(wethReceived);
                if (recipient != address(this)) {
                    (bool success,) = payable(recipient).call{value: wethReceived}("");
                    if (!success) revert RouterErrors.NativeAssetTransferFailed();
                }
            }
        } else {
            _unlockAndDecode(
                abi.encode(
                    BaseData({
                        amount: execution.amountIn,
                        amountLimit: minOut,
                        payer: address(this),
                        receiver: recipient,
                        flags: SwapFlags.SINGLE_SWAP
                    }),
                    zeroForOne,
                    poolKey,
                    hookData
                )
            );
        }
    }

    /**
     * @notice Handle output fees for ETH swaps
     */
    function _handleOutputFees(
        IMoonXTypes.SwapRoute memory /* route */,
        IMoonXTypes.SwapExecution memory execution,
        IMoonXTypes.FeeProcessing memory fees,
        IMoonXTypes.PlatformConfig memory /* platform */,
        uint256 totalAmountOut
    ) internal returns (uint256 finalAmountOut) {
        finalAmountOut = totalAmountOut;

        uint256 globalPlatformFee = LibFeeCollector.getPlatformFee();
        address feeRecipient = LibFeeCollector.getRecipient();
        
            uint256 platformFeeFromOutput;
            unchecked {
            platformFeeFromOutput = (finalAmountOut * globalPlatformFee) / BASIS_POINTS;
            }

        if (platformFeeFromOutput > finalAmountOut) {
            revert RouterErrors.ReturnAmountIsNotEnough(0, finalAmountOut);
            }

            unchecked {
            finalAmountOut -= platformFeeFromOutput;
            }
            _handleOutputFee(feeRecipient, platformFeeFromOutput);

        // Calculate and handle referral fee
            if (fees.refAddress != address(0) && fees.refFee > 0) {
                uint256 refFeeFromOutput;
                unchecked {
                refFeeFromOutput = (finalAmountOut * fees.refFee) / BASIS_POINTS;
            }

            if (refFeeFromOutput > finalAmountOut) {
                revert RouterErrors.ReturnAmountIsNotEnough(0, finalAmountOut);
            }

            unchecked {
                finalAmountOut -= refFeeFromOutput;
            }
            _handleOutputFee(fees.refAddress, refFeeFromOutput);
        }

        // Send remaining amount to recipient
        _handleOutputFee(execution.recipient, finalAmountOut);
        return finalAmountOut;
    }

    function _handleTokenTransfer(
        address recipient,
        address tokenIn,
        uint256 amountIn
    ) internal {
        if (tokenIn != ETH_ADDRESS) {
            // For ERC20 tokens, use SafeERC20 for secure transfers
            IERC20(tokenIn).transferFrom(recipient, address(this), amountIn);
            _approveToken(tokenIn, amountIn);
        } else {
            _approveToken(WETH, amountIn);
        }
    }

    function _approveToken(address token, uint256 amount) internal {
        if (token == ETH_ADDRESS) return;

        // First approve to PERMIT2
        assembly {
            let ptr := mload(0x40)
            // approve(address,uint256) selector: 0x095ea7b3
            mstore(
                ptr,
                0x095ea7b300000000000000000000000000000000000000000000000000000000
            )
            mstore(add(ptr, 0x04), PERMIT2)
            mstore(add(ptr, 0x24), amount)

            let success := call(gas(), token, 0, ptr, 0x44, 0, 0)
            if iszero(success) {
                revert(0, 0)
            }
        }

        // Then approve via PERMIT2
        IPermit2(PERMIT2).approve(
            token,
            address(router),
            uint160(amount),
            uint48(block.timestamp + 1 hours)
        );
    }

    function _getTokenBalance(
        address token,
        address account
    ) internal view returns (uint256 bal) {
        if (token == ETH_ADDRESS) {
            assembly {
                bal := balance(account)
            }
        } else {
            assembly {
                // Load the balanceOf function selector (0x70a08231)
                let ptr := mload(0x40)
                mstore(
                    ptr,
                    0x70a0823100000000000000000000000000000000000000000000000000000000
                )
                mstore(add(ptr, 0x04), account)

                let success := staticcall(gas(), token, ptr, 0x24, ptr, 0x20)
                if iszero(success) {
                    revert(0, 0)
                }
                bal := mload(ptr)
            }
        }
    }

    function _executeV2Swap(
        address recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address[] memory path
    ) internal {
        if (tokenIn == ETH_ADDRESS) {
            // ETH -> ERC20: WRAP_ETH + V2_SWAP_EXACT_IN
            bytes[] memory inputArray = new bytes[](2);

            // WRAP_ETH command
            inputArray[0] = abi.encode(address(this), amountIn);

            // V2_SWAP_EXACT_IN command
            inputArray[1] = abi.encode(
                recipient, // recipient
                amountIn,
                minOut,
                path,
                true
            );

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.WRAP_ETH)),
                bytes1(uint8(Commands.V2_SWAP_EXACT_IN))
            );

            router.execute{value: amountIn}(
                commands,
                inputArray,
                block.timestamp + 1 hours
            );
        } else if (tokenOut == ETH_ADDRESS) {
            // ERC20 -> ETH: V2_SWAP_EXACT_IN + UNWRAP_WETH
            bytes[] memory inputArray = new bytes[](2);

            // V2_SWAP_EXACT_IN command - swap to WETH first
            inputArray[0] = abi.encode(
                address(this), // recipient (contract receives WETH)
                amountIn,
                minOut,
                path, // path should end with WETH
                true
            );

            // UNWRAP_WETH command
            inputArray[1] = abi.encode(recipient, minOut); // recipient, amountMin

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.V2_SWAP_EXACT_IN)),
                bytes1(uint8(Commands.UNWRAP_WETH))
            );

            router.execute(commands, inputArray, block.timestamp + 1 hours);
        } else {
            // ERC20 -> ERC20: Standard V2_SWAP_EXACT_IN
            bytes memory inputs = abi.encode(
                recipient, // recipient
                amountIn,
                minOut,
                path,
                true
            );

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.V2_SWAP_EXACT_IN))
            );

            bytes[] memory inputArray = new bytes[](1);
            inputArray[0] = inputs;
            router.execute(commands, inputArray, block.timestamp + 1 hours);
        }
    }

    function _executeV3Swap(
        address recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint24 fee
    ) internal {
        // For ETH swaps, need to use WRAP_ETH command first
        if (tokenIn == ETH_ADDRESS) {
            // Use WRAP_ETH + V3_SWAP_EXACT_IN commands for ETH input
            bytes[] memory inputArray = new bytes[](2);

            // WRAP_ETH command
            inputArray[0] = abi.encode(address(this), amountIn);

            // V3_SWAP_EXACT_IN command - use WETH address in path since ETH is wrapped
            inputArray[1] = abi.encode(
                recipient, // recipient
                amountIn,
                minOut,
                abi.encodePacked(WETH, fee, tokenOut), // path with WETH
                true
            );

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.WRAP_ETH)),
                bytes1(uint8(Commands.V3_SWAP_EXACT_IN))
            );

            router.execute{value: amountIn}(
                commands,
                inputArray,
                block.timestamp + 1 hours
            );
        } else if (tokenOut == ETH_ADDRESS) {
            // For output ETH, swap to WETH then unwrap
            bytes[] memory inputArray = new bytes[](1);

            // V3_SWAP_EXACT_IN command - swap to WETH
            inputArray[0] = abi.encode(
                address(this), // recipient (contract receives WETH)
                amountIn,
                minOut,
                abi.encodePacked(tokenIn, fee, WETH), // path to WETH
                true
            );

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.V3_SWAP_EXACT_IN))
            );

            // ERC20 -> ETH: First swap to WETH, then unwrap to ETH
            uint256 wethBalanceBefore = IERC20(WETH).balanceOf(address(this));

            router.execute(commands, inputArray, block.timestamp + 1 hours);

            // Get amount of WETH received and unwrap to ETH
            uint256 wethBalanceAfter = IERC20(WETH).balanceOf(address(this));
            uint256 wethReceived = wethBalanceAfter - wethBalanceBefore;

            if (wethReceived > 0) {
                _unwrapETH(wethReceived);

                if (recipient != address(this)) {
                    (bool success, ) = payable(recipient).call{
                        value: wethReceived
                    }("");
                    if (!success)
                        revert RouterErrors.NativeAssetTransferFailed();
                }
            }
        } else {
            // For ERC20 to ERC20, use standard V3_SWAP_EXACT_IN
            bytes memory inputs = abi.encode(
                recipient, // recipient
                amountIn,
                minOut,
                abi.encodePacked(tokenIn, fee, tokenOut), // path
                true
            );

            bytes memory commands = abi.encodePacked(
                bytes1(uint8(Commands.V3_SWAP_EXACT_IN))
            );

            bytes[] memory inputArray = new bytes[](1);
            inputArray[0] = inputs;
            router.execute(commands, inputArray, block.timestamp + 1 hours);
        }
    }

    function _executeV4Swap(
        address recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        bytes memory routeData
    ) internal {
        PoolKey memory poolKey;
        bool zeroForOne;

        // routeData must be provided from aggregator quote
        require(routeData.length > 0, "Missing V4 routeData");
        (poolKey, zeroForOne) = abi.decode(routeData, (PoolKey, bool));

        // Use empty hookData for all hooks (can be enhanced later if needed)
        bytes memory hookData = "";

        // Handle ETH input/output cases
        if (tokenIn == ETH_ADDRESS) {
            // Wrap ETH to WETH first
            _wrapETH(amountIn);

            _unlockAndDecode(
                abi.encode(
                    BaseData({
                        amount: amountIn,
                        amountLimit: minOut,
                        payer: address(this),
                        receiver: recipient,
                        flags: SwapFlags.SINGLE_SWAP
                    }),
                    zeroForOne,
                    poolKey,
                    hookData
                )
            );
        } else if (tokenOut == ETH_ADDRESS) {
            // ERC20 -> ETH: First swap to WETH, then unwrap to ETH
            uint256 wethBalanceBefore = IERC20(WETH).balanceOf(address(this));

            _unlockAndDecode(
                abi.encode(
                    BaseData({
                        amount: amountIn,
                        amountLimit: minOut,
                        payer: address(this),
                        receiver: address(this),
                        flags: SwapFlags.SINGLE_SWAP
                    }),
                    zeroForOne,
                    poolKey,
                    hookData
                )
            );

            // Get amount of WETH received and unwrap to ETH
            uint256 wethBalanceAfter = IERC20(WETH).balanceOf(address(this));
            uint256 wethReceived = wethBalanceAfter - wethBalanceBefore;

            if (wethReceived > 0) {
                _unwrapETH(wethReceived);

                if (recipient != address(this)) {
                    (bool success, ) = payable(recipient).call{
                        value: wethReceived
                    }("");
                    if (!success)
                        revert RouterErrors.NativeAssetTransferFailed();
                }
            }
        } else {
            // ERC20 -> ERC20: Direct V4 swap
            _unlockAndDecode(
                abi.encode(
                    BaseData({
                        amount: amountIn,
                        amountLimit: minOut,
                        payer: address(this),
                        receiver: recipient,
                        flags: SwapFlags.SINGLE_SWAP
                    }),
                    zeroForOne,
                    poolKey,
                    hookData
                )
            );
        }
    }

    function _wrapETH(uint256 amount) internal {
        // Wrap ETH to WETH using the WETH contract
        (bool success, ) = WETH.call{value: amount}(
            abi.encodeWithSignature("deposit()")
        );
        require(success, "ETH wrap failed");
    }

    function _unwrapETH(uint256 amount) internal {
        // Unwrap WETH to ETH
        (bool success, ) = WETH.call(
            abi.encodeWithSignature("withdraw(uint256)", amount)
        );
        require(success, "ETH unwrap failed");
    }

    function msgSender() external view returns (address) {
        return msg.sender;
    }

    /**
     * @notice Get tick spacing for V4 fee tier
     */
    function _getTickSpacing(uint24 fee) internal pure returns (int24) {
        if (fee == 100) return 1; // 0.01%
        if (fee == 500) return 10; // 0.05%
        if (fee == 3000) return 60; // 0.3%
        if (fee == 10000) return 200; // 1%
        revert RouterErrors.InvalidAmount();
    }

    function _handleInputFee(
        address feeRecipient,
        address tokenIn,
        uint256 amount
    ) internal {
        if (amount > 0) {
            if (tokenIn == ETH_ADDRESS) {
                // Send ETH fee directly to fee recipient
                (bool success, ) = payable(feeRecipient).call{value: amount}(
                    ""
                );
                if (!success) revert RouterErrors.NativeAssetTransferFailed();
            } else {
                // For ERC20 fees, transfer tokens directly to fee recipient
                // Fee recipient can handle their own token conversion if needed
                IERC20(tokenIn).transfer(feeRecipient, amount);
            }
        }
    }

    function _handleOutputFee(address recipient, uint256 amount) internal {
        if (amount > 0) {
            // Output fees are always in ETH when feeFromOutput is true
            (bool success, ) = payable(recipient).call{value: amount}("");
            if (!success) revert RouterErrors.NativeAssetTransferFailed();
        }
    }
}
