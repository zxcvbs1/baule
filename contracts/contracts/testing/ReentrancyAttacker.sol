// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArbitration {
    function finalizeDispute(uint256 transactionId) external;
}

contract ReentrancyAttacker {
    address public target;
    bool public attackResult;
    uint256 public attackCount;
    
    // Function to set the target contract
    function setTarget(address _target) external {
        target = _target;
    }
    
    // Function to attack finalizeDispute
    function attackFinalizeDispute(uint256 transactionId) external payable {
        // First call to finalizeDispute
        try IArbitration(target).finalizeDispute(transactionId) {
            attackResult = true;
        } catch {
            attackResult = false;
        }
    }
    
    // Fallback function to attempt reentrancy
    receive() external payable {
        attackCount++;
        
        // Only try to reenter once to avoid infinite loops
        if (attackCount == 1 && target != address(0)) {
            // Try to call finalizeDispute again during the first payment
            try IArbitration(target).finalizeDispute(0) {
                // If this succeeds, the reentrancy protection failed
                attackResult = true;
            } catch {
                // If this fails, the reentrancy protection worked
                attackResult = false;
            }
        }
    }
}
