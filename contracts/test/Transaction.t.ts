import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { setupBorrowingTransactionAndGetId, initiateDisputeAndGetReceipt, deployTestContractsFixture } from "./helpers/testUtils";
import { zeroAddress } from "viem"; // Ensure zeroAddress is imported

async function setupDisputedTransactionContext(fundSecureBorrowingExtra: boolean = true) {
  const fixtureResults = await loadFixture(deployTestContractsFixture);
  console.log("Fixture Results in setupDisputedTransactionContext:", {
    secureBorrowingContractAddress: fixtureResults.secureBorrowingContract?.address,
    arbitrationContractAddress: fixtureResults.arbitrationContract?.address,
    ownerLedgerAddress: fixtureResults.ownerLedger?.account?.address,
    borrowerAccountAddress: fixtureResults.borrowerAccount?.account?.address,
    arbitrator1Address: fixtureResults.arbitrator1?.account?.address,
    arbitrator2Address: fixtureResults.arbitrator2?.account?.address,
    arbitrator3Address: fixtureResults.arbitrator3?.account?.address,
  });

  const {
    secureBorrowingContract,
    arbitrationContract,
    ownerLedger,
    ownerArbitration, // ← CORREGIDO: Asegurarse de desestructurar ownerArbitration
    borrowerAccount,
    publicClient,
    arbitrator1,
    arbitrator2,
    arbitrator3,
    externalCaller,
  } = fixtureResults;

  const { deposit, transactionId, itemId } = await setupBorrowingTransactionAndGetId(
    secureBorrowingContract,
    ownerLedger,
    borrowerAccount,
    publicClient
  );

  await initiateDisputeAndGetReceipt(
    secureBorrowingContract,
    ownerLedger,
    transactionId,
    publicClient
  );

  if (fundSecureBorrowingExtra) {
    await ownerLedger.sendTransaction({
      to: secureBorrowingContract.address,
      value: parseEther("2.0"), 
    });
  }

  // Crear una wallet específica para el finalizador
  // const [finalizerWallet] = await hre.viem.getWalletClients({ count: 1 }); // Puedes mantenerla si la usas para llamar a finalizeDispute

  // Configurar el finalizador en el contrato Arbitration
  // ELIMINA O COMENTA ESTAS LÍNEAS:
  // await arbitrationContract.write.setDisputeFinalizer(
  //   [finalizerWallet.account.address],
  //   { account: ownerArbitration.account }
  // );

  console.log("Values returned by setupDisputedTransactionContext:", {
    secureBorrowingContractAddress: secureBorrowingContract?.address,
    arbitrationContractAddress: arbitrationContract?.address,
    ownerLedgerAddress: ownerLedger?.account?.address,
    borrowerAccountAddress: borrowerAccount?.account?.address,
    arbitrator1Address: arbitrator1?.account?.address,
    arbitrator2Address: arbitrator2?.account?.address,
    arbitrator3Address: arbitrator3?.account?.address,
    deposit: deposit?.toString(),
    transactionId: transactionId?.toString(),
    itemId: itemId?.toString(),
  });

  // Si eliminaste la creación de finalizerWallet y no la necesitas para llamar a finalizeDispute,
  // también puedes quitarla del objeto que se retorna.
  // Si la mantienes para llamar a finalizeDispute (aunque ahora cualquiera puede), déjala.
  return {
    secureBorrowingContract,
    arbitrationContract,
    ownerLedger,
    borrowerAccount,
    publicClient,
    arbitrator1,
    arbitrator2,
    arbitrator3,
    externalCaller,
    deposit,
    transactionId,
    itemId,
    // finalizerWallet // Solo si la sigues usando para llamar a finalizeDispute
  };
}

describe("Transaction", function () {
  describe("processArbitrationOutcome", function () {
    describe("Successful Processing Scenarios (Escenario B - Incentive Pool deducido del depósito)", function () {
      
      it("Escenario B: Dueño gana con 100% severidad, recibe depósito neto", async function () {
        const {
          secureBorrowingContract,
          arbitrationContract,
          ownerLedger,
          borrowerAccount,
          publicClient,
          deposit, 
          transactionId,
          itemId,
          arbitrator1, 
          arbitrator2,
          arbitrator3,
          finalizerWallet, // Incluido correctamente
        } = await setupDisputedTransactionContext(); 

        const incentivePercentage = await arbitrationContract.read.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
        const expectedIncentivePool = (deposit * incentivePercentage) / 100n;
        const netDepositAvailableInSecureBorrowing = deposit - expectedIncentivePool;

        const initialOwnerRepSB = await secureBorrowingContract.read.ownerReputation([ownerLedger.account.address]);
        const initialBorrowerRepSB = await secureBorrowingContract.read.borrowerReputation([borrowerAccount.account.address]);
        const initialActiveDisputeCountSB = await secureBorrowingContract.read.activeDisputeCount();
        const ownerBalanceBefore = await publicClient.getBalance({ address: ownerLedger.account.address });
        const borrowerBalanceBefore = await publicClient.getBalance({ address: borrowerAccount.account.address });

        const arbitrationAsArb1 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator1 } });
        await arbitrationAsArb1.write.castArbitratorVote([transactionId, true, 100]);

        const arbitrationAsArb2 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator2 } });
        await arbitrationAsArb2.write.castArbitratorVote([transactionId, true, 100]);

        const arbitrationAsArb3 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator3 } });
        await arbitrationAsArb3.write.castArbitratorVote([transactionId, true, 100]);

        // MUEVE EL LOG AQUÍ:
        const txnInfoBeforeFinalize = await secureBorrowingContract.read.getTransactionInfo([transactionId]);
        console.log("Estado de la transacción ANTES de llamar a finalizeDispute:", txnInfoBeforeFinalize.status);
        // También puedes loguear el estado de la disputa en Arbitration.sol si es relevante
        const disputeInfoBeforeFinalize = await arbitrationContract.read.disputesData([transactionId]);
        console.log("Estado de la disputa en Arbitration ANTES de llamar a finalizeDispute:", disputeInfoBeforeFinalize);


        const arbitrationAsFinalizer = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: ownerLedger } }); // O finalizerWallet si lo restauras
        const finalizeTxHash = await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
        const finalizeReceipt = await publicClient.waitForTransactionReceipt({ hash: finalizeTxHash });

        // --- PASO 3: Verificar el estado en SecureBorrowing.sol ---
        // Usar el nuevo getter getItemInfo
        const itemInfo = await secureBorrowingContract.read.getItemInfo([itemId]);
        console.log("Item info after dispute resolution:", itemInfo);

        if (itemInfo.owner !== zeroAddress) {
          expect(itemInfo.isAvailable).to.be.true;
        }

        const finalActiveDisputeCountSB = await secureBorrowingContract.read.activeDisputeCount();
        expect(finalActiveDisputeCountSB).to.equal(initialActiveDisputeCountSB - 1n);

        // Usar el nuevo getter getTransactionInfo
        const txn = await secureBorrowingContract.read.getTransactionInfo([transactionId]);
        console.log("Estado de la transacción antes de finalizar disputa:", txn.status);
        expect(txn.amountFromDepositPaidToOwner, "Penalty to owner (net deposit)").to.equal(netDepositAvailableInSecureBorrowing);
        expect(txn.amountFromDepositRefundedToBorrower, "Refund to borrower (should be 0)").to.equal(0n);

        const finalOwnerRepSB = await secureBorrowingContract.read.ownerReputation([ownerLedger.account.address]);
        const finalBorrowerRepSB = await secureBorrowingContract.read.borrowerReputation([borrowerAccount.account.address]);
        expect(finalOwnerRepSB).to.equal(initialOwnerRepSB + 1n);
        if (netDepositAvailableInSecureBorrowing > 0n) { 
             expect(finalBorrowerRepSB).to.be.lessThan(initialBorrowerRepSB);
        } else {
            expect(finalBorrowerRepSB).to.equal(initialBorrowerRepSB);
        }

        const secureBorrowingEvents = await secureBorrowingContract.getEvents.ArbitrationOutcomeProcessed(
          { transactionId: transactionId },
          { fromBlock: finalizeReceipt.blockNumber, toBlock: finalizeReceipt.blockNumber }
        );
        expect(secureBorrowingEvents.length).to.equal(1);
        const args = secureBorrowingEvents[0].args;
        expect(args.ownerWonDispute).to.be.true;
        expect(args.penaltyAmountPaidToOwner).to.equal(netDepositAvailableInSecureBorrowing);
        expect(args.refundAmountToBorrower).to.equal(0n);

        const ownerBalanceAfter = await publicClient.getBalance({ address: ownerLedger.account.address });
        const borrowerBalanceAfter = await publicClient.getBalance({ address: borrowerAccount.account.address });
        
        if (netDepositAvailableInSecureBorrowing > 0n) {
            expect(ownerBalanceAfter).to.be.gte(ownerBalanceBefore + netDepositAvailableInSecureBorrowing - parseEther("0.01"));
        }
        expect(borrowerBalanceAfter).to.equal(borrowerBalanceBefore); 
      });

      it("Escenario B: Dueño gana con 60% severidad, pagos basados en depósito neto", async function () {
        const {
          secureBorrowingContract,
          arbitrationContract,
          ownerLedger,
          borrowerAccount,
          publicClient,
          deposit, 
          transactionId,
          itemId,
          arbitrator1,
          arbitrator2,
          arbitrator3,
          finalizerWallet, // Incluido correctamente
        } = await setupDisputedTransactionContext();

        const incentivePercentage = await arbitrationContract.read.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
        const expectedIncentivePool = (deposit * incentivePercentage) / 100n;
        const netDepositAvailableInSecureBorrowing = deposit - expectedIncentivePool;

        const arb1Severity = 70;
        const arb2Severity = 50;
        const expectedAvgSeverityPercent = 60n; 
        
        const actualAmountPaidToOwner = (netDepositAvailableInSecureBorrowing * expectedAvgSeverityPercent) / 100n;
        const actualAmountRefundedToBorrower = netDepositAvailableInSecureBorrowing - actualAmountPaidToOwner;

        const initialOwnerRepSB = await secureBorrowingContract.read.ownerReputation([ownerLedger.account.address]);
        const initialBorrowerRepSB = await secureBorrowingContract.read.borrowerReputation([borrowerAccount.account.address]);
        const initialActiveDisputeCountSB = await secureBorrowingContract.read.activeDisputeCount();
        const ownerBalanceBefore = await publicClient.getBalance({ address: ownerLedger.account.address });
        const borrowerBalanceBefore = await publicClient.getBalance({ address: borrowerAccount.account.address });

        const arbitrationAsArb1 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator1 } });
        await arbitrationAsArb1.write.castArbitratorVote([transactionId, true, arb1Severity]);

        const arbitrationAsArb2 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator2 } });
        await arbitrationAsArb2.write.castArbitratorVote([transactionId, true, arb2Severity]);

        const arbitrationAsArb3 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator3 } });
        await arbitrationAsArb3.write.castArbitratorVote([transactionId, false, 0]); 

        // ⚠️ CAMBIAR ESTA LÍNEA: Usar finalizerWallet en lugar de ownerLedger
        const arbitrationAsFinalizer = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: finalizerWallet } });
        const finalizeTxHash = await arbitrationAsFinalizer.write.finalizeDispute([transactionId]);
        const finalizeReceipt = await publicClient.waitForTransactionReceipt({ hash: finalizeTxHash });

        // Usar el nuevo getter getItemInfo
        const itemInfo = await secureBorrowingContract.read.getItemInfo([itemId]);
        console.log("Item info after dispute resolution:", itemInfo);

        if (itemInfo.owner !== zeroAddress) {
          expect(itemInfo.isAvailable).to.be.true;
        }

        const finalActiveDisputeCountSB = await secureBorrowingContract.read.activeDisputeCount();
        expect(finalActiveDisputeCountSB).to.equal(initialActiveDisputeCountSB - 1n);

        // Usar el nuevo getter getTransactionInfo
        const txn = await secureBorrowingContract.read.getTransactionInfo([transactionId]);
        expect(txn.amountFromDepositPaidToOwner, "Penalty to owner (actual)").to.equal(actualAmountPaidToOwner);
        expect(txn.amountFromDepositRefundedToBorrower, "Refund to borrower (actual)").to.equal(actualAmountRefundedToBorrower);

        const finalOwnerRepSB = await secureBorrowingContract.read.ownerReputation([ownerLedger.account.address]);
        const finalBorrowerRepSB = await secureBorrowingContract.read.borrowerReputation([borrowerAccount.account.address]);
        expect(finalOwnerRepSB).to.equal(initialOwnerRepSB + 1n); 
        if (actualAmountPaidToOwner > 0n) {
            expect(finalBorrowerRepSB).to.be.lessThan(initialBorrowerRepSB);
        } else { 
            expect(finalBorrowerRepSB).to.be.at.least(initialBorrowerRepSB);
        }

        const secureBorrowingEvents = await secureBorrowingContract.getEvents.ArbitrationOutcomeProcessed(
          { transactionId: transactionId },
          { fromBlock: finalizeReceipt.blockNumber, toBlock: finalizeReceipt.blockNumber }
        );
        expect(secureBorrowingEvents.length).to.equal(1);
        const args = secureBorrowingEvents[0].args;
        expect(args.ownerWonDispute).to.be.true;
        expect(args.penaltyAmountPaidToOwner).to.equal(actualAmountPaidToOwner);
        expect(args.refundAmountToBorrower).to.equal(actualAmountRefundedToBorrower);

        const ownerBalanceAfter = await publicClient.getBalance({ address: ownerLedger.account.address });
        const borrowerBalanceAfter = await publicClient.getBalance({ address: borrowerAccount.account.address });

        if (actualAmountPaidToOwner > 0n) {
            expect(ownerBalanceAfter).to.be.gte(ownerBalanceBefore + actualAmountPaidToOwner - parseEther("0.01"));
        } else {
            expect(ownerBalanceAfter).to.be.lte(ownerBalanceBefore - parseEther("0.0001")); 
        }
        if (actualAmountRefundedToBorrower > 0n) {
            expect(borrowerBalanceAfter).to.equal(borrowerBalanceBefore + actualAmountRefundedToBorrower);
        } else {
            expect(borrowerBalanceAfter).to.equal(borrowerBalanceBefore);
        }
      });
      
      it("Escenario B: Dueño gana con 100% severidad, (ESPERANDO FALLO DE TRANSFERENCIA)", async function () {
        const {
          secureBorrowingContract,
          arbitrationContract,
          ownerLedger,
          borrowerAccount,
          publicClient,
          deposit,
          transactionId,
          itemId,
          arbitrator1,
          arbitrator2,
          arbitrator3,
          finalizerWallet, // Incluido correctamente
        } = await setupDisputedTransactionContext(false);

        const incentivePercentage = await arbitrationContract.read.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
        const expectedIncentivePool = (deposit * incentivePercentage) / 100n;
        const netDepositAvailableInSecureBorrowing = deposit - expectedIncentivePool;

        const initialOwnerRepSB = await secureBorrowingContract.read.ownerReputation([ownerLedger.account.address]);
        const initialBorrowerRepSB = await secureBorrowingContract.read.borrowerReputation([borrowerAccount.account.address]);
        const initialActiveDisputeCountSB = await secureBorrowingContract.read.activeDisputeCount();
        const ownerBalanceBefore = await publicClient.getBalance({ address: ownerLedger.account.address });
        const borrowerBalanceBefore = await publicClient.getBalance({ address: borrowerAccount.account.address });

        const arbitrationAsArb1 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator1 } });
        await arbitrationAsArb1.write.castArbitratorVote([transactionId, true, 100]);
        const arbitrationAsArb2 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator2 } });
        await arbitrationAsArb2.write.castArbitratorVote([transactionId, true, 100]);
        const arbitrationAsArb3 = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: arbitrator3 } });
        await arbitrationAsArb3.write.castArbitratorVote([transactionId, true, 100]);

        // ⚠️ CAMBIAR ESTA LÍNEA: Usar finalizerWallet en lugar de ownerLedger
        const arbitrationAsFinalizer = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: finalizerWallet } }); 
        
        // AHORA ESPERAMOS QUE ESTA LLAMADA CAUSE UN REVERT DENTRO DE SecureBorrowing.processArbitrationOutcome
        await expect(
          arbitrationAsFinalizer.write.finalizeDispute([transactionId])
        ).to.be.revertedWith("Ledger: Penalty transfer to owner failed");
      });
    });
  });
});