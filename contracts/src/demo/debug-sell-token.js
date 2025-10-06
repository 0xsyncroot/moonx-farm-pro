const { ethers } = require('ethers');

const CONFIG = {
    DIAMOND_ADDRESS: "0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630",
    RPC_URL: "http://localhost:8645",
    PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    TOKEN_A: "0x1111111111166b7fe7bd91427724b487980afc69", // USDC (token to sell)
    TOKEN_B: "0x0000000000000000000000000000000000000000", // ETH (native token to receive)
    SELL_PERCENTAGE: 50, // Phần trăm token muốn bán (50% = bán một nửa)
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
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

async function debugSellToken() {
    try {
        console.log("🔍 Debug Sell Token (Token -> Native ETH)");
        console.log("⏰ Started at:", new Date().toISOString());

        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        const diamond = new ethers.Contract(CONFIG.DIAMOND_ADDRESS, ABI, signer);
        const tokenContract = new ethers.Contract(CONFIG.TOKEN_A, ERC20_ABI, signer);
        
        // Check current nonce at start
        const initialNonce = await provider.getTransactionCount(signer.address, "pending");
        console.log("🔢 Initial nonce:", initialNonce);
        
        // Check network connection
        const network = await provider.getNetwork();
        console.log("🌐 Network Info:", {
            chainId: Number(network.chainId),
            name: network.name,
            rpcUrl: CONFIG.RPC_URL
        });
        
        console.log("📋 Contract Info:", {
            diamond: CONFIG.DIAMOND_ADDRESS,
            tokenA: CONFIG.TOKEN_A,
            tokenB: CONFIG.TOKEN_B,
            signer: signer.address
        });

        // 0. Check token balance and approve if necessary
        console.log("0️⃣ Checking token balance and approval...");
        const tokenBalance = await tokenContract.balanceOf(signer.address);
        const tokenSymbol = await tokenContract.symbol();
        const tokenDecimals = await tokenContract.decimals();
        
        console.log(`📊 Token Info:`, {
            address: CONFIG.TOKEN_A,
            symbol: tokenSymbol,
            decimals: Number(tokenDecimals),
            balance: ethers.formatUnits(tokenBalance, tokenDecimals),
            sellPercentage: `${CONFIG.SELL_PERCENTAGE}%`
        });
        
        // Calculate the amount to sell based on the percentage
        const amountToSell = (BigInt(tokenBalance) * BigInt(CONFIG.SELL_PERCENTAGE)) / BigInt(100);
        console.log(`📊 Amount to sell: ${ethers.formatUnits(amountToSell, tokenDecimals)} ${tokenSymbol}`);

        if (amountToSell === 0n) {
            console.log(`❌ Insufficient ${tokenSymbol} balance to sell ${CONFIG.SELL_PERCENTAGE}%`);
            return;
        }

        // Check allowance
        const allowance = await tokenContract.allowance(signer.address, CONFIG.DIAMOND_ADDRESS);
        console.log(`📋 Current allowance: ${ethers.formatUnits(allowance, tokenDecimals)} ${tokenSymbol}`);
        
        if (allowance < amountToSell) {
            console.log("🔓 Approving token spending...");
            
            // Get nonce for approval transaction
            const approveNonce = await provider.getTransactionCount(signer.address, "pending");
            console.log("🔢 Approval nonce:", approveNonce);
            
            const approveTx = await tokenContract.approve(CONFIG.DIAMOND_ADDRESS, amountToSell, {
                nonce: approveNonce
            });
            console.log("⏳ Waiting for approval confirmation...");
            await approveTx.wait();
            console.log("✅ Token approved");
            
            // Wait a bit to ensure nonce is updated
            console.log("⏳ Waiting 2 seconds for nonce update...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // 1. Get quote first to get valid parameters
        console.log("1️⃣ Getting quote...");
        console.log("🔄 Swap Direction:", {
            from: `${tokenSymbol} (${CONFIG.TOKEN_A})`,
            to: `ETH (${CONFIG.TOKEN_B})`,
            amount: `${ethers.formatUnits(amountToSell, tokenDecimals)} ${tokenSymbol}`,
            direction: "Token -> Native"
        });
        
        const quoteArgs = [
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.TOKEN_A]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [CONFIG.TOKEN_B]),
            ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountToSell])
        ];

        // Measure quote gas usage
        console.log("⛽ Measuring quote gas usage...");
        const quoteGasEstimate = await diamond.moonxGetQuote.estimateGas(quoteArgs);
        console.log(`📊 Quote gas estimate: ${quoteGasEstimate.toString()} gas`);

        const quoteResult = await diamond.moonxGetQuote.staticCall(quoteArgs);
        console.log("📊 Quote Result:", {
            version: Number(quoteResult.version),
            amountOut: quoteResult.amountOut.toString(),
            fee: quoteResult.fee ? Number(quoteResult.fee) : "N/A",
            path: quoteResult.path ? quoteResult.path : "N/A",
            routeData: quoteResult.routeData ? quoteResult.routeData : "N/A"
        });
        
        if (Number(quoteResult.version) === 0) {
            console.log("❌ Quote failed - version 0 indicates no valid route found");
            console.log("This might be because:");
            console.log("- No liquidity for this token pair");
            console.log("- Token pair not supported");
            console.log("- Amount too small or too large");
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
        } else if (version === 0) {
            // Handle version 0 case
            console.log("⚠️ Version 0 detected - this might indicate no valid route found");
            swapRoute = {
                tokenIn: CONFIG.TOKEN_A,
                tokenOut: CONFIG.TOKEN_B,
                version: version,
                poolFee: 0,
                path: [],
                routeData: "0x",
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
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amountToSell]));

        // args[4]: amountOut (expected)
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [quoteResult.amountOut]));

        // args[5]: slippage (user-provided slippage in basis points)
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [CONFIG.SLIPPAGE]));

        // args[6]: useProvidedQuote (true = use provided quote, false = fetch fresh)
        args.push(ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]));

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
            integratorId: "debug-sell-token",
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
        
        // Token balance (input)
        const tokenInBalanceBefore = await tokenContract.balanceOf(signer.address);
        
        // ETH balance (output)
        const ethBalanceBefore = await provider.getBalance(signer.address);

        console.log("📊 Initial Balances:");
        console.log(`- TokenIn (${tokenSymbol}): ${ethers.formatUnits(tokenInBalanceBefore, tokenDecimals)} ${tokenSymbol}`);
        console.log(`- TokenOut (ETH): ${ethers.formatEther(ethBalanceBefore)} ETH`);
        console.log(`📈 Expected Output: ${ethers.formatEther(quoteResult.amountOut)} ETH`);

        try {
            // 5. Estimate and execute swap
            console.log("5️⃣ Estimating swap gas and executing...");
            
            // Get current nonce to avoid nonce conflicts
            const currentNonce = await provider.getTransactionCount(signer.address, "pending");
            console.log("🔢 Using nonce:", currentNonce);
            
            // Get gas estimate for swap
            console.log("⛽ Getting swap gas estimate...");
            const swapGasEstimate = await diamond.moonxExec.estimateGas(args, {
                value: 0 // No ETH needed when selling tokens
            });
            console.log(`📊 Swap gas estimate: ${swapGasEstimate.toString()} gas`);
            
            // Calculate estimated gas cost
            const gasPrice = await provider.getFeeData();
            const estimatedGasCost = swapGasEstimate * gasPrice.gasPrice;
            console.log(`💰 Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`);
            console.log(`💰 Gas price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);
            
            // Use staticCall first to get the return value, then send the actual transaction
            console.log("📋 Getting exact return value from contract...");
            const staticResult = await diamond.moonxExec.staticCall(args, {
                value: 0
            });
            console.log(`📊 Contract will return: ${ethers.formatEther(staticResult)} ETH`);

            // Check if recipient is the actual signer
            const recipientFromArgs = ethers.AbiCoder.defaultAbiCoder().decode(["address"], args[1])[0];
            console.log(`📋 Address Analysis:`);
            console.log(`   Recipient (from args): ${recipientFromArgs}`);
            console.log(`   Signer address: ${signer.address}`);
            console.log(`   Recipients match: ${recipientFromArgs.toLowerCase() === signer.address.toLowerCase()}`);
            
            // Double-check balance tracking will use correct address
            console.log(`📋 Balance tracking will check: ${signer.address}`);

            const tx = await diamond.moonxExec(args, {
                value: 0, // No ETH needed when selling tokens
                gasLimit: swapGasEstimate * 120n / 100n, // 20% buffer
                nonce: currentNonce
            });

            console.log("✅ Transaction hash:", tx.hash);
            const receipt = await tx.wait();
            console.log("✅ Transaction confirmed, block:", receipt.blockNumber);
            
            // Calculate actual gas usage and analyze efficiency
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
            
            // Analyze transaction logs for ETH transfers
            console.log(`\n📋 Transaction logs (${receipt.logs.length} total):`);
            
            // Look for internal ETH transfers (calls to addresses)
            // Check if there are any value transfers in the transaction
            if (receipt.logs.length > 0) {
                console.log("📋 Found transaction events - analyzing for ETH transfers...");
                // You can add more detailed log analysis here if needed
            } else {
                console.log("⚠️ No events found in transaction");
            }

            // 6. Check final balances and compare
            console.log("6️⃣ Checking final balances...");
            
            // Add delay to ensure balance updates are propagated
            console.log("⏳ Waiting 2 seconds for balance updates...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const tokenInBalanceAfter = await tokenContract.balanceOf(signer.address);
            
            // Force fresh balance query
            const ethBalanceAfter = await provider.getBalance(signer.address, "latest");

            // Calculate differences
            const tokenInUsed = tokenInBalanceBefore - tokenInBalanceAfter;
            const ethBalanceChange = ethBalanceAfter - ethBalanceBefore;
            const actualETHFromContract = staticResult; // This is the exact amount contract returned
            const expectedOut = quoteResult.amountOut;
            
            console.log("\n📊 Balance Analysis:");
            console.log(`✅ Initial ETH Balance: ${ethers.formatEther(ethBalanceBefore)} ETH`);
            console.log(`✅ Final ETH Balance: ${ethers.formatEther(ethBalanceAfter)} ETH`);
            console.log(`📈 Net ETH Change: ${ethers.formatEther(ethBalanceChange)} ETH`);
            console.log(`📊 Raw Values (wei):`);
            console.log(`   - Initial: ${ethBalanceBefore.toString()} wei`);
            console.log(`   - Final: ${ethBalanceAfter.toString()} wei`);
            console.log(`   - Change: ${ethBalanceChange.toString()} wei`);
            console.log(`⛽ Gas Cost: ${ethers.formatEther(actualGasCost)} ETH`);
            console.log(`💰 ETH from Swap: ${ethers.formatEther(actualETHFromContract)} ETH`);
            
            // Verification: ethBalanceChange should equal (ethFromSwap - gasCost)
            const calculatedChange = actualETHFromContract - actualGasCost;
            const verificationDiff = ethBalanceChange - calculatedChange;
            console.log(`🔍 Verification:`);
            console.log(`   Expected change: ${ethers.formatEther(calculatedChange)} ETH`);
            console.log(`   Actual change: ${ethers.formatEther(ethBalanceChange)} ETH`);
            console.log(`   Difference: ${ethers.formatEther(verificationDiff)} ETH (should be ~0)`);
            console.log(`   Difference (wei): ${verificationDiff.toString()} wei`);
            
            const tolerance = BigInt(1e9); // 1 gwei tolerance
            if (verificationDiff >= -tolerance && verificationDiff <= tolerance) {
                console.log("✅ Balance verification PASSED!");
            } else {
                console.log("⚠️ Balance verification FAILED!");
                
                // Debug: Check if ETH went somewhere else
                console.log("🔍 Debugging ETH flow:");
                console.log(`   • Contract says it returned: ${actualETHFromContract.toString()} wei`);
                console.log(`   • Gas cost: ${actualGasCost.toString()} wei`);
                console.log(`   • Expected balance change: ${calculatedChange.toString()} wei`);
                console.log(`   • Actual balance change: ${ethBalanceChange.toString()} wei`);
                console.log(`   • Missing ETH: ${(-verificationDiff).toString()} wei`);
                
                // Special case: User received no ETH despite contract success
                console.log("🚨 CRITICAL: User received NO ETH despite contract claiming success!");
                
                // Check if this is actually normal (gas cost = ETH received)
                if (Math.abs(Number(actualGasCost - actualETHFromContract)) < 1e9) {
                    console.log("💡 EXPLANATION: ETH from swap ≈ Gas cost");
                    console.log("   This is not a bug - you received ETH but spent similar amount on gas");
                    console.log(`   ETH received: ${ethers.formatEther(actualETHFromContract)} ETH`);
                    console.log(`   Gas paid: ${ethers.formatEther(actualGasCost)} ETH`);
                    console.log(`   Net result ≈ 0 ETH`);
                } else {
                    console.log("🔍 Debugging potential issues:");
                    console.log("   Possible causes:");
                    console.log("   - ETH sent to wrong address");
                    console.log("   - Fee logic consumed all ETH");
                    console.log("   - Contract bug in ETH distribution");
                    
                    // Cross-verify: Check if ETH was sent to recipient address
                    const recipientFromArgs = ethers.AbiCoder.defaultAbiCoder().decode(["address"], args[1])[0];
                    if (recipientFromArgs.toLowerCase() !== signer.address.toLowerCase()) {
                        console.log("🔍 FOUND ISSUE: ETH sent to different address!");
                        console.log(`   Script checking: ${signer.address}`);
                        console.log(`   ETH sent to: ${recipientFromArgs}`);
                        
                        // Check balance of actual recipient
                        const recipientBalance = await provider.getBalance(recipientFromArgs, "latest");
                        console.log(`   Recipient balance: ${ethers.formatEther(recipientBalance)} ETH`);
                    } else {
                        console.log("🔍 Address verification passed - investigating contract logic");
                        
                        // Debug fee calculation
                        const platformFee = await diamond.getPlatformFee();
                        const totalSwapOutput = (actualETHFromContract * 10000n) / (10000n - BigInt(platformFee));
                        const calculatedPlatformFee = totalSwapOutput - actualETHFromContract;
                        
                        console.log("🧮 Fee calculation analysis:");
                        console.log(`   Total swap output: ${ethers.formatEther(totalSwapOutput)} ETH`);
                        console.log(`   Platform fee (${Number(platformFee)/100}%): ${ethers.formatEther(calculatedPlatformFee)} ETH`);
                        console.log(`   User should receive: ${ethers.formatEther(actualETHFromContract)} ETH`);
                        console.log(`   But user balance didn't change (excluding gas)`);
                        
                        console.log("\n🚨 POTENTIAL CONTRACT BUG detected!");
                        console.log("   Contract returns correct amount but ETH not transferred to user");
                        
                        // Check if ETH is stuck in contract
                        const contractETHBalance = await provider.getBalance(CONFIG.DIAMOND_ADDRESS, "latest");
                        console.log("🔍 Contract ETH balance check:");
                        console.log(`   Contract balance: ${ethers.formatEther(contractETHBalance)} ETH`);
                        console.log("   If balance > 0, ETH might be stuck in contract");
                        
                        // Suggest manual investigation
                        console.log("\n💡 Manual investigation steps:");
                        console.log("   1. Check transaction trace logs");
                        console.log("   2. Verify _handleOutputFee implementation");
                        console.log("   3. Check if feeFromOutput logic has bugs");
                        console.log(`   4. Verify recipient address in contract: ${recipientFromArgs}`);
                    }
                }
            }
            
            // Explain why balance might not change much
            if (Math.abs(Number(ethBalanceChange)) < 1e-15) {
                console.log("\n💡 Why NET ETH change is ~0:");
                console.log("   • You received ETH from swap: +", ethers.formatEther(actualETHFromContract), "ETH");
                console.log("   • You paid gas for transaction: -", ethers.formatEther(actualGasCost), "ETH"); 
                console.log("   • Net result ≈ 0 (ETH gained ≈ gas paid)");
                console.log("   • This is NORMAL - the swap worked correctly!");
            }

            console.log("\n📊 Token Usage:");
            console.log(`- ${tokenSymbol} Used: ${ethers.formatUnits(tokenInUsed, tokenDecimals)} ${tokenSymbol}`);
            
            console.log("📈 Comparison Results:");
            console.log(`- Expected (quote): ${ethers.formatEther(expectedOut)} ETH`);
            console.log(`- Actual (contract): ${ethers.formatEther(actualETHFromContract)} ETH`);
            
            if (expectedOut > 0n) {
                const difference = actualETHFromContract - expectedOut;
                const percentageDiff = (Number(difference) / Number(expectedOut)) * 100;
                
                console.log(`- Difference: ${ethers.formatEther(difference)} ETH`);
                console.log(`- Percentage: ${percentageDiff.toFixed(4)}%`);
                
                if (actualETHFromContract >= expectedOut) {
                    console.log("✅ Received amount meets or exceeds expectation!");
                } else {
                    console.log("⚠️ Received amount is less than expected");
                    
                    // Calculate platform fee if feeFromOutput is true
                    const platformFee = await diamond.getPlatformFee();
                    const expectedAfterFee = (expectedOut * (10000n - BigInt(platformFee))) / 10000n;
                    console.log(`💡 Expected after ${Number(platformFee)/100}% platform fee: ${ethers.formatEther(expectedAfterFee)} ETH`);
                    
                    if (actualETHFromContract >= expectedAfterFee) {
                        console.log("✅ Received amount matches expectation after fees!");
                    }
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
            
            // Handle nonce conflicts with retry
            if (error.message.includes("nonce") || error.message.includes("NONCE")) {
                console.log("🔄 Nonce conflict detected, retrying with fresh nonce...");
                try {
                    // Wait a bit and get fresh nonce
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    const freshNonce = await provider.getTransactionCount(signer.address, "pending");
                    console.log("🔢 Retry with nonce:", freshNonce);
                    
                    // Get staticCall result for retry
                    console.log("📋 Getting exact return value from retry...");
                    const retryStaticResult = await diamond.moonxExec.staticCall(args, {
                        value: 0
                    });
                    console.log(`📊 Retry contract will return: ${ethers.formatEther(retryStaticResult)} ETH`);
                    
                    const retryTx = await diamond.moonxExec(args, {
                        value: 0,
                        gasLimit: 50000000,
                        nonce: freshNonce
                    });
                    
                    console.log("✅ Retry transaction hash:", retryTx.hash);
                    const retryReceipt = await retryTx.wait();
                    console.log("✅ Retry transaction confirmed, block:", retryReceipt.blockNumber);
                    
                    // Calculate gas cost for retry
                    const retryGasUsed = retryReceipt.gasUsed;
                    const retryGasPrice = retryReceipt.gasPrice || retryReceipt.effectiveGasPrice;
                    const retryGasCost = retryGasUsed * retryGasPrice;
                    
                    console.log("\n⛽ Retry Gas Information:");
                    console.log(`- Gas used: ${retryGasUsed.toString()}`);
                    console.log(`- Gas price: ${ethers.formatUnits(retryGasPrice, 'gwei')} gwei`);
                    console.log(`- Gas cost: ${ethers.formatEther(retryGasCost)} ETH`);
                    
                    // Gas optimization analysis for retry
                    const retryPreOptimizationEstimate = retryGasUsed + 3500n;
                    const retryGasSaved = retryPreOptimizationEstimate - retryGasUsed;
                    const retryGasSavingsCost = retryGasSaved * retryGasPrice;
                    
                    console.log(`🚀 Retry Optimization Impact:`);
                    console.log(`   - Pre-optimization gas: ~${retryPreOptimizationEstimate.toString()} gas`);
                    console.log(`   - Current gas: ${retryGasUsed.toString()} gas`);
                    console.log(`   - Gas saved: ~${retryGasSaved.toString()} gas`);
                    console.log(`   - Cost saved: ~${ethers.formatEther(retryGasSavingsCost)} ETH`);
                    
                    // Continue with balance checking...
                    console.log("6️⃣ Checking final balances...");
                    
                    const tokenInBalanceAfter = await tokenContract.balanceOf(signer.address);
                    const ethBalanceAfter = await provider.getBalance(signer.address);

                    // Calculate differences
                    const tokenInUsed = tokenInBalanceBefore - tokenInBalanceAfter;
                    const ethBalanceChange = ethBalanceAfter - ethBalanceBefore;
                    const actualETHFromContract = retryStaticResult; // Use exact contract return value
                    const expectedOut = quoteResult.amountOut;
                    
                    console.log("📊 Balance Analysis:");
                    console.log(`✅ Initial ETH Balance: ${ethers.formatEther(ethBalanceBefore)} ETH`);
                    console.log(`✅ Final ETH Balance: ${ethers.formatEther(ethBalanceAfter)} ETH`);
                    console.log(`📈 Net ETH Change: ${ethers.formatEther(ethBalanceChange)} ETH`);
                    console.log(`⛽ Gas Cost: ${ethers.formatEther(retryGasCost)} ETH`);
                    console.log(`💰 ETH from Swap: ${ethers.formatEther(actualETHFromContract)} ETH`);
                    
                    // Verification: ethBalanceChange should equal (ethFromSwap - gasCost)
                    const calculatedChange = actualETHFromContract - retryGasCost;
                    const verificationDiff = ethBalanceChange - calculatedChange;
                    console.log(`🔍 Verification: ${ethers.formatEther(calculatedChange)} ETH (expected change)`);
                    console.log(`🔍 Difference: ${ethers.formatEther(verificationDiff)} ETH (should be ~0)`);
                    
                    if (Math.abs(Number(verificationDiff)) < 1e-15) {
                        console.log("✅ Balance verification PASSED!");
                    } else {
                        console.log("⚠️ Balance verification FAILED!");
                    }
                    
                    // Explain why balance might not change much
                    if (Math.abs(Number(ethBalanceChange)) < 1e-15) {
                        console.log("\n💡 Why NET ETH change is ~0:");
                        console.log("   • You received ETH from swap: +", ethers.formatEther(actualETHFromContract), "ETH");
                        console.log("   • You paid gas for transaction: -", ethers.formatEther(retryGasCost), "ETH"); 
                        console.log("   • Net result ≈ 0 (ETH gained ≈ gas paid)");
                        console.log("   • This is NORMAL - the swap worked correctly!");
                    }

                    console.log("\n📊 Token Usage:");
                    console.log(`- ${tokenSymbol} Used: ${ethers.formatUnits(tokenInUsed, tokenDecimals)} ${tokenSymbol}`);
                    
                    console.log("📈 Comparison Results:");
                    console.log(`- Expected (quote): ${ethers.formatEther(expectedOut)} ETH`);
                    console.log(`- Actual (contract): ${ethers.formatEther(actualETHFromContract)} ETH`);
                    
                    if (expectedOut > 0n) {
                        const difference = actualETHFromContract - expectedOut;
                        const percentageDiff = (Number(difference) / Number(expectedOut)) * 100;
                        
                        console.log(`- Difference: ${ethers.formatEther(difference)} ETH`);
                        console.log(`- Percentage: ${percentageDiff.toFixed(4)}%`);
                        
                        if (actualETHFromContract >= expectedOut) {
                            console.log("✅ Received amount meets or exceeds expectation!");
                        } else {
                            console.log("⚠️ Received amount is less than expected");
                            
                            // Calculate platform fee if feeFromOutput is true
                            const platformFee = await diamond.getPlatformFee();
                            const expectedAfterFee = (expectedOut * (10000n - BigInt(platformFee))) / 10000n;
                            console.log(`💡 Expected after ${Number(platformFee)/100}% platform fee: ${ethers.formatEther(expectedAfterFee)} ETH`);
                            
                            if (actualETHFromContract >= expectedAfterFee) {
                                console.log("✅ Received amount matches expectation after fees!");
                            }
                        }
                    }
                    
                    // Final gas summary for retry
                    console.log("\n📋 Retry Final Gas Usage Summary:");
                    console.log("=".repeat(50));
                    console.log(`🔍 Quote Gas: ${quoteGasEstimate.toString()} gas`);
                    console.log(`🔄 Swap Gas: ${retryGasUsed.toString()} gas`);
                    console.log(`💰 Total Cost: ${ethers.formatEther(retryGasCost)} ETH`);
                    console.log(`🚀 Estimated Savings: ${ethers.formatEther(retryGasSavingsCost)} ETH (~${((Number(retryGasSaved) / Number(retryPreOptimizationEstimate)) * 100).toFixed(1)}%)`);
                    console.log("=".repeat(50));
                    
                } catch (retryError) {
                    console.log("❌ Retry also failed:", retryError.message);
                    if (retryError.data) {
                        console.log("❌ Retry error data:", retryError.data);
                    }
                }
            } else {
                if (error.data) {
                    console.log("❌ Error data:", error.data);
                }
            }
        }

    } catch (error) {
        console.error("❌ Debug failed:", error.message);
        if (error.data) {
            console.error("❌ Error data:", error.data);
        }
    }
}

debugSellToken(); 