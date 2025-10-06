// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title MoonX Storage Library (Diamond Storage Pattern)
/// @notice Manages storage for MoonXFacet to prevent collision in Diamond pattern
library LibMoonXStorage {
    // ✅ Diamond Storage Pattern - Use unique hash for storage position
    bytes32 constant MOONX_STORAGE_POSITION = keccak256("moonx.facet.storage");
    
    struct MoonXStorage {
        // ✅ Essential V4 reentrancy protection only
        bool v4SwapInProgress;
        
        // ✅ Future extensibility - reserve storage slots
        uint256[49] __gap; // Reserve 50 slots total (1 used, 49 reserved)
    }
    
    function moonxStorage() internal pure returns (MoonXStorage storage ms) {
        bytes32 position = MOONX_STORAGE_POSITION;
        assembly {
            ms.slot := position
        }
    }
    
    // ✅ Essential helper functions only
    function getV4SwapInProgress() internal view returns (bool) {
        return moonxStorage().v4SwapInProgress;
    }
    
    function setV4SwapInProgress(bool inProgress) internal {
        moonxStorage().v4SwapInProgress = inProgress;
    }
} 