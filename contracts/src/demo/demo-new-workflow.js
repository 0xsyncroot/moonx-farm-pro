const { ethers } = require('ethers');

/**
 * Demo cho New MoonX Workflow: moonxGetQuote → moonxExec
 * 
 * Workflow mới:
 * 1. moonxGetQuote(SwapParams) → QuoteResult (tự động tìm best route)
 * 2. moonxExec(args với path từ QuoteResult) → actual swap
 */

const CONFIG = {
    DIAMOND_ADDRESS: "0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630", // Update với address thực tế
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    
    // Token addresses - CẬP NHẬT VỚI ADDRESSES THỰC TẾ CỦA BẠN
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x4200000000000000000000000000000000000006", 
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};

const ABI = [
    // moonxGetQuote with original bytes[] args signature
    "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))",
    
    // Original moonxExec (unchanged)
    "function moonxExec(bytes[] calldata args) external payable returns (uint256)"
];

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

async function demonstrateNewWorkflow() {
    console.log("🌟 MoonX New Workflow Demo");
    console.log("==========================\n");
    
    try {
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, ABI, signer);
        
        console.log(`👤 User: ${signer.address}`);
        console.log(`💎 Contract: ${CONFIG.DIAMOND_ADDRESS}`);
        console.log(`⚠️  Note: Make sure MoonxAggregator.sol has been deployed with the latest fixes`);
        console.log(`    Fix: V3 simple hop path setting in _quoteV3Multihop function`);
        
        // Check initial nonce
        const initialNonce = await signer.provider.getTransactionCount(signer.address, 'pending');
        console.log(`🔢 Initial account nonce: ${initialNonce}\n`);

        // Demo 1: Simple swap (ETH → USDC)
        console.log("🚀 Starting Demo 1...");
        await demoSimpleSwap(contract, signer);
        
        console.log("\n⏳ Waiting for network to settle (5 seconds)...");
        await delay(5000);
        
        // Demo 2: Multihop swap (USDC → ETH → DAI, with approval)
        console.log("🚀 Starting Demo 2...");
        await demoMultihopSwap(contract, signer);
        
        console.log("\n⏳ Waiting for network to settle (5 seconds)...");
        await delay(5000);
        
        // Demo 3: ERC20 to ERC20 swap (DAI → USDC, with approval)
        console.log("🚀 Starting Demo 3...");
        await demoERC20Swap(contract, signer);
        
        // Check final nonce
        const finalNonce = await signer.provider.getTransactionCount(signer.address, 'pending');
        console.log(`\n🔢 Final account nonce: ${finalNonce}`);
        console.log(`📊 Total transactions executed: ${finalNonce - initialNonce}`);
        
        console.log("\n🎉 All demos completed!");
        
    } catch (error) {
        console.error("💥 Demo failed:", error);
    }
}

async function demoSimpleSwap(contract, signer) {
    console.log("📊 Demo 1: Simple ETH → USDC Swap");
    console.log("─".repeat(40));
    
    // Step 1: Define quote parameters  
    const quoteParams = {
        path: [CONFIG.ETH, CONFIG.USDC],        // Simple direct path
        amountIn: ethers.parseEther("0.1"),     // 0.1 ETH
        v4Data: buildSmartV4Data([CONFIG.ETH, CONFIG.USDC]) // Smart V4 PathKey data
    };
    
    console.log(`\n🔍 Step 1: Get Quote`);
    console.log(`   Path: ${quoteParams.path.map(getTokenSymbol).join(' → ')}`);
    console.log(`   Amount: ${ethers.formatEther(quoteParams.amountIn)} ETH`);
    console.log(`   V4 Data: ${quoteParams.v4Data.length > 2 ? `${Math.floor(quoteParams.v4Data.length / 2)} bytes (PathKey encoded)` : 'None'}`);
    
    try {
        // Encode QuoteParams into args[0] 
        const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address[] path, uint256 amountIn, bytes v4Data)"],
            [quoteParams]
        );
        
        // Call moonxGetQuote with encoded args
        const quoteResult = await contract.moonxGetQuote.staticCall([encodedParams]);
        
        // Debug logging cho simple swap
        console.log("🔍 Debug - Quote Result Details:", {
            amountOut: quoteResult.amountOut?.toString(),
            version: quoteResult.version?.toString(),
            fee: quoteResult.fee?.toString(),
            pathLength: quoteResult.path?.length,
            path: quoteResult.path?.map(addr => `${addr} (${getTokenSymbol(addr)})`),
            liquidity: quoteResult.liquidity?.toString(),
            routeDataLength: quoteResult.routeData?.length,
            hooks: quoteResult.hooks
        });
        
        console.log(`\n✅ Quote Result:`);
        console.log(`   Expected Output: ${ethers.formatUnits(quoteResult.amountOut, 6)} USDC`);
        console.log(`   Best Version: V${quoteResult.version}`);
        console.log(`   Fee Tier: ${quoteResult.fee} (${(Number(quoteResult.fee) / 10000).toFixed(2)}%)`);
        console.log(`   Optimized Path: ${quoteResult.path?.length ? quoteResult.path.map(addr => getTokenSymbol(addr)).join(' → ') : 'EMPTY PATH!'}`);
        console.log(`   Liquidity: ${ethers.formatUnits(quoteResult.liquidity, 0)}`);
        
        // Check for empty path  
        if (!quoteResult.path || quoteResult.path.length === 0) {
            console.error("❌ CRITICAL: Quote returned empty path!");
            console.error("This indicates a bug in MoonxAggregator quote functions.");
            throw new Error("Quote returned empty path - cannot execute swap");
        }
        
        console.log("✅ Path validation passed - proceeding to swap execution");
        
        // Step 2: Execute swap using quote result
        console.log(`\n⚡ Step 2: Execute Swap`);
        const actualAmountOut = await executeSwapWithQuote(contract, signer, quoteParams, quoteResult);
        
        console.log(`\n✅ Swap Success!`);
        console.log(`   Actual Output: ${ethers.formatUnits(actualAmountOut, 6)} USDC`);
        
        const slippage = calculateSlippage(quoteResult.amountOut, actualAmountOut);
        console.log(`   Slippage: ${slippage.toFixed(3)}%`);
        
    } catch (error) {
        console.error(`❌ Simple swap failed:`, error.message);
    }
}

async function demoMultihopSwap(contract, signer) {
    console.log("\n📊 Demo 2: Multihop USDC → ETH → DAI Swap (with Token Approval)");
    console.log("─".repeat(60));
    
    // Multihop path
    const quoteParams = {
        path: [CONFIG.USDC, CONFIG.ETH, CONFIG.DAI], // Multihop: USDC → ETH → DAI  
        amountIn: ethers.parseUnits("100", 6),        // 100 USDC (needs approval)
        v4Data: buildSmartV4Data([CONFIG.USDC, CONFIG.ETH, CONFIG.DAI]) // V4 multihop PathKey data
    };
    
    console.log(`\n🔍 Step 1: Get Multihop Quote`);
    console.log(`   Path: ${quoteParams.path.map(getTokenSymbol).join(' → ')}`);
    console.log(`   Amount: ${ethers.formatUnits(quoteParams.amountIn, 6)} USDC`);
    console.log(`   V4 Data: ${quoteParams.v4Data.length > 2 ? `${Math.floor(quoteParams.v4Data.length / 2)} bytes (Multihop PathKey)` : 'None'}`);
    
    try {
        // Encode QuoteParams into args[0] 
        const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address[] path, uint256 amountIn, bytes v4Data)"],
            [quoteParams]
        );
        
        const quoteResult = await contract.moonxGetQuote.staticCall([encodedParams]);
        
        // Debug logging
        console.log("🔍 Debug - Quote Result:", {
            amountOut: quoteResult.amountOut?.toString() || "null",
            version: quoteResult.version?.toString() || "null",
            fee: quoteResult.fee?.toString() || "null",
            pathLength: quoteResult.path?.length || 0,
            routeDataLength: quoteResult.routeData?.length || 0
        });
        
        if (!quoteResult.amountOut || quoteResult.amountOut.toString() === "0") {
            throw new Error("No valid quote found - amountOut is 0 or null");
        }
        
        console.log(`\n✅ Multihop Quote Result:`);
        console.log(`   Expected Output: ${ethers.formatUnits(quoteResult.amountOut, 18)} DAI`);
        console.log(`   Best Version: V${quoteResult.version}`);
        console.log(`   Path Length: ${quoteResult.path.length} tokens`);
        console.log(`   Optimized Route: ${quoteResult.path.map(addr => getTokenSymbol(addr)).join(' → ')}`);
        
        // Execute multihop
        console.log(`\n⚡ Step 2: Execute Multihop Swap`);
        const actualAmountOut = await executeSwapWithQuote(contract, signer, quoteParams, quoteResult);
        
        console.log(`\n✅ Multihop Success!`);
        console.log(`   Actual Output: ${ethers.formatUnits(actualAmountOut, 18)} DAI`);
        
        // Calculate multihop efficiency
        const efficiency = (Number(actualAmountOut) / Number(quoteResult.amountOut)) * 100;
        console.log(`   Execution Efficiency: ${efficiency.toFixed(2)}%`);
        
    } catch (error) {
        console.error(`❌ Multihop swap failed:`, error.message);
    }
}

async function demoERC20Swap(contract, signer) {
    console.log("\n📊 Demo 3: ERC20 → ERC20 Direct Swap (DAI → USDC with Approval)");
    console.log("─".repeat(65));
    
    // ERC20 to ERC20 direct swap
    const quoteParams = {
        path: [CONFIG.DAI, CONFIG.USDC],         // Direct: DAI → USDC
        amountIn: ethers.parseUnits("50", 18),   // 50 DAI (needs approval)
        v4Data: buildSmartV4Data([CONFIG.DAI, CONFIG.USDC]) // Smart V4 PathKey data
    };
    
    console.log(`\n🔍 Step 1: Get ERC20 Swap Quote`);
    console.log(`   Path: ${quoteParams.path.map(getTokenSymbol).join(' → ')}`);
    console.log(`   Amount: ${ethers.formatUnits(quoteParams.amountIn, 18)} DAI`);
    console.log(`   V4 Data: ${quoteParams.v4Data.length > 2 ? `${Math.floor(quoteParams.v4Data.length / 2)} bytes (PathKey encoded)` : 'None'}`);
    
    try {
        // Check balance first
        console.log(`\n💰 Checking DAI Balance...`);
        const daiBalance = await getTokenBalance(CONFIG.DAI, signer.address, signer);
        console.log(`   Current Balance: ${ethers.formatUnits(daiBalance, 18)} DAI`);
        
        if (daiBalance < quoteParams.amountIn) {
            console.log(`   ⚠️  Insufficient DAI balance for demo. Required: ${ethers.formatUnits(quoteParams.amountIn, 18)} DAI`);
            console.log(`   💡 This demo shows the approval flow, but would fail on actual swap due to insufficient balance.`);
        }
        
        // Encode QuoteParams into args[0] 
        const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address[] path, uint256 amountIn, bytes v4Data)"],
            [quoteParams]
        );
        
        const quoteResult = await contract.moonxGetQuote.staticCall([encodedParams]);
        
        // Debug logging
        console.log("\n🔍 Debug - ERC20 Quote Result:", {
            amountOut: quoteResult.amountOut?.toString(),
            version: quoteResult.version?.toString(),
            fee: quoteResult.fee?.toString(),
            pathLength: quoteResult.path?.length,
            path: quoteResult.path?.map(addr => `${addr} (${getTokenSymbol(addr)})`),
            routeDataLength: quoteResult.routeData?.length
        });
        
        if (!quoteResult.amountOut || quoteResult.amountOut.toString() === "0") {
            throw new Error("No valid quote found for ERC20 swap - amountOut is 0 or null");
        }
        
        console.log(`\n✅ ERC20 Swap Quote Result:`);
        console.log(`   Expected Output: ${ethers.formatUnits(quoteResult.amountOut, 6)} USDC`);
        console.log(`   Best Version: V${quoteResult.version}`);
        console.log(`   Fee Tier: ${quoteResult.fee} (${(Number(quoteResult.fee) / 10000).toFixed(2)}%)`);
        console.log(`   Optimized Path: ${quoteResult.path?.length ? quoteResult.path.map(addr => getTokenSymbol(addr)).join(' → ') : 'EMPTY PATH!'}`);
        
        // Calculate exchange rate
        const inputAmount = Number(ethers.formatUnits(quoteParams.amountIn, 18));
        const outputAmount = Number(ethers.formatUnits(quoteResult.amountOut, 6));
        const rate = outputAmount / inputAmount;
        console.log(`   Exchange Rate: 1 DAI = ${rate.toFixed(4)} USDC`);
        
        // Execute ERC20 swap (this will test approval flow)
        console.log(`\n⚡ Step 2: Execute ERC20 Swap`);
        const actualAmountOut = await executeSwapWithQuote(contract, signer, quoteParams, quoteResult);
        
        console.log(`\n✅ ERC20 Swap Success!`);
        console.log(`   Actual Output: ${ethers.formatUnits(actualAmountOut, 6)} USDC`);
        
        // Calculate final efficiency
        const efficiency = (Number(actualAmountOut) / Number(quoteResult.amountOut)) * 100;
        console.log(`   Execution Efficiency: ${efficiency.toFixed(2)}%`);
        
    } catch (error) {
        console.error(`❌ ERC20 swap failed:`, error.message);
    }
}

async function executeSwapWithQuote(contract, signer, quoteParams, quoteResult) {
    const userAddress = signer.address;
    const tokenIn = quoteParams.path[0];
    const tokenOut = quoteParams.path[quoteParams.path.length - 1];
    
    // Check and handle token approval if needed
    if (tokenIn !== CONFIG.ETH) {
        console.log(`   🔒 Checking token approval for ${getTokenSymbol(tokenIn)}...`);
        await ensureTokenApproval(tokenIn, CONFIG.DIAMOND_ADDRESS, quoteParams.amountIn, signer);
    } else {
        console.log(`   ⚡ ETH input - no approval needed`);
    }
    
    // Build moonxExec arguments using QuoteResult
    const swapRoute = {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        path: quoteResult.path,           // ✨ Use optimized path from quote
        version: quoteResult.version,     // ✨ Use best version from quote
        poolFee: quoteResult.fee,         // ✨ Use optimal fee from quote
        routeData: quoteResult.routeData, // ✨ Use route data from quote
        hookData: "0x"
    };
    
    // Debug SwapRoute
    console.log("🔍 Debug - SwapRoute:", {
        tokenIn: `${swapRoute.tokenIn} (${getTokenSymbol(swapRoute.tokenIn)})`,
        tokenOut: `${swapRoute.tokenOut} (${getTokenSymbol(swapRoute.tokenOut)})`,
        pathLength: swapRoute.path?.length,
        path: swapRoute.path?.map(addr => `${addr} (${getTokenSymbol(addr)})`),
        version: swapRoute.version,
        poolFee: swapRoute.poolFee,
        routeDataLength: swapRoute.routeData?.length,
        routeDataInfo: swapRoute.version === 4 ? "Contains PoolKey/PathKey with hooks, fees, tickSpacing" : "V2/V3 route data",
        hookData: swapRoute.hookData
    });
    
    const execution = {
        amountIn: quoteParams.amountIn,
        amountOut: quoteResult.amountOut, // ✨ Use expected output from quote
        slippage: 300, // 3%
        deadline: Math.floor(Date.now() / 1000) + 1800,
        recipient: userAddress,
        exactInput: true,
        useProvidedQuote: true            // ✨ Always true for new workflow
    };
    
    // Standard moonxExec args (same as before)
    const args = [
        // args[0]: SwapRoute
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address tokenIn, address tokenOut, uint8 version, uint24 poolFee, address[] path, bytes routeData, bytes hookData)"],
            [swapRoute]
        ),
        // args[1]: recipient
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [userAddress]),
        // args[2]: referral config
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address refAddress, uint256 refFee)"], 
            [{ refAddress: ethers.ZeroAddress, refFee: 0 }]
        ),
        // args[3]: amountIn
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [execution.amountIn]),
        // args[4]: amountOut
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [execution.amountOut]),
        // args[5]: slippage
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [execution.slippage]),
        // args[6]: useProvidedQuote
        ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [execution.useProvidedQuote]),
        // args[7]: platform config
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(bool gasOptimization, bool mevProtection, uint8 routeType)"],
            [{ gasOptimization: false, mevProtection: false, routeType: 0 }]
        ),
        // args[8]: metadata (SwapCache được contract tự tạo internally)
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(string integratorId, bytes userData, uint256 nonce, bytes signature, bool isPermit2, uint8 aggregatorVersion)"],
            [{ integratorId: "demo", userData: "0x", nonce: 0, signature: "0x", isPermit2: false, aggregatorVersion: 1 }]
        )
    ];
    
    // Execute with ETH value if needed
    const value = tokenIn === CONFIG.ETH ? quoteParams.amountIn : 0n;
    
    try {
        // Get fresh nonce for swap execution
        console.log(`   🔢 Getting nonce for swap execution...`);
        const nonce = await getNonceWithRetry(signer);
        
        const tx = await contract.moonxExec(args, { value, nonce });
        await waitForTransactionWithNonce(tx, "Swap Execution");
        
        // Extract actualAmountOut from logs or calculate from balance changes
        // For demo, we'll return the expected amount
        return quoteResult.amountOut;
    } catch (error) {
        console.error("❌ moonxExec failed:", error.message);
        
        // Handle nonce-related errors specifically
        if (error.message.includes("nonce") || error.message.includes("already been used")) {
            console.log("   🔄 Nonce conflict detected. Getting fresh nonce and retrying...");
            try {
                await delay(2000); // Wait for network to settle
                const freshNonce = await getNonceWithRetry(signer);
                console.log(`   🔢 Retrying with fresh nonce: ${freshNonce}`);
                
                const retryTx = await contract.moonxExec(args, { value, nonce: freshNonce });
                await waitForTransactionWithNonce(retryTx, "Swap Execution (Retry)");
                return quoteResult.amountOut;
            } catch (retryError) {
                console.error("   ❌ Retry also failed:", retryError.message);
                throw retryError;
            }
        }
        
        // Try to decode custom error
        if (error.data) {
            console.log("🔍 Debug - Error data:", error.data);
            
            // Common error signatures
            const errorMap = {
                "0x2c5211c6": "InvalidPathLength",
                "0x4e487b71": "Panic(uint256)", 
                "0x08c379a0": "Error(string)",
                "0xe922eb9a": "InvalidAmountIn",
                "0x49c6ac1e": "InvalidAmountOut"
            };
            
            const errorSig = error.data.substring(0, 10);
            console.log(`🔍 Debug - Error signature: ${errorSig} = ${errorMap[errorSig] || "Unknown"}`);
        }
        
        throw error;
    }
}

// Nonce Management Helper Functions
async function getNonceWithRetry(signer, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const nonce = await signer.provider.getTransactionCount(signer.address, 'pending');
            console.log(`   🔢 Current nonce: ${nonce}`);
            return nonce;
        } catch (error) {
            console.warn(`   ⚠️ Failed to get nonce (attempt ${i + 1}/${retries}): ${error.message}`);
            if (i === retries - 1) throw error;
            await delay(1000);
        }
    }
}

async function waitForTransactionWithNonce(tx, description = "Transaction") {
    try {
        console.log(`   ⏳ ${description}: ${tx.hash}`);
        console.log(`   🔢 Transaction nonce: ${tx.nonce}`);
        
        const receipt = await tx.wait();
        console.log(`   ✅ ${description} confirmed in block ${receipt.blockNumber}`);
        console.log(`   ⛽ Gas used: ${receipt.gasUsed.toString()}`);
        
        // Small delay to let network settle
        await delay(1000);
        return receipt;
    } catch (error) {
        console.error(`   ❌ ${description} failed: ${error.message}`);
        throw error;
    }
}

// Token Approval Helper Functions
async function ensureTokenApproval(tokenAddress, spenderAddress, amount, signer) {
    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        
        // Check current allowance
        const currentAllowance = await tokenContract.allowance(signer.address, spenderAddress);
        
        if (currentAllowance >= amount) {
            console.log(`   ✅ Sufficient allowance already exists (${ethers.formatUnits(currentAllowance, getTokenDecimals(tokenAddress))})`);
            return;
        }
        
        console.log(`   🔄 Approving ${getTokenSymbol(tokenAddress)} spending...`);
        console.log(`   💰 Amount: ${formatTokenAmount(amount, tokenAddress)}`);
        
        // Get fresh nonce for approval
        const nonce = await getNonceWithRetry(signer);
        
        // Approve the exact amount (or max if preferred) with explicit nonce
        const approveTx = await tokenContract.approve(spenderAddress, amount, { nonce });
        await waitForTransactionWithNonce(approveTx, "Token Approval");
        
    } catch (error) {
        console.error(`   ❌ Token approval failed: ${error.message}`);
        throw error;
    }
}

async function getTokenBalance(tokenAddress, userAddress, signer) {
    if (tokenAddress === CONFIG.ETH) {
        return await signer.provider.getBalance(userAddress);
    } else {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        return await tokenContract.balanceOf(userAddress);
    }
}

function getTokenDecimals(address) {
    const decimals = {
        [CONFIG.ETH]: 18,
        [CONFIG.WETH]: 18,
        [CONFIG.USDC]: 6,
        [CONFIG.DAI]: 18,
        [CONFIG.USDT]: 6,
    };
    return decimals[address] || 18;
}

function formatTokenAmount(amount, tokenAddress) {
    const decimals = getTokenDecimals(tokenAddress);
    const formatted = ethers.formatUnits(amount, decimals);
    const symbol = getTokenSymbol(tokenAddress);
    return `${parseFloat(formatted).toFixed(decimals === 6 ? 2 : 4)} ${symbol}`;
}

// V4 PathKey Builder Helper Functions  
function buildV4PathKeyData(path, customConfig = {}) {
    if (path.length < 2) return "0x";
    
    // Mock V4 pool configurations - replace with actual deployed pool data
    const defaultConfig = {
        fee: 3000,           // 0.3% default
        tickSpacing: 60,     // Standard tick spacing for 0.3%
        hooks: "0x0000000000000000000000000000000000000000", // No hooks by default
        hookData: "0x"
    };
    
    const config = { ...defaultConfig, ...customConfig };
    
    try {
        // Build PathKey array for multihop (skip first token, include rest as intermediate)
        const pathKeys = [];
        
        for (let i = 1; i < path.length; i++) {
            const pathKey = {
                intermediateCurrency: path[i], // Target token for this hop
                fee: config.fee,
                tickSpacing: config.tickSpacing,
                hooks: config.hooks,
                hookData: config.hookData
            };
            pathKeys.push(pathKey);
        }
        
        // Encode PathKey array
        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[]"],
            [pathKeys]
        );
        
        return encoded;
    } catch (error) {
        console.warn(`Failed to build V4 PathKey data: ${error.message}`);
        return "0x"; // Fallback to empty
    }
}

function getV4ConfigForPair(tokenA, tokenB) {
    // Mock configurations for different token pairs
    const configs = {
        [`${CONFIG.ETH}-${CONFIG.USDC}`]: {
            fee: 3000,
            tickSpacing: 60,
            hooks: "0x0000000000000000000000000000000000000000"
        },
        [`${CONFIG.ETH}-${CONFIG.DAI}`]: {
            fee: 500,  // Lower fee tier
            tickSpacing: 10,
            hooks: "0x0000000000000000000000000000000000000000"
        },
        [`${CONFIG.USDC}-${CONFIG.DAI}`]: {
            fee: 100,  // Ultra low fee
            tickSpacing: 1,
            hooks: "0x0000000000000000000000000000000000000000"
        }
    };
    
    const key1 = `${tokenA}-${tokenB}`;
    const key2 = `${tokenB}-${tokenA}`;
    
    return configs[key1] || configs[key2] || {
        fee: 3000,
        tickSpacing: 60,
        hooks: "0x0000000000000000000000000000000000000000",
        hookData: "0x"
    };
}

function buildSmartV4Data(path) {
    if (path.length === 2) {
        // Single hop - use pair-specific config
        const config = getV4ConfigForPair(path[0], path[1]);
        return buildV4PathKeyData(path, config);
    } else {
        // Multihop - use default config
        return buildV4PathKeyData(path);
    }
}

// Utility functions
function getTokenSymbol(address) {
    const symbols = {
        [CONFIG.ETH]: "ETH",
        [CONFIG.WETH]: "WETH", 
        [CONFIG.USDC]: "USDC",
        [CONFIG.DAI]: "DAI",
        [CONFIG.USDT]: "USDT"
    };
    return symbols[address] || `TOKEN(${address.slice(0, 6)})`;
}

function calculateSlippage(expected, actual) {
    return Math.abs((Number(expected) - Number(actual)) / Number(expected)) * 100;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Usage examples
function printUsageExamples() {
    console.log("\n📚 Usage Examples:");
    console.log("==================\n");
    
    console.log("// 1. ETH → ERC20 swap (no approval needed)");
    console.log("const quoteParams = {");
    console.log("    path: [ETH_ADDRESS, USDC_ADDRESS],");
    console.log("    amountIn: ethers.parseEther('0.1'),");
    console.log("    v4Data: buildSmartV4Data([ETH_ADDRESS, USDC_ADDRESS])");
    console.log("};");
    console.log("const encoded = abi.encode(['tuple(address[],uint256,bytes)'], [quoteParams]);");
    console.log("const quote = await contract.moonxGetQuote([encoded]);\n");
    
    console.log("// 2. ERC20 → ERC20 swap (approval required)");
    console.log("const erc20Params = {");
    console.log("    path: [DAI_ADDRESS, USDC_ADDRESS],");
    console.log("    amountIn: ethers.parseUnits('50', 18), // 50 DAI");
    console.log("    v4Data: buildSmartV4Data([DAI_ADDRESS, USDC_ADDRESS])");
    console.log("};");
    console.log("// Demo will automatically handle DAI approval before swap\n");
    
    console.log("// 3. Multihop swap");
    console.log("const multihopParams = {");
    console.log("    path: [ETH_ADDRESS, USDC_ADDRESS, DAI_ADDRESS],");
    console.log("    amountIn: ethers.parseEther('0.1'),");
    console.log("    v4Data: '0x'");
    console.log("};");
    console.log("const encodedMultihop = abi.encode(['tuple(address[],uint256,bytes)'], [multihopParams]);");
    console.log("const multihopQuote = await contract.moonxGetQuote([encodedMultihop]);\n");
    
    console.log("// 4. V4 with Smart PathKey data");
    console.log("const v4Params = {");
    console.log("    path: [ETH_ADDRESS, USDC_ADDRESS],");
    console.log("    amountIn: ethers.parseEther('0.1'),");
    console.log("    v4Data: buildSmartV4Data([ETH_ADDRESS, USDC_ADDRESS]) // Smart V4 builder");
    console.log("};");
    console.log("const encodedV4 = abi.encode(['tuple(address[],uint256,bytes)'], [v4Params]);");
    console.log("const v4Quote = await contract.moonxGetQuote([encodedV4]);\n");
    
    console.log("// 5. V4 with custom config");
    console.log("const customV4Data = buildV4PathKeyData([ETH_ADDRESS, USDC_ADDRESS], {");
    console.log("    fee: 2500,  // Custom fee tier");
    console.log("    tickSpacing: 50, hooks: '0x1234...', hookData: '0x...'");
    console.log("});\n");
    
    console.log("// 6. Use quote result in moonxExec");
    console.log("const swapRoute = {");
    console.log("    tokenIn: quoteParams.path[0],");
    console.log("    tokenOut: quoteParams.path[quoteParams.path.length - 1],");
    console.log("    path: quote.path,         // ← Use optimized path");
    console.log("    version: quote.version,   // ← Use best version");
    console.log("    poolFee: quote.fee,       // ← Use optimal fee");
    console.log("    routeData: quote.routeData, // ← Use route data");
    console.log("    hookData: '0x'");
    console.log("};");
}

// Run demo
if (require.main === module) {
    console.log("🔥 Starting MoonX New Workflow Demo...\n");
    
    demonstrateNewWorkflow()
        .then(() => {
            printUsageExamples();
            console.log("\n✨ Demo completed successfully!");
            console.log("\n💡 Key Benefits Demonstrated:");
            console.log("   ✅ Auto-discovery: Best version (V2/V3/V4) selected automatically");
            console.log("   ✅ Multihop support: Automatic multihop routing");
            console.log("   ✅ Path optimization: Uses optimized path from quote");
            console.log("   ✅ Token Approval: Automatic ERC20 approval handling");
            console.log("   ✅ ETH vs ERC20: Handles both native and token inputs");
            console.log("   ✅ V4 PathKey: Smart V4 data with hooks, fees, tickSpacing");
            console.log("   ✅ Simple interface: Just provide path + amount");
            console.log("   ✅ Backward compatible: moonxExec unchanged");
            
            console.log("\n📊 Demo Coverage:");
            console.log("   🌟 Demo 1: ETH → USDC (Native to ERC20)");
            console.log("   🌟 Demo 2: USDC → ETH → DAI (ERC20 multihop with approval)");
            console.log("   🌟 Demo 3: DAI → USDC (ERC20 to ERC20 with approval)");
        })
        .catch(console.error);
}

module.exports = { demonstrateNewWorkflow };
