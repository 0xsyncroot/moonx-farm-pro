// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract BadInit {
    error CustomInitError();
    
    function initialize() external {
        // Always revert with custom error
        revert CustomInitError();
    }
}
