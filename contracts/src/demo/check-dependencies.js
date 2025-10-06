const { ethers } = require('ethers');

const CONFIG = {
    RPC_URL: "http://localhost:8645",
    WETH: "0x4200000000000000000000000000000000000006", // WETH on Base
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    
    // Uniswap V3 on Base
    V3_FACTORY: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", // Base mainnet
    V3_QUOTER: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2 (problematic)
    V3_QUOTER_VIEW: "0x222ca98f00ed15b1fae10b61c277703a194cf5d2", // View-only quoter (new)
    V3_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481", // Base mainnet
    
    // Common V3 fees
    FEES: [100, 500, 3000, 10000] // 0.01%, 0.05%, 0.3%, 1%
};

const FACTORY_ABI = [
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
];

const QUOTER_ABI = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
];

const POOL_ABI = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function liquidity() external view returns (uint128)",
    "function fee() external view returns (uint24)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
];

async function checkDependencies() {
    try {
        console.log("🔍 Checking Uniswap V3 Dependencies on Base");
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        
        // 1. Check factory
        console.log("\n📋 Checking V3 Factory...");
        const factory = new ethers.Contract(CONFIG.V3_FACTORY, FACTORY_ABI, provider);
        
        for (const fee of CONFIG.FEES) {
            console.log(`\n🔍 Checking ETH/USDC pool with ${fee/100}% fee...`);
            
            try {
                const poolAddress = await factory.getPool(CONFIG.WETH, CONFIG.USDC, fee);
                console.log(`Pool address: ${poolAddress}`);
                
                if (poolAddress === ethers.ZeroAddress) {
                    console.log(`❌ No pool found for ${fee/100}% fee`);
                    continue;
                }
                
                // Check pool details
                const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
                
                const [slot0, liquidity, poolFee, token0, token1] = await Promise.all([
                    pool.slot0(),
                    pool.liquidity(),
                    pool.fee(),
                    pool.token0(),
                    pool.token1()
                ]);
                
                console.log(`✅ Pool found!`);
                console.log(`  - Liquidity: ${liquidity.toString()}`);
                console.log(`  - Fee: ${poolFee}`);
                console.log(`  - Token0: ${token0}`);
                console.log(`  - Token1: ${token1}`);
                console.log(`  - SqrtPrice: ${slot0.sqrtPriceX96.toString()}`);
                console.log(`  - Tick: ${slot0.tick}`);
                
                // Test QuoterV2 (current)
                console.log(`\n📊 Testing QuoterV2 for ${fee/100}% pool...`);
                const quoter = new ethers.Contract(CONFIG.V3_QUOTER, QUOTER_ABI, provider);
                
                try {
                    const quote = await quoter.quoteExactInputSingle.staticCall(
                        CONFIG.WETH,
                        CONFIG.USDC,
                        fee,
                        ethers.parseEther("0.001"), // 0.001 ETH
                        0 // No price limit
                    );
                    console.log(`✅ QuoterV2 successful: ${quote.toString()} USDC`);
                    console.log(`   (${ethers.formatUnits(quote, 6)} USDC for 0.001 ETH)`);
                } catch (quoteError) {
                    console.log(`❌ QuoterV2 failed: ${quoteError.message}`);
                    if (quoteError.data) {
                        console.log(`   Error data: ${quoteError.data}`);
                        
                        // Try to decode the error
                        if (quoteError.data === "0xa9ad62f8") {
                            console.log(`   🎯 FOUND THE ERROR! This is the same 0xa9ad62f8`);
                        }
                    }
                }
                
                // Test View-Only Quoter
                console.log(`\n📊 Testing View-Only Quoter for ${fee/100}% pool...`);
                const viewQuoter = new ethers.Contract(CONFIG.V3_QUOTER_VIEW, QUOTER_ABI, provider);
                
                try {
                    const viewQuote = await viewQuoter.quoteExactInputSingle.staticCall(
                        CONFIG.WETH,
                        CONFIG.USDC,
                        fee,
                        ethers.parseEther("0.001"), // 0.001 ETH
                        0 // No price limit
                    );
                    console.log(`✅ View-Only Quoter successful: ${viewQuote.toString()} USDC`);
                    console.log(`   (${ethers.formatUnits(viewQuote, 6)} USDC for 0.001 ETH)`);
                } catch (viewQuoteError) {
                    console.log(`❌ View-Only Quoter failed: ${viewQuoteError.message}`);
                    if (viewQuoteError.data) {
                        console.log(`   View-Only Error data: ${viewQuoteError.data}`);
                    }
                }
                
            } catch (poolError) {
                console.log(`❌ Error checking pool: ${poolError.message}`);
            }
        }
        
        // 2. Test other pairs
        console.log("\n🔍 Testing other popular pairs...");
        
        const testPairs = [
            { name: "WETH/DAI", tokenA: CONFIG.WETH, tokenB: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" }, // DAI on Base
            { name: "WETH/cbETH", tokenA: CONFIG.WETH, tokenB: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" }, // cbETH on Base
        ];
        
        for (const pair of testPairs) {
            console.log(`\n🔍 Checking ${pair.name}...`);
            try {
                const poolAddress = await factory.getPool(pair.tokenA, pair.tokenB, 3000); // 0.3% fee
                console.log(`${pair.name} pool: ${poolAddress}`);
                
                if (poolAddress !== ethers.ZeroAddress) {
                    console.log(`✅ ${pair.name} pool exists`);
                } else {
                    console.log(`❌ ${pair.name} pool not found`);
                }
            } catch (error) {
                console.log(`❌ Error checking ${pair.name}: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error("❌ Dependency check failed:", error.message);
    }
}

checkDependencies(); 