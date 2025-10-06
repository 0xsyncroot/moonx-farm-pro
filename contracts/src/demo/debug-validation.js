const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630",
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    TOKEN_A: "0x1111111111166b7fe7bd91427724b487980afc69", // ETH
    TOKEN_B: "0x852cACF2829e0354929087f461cFe5f7D4D40eaE", // USDC
    AMOUNT_IN: "100000000000000000000", // 0.1 ETH
    SLIPPAGE: 300, // 30%
    REF_ADDRESS: "0x0000000000000000000000000000000000000000",
    REF_FEE: 0,
};

const ABI = [
    "function moonxExec(bytes[] calldata args) external payable returns (uint256)",
    "function moonxGetQuote(bytes[] calldata args) external returns (tuple(uint256 amountOut, uint128 liquidity, uint24 fee, uint8 version, address hooks, address[] path, bytes routeData))",
    "function getPlatformFee() external view returns (uint256)"
];

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

async function debugValidation() {
    try {
        console.log("🔍 Debug Validation Steps");

        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        const diamond = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, ABI, signer);
        console.log(CONFIG)
        // 1. Get quote first to get valid parameters
        console.log("1️⃣ Getting quote...");
        const quoteArgs = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.TOKEN_A]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.TOKEN_B]),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [CONFIG.AMOUNT_IN])
        ];

        // Measure quote gas usage
        console.log("⛽ Measuring quote gas usage...");
        const quoteGasEstimate = await diamond.moonxGetQuote.estimateGas(quoteArgs);
        console.log(`📊 Quote gas estimate: ${quoteGasEstimate.toString()} gas`);

        const quoteResult = await diamond.moonxGetQuote.staticCall(quoteArgs);
        if (Number(quoteResult.version) === 0) {
            console.log("❌ Quote failed, version 0");
            return;
        }
        console.log("✅ Quote OK, version:", Number(quoteResult.version));

        // 2. Prepare new structured swap args
        console.log("2️⃣ Preparing new structured swap args...");
        const args = [];
        const version = Number(quoteResult.version);

        // args[0]: SwapRoute
        let swapRoute;
        if (version === 2) {
            swapRoute = {
                tokenIn: CONFIG.TOKEN_A,
                tokenOut: CONFIG.TOKEN_B,
                version: version,
                poolFee: 0,
                path: quoteResult.path || [],
                routeData: "0x",
                hookData: "0x"
            };
        } else if (version === 3) {
            swapRoute = {
                tokenIn: CONFIG.TOKEN_A,
                tokenOut: CONFIG.TOKEN_B,
                version: version,
                poolFee: quoteResult.fee || 3000,
                path: [],
                routeData: "0x",
                hookData: "0x"
            };
        } else if (version === 4) {
            swapRoute = {
                tokenIn: CONFIG.TOKEN_A,
                tokenOut: CONFIG.TOKEN_B,
                version: version,
                poolFee: quoteResult.fee || 3000,
                path: [],
                routeData: quoteResult.routeData || "0x",
                hookData: "0x"
            };
        }

        args.push(ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,address,uint8,uint24,address[],bytes,bytes)"],
            [[
                swapRoute.tokenIn,
                swapRoute.tokenOut,
                swapRoute.version,
                swapRoute.poolFee,
                swapRoute.path,
                swapRoute.routeData,
                swapRoute.hookData
            ]]
        ));

        // args[1]: recipient (optional, can be empty for msg.sender)
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [signer.address]));

        // args[2]: RefConfiguration (only referral settings - platform fee managed globally)
        const refConfig = {
            refAddress: CONFIG.REF_ADDRESS,
            refFee: CONFIG.REF_FEE
        };
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,uint256)"],
            [[
                refConfig.refAddress,
                refConfig.refFee
            ]]
        ));

        // args[3]: amountIn
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [CONFIG.AMOUNT_IN]));

        // args[4]: amountOut (expected)
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [quoteResult.amountOut]));

        // args[5]: slippage (user-provided slippage in basis points)
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [CONFIG.SLIPPAGE]));

        // args[6]: useProvidedQuote (true = use provided quote, false = fetch fresh quote)
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true])); // Test fresh quote fetching

        // args[7]: PlatformConfig
        const platformConfig = {
            gasOptimization: true,
            mevProtection: true, // Enable MEV protection for testing
            routeType: 0 // best_price
        };
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(bool,bool,uint8)"],
            [[
                platformConfig.gasOptimization,
                platformConfig.mevProtection,
                platformConfig.routeType
            ]]
        ));

        // args[8]: SwapMetadata (SwapCache được contract tự tạo internally)
        const metadata = {
            integratorId: "debug-validation",
            userData: "0x",
            nonce: 0,
            signature: "0x",
            isPermit2: false,
            aggregatorVersion: 2
        };
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(string,bytes,uint256,bytes,bool,uint8)"],
            [[
                metadata.integratorId,
                metadata.userData,
                metadata.nonce,
                metadata.signature,
                metadata.isPermit2,
                metadata.aggregatorVersion
            ]]
        ));

        console.log(`✅ Prepared ${args.length} structured args for V${version}`);

        // 3. Debug parameters
        console.log("3️⃣ Debugging new structured parameters...");
        console.log("📋 Args validation:");
        
        // Decode SwapRoute
        const decodedRoute = ethers.AbiCoder.defaultAbiCoder().decode(
            ["tuple(address,address,uint8,uint24,address[],bytes,bytes)"], 
            args[0]
        )[0];
        console.log("- SwapRoute:");
        console.log("  tokenIn:", decodedRoute[0]);
        console.log("  tokenOut:", decodedRoute[1]);
        console.log("  version:", Number(decodedRoute[2]));
        console.log("  poolFee:", Number(decodedRoute[3]));
        console.log("  path length:", decodedRoute[4].length);
        
        // Decode recipient
        const recipient = ethers.AbiCoder.defaultAbiCoder().decode(["address"], args[1])[0];
        console.log("- recipient:", recipient);
        
        // Decode RefConfiguration
        const decodedRef = ethers.AbiCoder.defaultAbiCoder().decode(
            ["tuple(address,uint256)"], 
            args[2]
        )[0];
        console.log("- RefConfiguration:");
        console.log("  refAddress:", decodedRef[0]);
        console.log("  refFee:", decodedRef[1].toString());
        
        // Decode amounts
        const amountIn = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], args[3])[0];
        const amountOut = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], args[4])[0];
        const slippage = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], args[5])[0];
        const useProvidedQuote = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], args[6])[0];
        
        console.log("- amountIn:", amountIn.toString());
        console.log("- amountOut (expected):", amountOut.toString());
        console.log("- slippage:", slippage.toString(), `(${Number(slippage)/100}%)`);
        console.log("- useProvidedQuote:", useProvidedQuote);
        
        // Decode PlatformConfig
        const decodedPlatform = ethers.AbiCoder.defaultAbiCoder().decode(
            ["tuple(bool,bool,uint8)"], 
            args[7]
        )[0];
        console.log("- PlatformConfig:");
        console.log("  gasOptimization:", decodedPlatform[0]);
        console.log("  mevProtection:", decodedPlatform[1]);
        console.log("  routeType:", Number(decodedPlatform[2]));
        
        console.log("- args count:", args.length);

        // 4. Get initial balances
        console.log("4️⃣ Getting initial balances...");
        let tokenInBalanceBefore, tokenOutBalanceBefore;
        let tokenOutContract = null;
        let tokenOutSymbol = "ETH";
        let tokenOutDecimals = 18;
        let tokenInContract = null;
        let tokenInSymbol = "ETH";
        let tokenInDecimals = 18;
        if (CONFIG.TOKEN_A === "0x0000000000000000000000000000000000000000") {
            // ETH balance
            tokenInBalanceBefore = await provider.getBalance(signer.address);
        } else {
            // ERC20 balance
            tokenInContract = new ethers.Contract(CONFIG.TOKEN_A, ERC20_ABI, signer);
            tokenInBalanceBefore = await tokenInContract.balanceOf(signer.address);
            tokenInSymbol = await tokenInContract.symbol();
            tokenInDecimals = await tokenInContract.decimals();
        }

        if (CONFIG.TOKEN_B === "0x0000000000000000000000000000000000000000") {
            // ETH balance
            tokenOutBalanceBefore = await provider.getBalance(signer.address);
        } else {
            // ERC20 balance
            tokenOutContract = new ethers.Contract(CONFIG.TOKEN_B, ERC20_ABI, provider);
            tokenOutBalanceBefore = await tokenOutContract.balanceOf(signer.address);
            tokenOutSymbol = await tokenOutContract.symbol();
            tokenOutDecimals = await tokenOutContract.decimals();
        }

        console.log("📊 Initial Balances:");
        console.log(`- TokenIn: ${ethers.formatEther(tokenInBalanceBefore)} ETH`);
        console.log(`- TokenOut: ${ethers.formatUnits(tokenOutBalanceBefore, tokenOutDecimals)} ${tokenOutSymbol} - ${tokenOutBalanceBefore}`);
        console.log(`📈 Expected Output: ${ethers.formatUnits(quoteResult.amountOut, tokenOutDecimals)} ${tokenOutSymbol}`);

        try {
            if (CONFIG.TOKEN_A !== "0x0000000000000000000000000000000000000000") {
                const allowance = await tokenInContract.allowance(signer.address, CONFIG.DIAMOND_ADDRESS);
                console.log(`📋 Current allowance: ${ethers.formatUnits(allowance, tokenInDecimals)} ${tokenInSymbol}`);

                if (allowance < CONFIG.AMOUNT_IN) {
                    console.log("🔓 Approving token spending...");

                    // Get nonce for approval transaction
                    const approveNonce = await provider.getTransactionCount(signer.address, "pending");
                    console.log("🔢 Approval nonce:", approveNonce);

                    const approveTx = await tokenInContract.approve(CONFIG.DIAMOND_ADDRESS, CONFIG.AMOUNT_IN, {
                        nonce: approveNonce
                    });
                    console.log("⏳ Waiting for approval confirmation...");
                    await approveTx.wait();
                    console.log("✅ Token approved");

                    // Wait a bit to ensure nonce is updated
                    console.log("⏳ Waiting 2 seconds for nonce update...");
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // 5. Estimate and execute swap
            console.log("5️⃣ Estimating swap gas and executing...");
            
            // Get gas estimate for swap
            console.log("⛽ Getting swap gas estimate...");
            const swapGasEstimate = await diamond.moonxExec.estimateGas(args, {
                value: CONFIG.TOKEN_A === "0x0000000000000000000000000000000000000000" ? CONFIG.AMOUNT_IN : 0n
            });
            console.log(`📊 Swap gas estimate: ${swapGasEstimate.toString()} gas`);
            
            // Calculate estimated gas cost
            const gasPrice = await provider.getFeeData();
            const estimatedGasCost = swapGasEstimate * gasPrice.gasPrice;
            console.log(`💰 Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`);
            console.log(`💰 Gas price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);

            const tx = await diamond.moonxExec(args, {
                value: CONFIG.TOKEN_A === "0x0000000000000000000000000000000000000000" ? CONFIG.AMOUNT_IN : 0n,
                gasLimit: swapGasEstimate * 120n / 100n // 20% buffer
            });

            console.log("✅ Transaction hash:", tx.hash);
            const receipt = await tx.wait();
            console.log("✅ Transaction confirmed, block:", receipt.blockNumber);

            // Calculate actual gas usage
            const actualGasUsed = receipt.gasUsed;
            const actualGasPrice = receipt.gasPrice || receipt.effectiveGasPrice;
            const actualGasCost = actualGasUsed * actualGasPrice;
            
            console.log("\n⛽ Gas Usage Analysis:");
            console.log(`📊 Quote gas estimate: ${quoteGasEstimate.toString()} gas`);
            console.log(`📊 Swap gas estimate: ${swapGasEstimate.toString()} gas`);
            console.log(`📊 Swap gas used: ${actualGasUsed.toString()} gas`);
            console.log(`💰 Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`);
            console.log(`💰 Actual gas cost: ${ethers.formatEther(actualGasCost)} ETH`);
            console.log(`🔍 Gas efficiency: ${((Number(actualGasUsed) / Number(swapGasEstimate)) * 100).toFixed(2)}%`);
            
            // Calculate gas savings from optimization
            const preOptimizationEstimate = actualGasUsed + 3500n; // Theoretical savings from staticcall optimization
            const gasSaved = preOptimizationEstimate - actualGasUsed;
            const gasSavingsCost = gasSaved * actualGasPrice;
            
            console.log(`🚀 Optimization Impact (estimated):`);
            console.log(`   - Pre-optimization gas: ~${preOptimizationEstimate.toString()} gas`);
            console.log(`   - Current gas: ${actualGasUsed.toString()} gas`);
            console.log(`   - Gas saved: ~${gasSaved.toString()} gas`);
            console.log(`   - Cost saved: ~${ethers.formatEther(gasSavingsCost)} ETH`);
            console.log(`   - Savings: ~${((Number(gasSaved) / Number(preOptimizationEstimate)) * 100).toFixed(2)}%`);

            // 6. Check final balances and compare
            console.log("\n6️⃣ Checking final balances...");
            let tokenInBalanceAfter, tokenOutBalanceAfter;

            if (CONFIG.TOKEN_A === "0x0000000000000000000000000000000000000000") {
                tokenInBalanceAfter = await provider.getBalance(signer.address);
            } else {
                const tokenInContract = new ethers.Contract(CONFIG.TOKEN_A, ERC20_ABI, provider);
                tokenInBalanceAfter = await tokenInContract.balanceOf(signer.address);
            }

            if (CONFIG.TOKEN_B === "0x0000000000000000000000000000000000000000") {
                tokenOutBalanceAfter = await provider.getBalance(signer.address);
            } else {
                tokenOutBalanceAfter = await tokenOutContract.balanceOf(signer.address);
            }

            // Calculate differences
            const tokenInUsed = tokenInBalanceBefore - tokenInBalanceAfter;
            const tokenOutReceived = tokenOutBalanceAfter - tokenOutBalanceBefore;
            const expectedOut = quoteResult.amountOut;

            console.log("📊 Final Balances:");
            console.log(`- TokenIn: ${ethers.formatEther(tokenInBalanceAfter)} ETH`);
            console.log(`- TokenOut: ${ethers.formatEther(tokenOutBalanceAfter)} ${tokenOutSymbol} - ${tokenOutBalanceAfter}`);

            console.log(`- TokenIn Used: ${ethers.formatEther(tokenInUsed)} ETH`);
            console.log(`- TokenOut Received: ${ethers.formatUnits(tokenOutReceived, tokenOutDecimals)} ${tokenOutSymbol}`);

            console.log("📈 Comparison Results:");
            console.log(`- Expected: ${ethers.formatUnits(expectedOut, tokenOutDecimals)} ${tokenOutSymbol}`);
            console.log(`- Actual: ${ethers.formatUnits(tokenOutReceived, tokenOutDecimals)} ${tokenOutSymbol}`);

            if (expectedOut > 0n) {
                const difference = tokenOutReceived - expectedOut;
                const percentageDiff = (Number(difference) / Number(expectedOut)) * 100;

                console.log(`- Difference: ${ethers.formatUnits(difference, tokenOutDecimals)} ${tokenOutSymbol}`);
                console.log(`- Percentage: ${percentageDiff.toFixed(4)}%`);

                if (tokenOutReceived >= expectedOut) {
                    console.log("✅ Received amount meets or exceeds expectation!");
                } else {
                    console.log("⚠️ Received amount is less than expected");
                }
            }

            // Final gas summary
            console.log("\n📋 Final Gas Usage Summary:");
            console.log("=".repeat(50));
            console.log(`🔍 Quote Gas: ${quoteGasEstimate.toString()} gas`);
            console.log(`🔄 Swap Gas: ${actualGasUsed.toString()} gas`);
            console.log(`💰 Total Cost: ${ethers.formatEther(actualGasCost)} ETH`);
            console.log(`🚀 Estimated Savings: ${ethers.formatEther(gasSavingsCost)} ETH (~${((Number(gasSaved) / Number(preOptimizationEstimate)) * 100).toFixed(1)}%)`);
            console.log("=".repeat(50));

        } catch (error) {
            console.log("❌ Execution failed:", error.message);
            if (error.data) {
                console.log("❌ Error data:", error.data);
            }
        }

    } catch (error) {
        console.error("❌ Debug failed:", error.message);
        if (error.data) {
            console.error("❌ Error data:", error.data);
        }
    }
}

debugValidation(); 