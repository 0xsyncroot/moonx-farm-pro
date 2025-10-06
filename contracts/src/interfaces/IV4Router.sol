// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

interface IV4Router {

    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }
} 