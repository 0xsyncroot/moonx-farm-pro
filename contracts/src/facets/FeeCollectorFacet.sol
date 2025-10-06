// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LibFeeCollector} from "../libraries/LibFeeCollector.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";

contract FeeCollectorFacet {
    function setFeeRecipient(address _recipient) external {
        LibDiamond.enforceIsContractOwner();
        LibFeeCollector.setRecipient(_recipient);
        LibFeeCollector.setPlatformFee(50);
    }

    function getFeeRecipient() external view returns (address) {
        return LibFeeCollector.getRecipient();
    }

    function setPlatformFee(uint16 _platformFee) external {
        LibDiamond.enforceIsContractOwner();
        LibFeeCollector.setPlatformFee(_platformFee);
    }

    function getPlatformFee() external view returns (uint16) {
        return LibFeeCollector.getPlatformFee();
    }
} 