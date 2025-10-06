// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Diamond interfaces
import {IDiamondCut} from "../src/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../src/interfaces/IDiamondLoupe.sol";

// All possible facets
import {DiamondLoupeFacet} from "../src/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../src/facets/OwnershipFacet.sol";
import {FeeCollectorFacet} from "../src/facets/FeeCollectorFacet.sol";
import {RescueFacet} from "../src/facets/RescueFacet.sol";
import {LifiProxyFacet} from "../src/facets/LifiProxyFacet.sol";
import {OneInchProxyFacet} from "../src/facets/OneInchProxyFacet.sol";
import {MoonXFacet} from "../src/facets/MoonXFacet.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";

contract FacetManagerScript is Script {
    
    // Network configurations for new facets
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
    
    // ===========================================
    // MAIN FUNCTIONS - CALL THESE VIA FORGE
    // ===========================================
    
    /// @notice Add new facet to diamond
    /// Usage: forge script script/FacetManager.s.sol:FacetManagerScript --sig "addFacet(address,string)" <diamond_address> <facet_name> --rpc-url <rpc> --broadcast
    function addFacet(address diamondAddress, string memory facetName) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        console.log("=== ADDING FACET ===");
        console.log("Diamond:", diamondAddress);
        console.log("Facet:", facetName);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy new facet
        address facetAddress = deployFacetByName(facetName);
        require(facetAddress != address(0), "Failed to deploy facet");
        
        // Get selectors
        bytes4[] memory selectors = generateSelectors(facetName);
        require(selectors.length > 0, "No selectors found");
        
        // Prepare facet cut
        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](1);
        cuts[0] = IDiamondCut.FacetCut({
            facetAddress: facetAddress,
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: selectors
        });
        
        // Execute cut
        IDiamondCut(diamondAddress).diamondCut(cuts, address(0), "");
        
        vm.stopBroadcast();
        
        console.log("SUCCESS: Facet added successfully:");
        console.log("  Address:", facetAddress);
        console.log("  Selectors:", selectors.length);
    }
    
    /// @notice Remove facet from diamond
    /// Usage: forge script script/FacetManager.s.sol:FacetManagerScript --sig "removeFacet(address,address)" <diamond_address> <facet_address> --rpc-url <rpc> --broadcast
    function removeFacet(address diamondAddress, address facetAddress) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        console.log("=== REMOVING FACET ===");
        console.log("Diamond:", diamondAddress);
        console.log("Facet to remove:", facetAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Get current selectors for this facet
        IDiamondLoupe loupe = IDiamondLoupe(diamondAddress);
        bytes4[] memory selectors = loupe.facetFunctionSelectors(facetAddress);
        require(selectors.length > 0, "Facet not found or has no selectors");
        
        // Prepare facet cut
        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](1);
        cuts[0] = IDiamondCut.FacetCut({
            facetAddress: address(0), // Set to 0 for removal
            action: IDiamondCut.FacetCutAction.Remove,
            functionSelectors: selectors
        });
        
        // Execute cut
        IDiamondCut(diamondAddress).diamondCut(cuts, address(0), "");
        
        vm.stopBroadcast();
        
        console.log("SUCCESS: Facet removed successfully:");
        console.log("  Removed selectors:", selectors.length);
    }
    
    /// @notice Replace existing facet with new one
    /// Usage: forge script script/FacetManager.s.sol:FacetManagerScript --sig "replaceFacet(address,string,address)" <diamond_address> <new_facet_name> <old_facet_address> --rpc-url <rpc> --broadcast
    function replaceFacet(address diamondAddress, string memory newFacetName, address oldFacetAddress) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        console.log("=== REPLACING FACET ===");
        console.log("Diamond:", diamondAddress);
        console.log("New facet:", newFacetName);
        console.log("Old facet:", oldFacetAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy new facet
        address newFacetAddress = deployFacetByName(newFacetName);
        require(newFacetAddress != address(0), "Failed to deploy new facet");
        
        // Get selectors
        bytes4[] memory selectors = generateSelectors(newFacetName);
        require(selectors.length > 0, "No selectors found");
        
        // Prepare facet cut
        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](1);
        cuts[0] = IDiamondCut.FacetCut({
            facetAddress: newFacetAddress,
            action: IDiamondCut.FacetCutAction.Replace,
            functionSelectors: selectors
        });
        
        // Execute cut
        IDiamondCut(diamondAddress).diamondCut(cuts, address(0), "");
        
        vm.stopBroadcast();
        
        console.log("SUCCESS: Facet replaced successfully:");
        console.log("  Old address:", oldFacetAddress);
        console.log("  New address:", newFacetAddress);
        console.log("  Selectors:", selectors.length);
    }
    
    /// @notice List all facets in diamond
    /// Usage: forge script script/FacetManager.s.sol:FacetManagerScript --sig "listFacets(address)" <diamond_address> --rpc-url <rpc>
    function listFacets(address diamondAddress) external view {
        console.log("=== DIAMOND FACETS ===");
        console.log("Diamond:", diamondAddress);
        
        IDiamondLoupe loupe = IDiamondLoupe(diamondAddress);
        IDiamondLoupe.Facet[] memory facets = loupe.facets();
        
        console.log("Total facets:", facets.length);
        
        for (uint i = 0; i < facets.length; i++) {
            console.log("");
            console.log("Facet", i + 1);
            console.log("  Address:", facets[i].facetAddress);
            console.log("  Selectors:", facets[i].functionSelectors.length);
            
            // Print first few selectors
            uint selectorCount = facets[i].functionSelectors.length > 3 ? 3 : facets[i].functionSelectors.length;
            for (uint j = 0; j < selectorCount; j++) {
                console.log("    Selector:", vm.toString(facets[i].functionSelectors[j]));
            }
            if (facets[i].functionSelectors.length > 3) {
                console.log("    ... and", facets[i].functionSelectors.length - 3, "more");
            }
        }
    }
    
    // ===========================================
    // INTERNAL HELPER FUNCTIONS
    // ===========================================
    
    function deployFacetByName(string memory facetName) internal returns (address) {
        NetworkConfig memory config = networkConfigs[block.chainid];
        
        if (keccak256(bytes(facetName)) == keccak256("DiamondLoupeFacet")) {
            DiamondLoupeFacet facet = new DiamondLoupeFacet();
            return address(facet);
        } else if (keccak256(bytes(facetName)) == keccak256("OwnershipFacet")) {
            OwnershipFacet facet = new OwnershipFacet();
            return address(facet);
        } else if (keccak256(bytes(facetName)) == keccak256("FeeCollectorFacet")) {
            FeeCollectorFacet facet = new FeeCollectorFacet();
            return address(facet);
        } else if (keccak256(bytes(facetName)) == keccak256("RescueFacet")) {
            RescueFacet facet = new RescueFacet();
            return address(facet);
        } else if (keccak256(bytes(facetName)) == keccak256("LifiProxyFacet")) {
            LifiProxyFacet facet = new LifiProxyFacet(config.lifi);
            return address(facet);
        } else if (keccak256(bytes(facetName)) == keccak256("OneInchProxyFacet")) {
            OneInchProxyFacet facet = new OneInchProxyFacet(config.oneInch);
            return address(facet);
        } else if (keccak256(bytes(facetName)) == keccak256("MoonXFacet")) {
            MoonXFacet facet = new MoonXFacet(
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
            return address(facet);
        }
        
        revert("Unknown facet name");
    }
    
    function generateSelectors(string memory facetName) internal pure returns (bytes4[] memory selectors) {
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
            selectors = new bytes4[](2);
            selectors[0] = bytes4(keccak256("setFeeRecipient(address)"));
            selectors[1] = bytes4(keccak256("getFeeRecipient()"));
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