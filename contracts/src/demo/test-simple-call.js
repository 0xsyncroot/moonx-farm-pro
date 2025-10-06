const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0xF3E1a41a03288e0eb6aeeA298cc8Ac9856f9e7AC",
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

async function testSimpleCall() {
    try {
        console.log("🧪 Testing Simple Function Calls");
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);

        // 1. Test moonxGetPlatformFee (should work)
        console.log("1️⃣ Testing moonxGetPlatformFee...");
        const platformFeeABI = ["function moonxGetPlatformFee() external view returns (uint256)"];
        const platformFeeContract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, platformFeeABI, provider);
        
        try {
            const platformFee = await platformFeeContract.moonxGetPlatformFee();
            console.log("✅ moonxGetPlatformFee works:", platformFee.toString());
        } catch (error) {
            console.log("❌ moonxGetPlatformFee failed:", error.message);
        }

        // 2. Test execMoonXSwap with empty args (should fail with different error)
        console.log("\n2️⃣ Testing execMoonXSwap with minimal args...");
        const execSwapABI = ["function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)"];
        const execSwapContract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, execSwapABI, signer);
        
        try {
            // Test with just empty args to see if function is reachable
            const emptyArgs = [];
            await execSwapContract.execMoonXSwap.staticCall(emptyArgs, { value: 0 });
            console.log("✅ execMoonXSwap function is reachable");
        } catch (error) {
            if (error.data === "0xa9ad62f8") {
                console.log("❌ execMoonXSwap: FunctionDoesNotExist - routing issue!");
            } else {
                console.log("✅ execMoonXSwap function is reachable but failed validation:", error.message.substring(0, 100));
            }
        }

        // 3. Test with manual function selector call
        console.log("\n3️⃣ Testing direct function selector call...");
        try {
            const execSelector = "0xe011f8c5"; // execMoonXSwap selector
            const emptyArgsData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [[]]);
            const callData = execSelector + emptyArgsData.slice(2);
            
            const result = await provider.call({
                to: CONFIG.DIAMOND_ADDRESS,
                data: callData,
                value: 0
            });
            console.log("✅ Direct selector call works, result length:", result.length);
        } catch (error) {
            if (error.data === "0xa9ad62f8") {
                console.log("❌ Direct call: FunctionDoesNotExist - selector not found in diamond!");
            } else {
                console.log("✅ Direct call reached function:", error.message.substring(0, 100));
            }
        }

        // 4. Check if function selector exists in diamond
        console.log("\n4️⃣ Verifying function selector in diamond...");
        const loupeABI = ["function facetAddress(bytes4 _functionSelector) external view returns (address facetAddress_)"];
        const loupeContract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, loupeABI, provider);
        
        try {
            const facetAddress = await loupeContract.facetAddress("0xe011f8c5");
            if (facetAddress === ethers.ZeroAddress) {
                console.log("❌ execMoonXSwap selector NOT registered in diamond");
            } else {
                console.log("✅ execMoonXSwap selector found at facet:", facetAddress);
            }
        } catch (error) {
            console.log("❌ Error checking facetAddress:", error.message);
        }

        // 5. Test with very simple args structure
        console.log("\n5️⃣ Testing with minimum valid args...");
        try {
            const minimalArgs = [
                ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x0000000000000000000000000000000000000000"]), // tokenIn
                ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]), // tokenOut
                ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], ["1000"]), // amountIn (minimal)
            ];
            
            await execSwapContract.execMoonXSwap.staticCall(minimalArgs, { value: 0 });
            console.log("✅ Minimal args call works");
        } catch (error) {
            if (error.data === "0xa9ad62f8") {
                console.log("❌ Minimal args: FunctionDoesNotExist");
            } else {
                console.log("✅ Minimal args reached function:", error.message.substring(0, 100));
            }
        }

    } catch (error) {
        console.error("❌ Test failed:", error.message);
    }
}

testSimpleCall(); 