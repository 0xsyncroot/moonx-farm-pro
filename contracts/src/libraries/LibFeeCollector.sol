// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library LibFeeCollector {
    bytes32 internal constant NAMESPACE =
        keccak256("moonx.diamond.feecollector");

    uint16 public constant MAX_PLATFORM_FEE = 1000; // 10%

    event FeeCollected(
        address indexed token,
        address recipient,
        uint256 amount
    );

    struct Storage {
        address recipient;
        uint16 platformFee;
    }

    function getPlatformFee() internal view returns (uint16) {
        return feeCollectorStorage().platformFee;
    }

    function setPlatformFee(uint16 _platformFee) internal {
        require(
            _platformFee <= MAX_PLATFORM_FEE,
            "FeeCollectFacet: INVALID_PLATFORM_FEE"
        );
        require(_platformFee > 0, "FeeCollectFacet: INVALID_PLATFORM_FEE");
        require(_platformFee != getPlatformFee(), "FeeCollectFacet: SAME_PLATFORM_FEE");
        feeCollectorStorage().platformFee = _platformFee;
    }

    function getRecipient() internal view returns (address) {
        return feeCollectorStorage().recipient;
    }

    function setRecipient(address _recipient) internal {
        require(
            _recipient != address(0) && _recipient != address(this),
            "FeeCollectFacet: INVALID_FEE_RECIPIENT"
        );
        require(
            _recipient != getRecipient(),
            "FeeCollectFacet: FEE_RECIPIENT_SAME_AS_CURRENT"
        );
        feeCollectorStorage().recipient = _recipient;
    }

    function feeCollectorStorage() internal pure returns (Storage storage s) {
        bytes32 namespace = NAMESPACE;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := namespace
        }
    }
}
