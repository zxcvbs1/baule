import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import {
    getAddress,
    parseEther,
    formatEther,
    keccak256,
    toHex,
    zeroAddress,
    decodeEventLog,
    type Hex,
    type AbiEvent,
    encodeEventTopics,
    type PublicClient,
    type WalletClient,
    type GetContractReturnType,
} from "viem";

// Constants from contracts
const ARBITRATION_INCENTIVE_PERCENTAGE = 10n; // INCENTIVE_PERCENTAGE_OF_DEPOSIT in Arbitration.sol
const FINALIZER_FEE_PERCENTAGE = 5n; // FINALIZER_FEE_FROM_POOL in Arbitration.sol
// const MIN_REPUTATION_CONTRACT = -10000n; // Not directly used in these tests but good for context
// const MAX_REPUTATION_CONTRACT = 10000n;  // Not directly used in these tests but good for context

// Define types for contracts for better type safety
// You should import the actual ABIs from your project's artifacts
// For example:
// import SecureBorrowingArtifact from "../artifacts/contracts/SecureBorrowing.sol/SecureBorrowing.json";
// import ArbitrationArtifact from "../artifacts/contracts/Arbitration.sol/Arbitration.json";
// const SecureBorrowingContractAbi = SecureBorrowingArtifact.abi;
// const ArbitrationContractAbi = ArbitrationArtifact.abi;

// Using 'any' for ABI as a placeholder if actual ABIs are not set up for import here.
// It's strongly recommended to use the actual ABIs for type safety.
const SecureBorrowingContractAbi: any = []; // Placeholder ABI
const ArbitrationContractAbi: any = [];   // Placeholder ABI


type SecureBorrowingContractType = GetContractReturnType<typeof SecureBorrowingContractAbi>;
type ArbitrationContractType = GetContractReturnType<typeof ArbitrationContractAbi>;

describe("SecureBorrowing and Arbitration Integration Tests", function () {
    // BASE FIXTURE FOR DEPLOYING CONTRACTS
    async function deployContractsFixture() {
        const [deployer, owner, borrower, arbitrator1, arbitrator2, arbitrator3, finalizerAccount, otherAccount, ...restAccounts] = await hre.viem.getWalletClients();

        const arbitrationContract = await hre.viem.deployContract("Arbitration", [deployer.account.address, deployer.account.address]) as ArbitrationContractType;
        const secureBorrowingContract = await hre.viem.deployContract("SecureBorrowing", [deployer.account.address, arbitrationContract.address]) as SecureBorrowingContractType;

        // Make sure to set the ABIs on the contract instances if not inferred correctly
        // This might be needed if you used placeholder ABIs above
        // @ts-ignore
        if (!secureBorrowingContract.abi || secureBorrowingContract.abi.length === 0) secureBorrowingContract.abi = (await hre.artifacts.readArtifact("SecureBorrowing")).abi;
        // @ts-ignore
        if (!arbitrationContract.abi || arbitrationContract.abi.length === 0) arbitrationContract.abi = (await hre.artifacts.readArtifact("Arbitration")).abi;


        await arbitrationContract.write.updateSecureBorrowing([secureBorrowingContract.address], { account: deployer.account });

        const publicClient = await hre.viem.getPublicClient();

        return {
            secureBorrowingContract,
            arbitrationContract,
            deployer,
            owner,
            borrower,
            arbitrator1,
            arbitrator2,
            arbitrator3,
            finalizerAccount,
            otherAccount,
            restAccounts, // Para tomar más cuentas únicas si es necesario
            publicClient
        };
    }

    // HELPER: CREATE AND BORROW ITEM
    async function createAndBorrowItem(
        secureBorrowingContract: SecureBorrowingContractType,
        owner: WalletClient,
        borrower: WalletClient,
        publicClient: PublicClient,
        itemConfig: { idSuffix: string, fee: bigint, deposit: bigint, metadataSuffix: string, minReputation?: bigint }
    ) {
        const itemId = keccak256(toHex(`testItem_${itemConfig.idSuffix}_${Date.now()}_${Math.random()}`)); // Ensure unique ID
        const metadataHash = keccak256(toHex(`itemMetadata_${itemConfig.metadataSuffix}_${Date.now()}_${Math.random()}`));
        const minBorrowerReputation = itemConfig.minReputation ?? 0n;

        await secureBorrowingContract.write.listItem(
            [itemId, itemConfig.fee, itemConfig.deposit, metadataHash, minBorrowerReputation],
            { account: owner.account }
        );

        const itemInfoBeforeBorrow = await secureBorrowingContract.read.items([itemId]);
        const nonce = itemInfoBeforeBorrow[1];

        const borrowMessage = {
            itemId: itemId,
            fee: itemConfig.fee,
            deposit: itemConfig.deposit,
            nonce: nonce,
            borrower: borrower.account.address,
        };

        const domain = {
            name: "SecureBorrowing_1.1",
            version: "1.1",
            chainId: BigInt(await publicClient.getChainId()),
            verifyingContract: secureBorrowingContract.address,
        } as const;

        const types = {
            Borrow: [
                { name: "itemId", type: "bytes32" },
                { name: "fee", type: "uint256" },
                { name: "deposit", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "borrower", type: "address" },
            ],
        } as const;

        const ownerSignature = await owner.signTypedData({
            domain,
            types,
            primaryType: "Borrow",
            message: borrowMessage,
        });

        const borrowTxValue = itemConfig.fee + itemConfig.deposit;
        const borrowTxHash = await secureBorrowingContract.write.borrowItem(
            [itemId, itemConfig.fee, itemConfig.deposit, ownerSignature],
            { account: borrower.account, value: borrowTxValue }
        );
        const receiptBorrow = await publicClient.waitForTransactionReceipt({ hash: borrowTxHash });

        const txCreatedEventAbi = secureBorrowingContract.abi.find(e => e.type === "event" && e.name === "TransactionCreated") as AbiEvent;
        let transactionId: bigint | undefined;
        for (const log of receiptBorrow.logs) {
            if (log.address.toLowerCase() === secureBorrowingContract.address.toLowerCase() &&
                txCreatedEventAbi && log.topics[0]?.toLowerCase() === encodeEventTopics({ abi: [txCreatedEventAbi], eventName: 'TransactionCreated' })[0]?.toLowerCase()) {
                try {
                    const decoded = decodeEventLog({ abi: [txCreatedEventAbi], data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
                    if (decoded.eventName === "TransactionCreated") {
                        transactionId = (decoded.args as any).transactionId;
                        if ((decoded.args as any).borrower.toLowerCase() === borrower.account.address.toLowerCase()) break;
                    }
                } catch (e) { /* ignore decoding errors for other events */ }
            }
        }
        expect(transactionId, `Transaction ID not found for item ${itemConfig.idSuffix}`).to.not.be.undefined;

        return { transactionId: transactionId!, itemId, itemDeposit: itemConfig.deposit };
    }

    // FIXTURE FOR DISPUTED TRANSACTIONS (Test Cases 1 & 2)
    async function setupDisputedTransactionContext() {
        const baseContext = await loadFixture(deployContractsFixture);
        const { deployer, owner, borrower, arbitrator1, arbitrator2, arbitrator3, arbitrationContract, secureBorrowingContract, publicClient, finalizerAccount } = baseContext;

        const arbitrators = [arbitrator1.account.address, arbitrator2.account.address, arbitrator3.account.address] as const;
        await arbitrationContract.write.setArbitratorsPanel([arbitrators], { account: deployer.account });

        const itemConfig = { idSuffix: "dispute", fee: parseEther("0.05"), deposit: parseEther("1"), metadataSuffix: "dispute" };
        const { transactionId, itemDeposit } = await createAndBorrowItem(secureBorrowingContract, owner, borrower, publicClient, itemConfig);

        const expectedIncentivePool = (itemDeposit * ARBITRATION_INCENTIVE_PERCENTAGE) / 100n;
        if (expectedIncentivePool > 0n) {
             await deployer.sendTransaction({ to: secureBorrowingContract.address, value: expectedIncentivePool, account: deployer.account });
        }

        await secureBorrowingContract.write.settleTransaction([transactionId, true], { account: owner.account });
        
        const arbitrationBalanceAfterDisputeOpen = await publicClient.getBalance({ address: arbitrationContract.address });
        expect(arbitrationBalanceAfterDisputeOpen).to.equal(expectedIncentivePool);

        return { ...baseContext, transactionId, itemDeposit, finalizerAccountToUse: finalizerAccount };
    }

    // FIXTURE FOR ZERO DEPOSIT DISPUTE (Test Case 3 - ISOLATED)
    async function setupZeroDepositDisputedTransactionContext() {
        const accounts = await hre.viem.getWalletClients();
        // Ensure enough unique accounts. Slice from a higher index if default accounts are used elsewhere.
        const uniqueAccounts = accounts.slice(10, 18); 
        if (uniqueAccounts.length < 8) throw new Error("Not enough unique accounts for zero deposit test. Need at least 8.");

        const [deployerZero, ownerZero, borrowerZero, arbitrator1Zero, arbitrator2Zero, arbitrator3Zero, finalizerZero, otherZero] = uniqueAccounts;

        const arbitrationContract = await hre.viem.deployContract("Arbitration", [deployerZero.account.address, deployerZero.account.address]) as ArbitrationContractType;
        const secureBorrowingContract = await hre.viem.deployContract("SecureBorrowing", [deployerZero.account.address, arbitrationContract.address]) as SecureBorrowingContractType;
        
        // @ts-ignore
        if (!secureBorrowingContract.abi || secureBorrowingContract.abi.length === 0) secureBorrowingContract.abi = (await hre.artifacts.readArtifact("SecureBorrowing")).abi;
        // @ts-ignore
        if (!arbitrationContract.abi || arbitrationContract.abi.length === 0) arbitrationContract.abi = (await hre.artifacts.readArtifact("Arbitration")).abi;

        await arbitrationContract.write.updateSecureBorrowing([secureBorrowingContract.address], { account: deployerZero.account });
        const publicClient = await hre.viem.getPublicClient();

        const arbitrators = [arbitrator1Zero.account.address, arbitrator2Zero.account.address, arbitrator3Zero.account.address] as const;
        await arbitrationContract.write.setArbitratorsPanel([arbitrators], { account: deployerZero.account });

        const itemConfig = { idSuffix: "zero_deposit_unique", fee: parseEther("0.05"), deposit: 0n, metadataSuffix: "zero_deposit_unique" };
        const { transactionId, itemDeposit } = await createAndBorrowItem(secureBorrowingContract, ownerZero, borrowerZero, publicClient, itemConfig);
        
        return {
            deployer: deployerZero, owner: ownerZero, borrower: borrowerZero,
            arbitrator1: arbitrator1Zero, arbitrator2: arbitrator2Zero, arbitrator3: arbitrator3Zero,
            finalizerAccountToUse: finalizerZero, otherAccount: otherZero,
            arbitrationContract, secureBorrowingContract, publicClient,
            transactionId, itemDeposit
        };
    }

    // FIXTURE FOR NORMAL RETURN (Test Case 4 - ISOLATED)
    async function setupNormalTransactionContextWithUniqueAccounts() {
        const accounts = await hre.viem.getWalletClients();
        const uniqueAccounts = accounts.slice(10, 18); // Adjust if more needed or for parallel runs
        if (uniqueAccounts.length < 8) throw new Error("Not enough unique accounts for normal transaction test. Need at least 8 for all roles.");

        const [deployer, owner, borrower, arbitrator1, arbitrator2, arbitrator3, finalizerAccount, otherAccount] = uniqueAccounts;

        const arbitrationContract = await hre.viem.deployContract("Arbitration", [deployer.account.address, deployer.account.address]) as ArbitrationContractType;
        const secureBorrowingContract = await hre.viem.deployContract("SecureBorrowing", [deployer.account.address, arbitrationContract.address]) as SecureBorrowingContractType;

        // @ts-ignore
        if (!secureBorrowingContract.abi || secureBorrowingContract.abi.length === 0) secureBorrowingContract.abi = (await hre.artifacts.readArtifact("SecureBorrowing")).abi;
        // @ts-ignore
        if (!arbitrationContract.abi || arbitrationContract.abi.length === 0) arbitrationContract.abi = (await hre.artifacts.readArtifact("Arbitration")).abi;

        await arbitrationContract.write.updateSecureBorrowing([secureBorrowingContract.address], { account: deployer.account });
        const publicClient = await hre.viem.getPublicClient();
        
        const itemConfig = { idSuffix: "normal_return_unique", fee: parseEther("0.1"), deposit: parseEther("0.5"), metadataSuffix: "normal_unique" };
        const { transactionId, itemId, itemDeposit } = await createAndBorrowItem(secureBorrowingContract, owner, borrower, publicClient, itemConfig);

        return {
            deployer, owner, borrower,
            arbitrator1, arbitrator2, arbitrator3, // For consistency if helpers need them
            finalizerAccountToUse: finalizerAccount, otherAccount, // For consistency
            arbitrationContract, secureBorrowingContract, publicClient,
            transactionId, itemId, itemDeposit
        };
    }

    // GENERAL HELPER FUNCTIONS
    async function getEventFromTx(publicClient: PublicClient, contracts: (ArbitrationContractType | SecureBorrowingContractType)[], txHash: Hex, logToConsole: boolean = true) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (logToConsole) console.log("Transaction logs for tx:", txHash, receipt.logs.length > 0 ? "" : "(No logs found)");
        
        const allAbis: AbiEvent[] = [];
        for (const contract of contracts) {
            if (contract.abi) {
                allAbis.push(...contract.abi.filter(item => item.type === 'event') as AbiEvent[]);
            }
        }
        if (allAbis.length === 0 && logToConsole) {
            console.warn("No ABIs found for event decoding in getEventFromTx for contracts:", contracts.map(c => c.address));
        }
        
        for (const log of receipt.logs) {
            try {
                const decoded = decodeEventLog({
                    abi: allAbis, 
                    data: log.data as Hex,
                    topics: log.topics as [Hex, ...Hex[]]
                });
                if (logToConsole) console.log("Decoded event:", decoded.eventName, decoded.args);
            } catch (e) {
                // if (logToConsole) console.log("Could not decode log (may be from a different contract or non-event):", log);
            }
        }
    }

    async function setupArbitratorVotes(params: {
        arbitrationContract: ArbitrationContractType,
        arbitrators: WalletClient[],
        transactionId: bigint,
        voteForOwner: boolean,
        severity: number
    }) {
        const { arbitrationContract, arbitrators, transactionId, voteForOwner, severity } = params;
        console.log(`\n=== VOTACIÓN DE ÁRBITROS (TxId: ${transactionId}) ===`);
        for (let i = 0; i < arbitrators.length; i++) {
            await arbitrationContract.write.castArbitratorVote(
                [transactionId, voteForOwner, severity],
                { account: arbitrators[i].account }
            );
            console.log(`✓ Árbitro ${i + 1} (${arbitrators[i].account.address.substring(0,6)}...) votó: ${severity}% ${voteForOwner ? 'a favor del dueño' : 'a favor del prestatario'}`);
        }
    }

    async function captureBalances(params: {
        publicClient: PublicClient,
        owner: WalletClient,
        borrower: WalletClient,
        secureBorrowingContract: SecureBorrowingContractType,
        itemDepositForLog?: bigint
    }) {
        const { publicClient, owner, borrower, secureBorrowingContract, itemDepositForLog } = params;
        const ownerBalance = await publicClient.getBalance({ address: owner.account.address });
        const borrowerBalance = await publicClient.getBalance({ address: borrower.account.address });
        const contractBalance = await publicClient.getBalance({ address: secureBorrowingContract.address });
        console.log(`\n--- Balances Capturados ---`);
        console.log(`Owner Balance: ${formatEther(ownerBalance)} ETH`);
        console.log(`Borrower Balance: ${formatEther(borrowerBalance)} ETH`);
        console.log(`SecureBorrowing Contract Balance: ${formatEther(contractBalance)} ETH`);
        if (itemDepositForLog !== undefined) console.log(`(Item Deposit para referencia: ${formatEther(itemDepositForLog)} ETH)`);
        return { ownerBalance, borrowerBalance, contractBalance };
    }

    async function finalizeDisputeAndCaptureEvents(params: {
        arbitrationContract: ArbitrationContractType,
        secureBorrowingContract: SecureBorrowingContractType,
        transactionId: bigint,
        finalizer: WalletClient,
        publicClient: PublicClient
    }) {
        const { arbitrationContract, secureBorrowingContract, transactionId, finalizer, publicClient } = params;
        console.log("\n=== FINALIZANDO DISPUTA ===");
        const finalizeTxHash = await arbitrationContract.write.finalizeDispute([transactionId], { account: finalizer.account });
        console.log(`✓ Disputa finalizada (Tx: ${finalizeTxHash})`);
        await getEventFromTx(publicClient, [arbitrationContract, secureBorrowingContract], finalizeTxHash);
        return finalizeTxHash;
    }

    async function verifyReputationChanges(params: {
        secureBorrowingContract: SecureBorrowingContractType,
        owner: WalletClient,
        borrower: WalletClient,
        initialOwnerRep: bigint,
        initialBorrowerRep: bigint,
        expectedOwnerRepChange: bigint,
        expectedBorrowerRepChange: bigint
    }) {
        const { secureBorrowingContract, owner, borrower, initialOwnerRep, initialBorrowerRep, expectedOwnerRepChange, expectedBorrowerRepChange } = params;
        const finalOwnerRep = await secureBorrowingContract.read.ownerReputation([owner.account.address]);
        const finalBorrowerRep = await secureBorrowingContract.read.borrowerReputation([borrower.account.address]);
        const actualOwnerRepChange = finalOwnerRep - initialOwnerRep;
        const actualBorrowerRepChange = finalBorrowerRep - initialBorrowerRep;
        console.log(`\n=== RESULTADOS REPUTACIÓN ===`);
        console.log(`Final Owner Reputation: ${finalOwnerRep} (Actual Cambio: ${actualOwnerRepChange}, Esperado: ${expectedOwnerRepChange})`);
        console.log(`Final Borrower Reputation: ${finalBorrowerRep} (Actual Cambio: ${actualBorrowerRepChange}, Esperado: ${expectedBorrowerRepChange})`);
        expect(actualOwnerRepChange).to.equal(expectedOwnerRepChange, "Owner reputation change mismatch");
        expect(actualBorrowerRepChange).to.equal(expectedBorrowerRepChange, "Borrower reputation change mismatch");
        return { finalOwnerRep, finalBorrowerRep };
    }

    async function verifyOwnerBalanceChanges(params: {
        publicClient: PublicClient, owner: WalletClient, initialOwnerBalance: bigint,
        expectedChange?: bigint, expectedPayoutCloseTo?: bigint, margin?: bigint
    }) {
        const { publicClient, owner, initialOwnerBalance, expectedChange, expectedPayoutCloseTo, margin } = params;
        const finalOwnerBalance = await publicClient.getBalance({ address: owner.account.address });
        const actualChange = finalOwnerBalance - initialOwnerBalance;
        console.log(`Owner Balance: Final ${formatEther(finalOwnerBalance)}, Initial ${formatEther(initialOwnerBalance)}, Actual Change ${formatEther(actualChange)}`);
        if (expectedChange !== undefined) {
            console.log(`Owner Expected Exact Change: ${formatEther(expectedChange)}`);
            expect(actualChange).to.equal(expectedChange, `Owner balance exact change mismatch. Expected ${formatEther(expectedChange)}, got ${formatEther(actualChange)}`);
        }
        if (expectedPayoutCloseTo !== undefined) {
            const actualMargin = margin ?? parseEther("0.01"); // Default margin for gas
            console.log(`Owner Expected CloseTo Change: ${formatEther(expectedPayoutCloseTo)} (Margin: ${formatEther(actualMargin)})`);
            expect(actualChange).to.be.closeTo(expectedPayoutCloseTo, actualMargin, `Owner balance closeTo change mismatch. Expected around ${formatEther(expectedPayoutCloseTo)}, got ${formatEther(actualChange)}`);
        }
    }

    async function verifyBorrowerBalanceChanges(params: {
        publicClient: PublicClient, borrower: WalletClient, initialBorrowerBalance: bigint,
        expectedChange?: bigint, expectedRefundCloseTo?: bigint, margin?: bigint
    }) {
        const { publicClient, borrower, initialBorrowerBalance, expectedChange, expectedRefundCloseTo, margin } = params;
        const finalBorrowerBalance = await publicClient.getBalance({ address: borrower.account.address });
        const actualChange = finalBorrowerBalance - initialBorrowerBalance;
        console.log(`Borrower Balance: Final ${formatEther(finalBorrowerBalance)}, Initial ${formatEther(initialBorrowerBalance)}, Actual Change ${formatEther(actualChange)}`);
        if (expectedChange !== undefined) {
            console.log(`Borrower Expected Exact Change: ${formatEther(expectedChange)}`);
            expect(actualChange).to.equal(expectedChange, `Borrower balance exact change mismatch. Expected ${formatEther(expectedChange)}, got ${formatEther(actualChange)}`);
        }
        if (expectedRefundCloseTo !== undefined) {
            const actualMargin = margin ?? parseEther("0.01"); // Default margin for gas
            console.log(`Borrower Expected CloseTo Refund: ${formatEther(expectedRefundCloseTo)} (Margin: ${formatEther(actualMargin)})`);
            expect(actualChange).to.be.closeTo(expectedRefundCloseTo, actualMargin, `Borrower balance closeTo refund mismatch. Expected around ${formatEther(expectedRefundCloseTo)}, got ${formatEther(actualChange)}`);
        }
    }

    // TEST SUITES
    describe("Test Case 1: Dueño gana con 100% severidad", function () {
        it("should correctly process dispute where owner wins with 100% severity", async function () {
            console.log("\n=== INICIANDO TEST: Owner wins with 100% severity ===");
            const context = await loadFixture(setupDisputedTransactionContext);
            const { secureBorrowingContract, arbitrationContract, owner, borrower, arbitrator1, arbitrator2, arbitrator3, finalizerAccountToUse, transactionId, itemDeposit, publicClient } = context;

            console.log(`Transaction ID: ${transactionId}`);
            console.log(`Item Deposit: ${itemDeposit} wei (${formatEther(itemDeposit)} ETH)`);
            const initialOwnerRep = await secureBorrowingContract.read.ownerReputation([owner.account.address]);
            const initialBorrowerRep = await secureBorrowingContract.read.borrowerReputation([borrower.account.address]);
            console.log(`Initial Owner Reputation: ${initialOwnerRep}, Initial Borrower Reputation: ${initialBorrowerRep}`);

            await setupArbitratorVotes({ arbitrationContract, arbitrators: [arbitrator1, arbitrator2, arbitrator3], transactionId, voteForOwner: true, severity: 100 });
            const { ownerBalance: initialOwnerBalance, borrowerBalance: initialBorrowerBalance } = await captureBalances({ publicClient, owner, borrower, secureBorrowingContract, itemDepositForLog: itemDeposit });
            await finalizeDisputeAndCaptureEvents({ arbitrationContract, secureBorrowingContract, transactionId, finalizer: finalizerAccountToUse, publicClient });

            await verifyReputationChanges({ secureBorrowingContract, owner, borrower, initialOwnerRep, initialBorrowerRep, expectedOwnerRepChange: 1n, expectedBorrowerRepChange: -2n });
            
            // CORREGIR CÁLCULO: En 100% de severidad, el dueño recibe TODO el pool disponible
            const amountForSecureBorrowingToDistribute = itemDeposit - (itemDeposit * ARBITRATION_INCENTIVE_PERCENTAGE / 100n);
            const expectedOwnerPayout = amountForSecureBorrowingToDistribute; // 100% del monto distribuible
            const expectedBorrowerRefund = 0n; // 0% del monto distribuible
            
            await verifyOwnerBalanceChanges({ publicClient, owner, initialOwnerBalance, expectedChange: expectedOwnerPayout });
            await verifyBorrowerBalanceChanges({ publicClient, borrower, initialBorrowerBalance, expectedChange: expectedBorrowerRefund });
        });
    });

    describe("Test Case 2: Dueño gana con 60% severidad", function () {
        it("should correctly process dispute where owner wins with 60% average severity", async function () {
            console.log("\n=== INICIANDO TEST: Owner wins with 60% severity ===");
            const context = await loadFixture(setupDisputedTransactionContext);
            const { secureBorrowingContract, arbitrationContract, owner, borrower, arbitrator1, arbitrator2, arbitrator3, finalizerAccountToUse, transactionId, itemDeposit, publicClient } = context;

            console.log(`Transaction ID: ${transactionId}`);
            console.log(`Item Deposit: ${itemDeposit} wei (${formatEther(itemDeposit)} ETH)`);
            const initialOwnerRep = await secureBorrowingContract.read.ownerReputation([owner.account.address]);
            const initialBorrowerRep = await secureBorrowingContract.read.borrowerReputation([borrower.account.address]);
            console.log(`Initial Owner Reputation: ${initialOwnerRep}, Initial Borrower Reputation: ${initialBorrowerRep}`);

            await setupArbitratorVotes({ arbitrationContract, arbitrators: [arbitrator1, arbitrator2, arbitrator3], transactionId, voteForOwner: true, severity: 60 });
            const { ownerBalance: initialOwnerBalance, borrowerBalance: initialBorrowerBalance } = await captureBalances({ publicClient, owner, borrower, secureBorrowingContract, itemDepositForLog: itemDeposit });
            await finalizeDisputeAndCaptureEvents({ arbitrationContract, secureBorrowingContract, transactionId, finalizer: finalizerAccountToUse, publicClient });

            await verifyReputationChanges({ secureBorrowingContract, owner, borrower, initialOwnerRep, initialBorrowerRep, expectedOwnerRepChange: 1n, expectedBorrowerRepChange: -2n });

            // CORREGIR CÁLCULO: Eliminar el cálculo erróneo del finalizerFee
            const amountForSecureBorrowingToDistribute = itemDeposit - (itemDeposit * ARBITRATION_INCENTIVE_PERCENTAGE / 100n);
            const expectedOwnerPayout = (amountForSecureBorrowingToDistribute * 60n) / 100n; // 60% del pool
            const expectedBorrowerRefund = (amountForSecureBorrowingToDistribute * 40n) / 100n; // 40% del pool

            await verifyOwnerBalanceChanges({ publicClient, owner, initialOwnerBalance, expectedChange: expectedOwnerPayout });
            await verifyBorrowerBalanceChanges({ publicClient, borrower, initialBorrowerBalance, expectedChange: expectedBorrowerRefund });
        });
    });

    describe("Test Case 3: Disputa con Depósito Cero", function () {
        it("should correctly process dispute with zero deposit, affecting only reputations", async function () {
            console.log("\n=== INICIANDO TEST: Disputa con Depósito Cero ===");
            const context = await loadFixture(setupZeroDepositDisputedTransactionContext);
            const { secureBorrowingContract, owner, borrower, transactionId, itemDeposit, publicClient } = context;

            expect(itemDeposit).to.equal(0n, "Item deposit for this test case must be zero");
            console.log(`Transaction ID: ${transactionId}, Item Deposit: ${formatEther(itemDeposit)} ETH`);
            const initialOwnerRep = await secureBorrowingContract.read.ownerReputation([owner.account.address]);
            const initialBorrowerRep = await secureBorrowingContract.read.borrowerReputation([borrower.account.address]);
            console.log(`Initial Owner Reputation: ${initialOwnerRep}, Initial Borrower Reputation: ${initialBorrowerRep}`);
            
            const { ownerBalance: initialOwnerBalance, borrowerBalance: initialBorrowerBalance } = await captureBalances({ publicClient, owner, borrower, secureBorrowingContract, itemDepositForLog: itemDeposit });

            console.log("\n=== REPORTANDO DAÑO (SIN DEPÓSITO) ===");
            const settleTxHash = await secureBorrowingContract.write.settleTransaction([transactionId, true], { account: owner.account });
            await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
            console.log("✓ Daño reportado - transacción resuelta internamente");
            await getEventFromTx(publicClient, [secureBorrowingContract], settleTxHash);

            const transaction = await secureBorrowingContract.read.transactions([transactionId]);
            expect(transaction[5]).to.equal(true, "Transaction should be marked as concluded (isConcluded)"); // isConcluded is index 5
            expect(transaction[6]).to.equal(true, "Transaction should be marked as damageReported"); // damageReported is index 6
            
            await verifyReputationChanges({ secureBorrowingContract, owner, borrower, initialOwnerRep, initialBorrowerRep, expectedOwnerRepChange: 1n, expectedBorrowerRepChange: -2n });
            
            // Balances should only change by gas costs
            await verifyOwnerBalanceChanges({ publicClient, owner, initialOwnerBalance, expectedPayoutCloseTo: 0n });
            await verifyBorrowerBalanceChanges({ publicClient, borrower, initialBorrowerBalance, expectedRefundCloseTo: 0n });
        });
    });

    describe("Test Case 4: Finalización Exitosa sin Disputa", function () {
        it("should properly complete a transaction without damages and return deposit", async function () {
            console.log("\n=== INICIANDO TEST: Finalización Exitosa sin Disputa ===");
            const context = await loadFixture(setupNormalTransactionContextWithUniqueAccounts);
            const { secureBorrowingContract, owner, borrower, transactionId, itemId, itemDeposit, publicClient } = context;

            console.log(`Transaction ID: ${transactionId}, Item ID: ${itemId}`);
            console.log(`Item Deposit: ${itemDeposit} wei (${formatEther(itemDeposit)} ETH)`);
            const initialOwnerRep = await secureBorrowingContract.read.ownerReputation([owner.account.address]);
            const initialBorrowerRep = await secureBorrowingContract.read.borrowerReputation([borrower.account.address]);
            console.log(`Initial Owner Reputation: ${initialOwnerRep}, Initial Borrower Reputation: ${initialBorrowerRep}`);
            
            const { ownerBalance: initialOwnerBalance, borrowerBalance: initialBorrowerBalance } = await captureBalances({ publicClient, owner, borrower, secureBorrowingContract, itemDepositForLog: itemDeposit });
            
            const itemBefore = await secureBorrowingContract.read.items([itemId]);
            expect(itemBefore[5]).to.equal(false, "Item should be unavailable while borrowed"); // isAvailable is index 5

            console.log("\n=== FINALIZANDO TRANSACCIÓN (SIN DAÑOS) ===");
            const settleTxHash = await secureBorrowingContract.write.settleTransaction([transactionId, false], { account: owner.account });
            await publicClient.waitForTransactionReceipt({ hash: settleTxHash });
            console.log("✓ Transacción finalizada exitosamente sin daños reportados");
            await getEventFromTx(publicClient, [secureBorrowingContract], settleTxHash);

            const itemAfter = await secureBorrowingContract.read.items([itemId]);
            expect(itemAfter[5]).to.equal(true, "Item should be available after return");
            const transaction = await secureBorrowingContract.read.transactions([transactionId]);
            expect(transaction[5]).to.equal(true, "Transaction should be marked as concluded (isConcluded)");
            expect(transaction[6]).to.equal(false, "Transaction should have damageReported as false");

            // IMPORTANT: Assuming contract gives +2 reputation on successful return. 
            // Adjust to 1n if your contract logic is +1 for owner and borrower.
            await verifyReputationChanges({ secureBorrowingContract, owner, borrower, initialOwnerRep, initialBorrowerRep, expectedOwnerRepChange: 2n, expectedBorrowerRepChange: 2n });
            
            await verifyOwnerBalanceChanges({ publicClient, owner, initialOwnerBalance, expectedPayoutCloseTo: 0n }); // Owner only pays gas
            await verifyBorrowerBalanceChanges({ publicClient, borrower, initialBorrowerBalance, expectedRefundCloseTo: itemDeposit });
        });
    });

    describe("Test Case 5: Disputa sin Votos", function () {
        it("should correctly handle dispute when no arbitrator votes are cast", async function () {
            console.log("\n=== INICIANDO TEST: Disputa sin Votos ===");
            // Usar el mismo contexto base de los otros tests de disputa
            const context = await loadFixture(setupDisputedTransactionContext);
            const { 
                secureBorrowingContract, arbitrationContract, owner, borrower, 
                finalizerAccountToUse, transactionId, itemDeposit, publicClient 
            } = context;

            console.log(`Transaction ID: ${transactionId}`);
            console.log(`Item Deposit: ${itemDeposit} wei (${formatEther(itemDeposit)} ETH)`);
            
            // Capturar reputaciones y balances iniciales
            const initialOwnerRep = await secureBorrowingContract.read.ownerReputation([owner.account.address]);
            const initialBorrowerRep = await secureBorrowingContract.read.borrowerReputation([borrower.account.address]);
            console.log(`Initial Owner Reputation: ${initialOwnerRep}, Initial Borrower Reputation: ${initialBorrowerRep}`);
            
            const { ownerBalance: initialOwnerBalance, borrowerBalance: initialBorrowerBalance } = await captureBalances({ 
                publicClient, owner, borrower, secureBorrowingContract, 
                itemDepositForLog: itemDeposit 
            });

            // Consultar periodo de votación actual
            const votingPeriod = await arbitrationContract.read.disputeVotingPeriod();
            console.log(`Current voting period: ${votingPeriod} seconds`);
            
            // Avanzar el tiempo para simular el fin del periodo de votación sin votos
            console.log("\n=== AVANZANDO EL TIEMPO PARA FINALIZAR PERIODO DE VOTACIÓN ===");
            const secondsToAdvance = Number(votingPeriod) + 60; // 60 segundos extra para asegurar
            
            // Avanzar el tiempo
            await hre.network.provider.send("evm_increaseTime", [secondsToAdvance]);
            await hre.network.provider.send("evm_mine");
            
            console.log(`Tiempo avanzado ${secondsToAdvance} segundos`);

            // Intentar finalizar la disputa sin votos 
            await finalizeDisputeAndCaptureEvents({ 
                arbitrationContract, secureBorrowingContract, 
                transactionId, finalizer: finalizerAccountToUse, publicClient 
            });
            
            // Según el código en Arbitration.sol líneas 211-223:
            // - Si no hay votos, ownerWonDisputeDecision = false
            // - penaltyPercentToOwner = 0 (borrower recibe 100% del depósito disponible)
            // - Se intentará devolver el pool de incentivos al borrower
            
            // Verificar cambios de reputación
            const expectedOwnerRepChange = -2n; // Dueño pierde la disputa
            const expectedBorrowerRepChange = 1n; // Borrower gana la disputa
            
            await verifyReputationChanges({ 
                secureBorrowingContract, owner, borrower, 
                initialOwnerRep, initialBorrowerRep,
                expectedOwnerRepChange, expectedBorrowerRepChange 
            });
            
            // Verificar distribución de fondos: 
            // - Borrower recibe todo el depósito menos el incentivo
            // - Owner no recibe nada
            const amountForDistribution = itemDeposit - (itemDeposit * ARBITRATION_INCENTIVE_PERCENTAGE / 100n);
            const expectedOwnerPayout = 0n;
            const expectedBorrowerRefund = itemDeposit; // El depósito completo (1 ETH)

            await verifyOwnerBalanceChanges({ 
                publicClient, owner, initialOwnerBalance, 
                expectedChange: expectedOwnerPayout 
            });
            
            await verifyBorrowerBalanceChanges({ 
                publicClient, borrower, initialBorrowerBalance, 
                expectedChange: expectedBorrowerRefund 
            });
            
            // Si el código devuelve incentivos al borrower cuando no hay votos,
            // el borrower también recibiría ese monto adicional, pero esto ya sería
            // verificado en el balance final del borrower
        });
    });
});
