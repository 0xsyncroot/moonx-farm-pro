// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPermit2 {
    /// @notice Approve a spender to transfer up to a given amount of a token until a deadline
    function approve(
        address token,
        address spender,
        uint160 amount,
        uint48 expiration
    ) external;

    /// @notice Transfers tokens using an allowance
    function transferFrom(
        address from,
        address to,
        uint160 amount,
        address token
    ) external;

    /// @notice Returns the current allowance for a token and spender
    function allowance(
        address token,
        address owner,
        address spender
    ) external view returns (uint160 amount, uint48 expiration);
}
