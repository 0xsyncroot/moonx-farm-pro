// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RescueFacet {
    using SafeERC20 for IERC20;

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

    function rescueFunds(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}