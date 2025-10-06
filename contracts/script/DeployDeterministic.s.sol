// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
 * ┃                                                    MOONX FARM ROUTER - DETERMINISTIC DEPLOYMENT SCRIPT                                                                        ┃
 * ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
 * 
 * @title DeployDeterministicScript
 * @notice Deploys MoonX Farm Router Diamond using CREATE2 for consistent addresses across chains
 * 
 * @dev DEPLOYMENT FLOW:
 * 1. Predict all contract addresses using CREATE2
 * 2. Deploy DiamondCutFacet with CREATE2
 * 3. Deploy Diamond (MoonXFarmRouter) with CREATE2 
 * 4. Deploy DiamondInit with CREATE2
 * 5. Deploy all core facets (DiamondLoupe, Ownership, FeeCollector, Rescue)
 * 6. Deploy conditional proxy facets (LiFi, 1inch) if configured
 * 7. Deploy MoonXFacet with all required dependencies
 * 8. Execute diamond cut to add all facets
 * 9. Initialize diamond and set fee recipient
 * 
 * @dev SECURITY FEATURES:
 * - CREATE2 ensures deterministic addresses across chains
 * - All facets deployed with same SALT for predictability
 * - Comprehensive validation of network configurations
 * - Address prediction verification before deployment
 * - Uses Forge's standard CREATE2 deployer (0x4e59b44847b379578588920ca78fbf26c0b4956c)
 * 
 * @dev SUPPORTED NETWORKS:
 * - Ethereum Mainnet (chainId: 1)
 * - Base Mainnet (chainId: 8453)
 * - Easy to extend for additional chains
 * 
 * @author MoonX Team
 * @custom:version 1.0.0
 */

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Diamond imports
import {MoonXFarmRouter} from "../src/Diamond.sol";
import {DiamondCutFacet} from "../src/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../src/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../src/facets/OwnershipFacet.sol";
import {FeeCollectorFacet} from "../src/facets/FeeCollectorFacet.sol";
import {RescueFacet} from "../src/facets/RescueFacet.sol";
import {MoonXFacet} from "../src/facets/MoonXFacet.sol";
import {LifiProxyFacet} from "../src/facets/LifiProxyFacet.sol";
import {OneInchProxyFacet} from "../src/facets/OneInchProxyFacet.sol";

// Diamond interfaces
import {IDiamondCut} from "../src/interfaces/IDiamondCut.sol";
import {DiamondInit} from "../src/upgradeInitializers/DiamondInit.sol";

// Uniswap V4 imports
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";

contract DeployDeterministicScript is Script {
    // SALT for CREATE2 - CHANGE THIS to get different address
    bytes32 public constant SALT = keccak256("MoonXFarmRouter.v1.0.0");
    
    // Standard CREATE2 deployer used by Forge
    address public constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    
    // Network configurations
    struct NetworkConfig {
        address weth;
        address universalRouter;
        address lifi;
        address oneInch;
        address v2Factory;
        address v2Router;
        address v3Factory;
        address v3Quoter;
        address v4Quoter;
        address stateLibrary;
        address poolManager;
        address permit2;
    }

    mapping(uint256 => NetworkConfig) public networkConfigs;

    function setUp() public {
        // Base Mainnet (8453)
        networkConfigs[8453] = NetworkConfig({
            weth: 0x4200000000000000000000000000000000000006,
            universalRouter: 0x6fF5693b99212Da76ad316178A184AB56D299b43,
            lifi: 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE,
            oneInch: 0x111111125421cA6dc452d289314280a0f8842A65,
            v2Factory: 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6,
            v2Router: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24,
            v3Factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD,
            v3Quoter: 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a,
            v4Quoter: 0x0d5e0F971ED27FBfF6c2837bf31316121532048D,
            poolManager: 0x498581fF718922c3f8e6A244956aF099B2652b2b,
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71
        });

        // Ethereum Mainnet (1)
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
            poolManager: 0x000000000004444c5dc75cB358380D2e3dE08A90,
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227
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

        // Add more chains as needed...
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        uint256 chainId = block.chainid;
        NetworkConfig memory config = networkConfigs[chainId];

        require(config.weth != address(0), "Unsupported network");
        require(config.v2Factory != address(0), "Missing V2 Factory");
        require(config.v3Factory != address(0), "Missing V3 Factory");
        require(config.poolManager != address(0), "Missing V4 Pool Manager");
        require(config.permit2 != address(0), "Missing Permit2");

        console.log("=== DETERMINISTIC DEPLOYMENT ===");
        console.log("Chain ID:", chainId);
        console.log("Deployer:", deployer);
        console.log("Salt:", vm.toString(SALT));
        
        // Predict Diamond address BEFORE deployment
        address predictedDiamond = predictDiamondAddress(deployer);
        console.log("Predicted Diamond Address:", predictedDiamond);

        // Predict all other contract addresses for transparency
        address predictedDiamondCut = predictDiamondCutFacetAddress(deployer);
        console.log("Predicted DiamondCutFacet:", predictedDiamondCut);
        console.log("Predicted DiamondInit:", _predictContractAddress(deployer, type(DiamondInit).creationCode));
        console.log("Predicted DiamondLoupeFacet:", _predictContractAddress(deployer, type(DiamondLoupeFacet).creationCode));
        console.log("Predicted OwnershipFacet:", _predictContractAddress(deployer, type(OwnershipFacet).creationCode));
        console.log("Predicted FeeCollectorFacet:", _predictContractAddress(deployer, type(FeeCollectorFacet).creationCode));
        console.log("Predicted RescueFacet:", _predictContractAddress(deployer, type(RescueFacet).creationCode));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy DiamondCutFacet with CREATE2
        DiamondCutFacet diamondCutFacet = new DiamondCutFacet{salt: SALT}();
        console.log("DiamondCutFacet deployed at:", address(diamondCutFacet));

        // 2. Deploy Diamond with CREATE2 - SAME ADDRESS ON ALL CHAINS
        MoonXFarmRouter diamond = new MoonXFarmRouter{salt: SALT}(
            deployer,
            address(diamondCutFacet)
        );
        console.log("Diamond deployed at:", address(diamond));
        
        // Verify prediction
        require(address(diamond) == predictedDiamond, "Address prediction failed!");

        // 3. Deploy DiamondInit with CREATE2
        DiamondInit diamondInit = new DiamondInit{salt: SALT}();
        
        // 4. Deploy all facets with CREATE2
        DiamondLoupeFacet diamondLoupeFacet = new DiamondLoupeFacet{salt: SALT}();
        OwnershipFacet ownershipFacet = new OwnershipFacet{salt: SALT}();
        FeeCollectorFacet feeCollectorFacet = new FeeCollectorFacet{salt: SALT}();
        RescueFacet rescueFacet = new RescueFacet{salt: SALT}();

        console.log("Core facets deployed with CREATE2:");
        console.log("  DiamondLoupeFacet:", address(diamondLoupeFacet));
        console.log("  OwnershipFacet:", address(ownershipFacet));
        console.log("  FeeCollectorFacet:", address(feeCollectorFacet));
        console.log("  RescueFacet:", address(rescueFacet));

        // 5. Deploy proxy facets (conditional)
        address lifiProxyFacetAddr = address(0);
        address oneInchProxyFacetAddr = address(0);

        if (config.lifi != address(0)) {
            LifiProxyFacet lifiProxyFacet = new LifiProxyFacet{salt: SALT}(config.lifi);
            lifiProxyFacetAddr = address(lifiProxyFacet);
            console.log("  LifiProxyFacet:", lifiProxyFacetAddr);
        }

        if (config.oneInch != address(0)) {
            OneInchProxyFacet oneInchProxyFacet = new OneInchProxyFacet{salt: SALT}(config.oneInch);
            oneInchProxyFacetAddr = address(oneInchProxyFacet);
            console.log("  OneInchProxyFacet:", oneInchProxyFacetAddr);
        }

        // 6. Deploy MoonXFacet with CREATE2
        MoonXFacet moonXFacet = new MoonXFacet{salt: SALT}(
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

        // 7. Prepare facet cuts
        IDiamondCut.FacetCut[] memory cuts = prepareFacetCuts(
            diamondLoupeFacet,
            ownershipFacet,
            feeCollectorFacet,
            rescueFacet,
            moonXFacet,
            lifiProxyFacetAddr,
            oneInchProxyFacetAddr,
            config
        );

        // 8. Execute diamond cut
        IDiamondCut(address(diamond)).diamondCut(
            cuts,
            address(diamondInit),
            abi.encodeWithSignature("init()")
        );

        // 9. Set fee recipient
        FeeCollectorFacet(address(diamond)).setFeeRecipient(feeRecipient);

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("Chain:", chainId);
        console.log("Diamond Address:", address(diamond));
        console.log("This address is IDENTICAL on all supported chains!");
        console.log("===============================");
    }

    function predictDiamondCutFacetAddress(address) public view returns (address) {
        bytes memory bytecode = type(DiamondCutFacet).creationCode;
        
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_DEPLOYER,
            SALT,
            keccak256(bytecode)
        )))));
    }

    function predictDiamondAddress(address deployer) public view returns (address) {
        address predictedDiamondCutFacet = predictDiamondCutFacetAddress(deployer);
        bytes memory bytecode = abi.encodePacked(
            type(MoonXFarmRouter).creationCode,
            abi.encode(deployer, predictedDiamondCutFacet)
        );
        
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_DEPLOYER,
            SALT,
            keccak256(bytecode)
        )))));
    }

    function _predictContractAddress(address, bytes memory bytecode) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_DEPLOYER,
            SALT,
            keccak256(bytecode)
        )))));
    }

    function prepareFacetCuts(
        DiamondLoupeFacet diamondLoupeFacet,
        OwnershipFacet ownershipFacet,
        FeeCollectorFacet feeCollectorFacet,
        RescueFacet rescueFacet,
        MoonXFacet moonXFacet,
        address lifiProxyFacetAddr,
        address oneInchProxyFacetAddr,
        NetworkConfig memory config
    ) internal pure returns (IDiamondCut.FacetCut[] memory) {
        
        uint256 facetCount = 5; // Core + MoonX + Rescue
        if (config.lifi != address(0)) facetCount++;
        if (config.oneInch != address(0)) facetCount++;

        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](facetCount);
        uint256 index = 0;

        // Core facets
        cuts[index++] = IDiamondCut.FacetCut({
            facetAddress: address(diamondLoupeFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("DiamondLoupeFacet")
        });

        cuts[index++] = IDiamondCut.FacetCut({
            facetAddress: address(ownershipFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("OwnershipFacet")
        });

        cuts[index++] = IDiamondCut.FacetCut({
            facetAddress: address(feeCollectorFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("FeeCollectorFacet")
        });

        // Proxy facets (conditional)
        if (config.lifi != address(0)) {
            cuts[index++] = IDiamondCut.FacetCut({
                facetAddress: lifiProxyFacetAddr,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: generateSelectors("LifiProxyFacet")
            });
        }

        if (config.oneInch != address(0)) {
            cuts[index++] = IDiamondCut.FacetCut({
                facetAddress: oneInchProxyFacetAddr,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: generateSelectors("OneInchProxyFacet")
            });
        }

        // MoonXFacet
        cuts[index++] = IDiamondCut.FacetCut({
            facetAddress: address(moonXFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("MoonXFacet")
        });

        // RescueFacet
        cuts[index++] = IDiamondCut.FacetCut({
            facetAddress: address(rescueFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("RescueFacet")
        });

        return cuts;
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
        } else if (keccak256(bytes(facetName)) == keccak256("FeeCollectorFacet")) {
            selectors = new bytes4[](4);
            selectors[0] = bytes4(keccak256("setFeeRecipient(address)"));
            selectors[1] = bytes4(keccak256("getFeeRecipient()"));
            selectors[2] = bytes4(keccak256("setPlatformFee(uint16)"));
            selectors[3] = bytes4(keccak256("getPlatformFee()"));
        } else if (keccak256(bytes(facetName)) == keccak256("LifiProxyFacet")) {
            selectors = new bytes4[](1);
            selectors[0] = bytes4(keccak256("callLifi(uint256,uint256,uint256,bytes)"));
        } else if (keccak256(bytes(facetName)) == keccak256("OneInchProxyFacet")) {
            selectors = new bytes4[](1);
            selectors[0] = bytes4(keccak256("callOneInch(uint256,uint256,uint256,bytes)"));
        } else if (keccak256(bytes(facetName)) == keccak256("MoonXFacet")) {
            selectors = new bytes4[](4);
            selectors[0] = bytes4(keccak256("moonxExec(bytes[])"));
            selectors[1] = bytes4(keccak256("moonxGetQuote(bytes[])"));
            selectors[2] = bytes4(keccak256("unlockCallback(bytes)"));
            selectors[3] = bytes4(keccak256("msgSender()"));
        } else if (keccak256(bytes(facetName)) == keccak256("RescueFacet")) {
            selectors = new bytes4[](1);
            selectors[0] = bytes4(keccak256("rescueFunds(address,address,uint256)"));
        }
    }
} 