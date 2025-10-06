const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0x04233BcA3C0762289A0A278B0E1FAa6De7b1Ef6A",
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

async function debugDiamondRouting() {
    try {
        console.log("🔍 Debugging Diamond Routing for execMoonXSwap");
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);

        // 1. Test direct call to facet address (bypass diamond)
        console.log("1️⃣ Testing direct call to MoonXFacet...");
        const FACET_ADDRESS = "0x3714462a45aB78f7276DCBbEa44CE717eBF4a391";
        const MOONX_ABI = [
            "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)",
            "function moonxGetPlatformFee() external view returns (uint256)"
        ];
        
        const facetContract = new ethers.Contract(FACET_ADDRESS, MOONX_ABI, signer);
        
        try {
            const platformFee = await facetContract.moonxGetPlatformFee();
            console.log("✅ Direct facet call works - platformFee:", platformFee.toString());
        } catch (error) {
            console.log("❌ Direct facet call failed:", error.message);
        }

        // 2. Test minimal execMoonXSwap on direct facet
        console.log("\n2️⃣ Testing execMoonXSwap on direct facet...");
        try {
            const minimalArgs = [
                ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x0000000000000000000000000000000000000000"]),
                ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]),
                ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], ["1000"])
            ];
            
            await facetContract.execMoonXSwap.staticCall(minimalArgs, { value: 0 });
            console.log("✅ Direct facet execMoonXSwap works");
        } catch (error) {
            if (error.data === "0xa9ad62f8") {
                console.log("❌ Direct facet also returns FunctionDoesNotExist - facet implementation issue!");
            } else {
                console.log("✅ Direct facet execMoonXSwap reached function:", error.message.substring(0, 100));
            }
        }

        // 3. Test diamond lookup vs direct call
        console.log("\n3️⃣ Comparing diamond vs direct facet...");
        const LOUPE_ABI = ["function facetAddress(bytes4 _functionSelector) external view returns (address facetAddress_)"];
        const loupeContract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, LOUPE_ABI, provider);
        
        const execSelector = "0xe011f8c5";
        const platformSelector = "0x96e1f011";
        
        const execFacet = await loupeContract.facetAddress(execSelector);
        const platformFacet = await loupeContract.facetAddress(platformSelector);
        
        console.log("Diamond lookup for execMoonXSwap:", execFacet);
        console.log("Diamond lookup for moonxGetPlatformFee:", platformFacet);
        console.log("Expected facet address:", FACET_ADDRESS);
        console.log("Match?", execFacet.toLowerCase() === FACET_ADDRESS.toLowerCase());

        // 4. Test raw diamond call with manual calldata
        console.log("\n4️⃣ Testing raw diamond call...");
        try {
            const emptyArgsData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [[]]);
            const callData = execSelector + emptyArgsData.slice(2);
            
            console.log("Call data:", callData);
            console.log("To:", CONFIG.DIAMOND_ADDRESS);
            
            const result = await provider.call({
                to: CONFIG.DIAMOND_ADDRESS,
                data: callData,
                value: 0
            });
            console.log("✅ Raw diamond call works, result:", result);
        } catch (error) {
            console.log("❌ Raw diamond call error:", error.data || error.message);
        }

        // 5. Check if there's a function selector collision
        console.log("\n5️⃣ Checking for selector collisions...");
        const FACETS_ABI = ["function facets() external view returns (tuple(address facetAddress, bytes4[] functionSelectors)[] memory facets_)"];
        const facetsContract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, FACETS_ABI, provider);
        
        const facets = await facetsContract.facets();
        let collisionFound = false;
        
        for (let i = 0; i < facets.length; i++) {
            const facet = facets[i];
            for (let j = 0; j < facet.functionSelectors.length; j++) {
                if (facet.functionSelectors[j] === execSelector) {
                    console.log(`Found execMoonXSwap in facet ${i + 1}: ${facet.facetAddress}`);
                    if (collisionFound) {
                        console.log("⚠️ COLLISION DETECTED!");
                    }
                    collisionFound = true;
                }
            }
        }

    } catch (error) {
        console.error("❌ Debug failed:", error.message);
    }
}

debugDiamondRouting(); 