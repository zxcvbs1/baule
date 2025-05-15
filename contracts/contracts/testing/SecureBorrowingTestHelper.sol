// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../SecureBorrowing.sol";

/**
 * @title SecureBorrowingTestHelper
 * @dev Helper contract for testing SecureBorrowing integration with Arbitration
 */
contract SecureBorrowingTestHelper is SecureBorrowing {
    bool private mockTransferSuccess;
    
    constructor(address _owner, address _arbitrationContract) 
        SecureBorrowing(_owner, _arbitrationContract) {}
    
    /**
     * @dev Set whether mock transfers should succeed
     * @param success Whether transfers should succeed
     */
    function setMockTransferSuccess(bool success) external {
        mockTransferSuccess = success;
    }
    
    /**
     * @dev Mock a dispute for testing
     * @param transactionId The ID of the transaction
     * @param itemOwner The owner of the item
     * @param borrower The borrower of the item
     * @param deposit The deposit amount
     */
    function mockActiveDispute(
        uint256 transactionId,
        address itemOwner,
        address borrower,
        uint256 deposit
    ) external {
        // Create a mock transaction
        Transaction storage transaction = transactions[transactionId];
        transaction.borrower = borrower;
        transaction.itemId = bytes32(transactionId); // Use transactionId as itemId for simplicity
        transaction.feePaid = 0;
        transaction.depositPaid = deposit;
        transaction.returnTime = block.timestamp; // Changed from transaction.timestamp
        transaction.isConcluded = true;
        transaction.damageReported = true;
        
        // Set the item owner
        items[bytes32(transactionId)].owner = itemOwner;
        
        // Increment active dispute count
        activeDisputeCount++;
    }
    
    /**
     * @dev Override the processArbitrationOutcome function for testing
     */
    function processArbitrationOutcome(
        uint256 transactionId,
        bool ownerWonDispute,
        uint256 penaltyAmountPaidToOwner,
        uint256 refundAmountToBorrower,
        address itemOwnerFromArbitration, // Added missing parameter
        address borrowerFromArbitration   // Added missing parameter
    ) external override {
        // Verify caller is the arbitration contract
        require(
            msg.sender == address(arbitrationContract),
            "Only arbitration contract can call"
        );
        
        // Emit event for testing verification
        emit ArbitrationOutcomeProcessed(
            transactionId,
            ownerWonDispute,
            penaltyAmountPaidToOwner,
            refundAmountToBorrower
        );
        
        // Decrement active dispute count
        if (activeDisputeCount > 0) {
            activeDisputeCount--;
        }
    }
    
    /**
     * @dev Override the internal _sendEther function for testing
     */
    function _sendEther(address to, uint256 amount) internal returns (bool) { // Removed override
        // Use mock result instead of actual transfer
        return mockTransferSuccess;
    }
}
