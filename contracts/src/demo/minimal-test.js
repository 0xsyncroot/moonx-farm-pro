const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0xc2e282546F709129000eAaa56B0074F9cE66c267",
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

// Test with V3 ETH -> USDC (simpler, no approval needed)
const TEST_SWAP = {
    TOKEN_IN: "0x0000000000000000000000000000000000000000", // ETH
    TOKEN_OUT: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    AMOUNT_IN: "1000000000000000", // 0.001 ETH
    SLIPPAGE: 500, // 5%
    VERSION: 3,
    FEE: 3000, // 0.3%
};

const ABI = [
    "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)",
    "function getDirectQuote(uint8 version, address tokenIn, address tokenOut, uint256 amountIn, uint24 fee) external returns (uint256)",
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
];

async function minimalTest() {
    try {
        console.log("🧪 Minimal Swap Test");
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        const diamond = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, ABI, signer);
        
        console.log("👤 User:", await signer.getAddress());
        
        // 1. Check ETH balance
        const ethBalance = await provider.getBalance(signer.address);
        console.log("💰 ETH Balance:", ethers.formatEther(ethBalance));
        
        if (ethBalance < TEST_SWAP.AMOUNT_IN) {
            console.log("❌ Insufficient ETH balance");
            return;
        }
        
        // 2. Hardcode a reasonable quote (skip aggregator)
        const expectedOut = BigInt("3000000"); // 3 USDC (6 decimals) for 0.001 ETH
        const minOut = expectedOut * BigInt(10000 - TEST_SWAP.SLIPPAGE) / BigInt(10000);
        
        console.log("📊 Expected out:", expectedOut.toString(), "USDC");
        console.log("🎯 Min out:", minOut.toString(), "USDC");
        
        // 3. Prepare minimal args (bypass validation)
        const args = [];
        
        // args[0]: tokenIn
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [TEST_SWAP.TOKEN_IN]));
        
        // args[1]: tokenOut
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [TEST_SWAP.TOKEN_OUT]));
        
        // args[2]: amountIn 
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [TEST_SWAP.AMOUNT_IN]));
        
        // args[3]: slippage
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [TEST_SWAP.SLIPPAGE]));
        
        // args[4]: refData (empty)
        const refData = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [ethers.ZeroAddress]),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [0])
        ];
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [refData]));
        
        // args[5]: version 
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [TEST_SWAP.VERSION]));
        
        // args[6]: V3 fee
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint24"], [TEST_SWAP.FEE]));
        
        // args[7]: deadline
        const deadline = Math.floor(Date.now() / 1000) + 1200;
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [deadline]));
        
        console.log("📦 Prepared", args.length, "args for V3 ETH->USDC");
        
        // 4. Test quote first 
        console.log("📊 Testing direct quote...");
        try {
            const directQuote = await diamond.getDirectQuote(
                TEST_SWAP.VERSION,
                TEST_SWAP.TOKEN_IN, 
                TEST_SWAP.TOKEN_OUT,
                TEST_SWAP.AMOUNT_IN,
                TEST_SWAP.FEE
            );
            console.log("✅ Direct quote:", directQuote.toString());
        } catch (quoteError) {
            console.log("❌ Direct quote failed:", quoteError.message);
            if (quoteError.data) {
                console.log("Quote error data:", quoteError.data);
            }
        }
        
        // 5. Estimate gas
        console.log("⛽ Estimating gas...");
        const gasEstimate = await diamond.execMoonXSwap.estimateGas(args, {
            value: TEST_SWAP.AMOUNT_IN // Send ETH value
        });
        console.log("✅ Gas estimate:", gasEstimate.toString());
        
        // 6. Execute swap
        console.log("🚀 Executing swap...");
        const swapTx = await diamond.execMoonXSwap(args, {
            value: TEST_SWAP.AMOUNT_IN, // Send ETH value
            gasLimit: gasEstimate + 100000n // Add buffer
        });
        
        console.log("📝 TX hash:", swapTx.hash);
        const receipt = await swapTx.wait();
        console.log("✅ Swap successful! Gas used:", receipt.gasUsed.toString());
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        if (error.data) {
            console.log("Error data:", error.data);
        }
    }
}

minimalTest(); 