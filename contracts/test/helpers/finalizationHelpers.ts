import { expect } from "chai";
import hre from "hardhat";
import { decodeEventLog, stringToHex, keccak256 } from "viem"; // Make sure stringToHex and keccak256 are imported here
import { setupActiveDispute } from "./testUtils"

// Improved function to create a test environment with the SecureBorrowingTestHelper
export async function setupFinalizationTestEnvironment() {
  // Get regular setup first
  const setup = await setupActiveDispute()
  const { arbitrationContract, ownerArbitration, ownerLedger, borrowerAccount, transactionId, deposit, publicClient } =
    setup

  // Deploy SecureBorrowingTestHelper
  const secureBorrowingTestHelper = await hre.viem.deployContract("SecureBorrowingTestHelper", [
    ownerLedger.account.address,
    arbitrationContract.address,
  ])

  // Configure the test helper
  const testHelperAsOwner = await hre.viem.getContractAt(
    "SecureBorrowingTestHelper",
    secureBorrowingTestHelper.address,
    { client: { wallet: ownerLedger } },
  )
  await testHelperAsOwner.write.setMockTransferSuccess([true])

  // Update Arbitration to use our test helper
  // IMPORTANT: Use ownerArbitration instead of default account
  const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
    client: { wallet: ownerArbitration }, // Use the correct owner account
  })
  await arbitrationAsOwner.write.updateSecureBorrowing([secureBorrowingTestHelper.address])

  // Create the same dispute in the test helper
  await testHelperAsOwner.write.mockActiveDispute([
    transactionId,
    ownerLedger.account.address,
    borrowerAccount.account.address,
    deposit,
  ])

  return {
    ...setup,
    secureBorrowingContract: secureBorrowingTestHelper,
    testHelperAsOwner,
    publicClient,
  }
}

// Update setupDisputeWithVotes to use the test environment
export async function setupDisputeWithVotes({
  ownerVotes = 0,
  borrowerVotes = 0,
  ownerSeverities = [],
  skipTimeAdvance = false,
} = {}) {
  // Use test environment instead of regular setup
  const setup = await setupFinalizationTestEnvironment()
  const { arbitrationContract, transactionId, arbitrator1, arbitrator2, arbitrator3, publicClient } = setup

  // Cast votes according to parameters
  if (ownerVotes + borrowerVotes > 0) {
    const arbitrators = [arbitrator1, arbitrator2, arbitrator3]
    const votes = []

    // Assign owner votes (true)
    for (let i = 0; i < ownerVotes; i++) {
      if (i < arbitrators.length) {
        const severity = ownerSeverities[i] || 50
        votes.push({
          arbitrator: arbitrators[i],
          inFavorOfOwner: true,
          severity: severity,
        })
      }
    }

    // Assign borrower votes (false)
    for (let i = 0; i < borrowerVotes; i++) {
      if (i + ownerVotes < arbitrators.length) {
        votes.push({
          arbitrator: arbitrators[i + ownerVotes],
          inFavorOfOwner: false,
          severity: 0,
        })
      }
    }

    // Cast all votes
    for (const vote of votes) {
      const arbitrationAsArbitrator = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: vote.arbitrator },
      })

      await arbitrationAsArbitrator.write.castArbitratorVote([transactionId, vote.inFavorOfOwner, vote.severity])
    }
  }

  // Advance time past voting period if needed
  if (!skipTimeAdvance) {
    await advanceTimeAfterVotingPeriod(setup)
  }

  return {
    ...setup,
    ownerVotes,
    borrowerVotes,
    totalVotes: ownerVotes + borrowerVotes,
  }
}

/**
 * Advances time past the voting period
 */
export async function advanceTimeAfterVotingPeriod(setup) {
  const { arbitrationContract } = setup

  // Get voting period duration
  const votingPeriod = await arbitrationContract.read.disputeVotingPeriod()

  // Fast forward time
  await hre.network.provider.send("evm_increaseTime", [Number(votingPeriod) + 100])
  await hre.network.provider.send("evm_mine")

  return setup
}

/**
 * Verifies finalization outcome and events
 */
export async function verifyFinalizationOutcome(
  setup: any,
  expectedOutcome: {
    expectedOwnerWon: boolean;
    expectedPenalty: bigint;
    expectedRefund: bigint;
  },
) {
  const { arbitrationContract, transactionId, ownerLedger, borrowerAccount, deposit, publicClient } = setup;

  const [finalizer] = await hre.viem.getWalletClients({ count: 1 });
  const arbitrationAsFinalizer = await hre.viem.getContractAt(
    "Arbitration",
    arbitrationContract.address,
    { client: { wallet: finalizer } },
  );

  const tx = await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

  // Look for the CORRECT event name and signature
  const disputeFinalizedEventSignature = "DisputeFinalizedInArbitration(uint256,bool,uint256,uint256,address)";
  const disputeFinalizedEventLog = receipt.logs.find(
    (log) => log.topics[0] === keccak256(stringToHex(disputeFinalizedEventSignature)),
  );
  expect(disputeFinalizedEventLog, "DisputeFinalizedInArbitration event not found").to.exist;

  const arbitrationArtifact = require("../../artifacts/contracts/Arbitration.sol/Arbitration.json");
  const decodedFinalizedLog = decodeEventLog({
    abi: arbitrationArtifact.abi,
    data: disputeFinalizedEventLog!.data,
    topics: disputeFinalizedEventLog!.topics,
  });

  // Verify the correct parameter fields from your actual event
  expect(decodedFinalizedLog.args.originalTransactionId).to.equal(transactionId);
  expect(decodedFinalizedLog.args.ownerWon).to.equal(expectedOutcome.expectedOwnerWon);
  expect(decodedFinalizedLog.args.penaltyToOwner).to.equal(expectedOutcome.expectedPenalty);
  expect(decodedFinalizedLog.args.refundToBorrower).to.equal(expectedOutcome.expectedRefund);
  expect(decodedFinalizedLog.args.finalizer.toLowerCase()).to.equal(finalizer.account.address.toLowerCase());

  // Continue with any other checks...
}
