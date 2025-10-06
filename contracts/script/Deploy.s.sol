// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Diamond imports
import {MoonXFarmRouter} from "../src/Diamond.sol";
import {DiamondCutFacet} from "../src/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../src/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../src/facets/OwnershipFacet.sol";
import {FeeCollectorFacet} from "../src/facets/FeeCollectorFacet.sol";
import {RescueFacet} from "../src/facets/RescueFacet.sol";

// Aggregator imports
import {LifiProxyFacet} from "../src/facets/LifiProxyFacet.sol";
import {OneInchProxyFacet} from "../src/facets/OneInchProxyFacet.sol";
import {MoonXFacet} from "../src/facets/MoonXFacet.sol";

// Diamond interfaces
import {IDiamondCut} from "../src/interfaces/IDiamondCut.sol";
import {DiamondInit} from "../src/upgradeInitializers/DiamondInit.sol";

// Uniswap V4 imports
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";

contract DeployScript is Script {
    // Network configurations
    struct NetworkConfig {
        address weth;
        address universalRouter;
        address lifi;
        address oneInch;
        // Uniswap V2
        address v2Factory;
        address v2Router;
        // Uniswap V3
        address v3Factory;
        address v3Quoter;
        // Uniswap V4
        address v4Quoter;
        address stateLibrary; // V4 StateLibrary for liquidity checks
        address poolManager; // V4 PoolManager for liquidity checks
        address permit2; // Permit2 for signature transfer
    }

    mapping(uint256 => NetworkConfig) public networkConfigs;

    function setUp() public {
        // mainnet
        networkConfigs[1] = NetworkConfig({
            weth: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2,
            universalRouter: 0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af,
            lifi: 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE,
            oneInch: 0x111111125421cA6dc452d289314280a0f8842A65,
            v2Factory: 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f,
            v2Router: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D,
            v3Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984,
            v3Quoter: 0x61fFE014bA17989E743c5F6cB21bF9697530B21e,
            v4Quoter: 0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203,
            poolManager: 0x000000000004444c5dc75cB358380D2e3dE08A90, // V4 PoolManager - Official
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227 // V4 StateLibrary - TODO: Update with real address
        });

         // mainnet
        networkConfigs[11155111] = NetworkConfig({
            weth: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2,
            universalRouter: 0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b,
            lifi: address(0),
            oneInch: address(0),
            v2Factory: 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f,
            v2Router: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D,
            v3Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984,
            v3Quoter: 0x61fFE014bA17989E743c5F6cB21bF9697530B21e,
            v4Quoter: 0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227,
            poolManager: 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543, // V4 PoolManager - Official
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C // V4 StateLibrary - TODO: Update with real address
        });

        // Base Mainnet (8453) - Official Uniswap V4 Addresses
        networkConfigs[8453] = NetworkConfig({
            weth: 0x4200000000000000000000000000000000000006,
            universalRouter: 0x6fF5693b99212Da76ad316178A184AB56D299b43, // V4 Universal Router
            lifi: 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE,
            oneInch: 0x111111125421cA6dc452d289314280a0f8842A65,
            v2Factory: 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6,
            v2Router: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24,
            v3Factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD,
            v3Quoter: 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a,
            v4Quoter: 0x0d5e0F971ED27FBfF6c2837bf31316121532048D, // V4 Quoter - Live on Base!
            poolManager: 0x498581fF718922c3f8e6A244956aF099B2652b2b, // V4 PoolManager - Official
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71 // V4 StateLibrary - Official address
        });

        // Base Sepolia (84532) - Official Uniswap V4 Addresses
        networkConfigs[84532] = NetworkConfig({
            weth: 0x4200000000000000000000000000000000000006,
            universalRouter: 0x492E6456D9528771018DeB9E87ef7750EF184104, // V4 Universal Router
            lifi: address(0), // LiFi not deployed on Base Sepolia
            oneInch: address(0), // 1inch not deployed on Base Sepolia
            v2Factory: 0x4648a43B2C14Da09FdF82B161150d3F634f40491,
            v2Router: 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4,
            v3Factory: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24,
            v3Quoter: 0xC5290058841028F1614F3A6F0F5816cAd0df5E27,
            v4Quoter: 0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa, // V4 Quoter - Live on Base Sepolia!
            poolManager: 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408, // V4 PoolManager - Sepolia
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0x571291b572ed32ce6751a2Cb2486EbEe8DEfB9B4 // V4 StateLibrary - Official address
        });

        // BSC Mainnet (56) - Official Uniswap V4 Addresses
        networkConfigs[56] = NetworkConfig({
            weth: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c, // WBNB
            universalRouter: 0x1906c1d672b88cD1B9aC7593301cA990F94Eae07, // V4 Universal Router
            lifi: 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE,
            oneInch: 0x111111125421cA6dc452d289314280a0f8842A65,
            v2Factory: 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6,
            v2Router: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24,
            v3Factory: 0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7,
            v3Quoter: 0x78D78E420Da98ad378D7799bE8f4AF69033EB077,
            v4Quoter: 0x9F75dD27D6664c475B90e105573E550ff69437B0,
            poolManager: 0x28e2Ea090877bF75740558f6BFB36A5ffeE9e9dF, // V4 PoolManager - BSC
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0xd13Dd3D6E93f276FAfc9Db9E6BB47C1180aeE0c4 // V4 StateLibrary - Official address
        });

        // Zora Mainnet (7777777) - Official Uniswap V4 Addresses
        networkConfigs[7777777] = NetworkConfig({
            weth: 0x4200000000000000000000000000000000000006, // Zora WETH
            universalRouter: 0x3315ef7cA28dB74aBADC6c44570efDF06b04B020, // V4 Universal Router
            lifi: address(0),
            oneInch: address(0),
            v2Factory: 0x0F797dC7efaEA995bB916f268D919d0a1950eE3C, // Zora V2 not deployed yet
            v2Router: 0xa00F34A632630EFd15223B1968358bA4845bEEC7, // Zora V2 not deployed yet
            v3Factory: 0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb, // Zora V3 need confirmation
            v3Quoter: 0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df, // Zora V3 need confirmation
            v4Quoter: 0x5EDACcc0660E0a2C44b06E07Ce8B915E625DC2c6,
            poolManager: 0x0575338e4C17006aE181B47900A84404247CA30f, // V4 PoolManager - Zora
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0x385785Af07d63b50d0a0ea57C4FF89D06adf7328 // V4 StateLibrary - Official address
        });
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        uint256 chainId = block.chainid;
        NetworkConfig memory config = networkConfigs[chainId];

        require(config.weth != address(0), "Unsupported network");

        console.log("Deploying to chain:", chainId);
        console.log("Deployer:", deployer);
        console.log("Fee recipient:", feeRecipient);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy DiamondCutFacet
        DiamondCutFacet diamondCutFacet = new DiamondCutFacet();
        console.log("DiamondCutFacet deployed at:", address(diamondCutFacet));

        // 2. Deploy Diamond
        MoonXFarmRouter diamond = new MoonXFarmRouter(
            deployer,
            address(diamondCutFacet)
        );
        console.log("MoonXFarmRouter deployed at:", address(diamond));

        // 3. Deploy DiamondInit
        DiamondInit diamondInit = new DiamondInit();
        console.log("DiamondInit deployed at:", address(diamondInit));

        // 4. Deploy all facets
        DiamondLoupeFacet diamondLoupeFacet = new DiamondLoupeFacet();
        OwnershipFacet ownershipFacet = new OwnershipFacet();
        FeeCollectorFacet feeCollectorFacet = new FeeCollectorFacet();
        RescueFacet rescueFacet = new RescueFacet();

        console.log("Core facets deployed:");
        console.log("  DiamondLoupeFacet:", address(diamondLoupeFacet));
        console.log("  OwnershipFacet:", address(ownershipFacet));
        console.log("  FeeCollectorFacet:", address(feeCollectorFacet));
        console.log("  RescueFacet:", address(rescueFacet));

        // 5. Deploy aggregator facets (conditional)
        address lifiProxyFacetAddr = address(0);
        address oneInchProxyFacetAddr = address(0);
        uint256 aggregatorCount = 0;

        if (config.lifi != address(0)) {
            LifiProxyFacet lifiProxyFacet = new LifiProxyFacet(config.lifi);
            lifiProxyFacetAddr = address(lifiProxyFacet);
            console.log("  LifiProxyFacet:", lifiProxyFacetAddr);
            aggregatorCount++;
        } else {
            console.log("  LifiProxyFacet: SKIPPED (address not set)");
        }

        if (config.oneInch != address(0)) {
            OneInchProxyFacet oneInchProxyFacet = new OneInchProxyFacet(
                config.oneInch
            );
            oneInchProxyFacetAddr = address(oneInchProxyFacet);
            console.log("  OneInchProxyFacet:", oneInchProxyFacetAddr);
            aggregatorCount++;
        } else {
            console.log("  OneInchProxyFacet: SKIPPED (address not set)");
        }

        console.log(
            "Aggregator proxy facets deployed:",
            aggregatorCount,
            "of 2"
        );

        // 6. Deploy MoonXFacet with all required parameters
        MoonXFacet moonXFacet = new MoonXFacet(
            config.weth,
            config.universalRouter,
            config.v2Factory,
            config.v2Router,
            config.v3Factory,
            config.v3Quoter,
            config.v4Quoter,
            config.stateLibrary,
            IPoolManager(config.poolManager),
            ISignatureTransfer(config.permit2)
        );
        console.log("MoonXFacet deployed at:", address(moonXFacet));

        // 7. Prepare facet cuts (dynamic based on deployed facets)
        IDiamondCut.FacetCut[] memory tempCuts = new IDiamondCut.FacetCut[](7);
        uint256 cutCount = 0;

        // Core facets (always deployed)
        tempCuts[cutCount++] = IDiamondCut.FacetCut({
            facetAddress: address(diamondLoupeFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("DiamondLoupeFacet")
        });

        tempCuts[cutCount++] = IDiamondCut.FacetCut({
            facetAddress: address(ownershipFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("OwnershipFacet")
        });

        tempCuts[cutCount++] = IDiamondCut.FacetCut({
            facetAddress: address(feeCollectorFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("FeeCollectorFacet")
        });

        // Aggregator facets (conditional)
        if (config.lifi != address(0)) {
            tempCuts[cutCount++] = IDiamondCut.FacetCut({
                facetAddress: lifiProxyFacetAddr,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: generateSelectors("LifiProxyFacet")
            });
        }

        if (config.oneInch != address(0)) {
            tempCuts[cutCount++] = IDiamondCut.FacetCut({
                facetAddress: oneInchProxyFacetAddr,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: generateSelectors("OneInchProxyFacet")
            });
        }

        // MoonXFacet (always deployed)
        tempCuts[cutCount++] = IDiamondCut.FacetCut({
            facetAddress: address(moonXFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("MoonXFacet")
        });

        // RescueFacet (always deployed)
        tempCuts[cutCount++] = IDiamondCut.FacetCut({
            facetAddress: address(rescueFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("RescueFacet")
        });

        // Create properly sized cuts array
        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](
            cutCount
        );
        for (uint256 i = 0; i < cutCount; i++) {
            cuts[i] = tempCuts[i];
        }

        // 8. Execute diamond cut
        IDiamondCut(address(diamond)).diamondCut(
            cuts,
            address(diamondInit),
            abi.encodeWithSignature("init()")
        );

        console.log("All facets added to diamond");

        // 9. Set fee recipient
        FeeCollectorFacet(address(diamond)).setFeeRecipient(feeRecipient);
        console.log("Fee recipient set to:", feeRecipient);

        vm.stopBroadcast();

        // 10. Summary
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Network:", chainId);
        console.log("Diamond:", address(diamond));
        console.log("Total facets deployed:", cutCount);
        console.log(
            "  - Core facets: 3 (DiamondLoupe, Ownership, FeeCollector)"
        );
        console.log("  - Proxy facets:", aggregatorCount, "(LiFi, 1inch)");
        console.log("  - In-house facets: 2 (MoonXFacet, RescueFacet)");
        console.log("==========================");
    }

    function generateSelectors(
        string memory facetName
    ) internal pure returns (bytes4[] memory selectors) {
        if (keccak256(bytes(facetName)) == keccak256("DiamondLoupeFacet")) {
            selectors = new bytes4[](5);
            selectors[0] = bytes4(keccak256("facets()"));
            selectors[1] = bytes4(keccak256("facetFunctionSelectors(address)"));
            selectors[2] = bytes4(keccak256("facetAddresses()"));
            selectors[3] = bytes4(keccak256("facetAddress(bytes4)"));
            selectors[4] = bytes4(keccak256("supportsInterface(bytes4)"));
        } else if (keccak256(bytes(facetName)) == keccak256("OwnershipFacet")) {
            selectors = new bytes4[](2);
            selectors[0] = bytes4(keccak256("owner()"));
            selectors[1] = bytes4(keccak256("transferOwnership(address)"));
        } else if (
            keccak256(bytes(facetName)) == keccak256("FeeCollectorFacet")
        ) {
            selectors = new bytes4[](2);
            selectors[0] = bytes4(keccak256("setFeeRecipient(address)"));
            selectors[1] = bytes4(keccak256("getFeeRecipient()"));
        } else if (keccak256(bytes(facetName)) == keccak256("LifiProxyFacet")) {
            selectors = new bytes4[](1);
            selectors[0] = bytes4(
                keccak256("callLifi(uint256,uint256,uint256,bytes)")
            );
        } else if (
            keccak256(bytes(facetName)) == keccak256("OneInchProxyFacet")
        ) {
            selectors = new bytes4[](1);
            selectors[0] = bytes4(
                keccak256("callOneInch(uint256,uint256,uint256,bytes)")
            );
        } else if (keccak256(bytes(facetName)) == keccak256("MoonXFacet")) {
            selectors = new bytes4[](5);
            selectors[0] = bytes4(keccak256("moonxExec(bytes[])"));
            selectors[1] = bytes4(keccak256("moonxGetQuote(bytes[])"));
            selectors[3] = bytes4(keccak256("unlockCallback(bytes)"));
            selectors[4] = bytes4(keccak256("msgSender()"));
        } else if (keccak256(bytes(facetName)) == keccak256("RescueFacet")) {
            selectors = new bytes4[](1);
            selectors[0] = bytes4(
                keccak256("rescueFunds(address,address,uint256)")
            );
        }
    }
}
