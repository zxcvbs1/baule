import { expect } from "chai";
import hre from "hardhat";
import { parseEther, decodeEventLog } from "viem";
import { setupActiveDispute } from "./testUtils";

// Add this function to create a test environment with the SecureBorrowingTestHelper
export async function setupFinalizationTestEnvironment() {
  // Get regular setup first
  const setup = await setupActiveDispute();
  const { arbitrationContract, ownerLedger, borrowerAccount, transactionId, deposit } = setup;

  // Deploy SecureBorrowingTestHelper
  const secureBorrowingTestHelper = await hre.viem.deployContract("SecureBorrowingTestHelper", [
    ownerLedger.account.address,
    arbitrationContract.address
  ]);
  
  // Configure the test helper
  const testHelperAsOwner = await hre.viem.getContractAt(
    "SecureBorrowingTestHelper",
    secureBorrowingTestHelper.address,
    { client: { wallet: ownerLedger } }
  );
  await testHelperAsOwner.write.setMockTransferSuccess([true]);
  
  // Update Arbitration to use our test helper
  const arbitrationAsOwner = await hre.viem.getContractAt(
    "Arbitration",
    arbitrationContract.address,
    { client: { wallet: ownerLedger } }
  );
  await arbitrationAsOwner.write.updateSecureBorrowing([secureBorrowingTestHelper.address]);
  
  // Create the same dispute in the test helper
  await testHelperAsOwner.write.mockActiveDispute([
    transactionId,
    ownerLedger.account.address,
    borrowerAccount.account.address,
    deposit
  ]);
  
  return {
    ...setup,
    secureBorrowingContract: secureBorrowingTestHelper,
    testHelperAsOwner
  };
}

// Update setupDisputeWithVotes to use the test environment
export async function setupDisputeWithVotes({
  ownerVotes = 0,
  borrowerVotes = 0,
  ownerSeverities = [],
  skipTimeAdvance = false
} = {}) {
  // Use test environment instead of regular setup
  const setup = await setupFinalizationTestEnvironment();
  const { arbitrationContract, transactionId, arbitrator1, arbitrator2, arbitrator3 } = setup;

  // Cast votes according to parameters
  if (ownerVotes + borrowerVotes > 0) {
    const arbitrators = [arbitrator1, arbitrator2, arbitrator3];
    const votes = [];
    
    // Assign owner votes (true)
    for (let i = 0; i < ownerVotes; i++) {
      if (i < arbitrators.length) {
        const severity = ownerSeverities[i] || 50;
        votes.push({
          arbitrator: arbitrators[i],
          inFavorOfOwner: true,
          severity: severity
        });
      }
    }
    
    // Assign borrower votes (false)
    for (let i = 0; i < borrowerVotes; i++) {
      if (i + ownerVotes < arbitrators.length) {
        votes.push({
          arbitrator: arbitrators[i + ownerVotes],
          inFavorOfOwner: false,
          severity: 0
        });
      }
    }
    
    // Cast all votes
    for (const vote of votes) {
      const arbitrationAsArbitrator = await hre.viem.getContractAt(
        "Arbitration",
        arbitrationContract.address,
        { client: { wallet: vote.arbitrator } }
      );
      
      await arbitrationAsArbitrator.write.castArbitratorVote([
        transactionId, vote.inFavorOfOwner, vote.severity
      ]);
    }
  }
  
  // Advance time past voting period if needed
  if (!skipTimeAdvance) {
    await advanceTimeAfterVotingPeriod(setup);
  }
  
  return {
    ...setup,
    ownerVotes,
    borrowerVotes,
    totalVotes: ownerVotes + borrowerVotes
  };
}

/**
 * Advances time past the voting period
 */
export async function advanceTimeAfterVotingPeriod(setup) {
  const { arbitrationContract } = setup;
  
  // Get voting period duration
  const votingPeriod = await arbitrationContract.read.disputeVotingPeriod();
  
  // Fast forward time
  await hre.network.provider.send("evm_increaseTime", [Number(votingPeriod) + 100]);
  await hre.network.provider.send("evm_mine");
  
  return setup;
}

/**
 * Verifies finalization outcome and events
 */
export async function verifyFinalizationOutcome(setup, {
  expectedOwnerWon,
  expectedPenalty,
  expectedRefund
}) {
  const { arbitrationContract, transactionId, publicClient } = setup;
  
  // Get a random account to act as finalizer
  const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
  
  // Create contract instance for the finalizer
  const arbitrationAsFinalizer = await hre.viem.getContractAt(
    "Arbitration",
    arbitrationContract.address,
    { client: { wallet: finalizer } }
  );
  
  // Execute finalization
  const tx = await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
  
  // Get receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  
  // Verify event
  const eventSignature = 'DisputeFinalizedInArbitration(uint256,bool,uint256,uint256,address)';
  const eventLog = receipt.logs.find(log => 
    log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(eventSignature))
  );
  
  expect(eventLog, `Event ${eventSignature} not found`).to.exist;
  
  // Get the ABI
  const ArbitrationArtifact = require('../../artifacts/contracts/Arbitration.sol/Arbitration.json');
  
  // Decode the event
  const decodedLog = decodeEventLog({
    abi: ArbitrationArtifact.abi,
    data: eventLog.data,
    topics: eventLog.topics
  });
  
  // Verify event parameters
  expect(decodedLog.args.originalTransactionId).to.equal(transactionId);
  expect(decodedLog.args.ownerWon).to.equal(expectedOwnerWon);
  expect(decodedLog.args.penaltyToOwner).to.equal(expectedPenalty);
  expect(decodedLog.args.refundToBorrower).to.equal(expectedRefund);
  
  // Check dispute state
  const dispute = await arbitrationContract.read.disputesData([transactionId]);
  expect(dispute[6]).to.be.false; // isActive
  expect(dispute[7]).to.be.true;  // isResolved
  
  return { receipt, decodedLog, finalizer };
}