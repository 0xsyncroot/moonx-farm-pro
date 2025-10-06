const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630",
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    
    // Token addresses - Update these with your actual deployed tokens
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x4200000000000000000000000000000000000006", 
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};

const ABI = [
    // moonxGetQuote with original bytes[] args signature
    "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))",
];

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
];

async function demoGetQuote() {
    try {
        console.log("🚀 Demo moonxGetQuote với Path Examples");
        console.log("=====================================\n");

        // Setup provider and contract
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, ABI, signer);

        // Test cases với different paths
        const testCases = [
            {
                name: "ETH → USDC (V2/V3 Auto + V4 with PathKey)",
                params: {
                    path: [CONFIG.ETH, CONFIG.USDC],
                    amountIn: ethers.parseEther("0.1"), // 0.1 ETH
                    v4Data: buildSmartV4Data([CONFIG.ETH, CONFIG.USDC]) // Smart V4 data
                }
            },
            {
                name: "ETH → USDC → DAI (Multihop All Versions)",
                params: {
                    path: [CONFIG.ETH, CONFIG.USDC, CONFIG.DAI],
                    amountIn: ethers.parseEther("0.1"), // 0.1 ETH
                    v4Data: buildSmartV4Data([CONFIG.ETH, CONFIG.USDC, CONFIG.DAI]) // V4 multihop
                }
            },
            {
                name: "USDC → WETH → DAI → USDT (Long multihop)",
                params: {
                    path: [CONFIG.USDC, CONFIG.WETH, CONFIG.DAI, CONFIG.USDT],
                    amountIn: ethers.parseUnits("100", 6), // 100 USDC
                    v4Data: buildSmartV4Data([CONFIG.USDC, CONFIG.WETH, CONFIG.DAI, CONFIG.USDT])
                }
            },
            {
                name: "DAI → USDC (Direct with custom V4 fee)",
                params: {
                    path: [CONFIG.DAI, CONFIG.USDC],
                    amountIn: ethers.parseUnits("50", 18), // 50 DAI
                    v4Data: buildSmartV4Data([CONFIG.DAI, CONFIG.USDC]) // Uses 100 bps fee
                }
            },
            {
                name: "V2/V3 Only (No V4 data)",
                params: {
                    path: [CONFIG.ETH, CONFIG.DAI],
                    amountIn: ethers.parseEther("0.05"), // 0.05 ETH  
                    v4Data: "0x" // Deliberately no V4 data to test V2/V3 only
                }
            },
            {
                name: "ETH → USDC with V4 Custom Hook Simulation",
                params: {
                    path: [CONFIG.ETH, CONFIG.USDC],
                    amountIn: ethers.parseEther("0.05"), // 0.05 ETH
                    v4Data: buildV4PathKeyData([CONFIG.ETH, CONFIG.USDC], {
                        fee: 2500,  // Custom fee tier
                        tickSpacing: 50,
                        hooks: "0x1234567890123456789012345678901234567890", // Mock hook
                        hookData: ethers.keccak256(ethers.toUtf8Bytes("demo-hook-data"))
                    })
                }
            }
        ];

        console.log("📋 Test Cases:");
        testCases.forEach((testCase, i) => {
            console.log(`${i + 1}. ${testCase.name}`);
            console.log(`   Path: ${testCase.params.path.map(addr => getTokenName(addr)).join(' → ')}`);
            console.log(`   Amount: ${formatAmount(testCase.params.amountIn, testCase.params.path[0])}`);
            console.log(`   V4 Data: ${testCase.params.v4Data.length > 2 ? `${Math.floor(testCase.params.v4Data.length / 2)} bytes (PathKey encoded)` : 'None (V2/V3 only)'}`);
            
            // Show V4 config if available  
            if (testCase.params.v4Data.length > 2) {
                try {
                    // Try to show what V4 config was used (just for display)
                    const config = getV4ConfigForPair(testCase.params.path[0], testCase.params.path[testCase.params.path.length - 1]);
                    console.log(`   V4 Config: Fee=${config.fee} (${(config.fee/10000).toFixed(2)}%), TickSpacing=${config.tickSpacing}`);
                } catch (e) {
                    console.log(`   V4 Config: Custom configuration`);
                }
            }
            console.log('');
        });

        // Execute quotes
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            console.log(`\n🔍 Testing: ${testCase.name}`);
            console.log("─".repeat(50));

            try {
                console.log("⏳ Calling moonxGetQuote...");
                
                // Encode QuoteParams into args[0]
                const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(address[] path, uint256 amountIn, bytes v4Data)"],
                    [testCase.params]
                );
                
                const result = await contract.moonxGetQuote.staticCall([encodedParams]);
                
                console.log("✅ Quote Result:");
                console.log(`   Amount Out: ${formatAmount(result.amountOut, testCase.params.path[testCase.params.path.length - 1])}`);
                console.log(`   Version: V${result.version}`);
                console.log(`   Fee: ${result.fee} (${(Number(result.fee) / 10000).toFixed(2)}%)`);
                console.log(`   Liquidity: ${ethers.formatUnits(result.liquidity, 0)}`);
                console.log(`   Path: ${result.path.map(addr => getTokenName(addr)).join(' → ')}`);
                console.log(`   Hooks: ${result.hooks}`);
                console.log(`   Route Data: ${result.routeData.length > 2 ? `${result.routeData.substring(0, 20)}...` : 'None'}`);
                
                // Calculate rate
                const inputAmount = Number(ethers.formatUnits(testCase.params.amountIn, getTokenDecimals(testCase.params.path[0])));
                const outputAmount = Number(ethers.formatUnits(result.amountOut, getTokenDecimals(testCase.params.path[testCase.params.path.length - 1])));
                const rate = outputAmount / inputAmount;
                console.log(`   Rate: 1 ${getTokenName(testCase.params.path[0])} = ${rate.toFixed(4)} ${getTokenName(testCase.params.path[testCase.params.path.length - 1])}`);

            } catch (error) {
                console.error("❌ Quote failed:", error.message);
                if (error.data) {
                    console.error("   Error data:", error.data);
                }
            }
        }

        console.log("\n🎉 Demo completed!");
        console.log("\n💡 Usage Tips:");
        console.log("- Path array: [tokenIn, intermediateToken, tokenOut]");
        console.log("- V2: Automatic multihop support");
        console.log("- V3: Auto fee discovery (100, 500, 3000, 10000 basis points)");
        console.log("- V4: Provide PathKey array in v4Data for custom routing");
        console.log("- Best quote automatically selected from all versions");

    } catch (error) {
        console.error("💥 Demo failed:", error);
    }
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
    // In production, these should come from actual V4 pool discovery
    const configs = {
        [`${CONFIG.ETH}-${CONFIG.USDC}`]: {
            fee: 3000,
            tickSpacing: 60,
            hooks: "0x0000000000000000000000000000000000000000" // Could be actual hook contract
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
        // Multihop - use default config (in production, would query each hop)
        return buildV4PathKeyData(path);
    }
}

// Helper functions
function getTokenName(address) {
    const names = {
        [CONFIG.ETH]: "ETH",
        [CONFIG.WETH]: "WETH", 
        [CONFIG.USDC]: "USDC",
        [CONFIG.DAI]: "DAI",
        [CONFIG.USDT]: "USDT",
    };
    return names[address] || `${address.substring(0, 6)}...${address.substring(38)}`;
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

function formatAmount(amount, tokenAddress) {
    const decimals = getTokenDecimals(tokenAddress);
    const formatted = ethers.formatUnits(amount, decimals);
    const symbol = getTokenName(tokenAddress);
    return `${parseFloat(formatted).toFixed(decimals === 6 ? 2 : 4)} ${symbol}`;
}

// Run demo
if (require.main === module) {
    demoGetQuote().catch(console.error);
}

module.exports = { demoGetQuote };
