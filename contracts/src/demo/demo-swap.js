const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630",
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    
    // Token addresses - Update these with your actual deployed tokens
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    USDC: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    DAI: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    
    // Swap settings
    SLIPPAGE: 300, // 3%
    REF_ADDRESS: "0x0000000000000000000000000000000000000000",
    REF_FEE: 0,
};

const ABI = [
    // moonxGetQuote with original bytes[] args signature
    "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))",
    
    // moonxExec with original args structure
    "function moonxExec(bytes[] calldata args) external payable returns (uint256)",
    
    // Utility functions
    "function getPlatformFee() external view returns (uint256)"
];

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

async function demoSwap() {
    try {
        console.log("🚀 Demo Full Swap Workflow (moonxGetQuote → moonxExec)");
        console.log("=====================================================\n");

        // Setup
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.private_key || CONFIG.PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, ABI, signer);
        const userAddress = signer.address;

        console.log(`👤 User Address: ${userAddress}`);
        console.log(`💎 Diamond Address: ${CONFIG.DIAMOND_ADDRESS}\n`);

        // Test both directions
        await demoSwapDirection(
            "ETH → USDC (Buy USDC with ETH)", 
            [CONFIG.ETH, CONFIG.USDC],
            ethers.parseEther("0.1"), // 0.1 ETH
            contract, signer, userAddress, true
        );

        await delay(2000); // Wait 2 seconds between swaps

        await demoSwapDirection(
            "USDC → ETH (Sell USDC for ETH)", 
            [CONFIG.USDC, CONFIG.ETH],
            ethers.parseUnits("50", 6), // 50 USDC  
            contract, signer, userAddress, false
        );

        await delay(2000);

        // Demo multihop
        await demoSwapDirection(
            "ETH → USDC → DAI (Multihop)", 
            [CONFIG.ETH, CONFIG.USDC, CONFIG.DAI],
            ethers.parseEther("0.05"), // 0.05 ETH
            contract, signer, userAddress, true
        );

        console.log("\n🎉 All swaps completed successfully!");

    } catch (error) {
        console.error("💥 Demo failed:", error);
    }
}

async function demoSwapDirection(title, path, amountIn, contract, signer, userAddress, isETHInput) {
    console.log(`\n📊 ${title}`);
    console.log("=".repeat(50));
    
    const tokenIn = path[0];
    const tokenOut = path[path.length - 1];
    
    try {
        // 1. Check initial balances
        console.log("\n1️⃣ Initial Balances:");
        const initialBalanceIn = await getTokenBalance(tokenIn, userAddress, signer);
        const initialBalanceOut = await getTokenBalance(tokenOut, userAddress, signer);
        console.log(`   ${getTokenName(tokenIn)}: ${formatTokenAmount(initialBalanceIn, tokenIn)}`);
        console.log(`   ${getTokenName(tokenOut)}: ${formatTokenAmount(initialBalanceOut, tokenOut)}`);

        // 2. Approve tokens if needed (skip for ETH)
        if (tokenIn !== CONFIG.ETH) {
            console.log("\n2️⃣ Checking token approval...");
            await ensureApproval(tokenIn, CONFIG.DIAMOND_ADDRESS, amountIn, signer);
        } else {
            console.log("\n2️⃣ Skipping approval (ETH input)");
        }

        // 3. Get quote using new moonxGetQuote
        console.log("\n3️⃣ Getting quote with moonxGetQuote...");
        
        // Build smart V4 data based on path
        const smartV4Data = buildSmartV4Data(path);
        
        const quoteParams = {
            path: path,
            amountIn: amountIn,
            v4Data: smartV4Data // Smart V4 PathKey data
        };
        
        console.log(`   Path: ${path.map(addr => getTokenName(addr)).join(' → ')}`);
        console.log(`   Amount In: ${formatTokenAmount(amountIn, tokenIn)}`);
        console.log(`   V4 Data: ${smartV4Data.length > 2 ? `${Math.floor(smartV4Data.length / 2)} bytes (PathKey encoded)` : 'None'}`);
        
        // Encode QuoteParams into args[0]
        const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address[] path, uint256 amountIn, bytes v4Data)"],
            [quoteParams]
        );
        
        const quoteResult = await contract.moonxGetQuote([encodedParams]);
        
        console.log("   ✅ Quote received:");
        console.log(`      Expected Out: ${formatTokenAmount(quoteResult.amountOut, tokenOut)}`);
        console.log(`      Version: V${quoteResult.version}`);
        console.log(`      Fee: ${quoteResult.fee} (${(Number(quoteResult.fee) / 10000).toFixed(2)}%)`);
        console.log(`      Optimized Path: ${quoteResult.path.map(addr => getTokenName(addr)).join(' → ')}`);

        // 4. Prepare moonxExec arguments using quote result
        console.log("\n4️⃣ Preparing swap execution...");
        
        // Build SwapRoute from quote result
        const swapRoute = {
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            path: quoteResult.path, // Use optimized path from quote
            version: quoteResult.version,
            poolFee: quoteResult.fee,
            routeData: quoteResult.routeData,
            hookData: "0x"
        };

        const execution = {
            amountIn: quoteParams.amountIn,
            amountOut: quoteResult.amountOut,
            slippage: CONFIG.SLIPPAGE,
            deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
            recipient: userAddress,
            exactInput: true,
            useProvidedQuote: true
        };

        const refConfig = {
            refAddress: CONFIG.REF_ADDRESS,
            refFee: CONFIG.REF_FEE
        };

        const platformConfig = {
            gasOptimization: false,
            mevProtection: false,
            routeType: 0 // best_price
        };

        const metadata = {
            integratorId: "demo-swap",
            userData: "0x",
            nonce: 0,
            signature: "0x",
            isPermit2: false,
            aggregatorVersion: 1
        };

        // Encode arguments for moonxExec
        const args = [
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(address tokenIn, address tokenOut, uint8 version, uint24 poolFee, address[] path, bytes routeData, bytes hookData)"],
                [swapRoute]
            ),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [userAddress]),
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(address refAddress, uint256 refFee)"],
                [refConfig]
            ),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [execution.amountIn]),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [execution.amountOut]),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [execution.slippage]),
            ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [execution.useProvidedQuote]),
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(bool gasOptimization, bool mevProtection, uint8 routeType)"],
                [platformConfig]
            ),
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint256 gasStart, uint256 balanceBefore, uint256 balanceAfter, bytes32 swapHash, uint48 timestamp)"],
                [{
                    gasStart: 0,
                    balanceBefore: 0, 
                    balanceAfter: 0,
                    swapHash: ethers.keccak256(ethers.toUtf8Bytes("demo-swap")),
                    timestamp: Math.floor(Date.now() / 1000)
                }]
            ),
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(string integratorId, bytes userData, uint256 nonce, bytes signature, bool isPermit2, uint8 aggregatorVersion)"],
                [metadata]
            )
        ];

        console.log(`   ✅ Arguments prepared (${args.length} args)`);

        // 5. Execute swap
        console.log("\n5️⃣ Executing swap...");
        const value = isETHInput ? quoteParams.amountIn : 0n;
        
        const tx = await contract.moonxExec(args, { value: value });
        console.log(`   Transaction hash: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`   ✅ Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

        // 6. Check final balances
        console.log("\n6️⃣ Final Balances:");
        const finalBalanceIn = await getTokenBalance(tokenIn, userAddress, signer);
        const finalBalanceOut = await getTokenBalance(tokenOut, userAddress, signer);
        console.log(`   ${getTokenName(tokenIn)}: ${formatTokenAmount(finalBalanceIn, tokenIn)}`);
        console.log(`   ${getTokenName(tokenOut)}: ${formatTokenAmount(finalBalanceOut, tokenOut)}`);

        // 7. Calculate actual results
        console.log("\n7️⃣ Swap Results:");
        const actualAmountIn = initialBalanceIn - finalBalanceIn;
        const actualAmountOut = finalBalanceOut - initialBalanceOut;
        
        console.log(`   Actual Amount In: ${formatTokenAmount(actualAmountIn, tokenIn)}`);
        console.log(`   Actual Amount Out: ${formatTokenAmount(actualAmountOut, tokenOut)}`);
        console.log(`   Slippage: ${calculateSlippage(quoteResult.amountOut, actualAmountOut).toFixed(2)}%`);
        
        // Calculate rate
        const inputAmount = Number(ethers.formatUnits(actualAmountIn, getTokenDecimals(tokenIn)));
        const outputAmount = Number(ethers.formatUnits(actualAmountOut, getTokenDecimals(tokenOut)));
        const rate = outputAmount / inputAmount;
        console.log(`   Exchange Rate: 1 ${getTokenName(tokenIn)} = ${rate.toFixed(4)} ${getTokenName(tokenOut)}`);

        console.log("\n✅ Swap completed successfully!");

    } catch (error) {
        console.error(`❌ Swap failed: ${error.message}`);
        if (error.data) {
            console.error(`   Error data: ${error.data}`);
        }
    }
}

// Helper functions
async function getTokenBalance(tokenAddress, userAddress, signer) {
    if (tokenAddress === CONFIG.ETH) {
        return await signer.provider.getBalance(userAddress);
    } else {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        return await tokenContract.balanceOf(userAddress);
    }
}

async function ensureApproval(tokenAddress, spenderAddress, amount, signer) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const currentAllowance = await tokenContract.allowance(signer.address, spenderAddress);
    
    if (currentAllowance < amount) {
        console.log(`   Approving ${getTokenName(tokenAddress)} for spending...`);
        const approveTx = await tokenContract.approve(spenderAddress, amount);
        await approveTx.wait();
        console.log("   ✅ Approval successful");
    } else {
        console.log("   ✅ Sufficient allowance already exists");
    }
}

// V4 PathKey Builder Helper Functions
function buildV4PathKeyData(path, customConfig = {}) {
    if (path.length < 2) return "0x";
    
    const defaultConfig = {
        fee: 3000,
        tickSpacing: 60,
        hooks: "0x0000000000000000000000000000000000000000",
        hookData: "0x"
    };
    
    const config = { ...defaultConfig, ...customConfig };
    
    try {
        const pathKeys = [];
        for (let i = 1; i < path.length; i++) {
            pathKeys.push({
                intermediateCurrency: path[i],
                fee: config.fee,
                tickSpacing: config.tickSpacing,
                hooks: config.hooks,
                hookData: config.hookData
            });
        }
        
        return ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[]"],
            [pathKeys]
        );
    } catch (error) {
        console.warn(`Failed to build V4 PathKey data: ${error.message}`);
        return "0x";
    }
}

function getV4ConfigForPair(tokenA, tokenB) {
    const configs = {
        [`${CONFIG.ETH}-${CONFIG.USDC}`]: { fee: 3000, tickSpacing: 60 },
        [`${CONFIG.ETH}-${CONFIG.DAI}`]: { fee: 500, tickSpacing: 10 },
        [`${CONFIG.USDC}-${CONFIG.DAI}`]: { fee: 100, tickSpacing: 1 }
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
        const config = getV4ConfigForPair(path[0], path[1]);
        return buildV4PathKeyData(path, config);
    } else {
        return buildV4PathKeyData(path);
    }
}

function getTokenName(address) {
    const names = {
        [CONFIG.ETH]: "ETH",
        [CONFIG.WETH]: "WETH",
        [CONFIG.USDC]: "USDC", 
        [CONFIG.DAI]: "DAI",
    };
    return names[address] || `${address.substring(0, 6)}...${address.substring(38)}`;
}

function getTokenDecimals(address) {
    const decimals = {
        [CONFIG.ETH]: 18,
        [CONFIG.WETH]: 18,
        [CONFIG.USDC]: 6,
        [CONFIG.DAI]: 18,
    };
    return decimals[address] || 18;
}

function formatTokenAmount(amount, tokenAddress) {
    const decimals = getTokenDecimals(tokenAddress);
    const formatted = ethers.formatUnits(amount, decimals);
    const symbol = getTokenName(tokenAddress);
    return `${parseFloat(formatted).toFixed(decimals === 6 ? 2 : 4)} ${symbol}`;
}

function calculateSlippage(expected, actual) {
    const expectedNum = Number(expected);
    const actualNum = Number(actual);
    return Math.abs((expectedNum - actualNum) / expectedNum) * 100;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run demo
if (require.main === module) {
    demoSwap().catch(console.error);
}

module.exports = { demoSwap };