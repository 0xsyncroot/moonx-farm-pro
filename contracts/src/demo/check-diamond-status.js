const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0x04233BcA3C0762289A0A278B0E1FAa6De7b1Ef6A",
    RPC_URL: "http://localhost:8645",
};

const DIAMOND_LOUPE_ABI = [
    "function facets() external view returns (tuple(address facetAddress, bytes4[] functionSelectors)[] memory facets_)",
    "function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory facetFunctionSelectors_)",
    "function facetAddresses() external view returns (address[] memory facetAddresses_)",
    "function facetAddress(bytes4 _functionSelector) external view returns (address facetAddress_)"
];

const MOONX_FACET_ABI = [
    "function execMoonXSwap(bytes[] calldata args) external payable returns (uint256)",
    "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint8 version, uint256 amountOut, uint24 fee, address[] path, bytes routeData))",
    "function moonxGetPlatformFee() external view returns (uint256)"
];

async function checkDiamondStatus() {
    try {
        console.log("🔍 Checking Diamond Status...");
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const diamond = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, DIAMOND_LOUPE_ABI, provider);

        // 1. Get all facets
        console.log("1️⃣ Getting all facets...");
        const facets = await diamond.facets();
        console.log(`Found ${facets.length} facets:`);

        for (let i = 0; i < facets.length; i++) {
            const facet = facets[i];
            console.log(`  ${i + 1}. ${facet.facetAddress}`);
            console.log(`     Functions: ${facet.functionSelectors.length}`);
            
            // Decode function selectors to signatures
            for (let j = 0; j < facet.functionSelectors.length; j++) {
                const selector = facet.functionSelectors[j];
                console.log(`       - ${selector}`);
            }
        }

        // 2. Check specific MoonXFacet function selectors
        console.log("\n2️⃣ Checking MoonXFacet function selectors...");
        
        const expectedSelectors = [
            ethers.id("execMoonXSwap(bytes[])").substring(0, 10),
            ethers.id("moonxGetQuote(bytes[])").substring(0, 10),
            ethers.id("moonxGetPlatformFee()").substring(0, 10)
        ];

        console.log("Expected MoonXFacet selectors:");
        expectedSelectors.forEach((selector, index) => {
            const functionNames = [
                "execMoonXSwap(bytes[])",
                "moonxGetQuote(bytes[])", 
                "moonxGetPlatformFee()"
            ];
            console.log(`  ${functionNames[index]}: ${selector}`);
        });

        // 3. Check if selectors exist in diamond
        console.log("\n3️⃣ Verifying function selectors in diamond...");
        for (let i = 0; i < expectedSelectors.length; i++) {
            const selector = expectedSelectors[i];
            const functionNames = [
                "execMoonXSwap(bytes[])",
                "moonxGetQuote(bytes[])", 
                "moonxGetPlatformFee()"
            ];
            
            try {
                const facetAddress = await diamond.facetAddress(selector);
                if (facetAddress === ethers.ZeroAddress) {
                    console.log(`❌ ${functionNames[i]} (${selector}): NOT FOUND`);
                } else {
                    console.log(`✅ ${functionNames[i]} (${selector}): ${facetAddress}`);
                }
            } catch (error) {
                console.log(`❌ ${functionNames[i]} (${selector}): ERROR - ${error.message}`);
            }
        }

        // 4. Try to call a simple function to test if diamond works
        console.log("\n4️⃣ Testing diamond connectivity...");
        try {
            const facetAddresses = await diamond.facetAddresses();
            console.log(`✅ Diamond responsive, ${facetAddresses.length} facet addresses found`);
        } catch (error) {
            console.log(`❌ Diamond not responsive: ${error.message}`);
        }

        // 5. Test direct MoonXFacet functions if they exist
        console.log("\n5️⃣ Testing MoonXFacet functions...");
        const moonxContract = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, MOONX_FACET_ABI, provider);
        
        try {
            const platformFee = await moonxContract.moonxGetPlatformFee();
            console.log(`✅ moonxGetPlatformFee() works: ${platformFee.toString()}`);
        } catch (error) {
            console.log(`❌ moonxGetPlatformFee() failed: ${error.message}`);
        }

        try {
            // Test static call for execMoonXSwap
            const testArgs = [
                ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x0000000000000000000000000000000000000000"]),
                ethers.AbiCoder.defaultAbiCoder().encode(["address"], ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]),
                ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], ["1000"])
            ];
            
            // This should fail with validation error if function exists, or FunctionDoesNotExist if not
            await moonxContract.execMoonXSwap.staticCall(testArgs, { value: 0 });
            console.log(`✅ execMoonXSwap() function exists (validation may have failed)`);
        } catch (error) {
            if (error.message.includes("FunctionDoesNotExist") || error.data === "0xa9ad62f8") {
                console.log(`❌ execMoonXSwap() function NOT FOUND in diamond`);
            } else {
                console.log(`✅ execMoonXSwap() function exists but failed validation: ${error.message.substring(0, 100)}...`);
            }
        }

    } catch (error) {
        console.error("❌ Check failed:", error.message);
    }
}

checkDiamondStatus(); 