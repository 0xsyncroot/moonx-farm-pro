const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630",
    RPC_URL: "https://base-mainnet.g.alchemy.com/v2/UphfhralOCYNjg3BnpFIG",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    TOKEN_A: "0x0000000000000000000000000000000000000000", // ETH
    TOKEN_B: "0x0Db510e79909666d6dEc7f5e49370838c16D950f", // USDC on Base mainnet
    AMOUNT_IN: "10000000000000000", // 0.01 ETH
    SLIPPAGE: 300, // 3%
    REF_ADDRESS: "0x0000000000000000000000000000000000000000",
    REF_FEE: 0,
    FORCE_VERSION: 3, // Force V3 for testing
};

const MOONX_FACET_ABI = [
    "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)",
    "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))",
];

async function debugSwap() {
    try {
        console.log("🔍 Debug Swap Test");

        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        const diamond = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, MOONX_FACET_ABI, signer);

        // 1. Test quote first
        console.log("📊 Testing quote...");
        const quoteArgs = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.TOKEN_A]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.TOKEN_B]),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [CONFIG.AMOUNT_IN])
        ];

        const quoteResult = await diamond.moonxGetQuote.staticCall(quoteArgs);
        console.log("✅ Quote OK:", quoteResult.amountOut.toString());
        console.log("📊 Original best version:", quoteResult.version);

        // Force V3 for testing if needed
        if (CONFIG.FORCE_VERSION) {
            console.log(`🔧 Forcing version to V${CONFIG.FORCE_VERSION} for testing`);
            quoteResult.version = CONFIG.FORCE_VERSION;
            quoteResult.fee = 3000; // 0.3% fee for V3
        }

        // 2. Prepare swap args
        console.log("🔧 Preparing swap args...");
        const swapArgs = [];

        // args[0]: tokenIn
        swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.TOKEN_A]));

        // args[1]: tokenOut  
        swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.TOKEN_B]));

        // args[2]: amountIn
        swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [CONFIG.AMOUNT_IN]));

        // args[3]: slippage (NOT amountOutMin!)
        swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [CONFIG.SLIPPAGE]));

        // args[4]: refData
        const refData = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.REF_ADDRESS]),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [CONFIG.REF_FEE])
        ];
        swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [refData]));

        // Use forced version if specified
        const useVersion = Number(CONFIG.FORCE_VERSION) || Number(quoteResult.version);
        console.log(`🎯 Using version: ${useVersion} (original: ${quoteResult.version})`);

        // args[5]: version
        swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [useVersion]));

        // args[6]: version-specific data
        if (useVersion === 2) {
            // V2 uses path array from quote result
            swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [quoteResult.path]));
        } else if (useVersion === 3) {
            // For V3, use fee from quote result or fallback
            const fee = quoteResult.fee || 3000;
            swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint24"], [fee]));
        } else if (useVersion === 4) {
            swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["bytes"], [quoteResult.routeData]));
        } else {
            // Fallback for unsupported versions - add empty data
            swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["bytes"], ["0x"]));
        }

        console.log(`📦 Prepared ${swapArgs.length} swap args for V${quoteResult.version}`);

        // ❌ REMOVE THIS - Contract doesn't expect deadline
        // args[7]: deadline (ALWAYS required)
        // const deadline = Math.floor(Date.now() / 1000) + 1200;
        // swapArgs.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [deadline]));

        console.log(`✅ Final args count: ${swapArgs.length}`);
        console.log(`🔍 RouteData for V4:`, quoteResult.routeData ? quoteResult.routeData.length : "null");

        // 3. Estimate gas first
        console.log("⛽ Estimating gas...");
        try {
            const gasEstimate = await diamond.execMoonXSwap.estimateGas(swapArgs, {
                value: CONFIG.AMOUNT_IN
            });
            console.log("✅ Gas estimate:", gasEstimate.toString());
        } catch (gasError) {
            console.error("❌ Gas estimation failed:", gasError.message);
            if (gasError.data) {
                console.log("Error data:", gasError.data);
            }
            return;
        }

        // 4. Try dry run first
        console.log("🧪 Testing dry run...");
        try {
            await diamond.execMoonXSwap.staticCall(swapArgs, {
                value: CONFIG.AMOUNT_IN
            });
            console.log("✅ Dry run OK");
        } catch (dryError) {
            console.error("❌ Dry run failed:", dryError.message);
            if (dryError.data) {
                console.log("Error data:", dryError.data);
            }
            return;
        }

        // 5. Execute actual swap
        console.log("🚀 Executing swap...");
        const swapTx = await diamond.execMoonXSwap(swapArgs, {
            value: CONFIG.AMOUNT_IN,
            gasLimit: 800000
        });

        console.log("📝 TX hash:", swapTx.hash);
        const receipt = await swapTx.wait();
        console.log("✅ Swap successful! Gas used:", receipt.gasUsed.toString());

    } catch (error) {
        console.error("❌ Debug failed:", error.message);
        if (error.data) {
            console.log("Error data:", error.data);
        }
        if (error.receipt && error.receipt.status === 0) {
            console.log("Transaction reverted. Receipt:", error.receipt);
        }
    }
}

debugSwap(); 