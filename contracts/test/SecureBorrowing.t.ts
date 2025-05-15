import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { parseEther, stringToHex, keccak256, toHex, decodeEventLog, encodeAbiParameters, type Hash, zeroAddress } from "viem";
// Asegúrate de que el nombre del artefacto coincida con tu compilación
import SecureBorrowingABI from '../artifacts/contracts/SecureBorrowing.sol/SecureBorrowing.json';
import { deployTestContractsFixture, createTestItem, prepareEIP712Params, signBorrow, verifyEvent } from "./helpers/testUtils";

describe("Tests de SecureBorrowing", function () { // Changed from SecureBorrowingLedgerV6
  // Ya no necesitas definir createTestItem, prepareEIP712Params, signBorrow, verifyEvent, ni deployContractFixture aquí

  // ======= TESTS =======
  describe("listItem", function () {
    it("Should allow an owner to list a new item", async function () {
      // Usa la fixture importada
      const { owner, secureBorrowingContract } = await loadFixture(deployTestContractsFixture);
      
      const { itemId, fee, deposit, metadataHash, minBorrowerReputation } = 
        await createTestItem(secureBorrowingContract, { /* opciones si es necesario */ }); // createTestItem ahora es global

      const itemInfo = await secureBorrowingContract.read.items([itemId]);

      expect(itemInfo[0].toLowerCase()).to.equal(owner.account.address.toLowerCase());
      expect(itemInfo[1]).to.equal(0n); // nonce
      expect(itemInfo[2]).to.equal(fee); // fee
      expect(itemInfo[3]).to.equal(deposit); // deposit
      expect(itemInfo[4]).to.equal(metadataHash); // metadataHash
      expect(itemInfo[5]).to.be.true; // isAvailable
      expect(itemInfo[6]).to.equal(minBorrowerReputation); // minBorrowerReputation
    });

    it("Should allow an owner to update an existing item", async function () {
      const { owner, secureBorrowingContract, publicClient } = await loadFixture(deployTestContractsFixture);

      const { itemId } = await createTestItem(secureBorrowingContract, {
        itemId: stringToHex("item2", { size: 32 }),
        metadataHash: stringToHex("metadata_initial", { size: 32 }),
        minBorrowerReputation: 0n
      });

      const updatedFee = parseEther("0.2");
      const updatedDeposit = parseEther("0.6");
      const updatedMetadataHash = stringToHex("metadata_updated", { size: 32 });
      const updatedMinBorrowerReputation = 10n;

      const hash = await secureBorrowingContract.write.updateItem([
        itemId, updatedFee, updatedDeposit, updatedMetadataHash, updatedMinBorrowerReputation
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      await verifyEvent(publicClient, receipt, 'ItemUpdated(bytes32,address,uint256,uint256,int256)');
      
      const itemInfo = await secureBorrowingContract.read.items([itemId]);
      expect(itemInfo[2]).to.equal(updatedFee);
      expect(itemInfo[3]).to.equal(updatedDeposit);
      expect(itemInfo[4]).to.equal(updatedMetadataHash);
      expect(itemInfo[6]).to.equal(updatedMinBorrowerReputation);
    });

    it("Should not allow non-owner to update an item", async function () {
      const { secureBorrowingContract, getSecureBorrowingAs, otraCuenta } = await loadFixture(deployTestContractsFixture);

      const { itemId } = await createTestItem(secureBorrowingContract, {
        itemId: stringToHex("item3", { size: 32 })
      });
      
      const contractAsOtraCuenta = await getSecureBorrowingAs(otraCuenta);

      await expect(
        contractAsOtraCuenta.write.updateItem([
          itemId,
          parseEther("0.2"),
          parseEther("0.6"),
          stringToHex("metadata_other", { size: 32 }),
          0n 
        ])
      ).to.be.rejectedWith("No autorizado o item no existe");
    });
  });

  describe("borrowItem", function () {
    it("Should allow a user to borrow an available item with a valid signature", async function() {
      const { owner, otraCuenta, secureBorrowingContract, publicClient, getSecureBorrowingAs } = 
        await loadFixture(deployTestContractsFixture);
      
      const { itemId, fee, deposit } = await createTestItem(secureBorrowingContract, {
        itemId: stringToHex("itemToBorrow", { size: 32 }),
        minBorrowerReputation: -5n // Permitir con reputación negativa baja
      });
  
      const itemInfo = await secureBorrowingContract.read.items([itemId]);
      const nonce = itemInfo[1];
  
      const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient);
      const signature = await signBorrow(
        owner, eip712Params, itemId, fee, deposit, nonce, otraCuenta.account.address
      );
  
      const contractAsOtraCuenta = await getSecureBorrowingAs(otraCuenta);
      const borrowValue = fee + deposit;
      
      await contractAsOtraCuenta.write.borrowItem(
        [itemId, fee, deposit, signature], { value: borrowValue }
      );
  
      const updatedItemInfo = await secureBorrowingContract.read.items([itemId]);
      expect(updatedItemInfo[5]).to.be.false; // isAvailable
      expect(updatedItemInfo[1]).to.equal(nonce + 1n); // nonce incrementado
  
      const transactionCount = await secureBorrowingContract.read.transactionCount();
      const transaction = await secureBorrowingContract.read.transactions([transactionCount - 1n]);
      expect(transaction[0].toLowerCase()).to.equal(otraCuenta.account.address.toLowerCase()); // borrower
      expect(transaction[1]).to.equal(itemId); // itemId
      expect(transaction[2]).to.equal(fee); // feePaid
      expect(transaction[3]).to.equal(deposit); // depositPaid
      expect(transaction[5]).to.be.false; // isConcluded
    });

    it("Should reject borrowItem if borrower reputation is insufficient", async function() {
      const { owner, otraCuenta, secureBorrowingContract, publicClient, getSecureBorrowingAs } = 
        await loadFixture(deployTestContractsFixture);
      
      const { itemId, fee, deposit } = await createTestItem(secureBorrowingContract, {
        itemId: stringToHex("itemRepTest", { size: 32 }),
        minBorrowerReputation: 10n // Requiere reputación positiva
      });
      
      const itemInfo = await secureBorrowingContract.read.items([itemId]);
      const nonce = itemInfo[1];
      
      const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient);
      const signature = await signBorrow(
        owner, eip712Params, itemId, fee, deposit, nonce, otraCuenta.account.address
      );
      
      const contractAsOtraCuenta = await getSecureBorrowingAs(otraCuenta);
      await expect(
        contractAsOtraCuenta.write.borrowItem(
          [itemId, fee, deposit, signature], { value: fee + deposit }
        )
      ).to.be.rejectedWith("Reputacion insuficiente");
    });
  
    it("Should reject when signature is invalid", async function() {
      const { owner, otraCuenta, secureBorrowingContract, publicClient, getSecureBorrowingAs } = 
        await loadFixture(deployTestContractsFixture);
      const { itemId, fee, deposit } = await createTestItem(secureBorrowingContract);
      const itemInfo = await secureBorrowingContract.read.items([itemId]);
      const nonce = itemInfo[1];
      const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient);
      const invalidSignature = await signBorrow(
        owner, eip712Params, itemId, parseEther("0.01"), deposit, nonce, otraCuenta.account.address // Fee incorrecto en firma
      );
      const contractAsOtraCuenta = await getSecureBorrowingAs(otraCuenta);
      await expect(
        contractAsOtraCuenta.write.borrowItem(
          [itemId, fee, deposit, invalidSignature], { value: fee + deposit }
        )
      ).to.be.rejectedWith("Firma invalida");
    });
    
    it("Should reject when sent value doesn't match fee + deposit", async function() {
      const { owner, otraCuenta, secureBorrowingContract, publicClient, getSecureBorrowingAs } = 
        await loadFixture(deployTestContractsFixture);
      const { itemId, fee, deposit } = await createTestItem(secureBorrowingContract);
      const itemInfo = await secureBorrowingContract.read.items([itemId]);
      const nonce = itemInfo[1];
      const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient);
      const signature = await signBorrow(
        owner, eip712Params, itemId, fee, deposit, nonce, otraCuenta.account.address
      );
      const contractAsOtraCuenta = await getSecureBorrowingAs(otraCuenta);
      await expect(
        contractAsOtraCuenta.write.borrowItem(
          [itemId, fee, deposit, signature], { value: fee + deposit - 1n }
        )
      ).to.be.rejectedWith("Pago debe ser exacto");
    });
  });

  describe("DOMAIN_SEPARATOR", function() {
    it("Should calculate domain separator correctly", async function() {
      const { secureBorrowingContract, publicClient } = await loadFixture(deployTestContractsFixture);
      
      const contractDomainSeparator = await secureBorrowingContract.read.DOMAIN_SEPARATOR();
      
      const domainSeparatorTypeHash = keccak256(toHex(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
      ));
      
      const name = keccak256(toHex("SecureBorrowing_1.1")); // CHANGED
      const version = keccak256(toHex("1.1"));
      const chainId = await publicClient.getChainId();
      const verifyingContract = secureBorrowingContract.address;
      
      const encodedData = encodeAbiParameters([
        { name: 'typeHash', type: 'bytes32' }, { name: 'name', type: 'bytes32' },
        { name: 'version', type: 'bytes32' }, { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ], [ domainSeparatorTypeHash, name, version, chainId, verifyingContract ]);
      
      const calculatedDomainSeparator = keccak256(encodedData);
      expect(calculatedDomainSeparator).to.equal(contractDomainSeparator);
    });
  });

  describe("settleTransaction", function() {
    it("Should settle a transaction amicably (full deposit refund) when no damage reported", async function() {
      const { owner, otraCuenta, secureBorrowingContract, publicClient, getSecureBorrowingAs } = 
        await loadFixture(deployTestContractsFixture);
      
      const { itemId, fee, deposit } = await createTestItem(secureBorrowingContract);
      const itemInfoInitial = await secureBorrowingContract.read.items([itemId]);
      const nonceInitial = itemInfoInitial[1];
      
      const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient);
      const signature = await signBorrow(
        owner, eip712Params, itemId, fee, deposit, nonceInitial, otraCuenta.account.address
      );
      
      const contractAsBorrower = await getSecureBorrowingAs(otraCuenta);
      // El prestatario toma el ítem
      await contractAsBorrower.write.borrowItem(
        [itemId, fee, deposit, signature], { value: fee + deposit }
      );
      
      const transactionId = (await secureBorrowingContract.read.transactionCount()) - 1n;

      // El prestatario (o el dueño) liquida la transacción amigablemente
      // (reportDamageByOwnerAction = false)
      const reportDamage = false; 
      // La liquidación puede ser hecha por el prestatario o el dueño.
      // Para este caso, usemos al prestatario.
      const hash = await contractAsBorrower.write.settleTransaction([
        transactionId, reportDamage
      ]);
      
      // Obtener el recibo de la transacción de liquidación
      const receipt = await publicClient.waitForTransactionReceipt({ hash }); // ESTA LÍNEA ES CLAVE
      
      // Ahora puedes verificar el evento
      const eventLog = await verifyEvent(
        publicClient, receipt, 'TransactionSettledAmicably(uint256,uint256,uint256)'
      );
      
      const decodedLog = decodeEventLog({
        abi: SecureBorrowingABI.abi, data: eventLog.data, topics: eventLog.topics
      });
      
      expect(decodedLog.args.transactionId).to.equal(transactionId);
      expect(decodedLog.args.refundToBorrower).to.equal(deposit); // Reembolso completo del depósito
      expect(decodedLog.args.paymentToOwner).to.equal(0n); // Sin pago al dueño por daños
      
      const updatedItemInfo = await secureBorrowingContract.read.items([itemId]);
      expect(updatedItemInfo[5]).to.be.true; // isAvailable
      
      const transaction = await secureBorrowingContract.read.transactions([transactionId]);
      expect(transaction[5]).to.be.true; // isConcluded
      expect(transaction[6]).to.be.false; // damageReported
      
      // Verificar reputaciones (asumiendo que empiezan en 0)
      const MAX_REP_FROM_CONTRACT = await secureBorrowingContract.read.MAX_REPUTATION();
      const MIN_REP_FROM_CONTRACT = await secureBorrowingContract.read.MIN_REPUTATION();

      let calculatedRepChange = 0n;
      if (fee > 0n) {
          const baseChange = fee / 100n;
          calculatedRepChange = baseChange === 0n ? 1n : baseChange;
      }
      
      let expectedFinalOwnerRep = 0n + calculatedRepChange;
      if (expectedFinalOwnerRep > MAX_REP_FROM_CONTRACT) {
          expectedFinalOwnerRep = MAX_REP_FROM_CONTRACT;
      } else if (expectedFinalOwnerRep < MIN_REP_FROM_CONTRACT) {
          expectedFinalOwnerRep = MIN_REP_FROM_CONTRACT;
      }

      let expectedFinalBorrowerRep = 0n + calculatedRepChange;
      if (expectedFinalBorrowerRep > MAX_REP_FROM_CONTRACT) {
          expectedFinalBorrowerRep = MAX_REP_FROM_CONTRACT;
      } else if (expectedFinalBorrowerRep < MIN_REP_FROM_CONTRACT) {
          expectedFinalBorrowerRep = MIN_REP_FROM_CONTRACT;
      }
      
      const ownerRep = await secureBorrowingContract.read.ownerReputation([owner.account.address]);
      const borrowerRep = await secureBorrowingContract.read.borrowerReputation([otraCuenta.account.address]);
      
      expect(ownerRep).to.equal(expectedFinalOwnerRep);
      expect(borrowerRep).to.equal(expectedFinalBorrowerRep);
    });

    it("Should handle damage report with deposit > 0 by sending to arbitration", async function() {
      const { owner, otraCuenta, secureBorrowingContract, arbitrationContract, publicClient, getSecureBorrowingAs } = 
        await loadFixture(deployTestContractsFixture);
      
      const { itemId, fee, deposit } = await createTestItem(secureBorrowingContract, { deposit: parseEther("1.0")});
      const itemInfo = await secureBorrowingContract.read.items([itemId]);
      const nonce = itemInfo[1];
      
      const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient);
      const signature = await signBorrow(
        owner, eip712Params, itemId, fee, deposit, nonce, otraCuenta.account.address
      );
      
      const contractAsOtraCuenta = await getSecureBorrowingAs(otraCuenta);
      await contractAsOtraCuenta.write.borrowItem(
        [itemId, fee, deposit, signature], { value: fee + deposit }
      );
      
      const transactionId = (await secureBorrowingContract.read.transactionCount()) - 1n;
      const initialArbitrationBalance = await publicClient.getBalance({ address: arbitrationContract.address });
      const initialActiveDisputeCount = await secureBorrowingContract.read.activeDisputeCount(); // Read BEFORE the transaction

      const reportDamageByOwnerAction = true;
      const contractAsOwner = await getSecureBorrowingAs(owner);
      const hash = await contractAsOwner.write.settleTransaction([
        transactionId, reportDamageByOwnerAction
      ]);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const eventLog = await verifyEvent(
        publicClient, receipt, 'DisputeSentToArbitration(uint256,address,address,uint256,uint256)'
      );
      
      const decodedLog = decodeEventLog({
        abi: SecureBorrowingABI.abi, data: eventLog.data, topics: eventLog.topics
      });
      
      const incentivePercentage = await arbitrationContract.read.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
      const expectedIncentivePool = (deposit * incentivePercentage) / 100n;

      expect(decodedLog.args.transactionId).to.equal(transactionId);
      expect(decodedLog.args.itemOwner.toLowerCase()).to.equal(owner.account.address.toLowerCase());
      expect(decodedLog.args.borrower.toLowerCase()).to.equal(otraCuenta.account.address.toLowerCase());
      expect(decodedLog.args.depositAtStake).to.equal(deposit);
      expect(decodedLog.args.incentiveSent).to.equal(expectedIncentivePool);
      
      const finalArbitrationBalance = await publicClient.getBalance({ address: arbitrationContract.address });
      expect(finalArbitrationBalance).to.equal(initialArbitrationBalance + expectedIncentivePool);
      
      const transaction = await secureBorrowingContract.read.transactions([transactionId]);
      expect(transaction[5]).to.be.true;  // isConcluded
      expect(transaction[6]).to.be.true;  // damageReported

      const finalActiveDisputeCount = await secureBorrowingContract.read.activeDisputeCount(); // Read AFTER
      expect(finalActiveDisputeCount).to.equal(initialActiveDisputeCount + 1n); 
    });

    it("Should handle damage report with deposit = 0 by updating reputations directly", async function() {
      const { owner, otraCuenta, secureBorrowingContract, publicClient, getSecureBorrowingAs } = 
        await loadFixture(deployTestContractsFixture);
      
      const { itemId, fee } = await createTestItem(secureBorrowingContract, { deposit: 0n });
      const deposit = 0n; 
      
      const itemInfo = await secureBorrowingContract.read.items([itemId]);
      const nonce = itemInfo[1];
      
      const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient);
      const signature = await signBorrow(
        owner, eip712Params, itemId, fee, deposit, nonce, otraCuenta.account.address
      );
      
      const contractAsOtraCuenta = await getSecureBorrowingAs(otraCuenta);
      await contractAsOtraCuenta.write.borrowItem(
        [itemId, fee, deposit, signature], { value: fee + deposit }
      );
      
      const transactionId = (await secureBorrowingContract.read.transactionCount()) - 1n;
      const initialActiveDisputeCount = await secureBorrowingContract.read.activeDisputeCount();

      const reportDamageByOwnerAction = true;
      const contractAsOwner = await getSecureBorrowingAs(owner);
      const hash = await contractAsOwner.write.settleTransaction([
        transactionId, reportDamageByOwnerAction
      ]);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const eventLog = await verifyEvent(
        publicClient, receipt, 'DamageReportedNoArbitration(uint256,address,address,int256,int256)'
      );
      
      const decodedLog = decodeEventLog({
        abi: SecureBorrowingABI.abi, data: eventLog.data, topics: eventLog.topics
      });
      
      expect(decodedLog.args.transactionId).to.equal(transactionId);
      expect(decodedLog.args.itemOwner.toLowerCase()).to.equal(owner.account.address.toLowerCase());
      expect(decodedLog.args.borrower.toLowerCase()).to.equal(otraCuenta.account.address.toLowerCase());
      expect(decodedLog.args.ownerReputationChange).to.equal(1n);
      expect(decodedLog.args.borrowerReputationChange).to.equal(-2n);
      
      const ownerRep = await secureBorrowingContract.read.ownerReputation([owner.account.address]);
      const borrowerRep = await secureBorrowingContract.read.borrowerReputation([otraCuenta.account.address]);
      expect(ownerRep).to.equal(1n); 
      expect(borrowerRep).to.equal(-2n); 
      
      const transaction = await secureBorrowingContract.read.transactions([transactionId]);
      expect(transaction[5]).to.be.true;  // isConcluded
      expect(transaction[6]).to.be.true;  // damageReported

      const finalActiveDisputeCount = await secureBorrowingContract.read.activeDisputeCount();
      expect(finalActiveDisputeCount).to.equal(initialActiveDisputeCount); // No debe incrementar
    });
    
    it("Should only allow owner or borrower to settle transaction", async function() {
      const { owner, otraCuenta, secureBorrowingContract, publicClient, getSecureBorrowingAs } = 
        await loadFixture(deployTestContractsFixture);
      
      const { itemId, fee, deposit } = await createTestItem(secureBorrowingContract);
      const itemInfo = await secureBorrowingContract.read.items([itemId]);
      const nonce = itemInfo[1];
      
      const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient);
      const signature = await signBorrow(
        owner, eip712Params, itemId, fee, deposit, nonce, otraCuenta.account.address
      );
      
      const contractAsOtraCuenta = await getSecureBorrowingAs(otraCuenta);
      await contractAsOtraCuenta.write.borrowItem(
        [itemId, fee, deposit, signature], { value: fee + deposit }
      );
      
      const transactionId = (await secureBorrowingContract.read.transactionCount()) - 1n;
      
      const [,,,thirdAccountClient] = await hre.viem.getWalletClients({count:4});
      const contractAsThirdAccount = await getSecureBorrowingAs(thirdAccountClient);
      
      await expect(
        contractAsThirdAccount.write.settleTransaction([transactionId, false])
      ).to.be.rejectedWith("No autorizado para esta accion");
    });
  });
});
