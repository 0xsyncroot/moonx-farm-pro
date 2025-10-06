// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Diamond imports
import {IDiamondCut} from "../src/interfaces/IDiamondCut.sol";
import {MoonXFacet} from "../src/facets/MoonXFacet.sol";
import {FeeCollectorFacet} from "../src/facets/FeeCollectorFacet.sol";

// Uniswap V4 imports
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";

contract UpgradeScript is Script {
    // Network configurations - same as Deploy.s.sol
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
        // Copy network configs from Deploy.s.sol
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
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address diamondAddress = vm.envAddress("DIAMOND_ADDRESS"); // Current diamond address
        
        uint256 chainId = block.chainid;
        NetworkConfig memory config = networkConfigs[chainId];
        
        require(config.weth != address(0), "Unsupported network");
        require(diamondAddress != address(0), "Diamond address not set");

        console.log("Upgrading diamond at:", diamondAddress);
        console.log("Chain ID:", chainId);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new MoonXFacet with bug fixes
        console.log("Deploying new MoonXFacet...");
        MoonXFacet newMoonXFacet = new MoonXFacet(
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
        console.log("New MoonXFacet deployed at:", address(newMoonXFacet));

        // 2. Prepare diamond cut to replace MoonXFacet
        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](1);
        
        cuts[0] = IDiamondCut.FacetCut({
            facetAddress: address(newMoonXFacet),
            action: IDiamondCut.FacetCutAction.Replace, // Replace instead of Add
            functionSelectors: generateMoonXSelectors()
        });

        // 3. Execute upgrade
        console.log("Executing diamond cut (upgrade)...");
        IDiamondCut(diamondAddress).diamondCut(
            cuts,
            address(0), // No init needed for simple replacement
            ""
        );

        console.log("Upgrade completed!");
        console.log("Diamond address unchanged:", diamondAddress);
        console.log("New MoonXFacet implementation:", address(newMoonXFacet));

        vm.stopBroadcast();
    }

    function generateMoonXSelectors() internal pure returns (bytes4[] memory selectors) {
        selectors = new bytes4[](5);
        selectors[0] = bytes4(keccak256("execMoonXSwap(bytes[])"));
        selectors[1] = bytes4(keccak256("moonxGetQuote(bytes[])"));
        selectors[2] = bytes4(keccak256("moonxGetPlatformFee()"));
        selectors[3] = bytes4(keccak256("unlockCallback(bytes)"));
        selectors[4] = bytes4(keccak256("msgSender()"));
    }
} 