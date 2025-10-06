// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
 * ┃                                                    MOONX FARM ROUTER - UPGRADE MOONXFACET SCRIPT                                                                                ┃
 * ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
 * 
 * @title UpgradeMoonXFacetScript
 * @notice Upgrades MoonXFacet by removing old version and adding new version
 * 
 * @dev UPGRADE FLOW:
 * 1. Get current diamond address
 * 2. Detect existing MoonXFacet (both old execMoonXSwap and new moonxExec)
 * 3. Get actual existing selectors from diamond
 * 4. Remove old MoonXFacet with its actual selectors (if exists)
 * 5. Deploy new MoonXFacet with CREATE2
 * 6. Add new MoonXFacet to diamond with new selectors
 * 7. Verify upgrade success
 * 
 * @dev SECURITY FEATURES:
 * - Flexible SALT configuration (deterministic, dynamic, or custom)
 * - Supports multiple upgrades without address conflicts
 * - Validates network configuration before upgrade
 * - Comprehensive error handling and validation
 * - Preserves other facets during upgrade
 * - Auto-detects old and new function signatures
 * - Uses actual diamond selectors (not hardcoded)
 * 
 * @dev SALT CONFIGURATION:
 * - USE_DYNAMIC_SALT=true: New address each upgrade
 * - UPGRADE_SALT=custom: Custom salt string
 * - Default: Deterministic salt (same address)
 * 
 * @author MoonX Team
 * @custom:version 1.0.0
 */

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Diamond imports
import {MoonXFacet} from "../src/facets/MoonXFacet.sol";
import {IDiamondCut} from "../src/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../src/interfaces/IDiamondLoupe.sol";

// Uniswap V4 imports
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";

contract UpgradeMoonXFacetScript is Script {
    // Default SALT for CREATE2 - can be overridden by environment variable
    bytes32 public constant DEFAULT_SALT = keccak256("MoonXFarmRouter.v1.0.0");
    
    // Standard CREATE2 deployer used by Forge
    address public constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    
    // Get SALT from environment or generate dynamic one
    function getSalt() internal view returns (bytes32) {
        // Check if custom salt is provided via environment
        string memory customSalt = vm.envOr("UPGRADE_SALT", string(""));
        if (bytes(customSalt).length > 0) {
            return keccak256(bytes(customSalt));
        }
        
        // Check if dynamic salt is requested
        bool useDynamicSalt = vm.envOr("USE_DYNAMIC_SALT", false);
        if (useDynamicSalt) {
            // Generate salt based on current timestamp and a random element
            return keccak256(abi.encodePacked(
                "MoonXFarmRouter.upgrade.",
                block.timestamp,
                block.prevrandao
            ));
        }
        
        // Default: use deterministic salt
        return DEFAULT_SALT;
    }
    
    // Network configurations - MUST MATCH DeployDeterministic.s.sol
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

        // Base Sepolia (84532)
        networkConfigs[84532] = NetworkConfig({
            weth: 0x4200000000000000000000000000000000000006,
            universalRouter: 0x492E6456D9528771018DeB9E87ef7750EF184104,
            lifi: address(0),
            oneInch: address(0),
            v2Factory: 0x4648a43B2C14Da09FdF82B161150d3F634f40491,
            v2Router: 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4,
            v3Factory: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24,
            v3Quoter: 0xC5290058841028F1614F3A6F0F5816cAd0df5E27,
            v4Quoter: 0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa,
            poolManager: 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408,
            permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
            stateLibrary: 0x571291b572ed32ce6751a2Cb2486EbEe8DEfB9B4
        });
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address diamondAddress = vm.envAddress("DIAMOND_ADDRESS"); // Must be provided

        uint256 chainId = block.chainid;
        NetworkConfig memory config = networkConfigs[chainId];

        require(config.weth != address(0), "Unsupported network");
        require(diamondAddress != address(0), "Invalid diamond address");

        console.log("=== MOONXFACET UPGRADE ===");
        console.log("Chain ID:", chainId);
        console.log("Deployer:", deployer);
        console.log("Diamond Address:", diamondAddress);
        console.log("Salt:", vm.toString(getSalt()));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Get current MoonXFacet address and existing selectors
        address currentMoonXFacet = _getCurrentMoonXFacetAddress(diamondAddress);
        bytes4[] memory existingSelectors = _getExistingMoonXSelectors(diamondAddress);
        bytes4[] memory newSelectors = _getMoonXSelectors();
        
        console.log("Current MoonXFacet Address:", currentMoonXFacet);
        console.log("Existing selectors count:", existingSelectors.length);
        console.log("New selectors count:", newSelectors.length);
        
        // Show detailed selector comparison
        _logSelectorComparison(existingSelectors, newSelectors);

        // 2. Remove old MoonXFacet if it exists
        if (currentMoonXFacet != address(0) && existingSelectors.length > 0) {
            console.log("Removing old MoonXFacet...");
            
            IDiamondCut.FacetCut[] memory removeCuts = new IDiamondCut.FacetCut[](1);
            removeCuts[0] = IDiamondCut.FacetCut({
                facetAddress: address(0), // address(0) means remove
                action: IDiamondCut.FacetCutAction.Remove,
                functionSelectors: existingSelectors // Use actual existing selectors
            });

            IDiamondCut(diamondAddress).diamondCut(
                removeCuts,
                address(0),
                ""
            );
            
            console.log("[SUCCESS] Old MoonXFacet removed successfully");
        } else {
            console.log("No existing MoonXFacet found, proceeding with fresh installation");
        }

        // 3. Deploy new MoonXFacet with CREATE2
        bytes32 salt = getSalt();
        console.log("Deploying new MoonXFacet with CREATE2...");
        console.log("Using SALT:", vm.toString(salt));
        
        MoonXFacet newMoonXFacet = new MoonXFacet{salt: salt}(
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
        
        console.log("[SUCCESS] New MoonXFacet deployed at:", address(newMoonXFacet));

        // 4. Add new MoonXFacet to diamond
        console.log("Adding new MoonXFacet to diamond...");
        
        IDiamondCut.FacetCut[] memory addCuts = new IDiamondCut.FacetCut[](1);
        addCuts[0] = IDiamondCut.FacetCut({
            facetAddress: address(newMoonXFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: newSelectors // Use new selectors
        });

        IDiamondCut(diamondAddress).diamondCut(
            addCuts,
            address(0),
            ""
        );
        
        console.log("[SUCCESS] New MoonXFacet added to diamond successfully");

        // 5. Verify upgrade
        address verifyMoonXFacet = _getCurrentMoonXFacetAddress(diamondAddress);
        require(verifyMoonXFacet == address(newMoonXFacet), "Upgrade verification failed");
        
        console.log("[SUCCESS] Upgrade verification passed");

        vm.stopBroadcast();

        console.log("\n=== UPGRADE COMPLETE ===");
        console.log("Chain:", chainId);
        console.log("Diamond:", diamondAddress);
        console.log("New MoonXFacet:", address(newMoonXFacet));
        console.log("Same address on all chains!");
        console.log("============================");
    }

    function _getCurrentMoonXFacetAddress(address diamond) internal view returns (address) {
        // Try to find MoonXFacet by checking both old and new function signatures
        
        // First try new moonxExec function
        try IDiamondLoupe(diamond).facetAddress(bytes4(keccak256("moonxExec(bytes[])"))) returns (address facetAddr) {
            if (facetAddr != address(0)) {
                return facetAddr;
            }
        } catch {}
        
        // Then try old execMoonXSwap function  
        try IDiamondLoupe(diamond).facetAddress(bytes4(keccak256("execMoonXSwap(bytes[])"))) returns (address facetAddr) {
            if (facetAddr != address(0)) {
                return facetAddr;
            }
        } catch {}
        
        return address(0); // No MoonXFacet found
    }

    function _getMoonXSelectors() internal pure returns (bytes4[] memory selectors) {
        // Return new MoonXFacet selectors for adding
        selectors = new bytes4[](4);
        selectors[0] = bytes4(keccak256("moonxExec(bytes[])"));
        selectors[1] = bytes4(keccak256("moonxGetQuote(bytes[])"));
        selectors[2] = bytes4(keccak256("unlockCallback(bytes)"));
        selectors[3] = bytes4(keccak256("msgSender()"));
    }
    
    function _getExistingMoonXSelectors(address diamond) internal view returns (bytes4[] memory) {
        // Get all selectors currently associated with MoonXFacet
        address currentFacet = _getCurrentMoonXFacetAddress(diamond);
        if (currentFacet == address(0)) {
            return new bytes4[](0); // No existing facet
        }
        
        // Get all facet function selectors from diamond
        IDiamondLoupe.Facet[] memory facets = IDiamondLoupe(diamond).facets();
        
        // Find the MoonXFacet and return its selectors
        for (uint256 i = 0; i < facets.length; i++) {
            if (facets[i].facetAddress == currentFacet) {
                return facets[i].functionSelectors;
            }
        }
        
        return new bytes4[](0);
    }
    
    function _logSelectorComparison(bytes4[] memory existingSelectors, bytes4[] memory newSelectors) internal pure {
        console.log("\n=== SELECTOR COMPARISON ===");
        
        // Show old selectors being removed
        if (existingSelectors.length > 0) {
            console.log("Removing old selectors:");
            for (uint256 i = 0; i < existingSelectors.length; i++) {
                string memory selectorName = _getSelectorName(existingSelectors[i]);
                console.log("  - %s (%s)", vm.toString(existingSelectors[i]), selectorName);
            }
        }
        
        // Show new selectors being added
        console.log("Adding new selectors:");
        for (uint256 i = 0; i < newSelectors.length; i++) {
            string memory selectorName = _getSelectorName(newSelectors[i]);
            console.log("  + %s (%s)", vm.toString(newSelectors[i]), selectorName);
        }
        console.log("============================\n");
    }
    
    function _getSelectorName(bytes4 selector) internal pure returns (string memory) {
        // Map common selectors to readable names
        if (selector == bytes4(keccak256("moonxExec(bytes[])"))) return "moonxExec";
        if (selector == bytes4(keccak256("execMoonXSwap(bytes[])"))) return "execMoonXSwap (OLD)";
        if (selector == bytes4(keccak256("moonxGetQuote(bytes[])"))) return "moonxGetQuote";
        if (selector == bytes4(keccak256("unlockCallback(bytes)"))) return "unlockCallback";
        if (selector == bytes4(keccak256("msgSender()"))) return "msgSender";
        return "Unknown";
    }

    // Helper function to predict MoonXFacet address
    // NOTE: Only works reliably with deterministic salt (USE_DYNAMIC_SALT=false)
    function predictMoonXFacetAddress() external view returns (address) {
        uint256 chainId = block.chainid;
        NetworkConfig memory config = networkConfigs[chainId];
        bytes32 salt = getSalt();
        
        bytes memory bytecode = abi.encodePacked(
            type(MoonXFacet).creationCode,
            abi.encode(
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
            )
        );
        
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_DEPLOYER,
            salt,
            keccak256(bytecode)
        )))));
    }
    
    // Helper function to predict MoonXFacet address with custom salt
    function predictMoonXFacetAddressWithSalt(bytes32 customSalt) external view returns (address) {
        uint256 chainId = block.chainid;
        NetworkConfig memory config = networkConfigs[chainId];
        
        bytes memory bytecode = abi.encodePacked(
            type(MoonXFacet).creationCode,
            abi.encode(
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
            )
        );
        
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_DEPLOYER,
            customSalt,
            keccak256(bytecode)
        )))));
    }
}