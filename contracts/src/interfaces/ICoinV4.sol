// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IV4Router } from "./IV4Router.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

interface IHasPoolKey {
    /// @notice Returns the Uniswap V4 pool key associated with this coin
    /// @return The PoolKey struct containing pool identification parameters
    function getPoolKey() external view returns (PoolKey memory);
}

interface ICoinV4 is IHasPoolKey{
     function hooks() external view returns (IHooks);
}
