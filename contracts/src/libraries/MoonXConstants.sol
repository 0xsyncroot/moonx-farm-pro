// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title MoonXConstants
 * @dev Library containing constants used by MoonX Aggregator
 */
library MoonXConstants {
    /**
     * @dev Route optimization types
     */
    uint8 internal constant ROUTE_BEST_PRICE = 0;
    uint8 internal constant ROUTE_FASTEST = 1;
    uint8 internal constant ROUTE_SAFEST = 2;

    /**
     * @dev DEX versions supported
     */
    uint8 internal constant VERSION_V2 = 2;
    uint8 internal constant VERSION_V3 = 3;
    uint8 internal constant VERSION_V4 = 4;
}