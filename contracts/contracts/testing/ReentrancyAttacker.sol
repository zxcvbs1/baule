// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArbitration {
    function finalizeDispute(uint256 originalTransactionId) external;
}

contract ReentrancyAttacker {
    address public target;
    bool public attackResult;
    uint256 public attackCount;

    constructor() {
        attackResult = false;
        attackCount = 0;
    }

    function setTarget(address _target) external {
        target = _target;
    }

    function attackFinalizeDispute(uint256 txId) external payable {
        require(target != address(0), "Target not set");
        
        try IArbitration(target).finalizeDispute(txId) {
            // If this succeeds, we'll check if we were able to reenter
            attackResult = (attackCount > 1);
        } catch {
            // This is expected to fail, so attack is considered foiled
            attackResult = false;
        }
    }

    // This function will be called during the execution of finalizeDispute due to ETH transfers
    receive() external payable {
        attackCount++;
        
        // Try to reenter if we haven't tried yet and have a target
        if (attackCount == 1 && target != address(0)) {
            // Note: we're deliberately ignoring the return value here
            (bool success, ) = target.call(
                abi.encodeWithSignature("finalizeDispute(uint256)", 0)
            );
            
            // If successful reentry, mark attack as successful
            if (success) {
                attackResult = true;
            }
        }
    }
}