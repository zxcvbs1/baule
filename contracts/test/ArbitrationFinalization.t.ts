import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { parseEther, decodeEventLog } from "viem";
import { 
  setupDisputeWithVotes, 
  setupFinalizationTestEnvironment,
  advanceTimeAfterVotingPeriod,
  verifyFinalizationOutcome 
} from "./helpers/finalizationHelpers";
import { setupActiveDispute, deployArbitrationTestHelper } from "./helpers/testUtils";

describe("Arbitration Contract - Finalize Dispute", function() {
  // Basic rejection tests
  describe("Validation checks", function() {
    it("Should reject if dispute is not active or already resolved", async function() {
      // 1. Set up a dispute
      const setup = await setupActiveDispute();
      const { 
        arbitrationContract, 
        transactionId, 
        ownerLedger, 
        publicClient 
      } = setup;
      
      // 2. Deploy a test helper version to create a resolved dispute
      const { arbitrationTestHelper } = await deployArbitrationTestHelper(
        setup.secureBorrowingContract,
        ownerLedger,
        setup.arbitrator1,
        setup.arbitrator2,
        setup.arbitrator3
      );
      
      // 3. Create a dispute that's already resolved
      await arbitrationTestHelper.write.testCreateDisputeAsResolved([
        transactionId,
        ownerLedger.account.address,
        setup.borrowerAccount.account.address,
        setup.deposit
      ]);
      
      // 4. Get a random account to finalize
      const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
      
      // 5. Try to finalize the already resolved dispute
      const arbitrationAsFinalizer = await hre.viem.getContractAt(
        "ArbitrationTestHelper", // Use the ABI of ArbitrationTestHelper
        arbitrationTestHelper.address, // Target the deployed helper contract instance
        { client: { wallet: finalizer } }
      );
      
      // 6. Verify the transaction reverts with correct error
      try {
        await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
        // If the transaction did not revert, this test should fail.
        expect.fail("Transaction should have reverted but did not.");
      } catch (error: any) {
        // Extract error message - dig deeper into the error structure
        let actualErrorMessage = "";
        
        // Navigate through the nested error structure
        if (error.cause?.cause?.cause?.message && typeof error.cause.cause.cause.message === 'string') {
          actualErrorMessage = error.cause.cause.cause.message;
        } else if (error.cause?.cause?.message && typeof error.cause.cause.message === 'string') {
          actualErrorMessage = error.cause.cause.message;
        } else if (error.cause?.message && typeof error.cause.message === 'string') {
          actualErrorMessage = error.cause.message;
        } else if (error.message && typeof error.message === 'string') {
          actualErrorMessage = error.message;
        }
        
        const expectedErrorMessage = "Dispute not active or already resolved";
        expect(actualErrorMessage).to.include(
          expectedErrorMessage,
          `Expected transaction to revert with "${expectedErrorMessage}", but got "${actualErrorMessage}"`
        );
      }
    });

    it("Should reject if voting period has not ended and not all arbitrators voted", async function() {
      // 1. Set up a dispute with some votes but not all
      const setup = await setupDisputeWithVotes({
        ownerVotes: 1,
        borrowerVotes: 1,
        skipTimeAdvance: true // Important: don't advance time
      });
      
      const { arbitrationContract, transactionId } = setup;
      
      // 2. Get a random account to finalize
      const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
      
      // 3. Create a finalizer contract instance
      const arbitrationAsFinalizer = await hre.viem.getContractAt(
        "Arbitration",
        arbitrationContract.address,
        { client: { wallet: finalizer } }
      );
      
      // 4. Verify the transaction reverts with correct error
      // Only 2 out of 3 arbitrators have voted, and voting period hasn't ended
      try {
        await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
        expect.fail("Transaction should have reverted but did not.");
      } catch (error: any) {
        // Extract error message - dig deeper into the error structure
        let actualErrorMessage = "";
        
        // Navigate through the nested error structure
        if (error.cause?.cause?.cause?.message && typeof error.cause.cause.cause.message === 'string') {
          actualErrorMessage = error.cause.cause.cause.message;
        } else if (error.cause?.cause?.message && typeof error.cause.cause.message === 'string') {
          actualErrorMessage = error.cause.cause.message;
        } else if (error.cause?.message && typeof error.cause.message === 'string') {
          actualErrorMessage = error.cause.message;
        } else if (error.message && typeof error.message === 'string') {
          actualErrorMessage = error.message;
        }
        
        const expectedErrorMessage = "Voting period not over unless all voted";
        expect(actualErrorMessage).to.include(
          expectedErrorMessage,
          `Expected transaction to revert with "${expectedErrorMessage}", but got "${actualErrorMessage}"`
        );
      }
    });
  });

  // Different voting outcome scenarios
  describe("Dispute outcome scenarios", function() {
    it("Should resolve correctly when owner wins (majority votes)", async function() {
      // 1. Set up a dispute with 2 votes for owner, 1 for borrower
      const setup = await setupDisputeWithVotes({
        ownerVotes: 2,
        borrowerVotes: 1,
        ownerSeverities: [60, 80] // 60% and 80% severity
      });
      
      const { arbitrationContract, transactionId, deposit } = setup;
      
      // 2. Calculate expected outcomes
      const avgSeverity = (60 + 80) / 2; // 70%
      const expectedPenalty = (deposit * BigInt(avgSeverity)) / 100n;
      const expectedRefund = deposit - expectedPenalty;
      
      // 3. Verify finalization outcome
      await verifyFinalizationOutcome(setup, {
        expectedOwnerWon: true,
        expectedPenalty: expectedPenalty,
        expectedRefund: expectedRefund
      });
    });

    it("Should resolve correctly when borrower wins (majority votes)", async function() {
      // 1. Set up a dispute with 1 vote for owner, 2 for borrower
      const setup = await setupDisputeWithVotes({
        ownerVotes: 1,
        borrowerVotes: 2,
        ownerSeverities: [50]
      });
      
      const { deposit } = setup;
      
      // 2. Expected outcomes for borrower win
      await verifyFinalizationOutcome(setup, {
        expectedOwnerWon: false,
        expectedPenalty: 0n,
        expectedRefund: deposit
      });
    });

    it("Should handle tie votes correctly with 50/50 split", async function() {
      // For test with less than 3 arbitrators
      // or specific test where exactly half vote for each side
      const setup = await setupDisputeWithVotes({
        ownerVotes: 1,
        borrowerVotes: 1,
        ownerSeverities: [60]
      });
      
      const { deposit } = setup;
      
      // In a tie, penalty is 50% of deposit and refund is the rest
      const expectedPenalty = deposit / 2n;
      const expectedRefund = deposit - expectedPenalty;
      
      await verifyFinalizationOutcome(setup, {
        expectedOwnerWon: false, // In tie, borrower is favored
        expectedPenalty: expectedPenalty,
        expectedRefund: expectedRefund
      });
    });

    it("Should handle case where no arbitrators voted", async function() {
      // 1. Set up a dispute but no votes cast
      const setup = await setupDisputeWithVotes({
        ownerVotes: 0,
        borrowerVotes: 0
      });
      
      const { arbitrationContract, transactionId, deposit, borrowerAccount, publicClient } = setup;
      
      // 2. Track borrower's balance before/after (should get incentive pool back)
      const borrowerBalanceBefore = await publicClient.getBalance({
        address: borrowerAccount.account.address
      });
      
      // 3. Execute finalization
      const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
      const arbitrationAsFinalizer = await hre.viem.getContractAt(
        "Arbitration", 
        arbitrationContract.address,
        { client: { wallet: finalizer } }
      );
      
      const tx = await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
      await publicClient.waitForTransactionReceipt({ hash: tx });
      
      // 4. Check borrower's balance increased by incentive pool
      const borrowerBalanceAfter = await publicClient.getBalance({
        address: borrowerAccount.account.address
      });
      
      // 5. Calculate expected increase: incentivePool
      const incentivePercentage = await arbitrationContract.read.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
      const incentivePool = (deposit * incentivePercentage) / 100n;
      
      // 6. Verify borrower balance increased by incentive pool (approximately)
      const borrowerBalanceIncrease = borrowerBalanceAfter - borrowerBalanceBefore;
      expect(borrowerBalanceIncrease).to.be.at.least(incentivePool * 95n / 100n); // Allow small variance
      expect(borrowerBalanceIncrease).to.be.at.most(incentivePool * 105n / 100n);
      
      // 7. Check dispute was resolved with correct values
      await verifyFinalizationOutcome(setup, {
        expectedOwnerWon: false,
        expectedPenalty: 0n,
        expectedRefund: deposit
      });
    });
  });

  // Incentive distribution tests
  describe("Incentive distribution", function() {
    it("Should distribute incentives correctly to finalizer and voting arbitrators", async function() {
      // 1. Set up a dispute with all arbitrators voting
      const setup = await setupDisputeWithVotes({
        ownerVotes: 2,
        borrowerVotes: 1
      });
      
      const { 
        arbitrationContract, 
        transactionId, 
        deposit, 
        arbitrator1, 
        arbitrator2, 
        arbitrator3, 
        publicClient 
      } = setup;
      
      // 2. Record initial balances
      const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
      const finalizerBalanceBefore = await publicClient.getBalance({
        address: finalizer.account.address
      });
      
      const arbitrator1BalanceBefore = await publicClient.getBalance({
        address: arbitrator1.account.address
      });
      
      const arbitrator2BalanceBefore = await publicClient.getBalance({
        address: arbitrator2.account.address
      });
      
      const arbitrator3BalanceBefore = await publicClient.getBalance({
        address: arbitrator3.account.address
      });
      
      // 3. Execute finalization
      const arbitrationAsFinalizer = await hre.viem.getContractAt(
        "Arbitration", 
        arbitrationContract.address,
        { client: { wallet: finalizer } }
      );
      
      const tx = await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      
      // 4. Calculate expected distributions
      const incentivePercentage = await arbitrationContract.read.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
      const finalizerFeePercentage = await arbitrationContract.read.FINALIZER_FEE_FROM_POOL();
      const totalIncentivePool = (deposit * incentivePercentage) / 100n;
      const expectedFinalizerShare = (totalIncentivePool * finalizerFeePercentage) / 100n;
      const poolForArbitrators = totalIncentivePool - expectedFinalizerShare;
      const arbitratorShare = poolForArbitrators / 3n;
      
      // 5. Check balances increased (need to account for gas costs for finalizer)
      const finalizerBalanceAfter = await publicClient.getBalance({
        address: finalizer.account.address
      });
      
      const arbitrator1BalanceAfter = await publicClient.getBalance({
        address: arbitrator1.account.address
      });
      
      const arbitrator2BalanceAfter = await publicClient.getBalance({
        address: arbitrator2.account.address
      });
      
      const arbitrator3BalanceAfter = await publicClient.getBalance({
        address: arbitrator3.account.address
      });
      
      // 6. Verify incentive payments (approximately due to gas costs)
      // For arbitrators it should be exact since they didn't spend gas
      expect(arbitrator1BalanceAfter - arbitrator1BalanceBefore).to.be.approximately(arbitratorShare, 1n);
      expect(arbitrator2BalanceAfter - arbitrator2BalanceBefore).to.be.approximately(arbitratorShare, 1n);
      expect(arbitrator3BalanceAfter - arbitrator3BalanceBefore).to.be.approximately(arbitratorShare, 1n);
      
      // 7. For finalizer, balance change = incentive - gas costs
      const gasUsed = receipt.gasUsed;
      const effectiveGasPrice = receipt.effectiveGasPrice;
      const gasCost = gasUsed * effectiveGasPrice;
      
      const finalizerBalanceChange = finalizerBalanceAfter - finalizerBalanceBefore + gasCost;
      expect(finalizerBalanceChange).to.be.approximately(expectedFinalizerShare, 1n);
      
      // 8. Check events
      const finalizerEvent = receipt.logs.find(log => 
        log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(
          'FinalizerIncentivePaid(uint256,address,uint256)'
        ))
      );
      expect(finalizerEvent).to.exist;
      
      // Check arbitrator payment events too
      const arbitratorEvents = receipt.logs.filter(log => 
        log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(
          'ArbitratorIncentivePaid(uint256,address,uint256)'
        ))
      );
      expect(arbitratorEvents.length).to.equal(3); // All 3 arbitrators should get paid
    });

    it("Should handle case when no arbitrators voted (incentive return)", async function() {
      // 1. Set up dispute with no votes
      const setup = await setupDisputeWithVotes({
        ownerVotes: 0,
        borrowerVotes: 0
      });
      
      const { 
        arbitrationContract, 
        transactionId, 
        borrowerAccount,
        deposit,
        publicClient 
      } = setup;
      
      // 2. Track borrower balance
      const borrowerBalanceBefore = await publicClient.getBalance({
        address: borrowerAccount.account.address
      });
      
      // 3. Execute finalization
      const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
      const arbitrationAsFinalizer = await hre.viem.getContractAt(
        "Arbitration", 
        arbitrationContract.address,
        { client: { wallet: finalizer } }
      );
      
      const tx = await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      
      // 4. Check borrower balance increased
      const borrowerBalanceAfter = await publicClient.getBalance({
        address: borrowerAccount.account.address
      });
      
      const incentivePercentage = await arbitrationContract.read.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
      const incentivePool = (deposit * incentivePercentage) / 100n;
      
      expect(borrowerBalanceAfter - borrowerBalanceBefore).to.be.at.least(
        incentivePool * 95n / 100n // Allow small variance
      );
      
      // 5. Check UnusedIncentivesReturned event
      const unusedIncentivesEvent = receipt.logs.find(log => 
        log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(
          'UnusedIncentivesReturned(uint256,uint256)'
        ))
      );
      expect(unusedIncentivesEvent).to.exist;
    });
  });

  // Reputation updates
  describe("Reputation updates", function() {
    it("Should update arbitrator reputation correctly (+1 for voters, -2 for non-voters)", async function() {
      // 1. Set up dispute with some arbitrators voting and others not
      const setup = await setupDisputeWithVotes({
        ownerVotes: 2,  // arbitrator1 and arbitrator2 vote
        borrowerVotes: 0 // arbitrator3 doesn't vote
      });
      
      const { 
        arbitrationContract, 
        transactionId, 
        arbitrator1,
        arbitrator2, 
        arbitrator3,
        publicClient 
      } = setup;
      
      // 2. Get initial reputations
      const initialRep1 = await arbitrationContract.read.arbitratorReputation([
        arbitrator1.account.address
      ]);
      
      const initialRep2 = await arbitrationContract.read.arbitratorReputation([
        arbitrator2.account.address
      ]);
      
      const initialRep3 = await arbitrationContract.read.arbitratorReputation([
        arbitrator3.account.address
      ]);
      
      // 3. Execute finalization
      const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
      const arbitrationAsFinalizer = await hre.viem.getContractAt(
        "Arbitration", 
        arbitrationContract.address,
        { client: { wallet: finalizer } }
      );
      
      await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
      
      // 4. Check reputation changes
      const finalRep1 = await arbitrationContract.read.arbitratorReputation([
        arbitrator1.account.address
      ]);
      
      const finalRep2 = await arbitrationContract.read.arbitratorReputation([
        arbitrator2.account.address
      ]);
      
      const finalRep3 = await arbitrationContract.read.arbitratorReputation([
        arbitrator3.account.address
      ]);
      
      expect(finalRep1 - initialRep1).to.equal(1n); // +1 for voting
      expect(finalRep2 - initialRep2).to.equal(1n); // +1 for voting
      expect(initialRep3 - finalRep3).to.equal(2n); // -2 for not voting
    });
  });

  // Integration with SecureBorrowing
  describe("Integration with SecureBorrowing", function() {
    it("Should call processArbitrationOutcome with correct parameters", async function() {
      // 1. Create a dispute where owner wins
      const setup = await setupDisputeWithVotes({
        ownerVotes: 2,
        borrowerVotes: 1,
        ownerSeverities: [60, 80] 
      });
      
      const { 
        arbitrationContract, 
        secureBorrowingContract,
        transactionId, 
        deposit,
        ownerLedger,
        borrowerAccount,
        publicClient 
      } = setup;
      
      // 2. Calculate expected values
      const avgSeverity = (60 + 80) / 2; // 70%
      const expectedPenalty = (deposit * BigInt(avgSeverity)) / 100n;
      const expectedRefund = deposit - expectedPenalty;
      
      // 3. Listen for the ArbitrationOutcomeProcessed event on SecureBorrowing
      const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
      const arbitrationAsFinalizer = await hre.viem.getContractAt(
        "Arbitration", 
        arbitrationContract.address,
        { client: { wallet: finalizer } }
      );
      
      const tx = await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      
      // 4. Verify the SecureBorrowing contract received and processed the outcome
      const secureBorrowingArtifact = require('../artifacts/contracts/SecureBorrowing.sol/SecureBorrowing.json');
      const eventSignature = 'ArbitrationOutcomeProcessed(uint256,bool,uint256,uint256)';
      
      const sbEvents = receipt.logs.filter(log => 
        log.address.toLowerCase() === secureBorrowingContract.address.toLowerCase() &&
        log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(eventSignature))
      );
      
      expect(sbEvents.length).to.equal(1);
      
      // Decode the event
      const decodedEvent = decodeEventLog({
        abi: secureBorrowingArtifact.abi,
        data: sbEvents[0].data,
        topics: sbEvents[0].topics
      });
      
      // 5. Verify event parameters match our expectations
      expect(decodedEvent.args.transactionId).to.equal(transactionId);
      expect(decodedEvent.args.ownerWonDispute).to.be.true;
      expect(decodedEvent.args.penaltyAmountPaidToOwner).to.equal(expectedPenalty);
      expect(decodedEvent.args.refundAmountToBorrower).to.equal(expectedRefund);
    });
  });

  // Security tests
  describe("Security considerations", function() {
    it("Should be protected against reentrancy attacks", async function() {
      // For this test, we need to deploy a special attack contract that tries to reenter finalizeDispute
      
      // 1. Deploy the attacker contract
      const attackerContract = await hre.viem.deployContract("ReentrancyAttacker", []);
      
      // 2. Create a dispute
      const setup = await setupDisputeWithVotes({
        ownerVotes: 3,
        ownerSeverities: [50, 60, 70]
      });
      
      const { arbitrationContract, transactionId } = setup;
      
      // 3. Set the arbitration target in the attacker
      await attackerContract.write.setTarget([arbitrationContract.address]);
      
      // 4. Try to execute the attack
      const attackTx = await attackerContract.write.attackFinalizeDispute(
        [transactionId],
        { value: parseEther("1.0") } // Send ETH to fund the attack
      );
      
      const receipt = await attackerContract.client.public.waitForTransactionReceipt({
        hash: attackTx
      });
      
      // 5. Check if attack was prevented
      const attackResult = await attackerContract.read.attackResult();
      expect(attackResult).to.equal(false); // Attack should fail
      
      // Alternative if you don't want to implement an attack contract:
      // Just verify the nonReentrant modifier is present in the contract code
      const arbitrationCode = await hre.viem.getBytecode({ address: arbitrationContract.address });
      // This is a simplistic check, but nonReentrant should be present
      expect(arbitrationCode.indexOf(hre.viem.keccak256(hre.viem.stringToHex("nonReentrant")).slice(0, 10))).to.not.equal(-1);
    });
  });
});