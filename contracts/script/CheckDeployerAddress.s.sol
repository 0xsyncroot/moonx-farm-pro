// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MoonXFarmRouter} from "../src/Diamond.sol";
import {DiamondCutFacet} from "../src/facets/DiamondCutFacet.sol";

contract CheckDeployerAddressScript is Script {
    bytes32 public constant SALT = keccak256("MoonXFarmRouter.v1.0.0");
    address public constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    
    function run() external view {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== DEPLOYER & ADDRESS CHECK ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer Address:", deployer);
        console.log("Salt:", vm.toString(SALT));
        console.log("CREATE2 Deployer:", CREATE2_DEPLOYER);
        
        // Predict DiamondCutFacet address
        address predictedDiamondCutFacet = predictDiamondCutFacetAddress();
        console.log("Predicted DiamondCutFacet:", predictedDiamondCutFacet);
        
        // Predict Diamond address
        address predictedDiamond = predictDiamondAddress(deployer, predictedDiamondCutFacet);
        console.log("Predicted Diamond Address:", predictedDiamond);
        console.log("===============================");
    }
    
    function predictDiamondCutFacetAddress() public view returns (address) {
        bytes memory bytecode = type(DiamondCutFacet).creationCode;
        
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_DEPLOYER,
            SALT,
            keccak256(bytecode)
        )))));
    }
    
    function predictDiamondAddress(address deployer, address diamondCutFacet) public view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(MoonXFarmRouter).creationCode,
            abi.encode(deployer, diamondCutFacet)
        );
        
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_DEPLOYER,
            SALT,
            keccak256(bytecode)
        )))));
    }
} 