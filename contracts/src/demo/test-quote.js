const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0x04233BcA3C0762289A0A278B0E1FAa6De7b1Ef6A",
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

async function testQuote() {
    try {
        console.log("🧪 Testing moonxGetQuote");
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);

        const ABI = ["function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint8 version, uint256 amountOut, uint24 fee, address[] path, bytes routeData))"];
        const contract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, ABI, signer);

        // Test 1: Basic quote ETH -> USDC
        console.log("1️⃣ Testing basic quote...");
        const quoteArgs = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x0000000000000000000000000000000000000000"]), // ETH
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]), // USDC
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], ["1000000000000000000"]) // 1 ETH
        ];

        try {
            console.log("Calling moonxGetQuote...");
            const result = await contract.moonxGetQuote(quoteArgs);
            console.log("✅ Quote successful!");
            console.log("- version:", result.version.toString());
            console.log("- amountOut:", result.amountOut.toString());
            console.log("- fee:", result.fee.toString());
            console.log("- path:", result.path);
            console.log("- routeData length:", result.routeData.length);
        } catch (error) {
            console.log("❌ Quote failed:", error.message);
            if (error.data) {
                console.log("❌ Error data:", error.data);
            }
        }

        // Test 2: Invalid tokenIn
        console.log("\n2️⃣ Testing with invalid tokenIn...");
        const invalidArgs = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x1111111111111111111111111111111111111111"]), // Invalid token
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]), // USDC
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], ["1000000000000000000"]) // 1 ETH
        ];

        try {
            const result = await contract.moonxGetQuote(invalidArgs);
            console.log("✅ Invalid quote returned:", result.version.toString());
        } catch (error) {
            console.log("❌ Invalid quote failed (expected):", error.message.substring(0, 100));
        }

        // Test 3: Too small amount
        console.log("\n3️⃣ Testing with small amount...");
        const smallArgs = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x0000000000000000000000000000000000000000"]), // ETH
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]), // USDC
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], ["1000"]) // 1000 wei
        ];

        try {
            const result = await contract.moonxGetQuote(smallArgs);
            console.log("✅ Small amount quote:", result.version.toString());
        } catch (error) {
            console.log("❌ Small amount failed:", error.message.substring(0, 100));
        }

    } catch (error) {
        console.error("❌ Test failed:", error.message);
    }
}

testQuote(); 