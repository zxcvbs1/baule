import { expect } from "chai"
import hre from "hardhat"
import { parseEther, decodeEventLog } from "viem"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers"
import { deployTestContractsFixture } from "./helpers/testUtils"

describe("Arbitration Contract - Admin Functions", () => {
  describe("updateVotingPeriod", () => {
    it("Should reject if caller is not the owner", async () => {
      const { arbitrationContract, arbitrator1 } = await loadFixture(deployTestContractsFixture)

      // Get the contract as non-owner
      const arbitrationAsNonOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: arbitrator1 },
      })

      // Try to update voting period
      try {
        await arbitrationAsNonOwner.write.updateVotingPeriod([86400]) // 1 day
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Ownable: caller is not the owner")
      }
    })

    it("Should reject if new period is below MIN_VOTING_PERIOD", async () => {
      const { arbitrationContract, ownerArbitration, publicClient } = await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Get MIN_VOTING_PERIOD
      const minPeriod = await arbitrationContract.read.MIN_VOTING_PERIOD()
      const invalidPeriod = minPeriod - 1n

      // Try to update with invalid period
      try {
        await arbitrationAsOwner.write.updateVotingPeriod([invalidPeriod])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Period outside allowed range")
      }
    })

    it("Should reject if new period is above MAX_VOTING_PERIOD", async () => {
      const { arbitrationContract, ownerArbitration, publicClient } = await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Get MAX_VOTING_PERIOD
      const maxPeriod = await arbitrationContract.read.MAX_VOTING_PERIOD()
      const invalidPeriod = maxPeriod + 1n

      // Try to update with invalid period
      try {
        await arbitrationAsOwner.write.updateVotingPeriod([invalidPeriod])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Period outside allowed range")
      }
    })

    it("Should successfully update voting period within allowed range", async () => {
      const { arbitrationContract, ownerArbitration, publicClient } = await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Get current period and limits
      const initialPeriod = await arbitrationContract.read.disputeVotingPeriod()
      const minPeriod = await arbitrationContract.read.MIN_VOTING_PERIOD()
      const maxPeriod = await arbitrationContract.read.MAX_VOTING_PERIOD()

      // Choose a new valid period
      let newPeriod = (minPeriod + maxPeriod) / 2n

      // Make sure it's different from current
      if (newPeriod === initialPeriod) {
        newPeriod = initialPeriod + 1000n
      }

      // Update voting period
      const tx = await arbitrationAsOwner.write.updateVotingPeriod([newPeriod])
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })

      // Verify event
      const eventSignature = "VotingPeriodUpdated(uint256,uint256)"
      const eventLog = receipt.logs.find(
        (log) => log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(eventSignature)),
      )
      expect(eventLog).to.exist

      // Decode event
      const ArbitrationArtifact = require("../artifacts/contracts/Arbitration.sol/Arbitration.json")
      const decodedLog = decodeEventLog({
        abi: ArbitrationArtifact.abi,
        data: eventLog.data,
        topics: eventLog.topics,
      })

      // Verify event parameters
      expect(decodedLog.args.oldPeriod).to.equal(initialPeriod)
      expect(decodedLog.args.newPeriod).to.equal(newPeriod)

      // Verify state update
      const updatedPeriod = await arbitrationContract.read.disputeVotingPeriod()
      expect(updatedPeriod).to.equal(newPeriod)
    })
  })

  describe("setArbitratorsPanel", () => {
    it("Should reject if caller is not the owner", async () => {
      const { arbitrationContract, arbitrator1 } = await loadFixture(deployTestContractsFixture)

      // Get the contract as non-owner
      const arbitrationAsNonOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: arbitrator1 },
      })

      // Try to update arbitrators panel
      try {
        await arbitrationAsNonOwner.write.setArbitratorsPanel([[arbitrator1.account.address]])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Ownable: caller is not the owner")
      }
    })

    it("Should reject if any arbitrator address is zero", async () => {
      const { arbitrationContract, ownerArbitration, arbitrator1, publicClient } =
        await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Try to update with zero address
      try {
        await arbitrationAsOwner.write.setArbitratorsPanel([
          [arbitrator1.account.address, "0x0000000000000000000000000000000000000000"],
        ])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Zero address not allowed")
      }
    })

    it("Should successfully update arbitrators panel", async () => {
      const { arbitrationContract, ownerArbitration, publicClient } = await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Create new arbitrators
      const [newArb1, newArb2, newArb3] = await hre.viem.getWalletClients({ count: 3 })
      const newArbitrators = [newArb1.account.address, newArb2.account.address, newArb3.account.address]

      // Update arbitrators panel
      const tx = await arbitrationAsOwner.write.setArbitratorsPanel([newArbitrators])
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })

      // Verify event
      const eventSignature = "ArbitratorsPanelUpdated()"
      const eventLog = receipt.logs.find(
        (log) => log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(eventSignature)),
      )
      expect(eventLog).to.exist

      // Verify state update - check if arbitrators are in the panel
      for (const arbitrator of newArbitrators) {
        const isInPanel = await arbitrationContract.read.isArbitratorInPanel([arbitrator])
        expect(isInPanel).to.be.true
      }
    })

    it("Should not affect existing disputes when panel is updated", async () => {
      // This test requires creating a dispute first, then changing the panel, and verifying
      // that the original arbitrators can still vote on the dispute
      const {
        secureBorrowingContract,
        arbitrationContract,
        ownerLedger,
        borrowerAccount,
        ownerArbitration,
        arbitrator1,
        arbitrator2,
        arbitrator3,
        publicClient,
      } = await loadFixture(deployTestContractsFixture)

      // 1. Create a transaction and dispute
      // Create an item
      const itemId = hre.viem.stringToHex("test-item", { size: 32 })
      const fee = parseEther("0.1")
      const deposit = parseEther("1.0")
      const metadataHash = hre.viem.stringToHex("metadata-test", { size: 32 })
      const minBorrowerReputation = 0n

      const secureBorrowingAsOwner = await hre.viem.getContractAt("SecureBorrowing", secureBorrowingContract.address, {
        client: { wallet: ownerLedger },
      })

      await secureBorrowingAsOwner.write.listItem([itemId, fee, deposit, metadataHash, minBorrowerReputation])

      // Borrow the item
      const itemInfo = await secureBorrowingContract.read.items([itemId])
      const nonce = itemInfo[1]

      const eip712Params = {
        domain: {
          name: "SecureBorrowing_1.1",
          version: "1.1",
          chainId: await publicClient.getChainId(),
          verifyingContract: secureBorrowingContract.address,
        },
        types: {
          Borrow: [
            { name: "itemId", type: "bytes32" },
            { name: "fee", type: "uint256" },
            { name: "deposit", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "borrower", type: "address" },
          ],
        },
      }

      const signature = await ownerLedger.signTypedData({
        domain: eip712Params.domain,
        types: eip712Params.types,
        primaryType: "Borrow",
        message: {
          itemId,
          fee,
          deposit,
          nonce,
          borrower: borrowerAccount.account.address,
        },
      })

      const secureBorrowingAsBorrower = await hre.viem.getContractAt(
        "SecureBorrowing",
        secureBorrowingContract.address,
        {
          client: { wallet: borrowerAccount },
        },
      )

      await secureBorrowingAsBorrower.write.borrowItem([itemId, fee, deposit, signature], { value: fee + deposit })

      // Get transaction ID
      const transactionId = (await secureBorrowingContract.read.transactionCount()) - 1n

      // Report damage to create dispute
      await secureBorrowingAsOwner.write.settleTransaction([transactionId, true])

      // 2. Change arbitrators panel
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Create new arbitrators
      const [newArb1, newArb2, newArb3] = await hre.viem.getWalletClients({ count: 3 })
      const newArbitrators = [newArb1.account.address, newArb2.account.address, newArb3.account.address]

      // Update arbitrators panel
      await arbitrationAsOwner.write.setArbitratorsPanel([newArbitrators])

      // 3. Verify original arbitrators can still vote
      const arbitrationAsArb1 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: arbitrator1 },
      })

      // Try to vote with original arbitrator
      const voteTx = await arbitrationAsArb1.write.castArbitratorVote([
        transactionId,
        true, // voteInFavorOfOwner
        50, // damageSeverityPercentage
      ])

      const receipt = await publicClient.waitForTransactionReceipt({ hash: voteTx })

      // Verify vote was successful
      expect(receipt.status).to.equal("success")

      // Check if vote was recorded
      const hasVoted = await arbitrationContract.read.getArbitratorHasVoted([
        transactionId,
        arbitrator1.account.address,
      ])

      expect(hasVoted).to.be.true
    })
  })

  describe("withdrawStuckETH", () => {
    it("Should reject if caller is not the owner", async () => {
      const { arbitrationContract, arbitrator1 } = await loadFixture(deployTestContractsFixture)

      // Get the contract as non-owner
      const arbitrationAsNonOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: arbitrator1 },
      })

      // Try to withdraw ETH
      try {
        await arbitrationAsNonOwner.write.withdrawStuckETH([arbitrator1.account.address, parseEther("0.1")])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Ownable: caller is not the owner")
      }
    })

    it("Should reject if recipient is zero address", async () => {
      const { arbitrationContract, ownerArbitration } = await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Try to withdraw to zero address
      try {
        await arbitrationAsOwner.write.withdrawStuckETH([
          "0x0000000000000000000000000000000000000000",
          parseEther("0.1"),
        ])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Cannot withdraw to zero address")
      }
    })

    it("Should reject if amount exceeds contract balance", async () => {
      const { arbitrationContract, ownerArbitration, arbitrator1 } = await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Get contract balance
      const contractBalance = await hre.viem.getPublicClient().getBalance({
        address: arbitrationContract.address,
      })

      // Try to withdraw more than balance
      try {
        await arbitrationAsOwner.write.withdrawStuckETH([
          arbitrator1.account.address,
          contractBalance + parseEther("1.0"),
        ])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Insufficient balance")
      }
    })

    it("Should successfully withdraw ETH", async () => {
      const { arbitrationContract, ownerArbitration, arbitrator1, publicClient } =
        await loadFixture(deployTestContractsFixture)

      // First, send some ETH to the contract
      await ownerArbitration.sendTransaction({
        to: arbitrationContract.address,
        value: parseEther("1.0"),
      })

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Get initial balances
      const initialContractBalance = await publicClient.getBalance({
        address: arbitrationContract.address,
      })
      const initialRecipientBalance = await publicClient.getBalance({
        address: arbitrator1.account.address,
      })

      // Amount to withdraw
      const withdrawAmount = parseEther("0.5")

      // Withdraw ETH
      const tx = await arbitrationAsOwner.write.withdrawStuckETH([arbitrator1.account.address, withdrawAmount])
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })

      // Verify event
      const eventSignature = "ETHWithdrawn(address,uint256)"
      const eventLog = receipt.logs.find(
        (log) => log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(eventSignature)),
      )
      expect(eventLog).to.exist

      // Decode event
      const ArbitrationArtifact = require("../artifacts/contracts/Arbitration.sol/Arbitration.json")
      const decodedLog = decodeEventLog({
        abi: ArbitrationArtifact.abi,
        data: eventLog.data,
        topics: eventLog.topics,
      })

      // Verify event parameters
      expect(decodedLog.args.to.toLowerCase()).to.equal(arbitrator1.account.address.toLowerCase())
      expect(decodedLog.args.amount).to.equal(withdrawAmount)

      // Verify balances
      const finalContractBalance = await publicClient.getBalance({
        address: arbitrationContract.address,
      })
      const finalRecipientBalance = await publicClient.getBalance({
        address: arbitrator1.account.address,
      })

      expect(initialContractBalance - finalContractBalance).to.equal(withdrawAmount)
      expect(finalRecipientBalance - initialRecipientBalance).to.equal(withdrawAmount)
    })
  })

  describe("updateSecureBorrowing", () => {
    it("Should reject if caller is not the owner", async () => {
      const { arbitrationContract, arbitrator1 } = await loadFixture(deployTestContractsFixture)

      // Get the contract as non-owner
      const arbitrationAsNonOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: arbitrator1 },
      })

      // Try to update SecureBorrowing address
      try {
        await arbitrationAsNonOwner.write.updateSecureBorrowing([arbitrator1.account.address])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Ownable: caller is not the owner")
      }
    })

    it("Should reject if new address is zero", async () => {
      const { arbitrationContract, ownerArbitration } = await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Try to update to zero address
      try {
        await arbitrationAsOwner.write.updateSecureBorrowing(["0x0000000000000000000000000000000000000000"])
        expect.fail("Transaction should have reverted but did not")
      } catch (error: any) {
        // Extract error message
        let errorMessage = ""
        if (error.cause?.cause?.cause?.message) {
          errorMessage = error.cause.cause.cause.message
        } else if (error.cause?.cause?.message) {
          errorMessage = error.cause.cause.message
        } else if (error.cause?.message) {
          errorMessage = error.cause.message
        } else if (error.message) {
          errorMessage = error.message
        }

        expect(errorMessage).to.include("Zero address not allowed")
      }
    })

    it("Should successfully update SecureBorrowing address", async () => {
      const { arbitrationContract, ownerArbitration, publicClient } = await loadFixture(deployTestContractsFixture)

      // Get the contract as owner
      const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
        client: { wallet: ownerArbitration },
      })

      // Deploy a new SecureBorrowing contract
      const newSecureBorrowingContract = await hre.viem.deployContract("SecureBorrowing", [
        ownerArbitration.account.address,
        arbitrationContract.address,
      ])

      // Update SecureBorrowing address
      const tx = await arbitrationAsOwner.write.updateSecureBorrowing([newSecureBorrowingContract.address])
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })

      // Verify event
      const eventSignature = "SecureBorrowingUpdated(address,address)"
      const eventLog = receipt.logs.find(
        (log) => log.topics[0] === hre.viem.keccak256(hre.viem.stringToHex(eventSignature)),
      )
      expect(eventLog).to.exist

      // Decode event
      const ArbitrationArtifact = require("../artifacts/contracts/Arbitration.sol/Arbitration.json")
      const decodedLog = decodeEventLog({
        abi: ArbitrationArtifact.abi,
        data: eventLog.data,
        topics: eventLog.topics,
      })

      // Verify event parameters
      expect(decodedLog.args.oldAddress.toLowerCase()).not.to.equal(newSecureBorrowingContract.address.toLowerCase())
      expect(decodedLog.args.newAddress.toLowerCase()).to.equal(newSecureBorrowingContract.address.toLowerCase())

      // Verify state update
      const updatedAddress = await arbitrationContract.read.secureBorrowingContract()
      expect(updatedAddress.toLowerCase()).to.equal(newSecureBorrowingContract.address.toLowerCase())
    })
  })
})
