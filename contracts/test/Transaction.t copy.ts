import { expect } from "chai";
import hre from "hardhat";
import { parseEther, keccak256, stringToHex } from "viem";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { setupDisputeWithVotes, verifyFinalizationOutcome } from "./helpers/finalizationHelpers";
import { deployArbitrationTestHelper } from "./helpers/testUtils";

// Add this helper function at the top level
function logDebug(message: string, data?: any) {
  console.log(`DEBUG ${message}${data !== undefined ? ': ' + JSON.stringify(data, (_, v) => 
    typeof v === 'bigint' ? v.toString() : v, 2) : ''}`);
}

// Common test fixture to share setup across test cases
async function deploySecureBorrowingFixture() {
  logDebug("=== Starting fixture setup ===");
  
  // Get wallet clients for distinct roles
  const wallets = await hre.viem.getWalletClients({ count: 5 });
  const contractOwner = wallets[0];      // Owner of SecureBorrowing contract
  const itemOwner = wallets[1];          // Owner of the items
  const borrower = wallets[2];           // Borrower of items
  const randomUser = wallets[3];         // A random account
  const arbitrationContractOwner = wallets[4]; // Owner/deployer of ArbitrationTestHelper

  logDebug("Got wallet clients", {
    contractOwner: contractOwner.account.address,
    itemOwner: itemOwner.account.address,
    borrower: borrower.account.address,
    randomUser: randomUser.account.address,
    arbitrationContractOwner: arbitrationContractOwner.account.address
  });
  
  // Deploy SecureBorrowing contract with required parameters
  logDebug("Deploying SecureBorrowing contract...");
  try {
    const secureBorrowingContract = await hre.viem.deployContract("SecureBorrowing", [
      contractOwner.account.address, // Owner address for SecureBorrowing
      "0x0000000000000000000000000000000000000001" // Dummy arbitration address initially
    ], { client: { wallet: contractOwner } }); // Deployed by contractOwner
    logDebug("SecureBorrowing deployed at", secureBorrowingContract.address);
    
    // Deploy ArbitrationTestHelper
    // It will be owned by arbitrationContractOwner and deployed by arbitrationContractOwner
    logDebug("Deploying ArbitrationTestHelper with owner:", arbitrationContractOwner.account.address);
    if (!arbitrationContractOwner || !arbitrationContractOwner.account || typeof arbitrationContractOwner.account.address === 'undefined') {
      const errorMsg = "CRITICAL: arbitrationContractOwner.account.address is undefined before deploying ArbitrationTestHelper!";
      logDebug(errorMsg, {
          hasWallet: !!arbitrationContractOwner,
          hasAccount: !!(arbitrationContractOwner && arbitrationContractOwner.account),
          address: arbitrationContractOwner && arbitrationContractOwner.account ? arbitrationContractOwner.account.address : "N/A"
      });
      throw new Error(errorMsg);
    }

    const { arbitrationTestHelper } = await deployArbitrationTestHelper(
      secureBorrowingContract.address, 
      arbitrationContractOwner, // ownerArbitrationWallet - used to deploy and set as initial owner
      undefined,                // arbitrator1Wallet (optional)
      undefined,                // arbitrator2Wallet (optional)
      undefined                 // arbitrator3Wallet (optional)
    );
    logDebug("ArbitrationTestHelper deployed at", arbitrationTestHelper.address);
    
    // Get SecureBorrowing with contractOwner's wallet to update its arbitration contract address
    const secureBorrowingAsContractOwner = await hre.viem.getContractAt("SecureBorrowing", 
      secureBorrowingContract.address, 
      { client: { wallet: contractOwner } }
    );
    
    // Update Arbitration contract address in SecureBorrowing
    logDebug("Updating arbitration contract address in SecureBorrowing...");
    await secureBorrowingAsContractOwner.write.setArbitrationContract([arbitrationTestHelper.address]);
    logDebug("Arbitration contract updated in SecureBorrowing");
    
    // Create item and transaction data for testing
    const itemPrice = parseEther("1");
    const depositRequired = parseEther("0.5");
    const depositAmount = depositRequired; // Renaming for clarity in tests if needed
    const publicClient = await hre.viem.getPublicClient();

    // List first item (owned by itemOwner)
    logDebug("Listing first item...");
    const itemId = keccak256(stringToHex("test-item-1"));
    const sbAsItemOwner = await hre.viem.getContractAt("SecureBorrowing", 
      secureBorrowingContract.address, 
      { client: { wallet: itemOwner } }
    );
    
    await sbAsItemOwner.write.listItem([
      itemId,
      itemPrice,
      depositRequired,
      keccak256(stringToHex("test-item-1-metadata")),
      0n // minBorrowerReputation
    ]);
    logDebug("First item listed with ID", itemId);

    // Borrower (borrower wallet) borrows the item listed by itemOwner
    const sbAsBorrower = await hre.viem.getContractAt("SecureBorrowing", 
      secureBorrowingContract.address, 
      { client: { wallet: borrower } }
    );
    
    const itemInfo = await secureBorrowingContract.read.items([itemId]);
    const nonce = itemInfo[1]; // Nonce from the item data
    logDebug("Got nonce for first item", nonce);
    
    // Prepare signature for borrowing - signature must come from the item's owner (itemOwner)
    logDebug("Preparing signature for borrowing (signed by itemOwner)...");
    const domain = {
      name: "SecureBorrowing_1.1",
      version: "1.1",
      chainId: await publicClient.getChainId(),
      verifyingContract: secureBorrowingContract.address,
    };
    
    const types = {
      Borrow: [
        { name: "itemId", type: "bytes32" },
        { name: "fee", type: "uint256" },
        { name: "deposit", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "borrower", type: "address" },
      ],
    };
    
    // Correct: Signature provided by the item's actual owner (itemOwner)
    const signature = await itemOwner.signTypedData({
      domain,
      types,
      primaryType: "Borrow",
      message: {
        itemId,
        fee: itemPrice,
        deposit: depositRequired,
        nonce,
        borrower: borrower.account.address, // The intended borrower
      },
    });
    logDebug("Signature created for borrowing");
    
    // Borrow the item
    logDebug("Borrowing first item...");
    const borrowTx = await sbAsBorrower.write.borrowItem(
      [itemId, itemPrice, depositRequired, signature], 
      { value: itemPrice + depositRequired }
    );
    
    await publicClient.waitForTransactionReceipt({ hash: borrowTx });
    logDebug("Borrow transaction successful for first item", { txHash: borrowTx });
    
    // Find transaction id
    const transactionCountAfterFirstBorrow = await secureBorrowingContract.read.transactionCount();
    const transactionId = transactionCountAfterFirstBorrow - 1n;
    logDebug("First transaction ID", transactionId);
    
    // Setup a second item for testing invalid states (e.g., processing outcome on non-arbitrated tx)
    logDebug("Setting up second item...");
    const secondItemId = keccak256(stringToHex("test-item-2"));
    await sbAsItemOwner.write.listItem([ // Listed by itemOwner
      secondItemId,
      itemPrice,
      depositRequired,
      keccak256(stringToHex("test-item-2-metadata")),
      0n // minBorrowerReputation
    ]);
    logDebug("Second item listed with ID", secondItemId);
    
    const secondItemInfo = await secureBorrowingContract.read.items([secondItemId]);
    const secondNonce = secondItemInfo[1];
    logDebug("Got nonce for second item", secondNonce);
    
    // Signature by itemOwner for the second item
    const secondSignature = await itemOwner.signTypedData({
      domain,
      types,
      primaryType: "Borrow",
      message: {
        itemId: secondItemId,
        fee: itemPrice,
        deposit: depositRequired,
        nonce: secondNonce,
        borrower: borrower.account.address,
      },
    });
    
    logDebug("Borrowing second item...");
    const secondBorrowTx = await sbAsBorrower.write.borrowItem(
      [secondItemId, itemPrice, depositRequired, secondSignature], 
      { value: itemPrice + depositRequired }
    );
    
    await publicClient.waitForTransactionReceipt({ hash: secondBorrowTx });
    logDebug("Second borrow transaction successful", { txHash: secondBorrowTx });
    
    // Get the second transaction id
    const transactionCountAfterSecondBorrow = await secureBorrowingContract.read.transactionCount();
    const newTransactionId = transactionCountAfterSecondBorrow - 1n; // This is the ID for the second transaction
    logDebug("Second transaction ID", newTransactionId);
    
    // Common test values
    const damageDescription = "Item was damaged during rental"; // Used conceptually, not directly in this fixture
    const penaltyAmount = parseEther("0.3");
    const refundAmount = parseEther("0.2");

    // Helper function to get SecureBorrowing contract instance with a specific account
    // This is useful if tests need to interact from different perspectives
    const getSecureBorrowingAs = async (accountWalletClient: any) => {
      return hre.viem.getContractAt("SecureBorrowing", secureBorrowingContract.address, { client: { wallet: accountWalletClient } });
    };

    logDebug("=== Fixture setup complete ===");
    
    return {
      secureBorrowingContract, // Instance configured with contractOwner by default for reads
      arbitrationTestHelper,   // Instance configured with arbitrationContractOwner by default for writes
      contractOwner,           // WalletClient for SecureBorrowing owner
      itemOwner,               // WalletClient for item owner
      borrower,                // WalletClient for borrower
      randomUser,              // WalletClient for a random user
      arbitrationContractOwner, // WalletClient for ArbitrationTestHelper owner
      itemId,                  // ID of the first item/transaction
      transactionId,           // ID of the first transaction (this one will be sent to arbitration)
      newTransactionId,        // ID of the second transaction (used for testing non-arbitrated states)
      penaltyAmount,
      refundAmount,
      depositAmount,           // Actual deposit for the first transaction
      publicClient,
      getSecureBorrowingAs
    };
  } catch (error: any) {
    logDebug("ERROR in fixture setup", { 
      message: error.message,
      details: error.toString(), // Using toString() for better Viem error details
      stack: error.stack
    });
    throw error; // Re-throw to fail the test run clearly
  }
}

describe("SecureBorrowing Transactions", function() {
  it("Should correctly update counters and transaction fields when sent to arbitration", async function() {
    logDebug("Starting test: Should correctly update counters and transaction fields when sent to arbitration");
    try {
      const { 
        secureBorrowingContract, itemOwner, transactionId, getSecureBorrowingAs, publicClient
      } = await loadFixture(deploySecureBorrowingFixture);
      
      const initialLoanCount = await secureBorrowingContract.read.activeLoanCount();
      const initialDisputeCount = await secureBorrowingContract.read.activeDisputeCount();
      logDebug("Initial counts", { loans: initialLoanCount, disputes: initialDisputeCount });
      
      const sbAsItemOwner = await getSecureBorrowingAs(itemOwner);
      logDebug("Calling settleTransaction as itemOwner to report damage...");
      const settleTxHash = await sbAsItemOwner.write.settleTransaction([
        transactionId, 
        true // damageReported
      ]);
      await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
      logDebug("settleTransaction (damage reported) successful", { txHash: settleTxHash });
      
      const newLoanCount = await secureBorrowingContract.read.activeLoanCount();
      const newDisputeCount = await secureBorrowingContract.read.activeDisputeCount();
      logDebug("New counts", { loans: newLoanCount, disputes: newDisputeCount });
      
      expect(newLoanCount).to.equal(initialLoanCount - 1n, "Active loan count should decrease");
      expect(newDisputeCount).to.equal(initialDisputeCount + 1n, "Active dispute count should increase");
      
      const txn = await secureBorrowingContract.read.transactions([transactionId]);
      logDebug("Transaction after settlement", { 
        isConcluded: txn[5], 
        damageReported: txn[6],
      });
      
      expect(txn[5]).to.be.true; // isConcluded
      expect(txn[6]).to.be.true; // damageReported
      logDebug("Test 'Should correctly update counters...' completed successfully");
    } catch (error: any) {
      logDebug("ERROR in test 'Should correctly update counters...'", { 
        message: error.message,
        details: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  });

  describe("processArbitrationOutcome", function() {
    it("Should reject if caller is not the arbitration contract", async function() {
      logDebug("Starting test: Should reject if caller is not the arbitration contract");
      try {
        const { 
          itemOwner, borrower, transactionId, 
          penaltyAmount, refundAmount, getSecureBorrowingAs, randomUser, publicClient
        } = await loadFixture(deploySecureBorrowingFixture);
        
        const sbAsItemOwner = await getSecureBorrowingAs(itemOwner);
        logDebug("Setting up: sending transaction to arbitration by itemOwner...");
        const settleTxHash = await sbAsItemOwner.write.settleTransaction([transactionId, true]);
        await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
        logDebug("Transaction sent to arbitration", { txHash: settleTxHash });
        
        logDebug("Attempting to call processArbitrationOutcome as randomUser (unauthorized)");
        const sbAsRandomUser = await getSecureBorrowingAs(randomUser);
        
        await expect(
          sbAsRandomUser.write.processArbitrationOutcome([
            transactionId, 
            itemOwner.account.address, 
            borrower.account.address, 
            true, // ownerWonDispute
            penaltyAmount,
            refundAmount
          ])
        ).to.be.rejectedWith("Only arbitration contract can call");
        logDebug("Test 'Should reject if caller is not arbitration contract' completed successfully");
      } catch (error: any) {
        logDebug("ERROR in test 'Should reject if caller is not arbitration contract'", { 
          message: error.message,
          details: error.toString(),
          stack: error.stack
        });
        throw error;
      }
    });

    it("Should reject if transaction is not concluded or damage not reported", async function() {
      logDebug("Starting test: Should reject if transaction is not concluded or damage not reported");
      try {
        const { 
          arbitrationTestHelper, itemOwner, borrower, newTransactionId, // Using newTransactionId which is not arbitrated
          penaltyAmount, refundAmount 
        } = await loadFixture(deploySecureBorrowingFixture);
        
        logDebug("Attempting to process outcome on non-arbitrated transaction (newTransactionId)");
        // arbitrationTestHelper will use arbitrationContractOwner as the caller by default
        await expect(
          arbitrationTestHelper.write.callProcessArbitrationOutcome([
            newTransactionId, 
            itemOwner.account.address, 
            borrower.account.address, 
            true, // ownerWonDispute
            penaltyAmount,
            refundAmount
          ])
        ).to.be.rejectedWith("Transaction must be concluded and have damage reported");
        logDebug("Test 'Should reject if transaction not concluded/damage not reported' completed successfully");
      } catch (error: any) {
        logDebug("ERROR in test 'Should reject if transaction not concluded/damage not reported'", { 
          message: error.message,
          details: error.toString(),
          stack: error.stack
        });
        throw error;
      }
    });

    it("Should reject if itemOwnerFromArbitration is address(0)", async function() {
      logDebug("Starting test: Should reject if itemOwnerFromArbitration is address(0)");
      try {
        const { 
          arbitrationTestHelper, itemOwner, borrower, 
          transactionId, penaltyAmount, refundAmount, getSecureBorrowingAs, publicClient
        } = await loadFixture(deploySecureBorrowingFixture);

        const sbAsItemOwner = await getSecureBorrowingAs(itemOwner);
        logDebug("Setting up: sending transaction to arbitration by itemOwner...");
        const settleTxHash = await sbAsItemOwner.write.settleTransaction([transactionId, true]);
        await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
        logDebug("Transaction sent to arbitration", { txHash: settleTxHash });

        logDebug("Attempting to process outcome with zero address as itemOwnerFromArbitration");
        await expect(
          arbitrationTestHelper.write.callProcessArbitrationOutcome([
            transactionId, 
            "0x0000000000000000000000000000000000000000", // itemOwnerFromArbitration
            borrower.account.address, 
            true, // ownerWonDispute
            penaltyAmount,
            refundAmount
          ])
        ).to.be.rejectedWith("Item owner cannot be zero address");
        logDebug("Test 'Should reject if itemOwnerFromArbitration is address(0)' completed successfully");
      } catch (error: any) {
        logDebug("ERROR in test 'Should reject if itemOwnerFromArbitration is address(0)'", { 
          message: error.message,
          details: error.toString(),
          stack: error.stack
        });
        throw error;
      }
    });

    it("Should reject if borrowerFromArbitration doesn't match txn.borrower", async function() {
      logDebug("Starting test: Should reject if borrowerFromArbitration doesn't match txn.borrower");
      try {
        const { 
          arbitrationTestHelper, itemOwner, randomUser, // Using randomUser as mismatched borrower
          transactionId, penaltyAmount, refundAmount, getSecureBorrowingAs, publicClient
        } = await loadFixture(deploySecureBorrowingFixture);

        const sbAsItemOwner = await getSecureBorrowingAs(itemOwner);
        logDebug("Setting up: sending transaction to arbitration by itemOwner...");
        const settleTxHash = await sbAsItemOwner.write.settleTransaction([transactionId, true]);
        await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
        logDebug("Transaction sent to arbitration", { txHash: settleTxHash });

        logDebug("Attempting to process outcome with mismatched borrowerFromArbitration");
        await expect(
          arbitrationTestHelper.write.callProcessArbitrationOutcome([
            transactionId, 
            itemOwner.account.address, 
            randomUser.account.address, // borrowerFromArbitration (mismatched)
            true, // ownerWonDispute
            penaltyAmount,
            refundAmount
          ])
        ).to.be.rejectedWith("Borrower mismatch");
        logDebug("Test 'Should reject if borrowerFromArbitration mismatch' completed successfully");
      } catch (error: any) {
        logDebug("ERROR in test 'Should reject if borrowerFromArbitration mismatch'", { 
          message: error.message,
          details: error.toString(),
          stack: error.stack
        });
        throw error;
      }
    });

    it("Should reject if total payout (penalty + refund) exceeds deposit", async function() {
      logDebug("Starting test: Should reject if total payout exceeds deposit");
      try {
        const { 
          arbitrationTestHelper, secureBorrowingContract, itemOwner, borrower, 
          transactionId, getSecureBorrowingAs, publicClient 
        } = await loadFixture(deploySecureBorrowingFixture);

        const sbAsItemOwner = await getSecureBorrowingAs(itemOwner);
        logDebug("Setting up: sending transaction to arbitration by itemOwner...");
        const settleTxHash = await sbAsItemOwner.write.settleTransaction([transactionId, true]);
        await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
        logDebug("Transaction sent to arbitration", { txHash: settleTxHash });
        
        const txn = await secureBorrowingContract.read.transactions([transactionId]);
        const depositPaid = txn[3]; 
        const excessivePenalty = depositPaid; // Penalty equals full deposit
        const someRefund = parseEther("0.1");   // Any refund makes total > deposit

        logDebug("Attempting to process outcome with excessive total payout", { depositPaid, excessivePenalty, someRefund });
        await expect(
          arbitrationTestHelper.write.callProcessArbitrationOutcome([
            transactionId, 
            itemOwner.account.address, 
            borrower.account.address, 
            true, // ownerWonDispute
            excessivePenalty, 
            someRefund 
          ])
        ).to.be.rejectedWith("Total payout exceeds deposit");
        logDebug("Test 'Should reject if total payout exceeds deposit' completed successfully");
      } catch (error: any) {
        logDebug("ERROR in test 'Should reject if total payout exceeds deposit'", { 
          message: error.message,
          details: error.toString(),
          stack: error.stack
        });
        throw error;
      }
    });

    it("Should process outcome correctly when owner wins (penalty and partial refund)", async function() {
      logDebug("Starting test: Should process outcome correctly when owner wins");
      try {
        const { 
          secureBorrowingContract, arbitrationTestHelper, itemOwner, borrower, 
          transactionId, penaltyAmount, refundAmount, itemId, publicClient, getSecureBorrowingAs
        } = await loadFixture(deploySecureBorrowingFixture);

        const sbAsItemOwner = await getSecureBorrowingAs(itemOwner);
        logDebug("Setting up: sending transaction to arbitration by itemOwner...");
        const settleTxHash = await sbAsItemOwner.write.settleTransaction([transactionId, true]);
        await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
        logDebug("Transaction sent to arbitration", { txHash: settleTxHash });

        const initialOwnerBalance = await publicClient.getBalance({ address: itemOwner.account.address });
        const initialBorrowerBalance = await publicClient.getBalance({ address: borrower.account.address });
        const initialDisputeCount = await secureBorrowingContract.read.activeDisputeCount();
        logDebug("Initial state", { ownerBalance: initialOwnerBalance, borrowerBalance: initialBorrowerBalance, disputeCount: initialDisputeCount });
        
        logDebug("Processing arbitration outcome: owner wins", { penaltyAmount, refundAmount });
        const processTxHash = await arbitrationTestHelper.write.callProcessArbitrationOutcome([
          transactionId, 
          itemOwner.account.address, 
          borrower.account.address, 
          true, // ownerWonDispute
          penaltyAmount,
          refundAmount
        ]);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: processTxHash });
        logDebug("Arbitration outcome processed", { txHash: processTxHash });
        
        const item = await secureBorrowingContract.read.items([itemId]);
        expect(item[5]).to.be.true; // isAvailable
        
        expect(await secureBorrowingContract.read.activeDisputeCount()).to.equal(initialDisputeCount - 1n);
        
        const txn = await secureBorrowingContract.read.transactions([transactionId]);
        expect(txn[9]).to.equal(penaltyAmount); // amountFromDepositPaidToOwner
        expect(txn[10]).to.equal(refundAmount); // amountFromDepositRefundedToBorrower
        
        const finalOwnerBalance = await publicClient.getBalance({ address: itemOwner.account.address });
        const finalBorrowerBalance = await publicClient.getBalance({ address: borrower.account.address });
        
        // Check balances considering gas fees. Allow for small discrepancies.
        const gasTolerance = parseEther("0.01"); // Adjust if needed
        expect(finalOwnerBalance).to.be.closeTo(initialOwnerBalance + penaltyAmount, gasTolerance);
        expect(finalBorrowerBalance).to.be.closeTo(initialBorrowerBalance + refundAmount, gasTolerance);
        
        const eventSignature = 'ArbitrationOutcomeProcessed(uint256,address,address,bool,uint256,uint256)';
        const eventTopic = keccak256(stringToHex(eventSignature));
        const eventLog = receipt.logs.find(log => 
          log.topics[0] === eventTopic && log.address.toLowerCase() === secureBorrowingContract.address.toLowerCase()
        );
        expect(eventLog, "ArbitrationOutcomeProcessed event not found").to.exist;
        logDebug("Test 'Should process outcome correctly when owner wins' completed successfully");
      } catch (error: any) {
        logDebug("ERROR in test 'Should process outcome correctly when owner wins'", { 
          message: error.message,
          details: error.toString(),
          stack: error.stack
        });
        throw error;
      }
    });

    it("Should process outcome correctly when borrower wins (full refund of deposit)", async function() {
      logDebug("Starting test: Should process outcome correctly when borrower wins");
      try {
        const { 
          secureBorrowingContract, arbitrationTestHelper, itemOwner, borrower, 
          transactionId, depositAmount, itemId, publicClient, getSecureBorrowingAs
        } = await loadFixture(deploySecureBorrowingFixture);

        const sbAsItemOwner = await getSecureBorrowingAs(itemOwner);
        logDebug("Setting up: sending transaction to arbitration by itemOwner...");
        const settleTxHash = await sbAsItemOwner.write.settleTransaction([transactionId, true]);
        await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
        logDebug("Transaction sent to arbitration", { txHash: settleTxHash });

        const initialOwnerBalance = await publicClient.getBalance({ address: itemOwner.account.address });
        const initialBorrowerBalance = await publicClient.getBalance({ address: borrower.account.address });
        const initialDisputeCount = await secureBorrowingContract.read.activeDisputeCount();
        logDebug("Initial state", { ownerBalance: initialOwnerBalance, borrowerBalance: initialBorrowerBalance, disputeCount: initialDisputeCount });
        
        logDebug("Processing arbitration outcome: borrower wins (full refund)", { depositAmount });
        const processTxHash = await arbitrationTestHelper.write.callProcessArbitrationOutcome([
          transactionId, 
          itemOwner.account.address, 
          borrower.account.address, 
          false, // ownerWonDispute = false (borrower wins)
          0n,    // penaltyToOwner = 0
          depositAmount // refundToBorrower = full deposit
        ]);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: processTxHash });
        logDebug("Arbitration outcome processed", { txHash: processTxHash });
        
        const item = await secureBorrowingContract.read.items([itemId]);
        expect(item[5]).to.be.true; // isAvailable
        
        expect(await secureBorrowingContract.read.activeDisputeCount()).to.equal(initialDisputeCount - 1n);
        
        const txn = await secureBorrowingContract.read.transactions([transactionId]);
        expect(txn[9]).to.equal(0n); // amountFromDepositPaidToOwner
        expect(txn[10]).to.equal(depositAmount); // amountFromDepositRefundedToBorrower
        
        const finalOwnerBalance = await publicClient.getBalance({ address: itemOwner.account.address });
        const finalBorrowerBalance = await publicClient.getBalance({ address: borrower.account.address });
        
        const gasTolerance = parseEther("0.01");
        expect(finalOwnerBalance).to.be.closeTo(initialOwnerBalance, gasTolerance); // Owner gets nothing from deposit
        expect(finalBorrowerBalance).to.be.closeTo(initialBorrowerBalance + depositAmount, gasTolerance);
        
        const eventSignature = 'ArbitrationOutcomeProcessed(uint256,address,address,bool,uint256,uint256)';
        const eventTopic = keccak256(stringToHex(eventSignature));
        const eventLog = receipt.logs.find(log => 
          log.topics[0] === eventTopic && log.address.toLowerCase() === secureBorrowingContract.address.toLowerCase()
        );
        expect(eventLog, "ArbitrationOutcomeProcessed event not found").to.exist;
        logDebug("Test 'Should process outcome correctly when borrower wins' completed successfully");
      } catch (error: any) {
        logDebug("ERROR in test 'Should process outcome correctly when borrower wins'", { 
          message: error.message,
          details: error.toString(),
          stack: error.stack
        });
        throw error;
      }
    });

    it("Should handle case when item was delisted during dispute", async function() {
      logDebug("Starting test: Should handle case when item was delisted during dispute");
      try {
        const { 
          secureBorrowingContract, arbitrationTestHelper, itemOwner, borrower, 
          transactionId, penaltyAmount, refundAmount, itemId, publicClient, getSecureBorrowingAs
        } = await loadFixture(deploySecureBorrowingFixture);

        const sbAsItemOwner = await getSecureBorrowingAs(itemOwner);
        logDebug("Setting up: sending transaction to arbitration by itemOwner...");
        const settleTxHash = await sbAsItemOwner.write.settleTransaction([transactionId, true]);
        await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
        logDebug("Transaction sent to arbitration", { txHash: settleTxHash });
        
        logDebug("Delisting item during dispute");
        await sbAsItemOwner.write.delistItem([itemId]);
        
        const initialOwnerBalance = await publicClient.getBalance({ address: itemOwner.account.address });
        const initialBorrowerBalance = await publicClient.getBalance({ address: borrower.account.address });
        
        logDebug("Processing arbitration outcome");
        const processTxHash = await arbitrationTestHelper.write.callProcessArbitrationOutcome([
          transactionId, 
          itemOwner.account.address, 
          borrower.account.address, 
          true,
          penaltyAmount,
          refundAmount
        ]);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: processTxHash });
        
        const finalOwnerBalance = await publicClient.getBalance({ address: itemOwner.account.address });
        const finalBorrowerBalance = await publicClient.getBalance({ address: borrower.account.address });
        
        expect(finalOwnerBalance).to.be.greaterThanOrEqual(initialOwnerBalance + penaltyAmount - parseEther("0.001"));
        expect(finalBorrowerBalance).to.be.greaterThanOrEqual(initialBorrowerBalance + refundAmount - parseEther("0.001"));
        
        const arbitrationProcessedEventSignature = 'ArbitrationOutcomeProcessed(uint256,address,address,bool,uint256,uint256)';
        const eventTopic = keccak256(stringToHex(arbitrationProcessedEventSignature));
        
        const eventLog = receipt.logs.find(log => 
          log.topics[0] === eventTopic && 
          log.address.toLowerCase() === secureBorrowingContract.address.toLowerCase()
        );
        
        expect(eventLog).to.exist;
        logDebug("Test completed successfully");
      } catch (error: any) {
        logDebug("ERROR in test", { 
          message: error.message,
          details: error.toString(),
          stack: error.stack
        });
        throw error;
      }
    });
  });
});