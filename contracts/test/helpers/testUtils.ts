import hre from "hardhat"
import { parseEther, stringToHex, keccak256, toHex, decodeEventLog } from "viem"
import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers"

export async function deployTestContractsFixture() {
  const publicClient = await hre.viem.getPublicClient()
  const testClient = await hre.viem.getTestClient() // <<< AÑADIR ESTO
  const [
    ownerLedger, // Dueño de SecureBorrowing
    ownerArbitration, // Dueño de Arbitration
    borrowerAccount, // Una cuenta para simular un prestatario
    arbitrator1,
    arbitrator2,
    arbitrator3,
    externalCaller, // Una cuenta externa para llamar funciones
    anotherAccount, // Si necesitas más cuentas genéricas
  ] = await hre.viem.getWalletClients({ count: 8 })

  const dummyAddress = "0x0000000000000000000000000000000000000001"

  const secureBorrowingContract = await hre.viem.deployContract("SecureBorrowing", [
    ownerLedger.account.address,
    dummyAddress,
  ])

  const arbitrationContract = await hre.viem.deployContract("Arbitration", [
    secureBorrowingContract.address,
    ownerArbitration.account.address,
  ])

  const secureBorrowingAsOwner = await hre.viem.getContractAt("SecureBorrowing", secureBorrowingContract.address, {
    client: { wallet: ownerLedger },
  })
  await secureBorrowingAsOwner.write.setArbitrationContract([arbitrationContract.address])

  const arbitrationAsOwner = await hre.viem.getContractAt("Arbitration", arbitrationContract.address, {
    client: { wallet: ownerArbitration },
  })
  await arbitrationAsOwner.write.setArbitratorsPanel([
    [arbitrator1.account.address, arbitrator2.account.address, arbitrator3.account.address],
  ])

  const getSecureBorrowingAs = async (account) => {
    return hre.viem.getContractAt("SecureBorrowing", secureBorrowingContract.address, { client: { wallet: account } })
  }

  const getArbitrationContractAs = async (account) => {
    return hre.viem.getContractAt("Arbitration", arbitrationContract.address, { client: { wallet: account } })
  }

  return {
    ownerLedger,
    ownerArbitration,
    borrowerAccount,
    arbitrator1,
    arbitrator2,
    arbitrator3,
    externalCaller,
    anotherAccount,
    secureBorrowingContract,
    arbitrationContract,
    publicClient,
    testClient, // <<< RETORNAR ESTO
    getSecureBorrowingAs,
    getArbitrationContractAs,
    // Renombra 'owner' y 'otraCuenta' si es necesario para consistencia
    // Por ejemplo, podrías decidir usar ownerLedger como el 'owner' principal en los tests de SecureBorrowing
    // y borrowerAccount como 'otraCuenta'.
    owner: ownerLedger, // Alias para compatibilidad con tests existentes de SecureBorrowing
    otraCuenta: borrowerAccount, // Alias
  }
}

// Mueve las funciones auxiliares aquí también y expórtalas
export async function createTestItem(secureBorrowingInstance, options = {}) {
  const itemId = options.itemId || stringToHex("test-item", { size: 32 }) // CORREGIDO
  const fee = options.fee || parseEther("0.1")
  // Corrección de la lógica de deposit para que 0n sea válido
  const deposit = options.deposit !== undefined ? options.deposit : parseEther("0.5")
  const metadataHash = options.metadataHash || stringToHex("metadata-test", { size: 32 }) // CORREGIDO
  const minBorrowerReputation = options.minBorrowerReputation || 0n

  await secureBorrowingInstance.write.listItem([itemId, fee, deposit, metadataHash, minBorrowerReputation])
  return { itemId, fee, deposit, metadataHash, minBorrowerReputation }
}

export async function prepareEIP712Params(secureBorrowingContract, publicClient) {
  return {
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
}

export async function signBorrow(ownerWalletClient, params, itemId, fee, deposit, nonce, borrowerAddress) {
  const value = { itemId, fee, deposit, nonce, borrower: borrowerAddress }
  return ownerWalletClient.signTypedData({
    domain: params.domain,
    types: params.types,
    primaryType: "Borrow",
    message: value,
  })
}

export async function verifyEvent(publicClient, receipt, eventSignature) {
  const eventHash = keccak256(toHex(eventSignature))
  const eventLog = receipt.logs.find((log) => log.topics[0] === eventHash)
  expect(eventLog, `Event ${eventSignature} not found`).to.exist
  return eventLog
}

/**
 * Configura una transacción de préstamo completa y devuelve su ID
 */
export async function setupBorrowingTransactionAndGetId(
  secureBorrowingContract,
  ownerLedger,
  borrowerAccount,
  publicClient,
  depositAmount = parseEther("1.0"),
) {
  // Crear ítem
  const { itemId, fee, deposit } = await createTestItem(secureBorrowingContract, { deposit: depositAmount })

  // Preparar firma para préstamo
  const itemInfo = await secureBorrowingContract.read.items([itemId])
  const nonce = itemInfo[1]
  const eip712Params = await prepareEIP712Params(secureBorrowingContract, publicClient)
  const signature = await signBorrow(
    ownerLedger,
    eip712Params,
    itemId,
    fee,
    deposit,
    nonce,
    borrowerAccount.account.address,
  )

  // Tomar prestado el ítem como prestatario
  const secureBorrowingAsBorrower = await hre.viem.getContractAt("SecureBorrowing", secureBorrowingContract.address, {
    client: { wallet: borrowerAccount },
  })
  await secureBorrowingAsBorrower.write.borrowItem([itemId, fee, deposit, signature], { value: fee + deposit })

  // Obtener ID de la transacción
  const transactionId = (await secureBorrowingContract.read.transactionCount()) - 1n

  return { itemId, fee, deposit, nonce, transactionId }
}

/**
 * Inicia una disputa para una transacción y devuelve el recibo
 */
export async function initiateDisputeAndGetReceipt(secureBorrowingContract, ownerLedger, transactionId, publicClient) {
  // Verificar balance inicial del contrato Arbitration
  const arbitrationAddress = await secureBorrowingContract.read.arbitrationContract()
  const initialBalance = await publicClient.getBalance({ address: arbitrationAddress })

  // Reportar daño para iniciar la disputa
  const secureBorrowingAsOwner = await hre.viem.getContractAt("SecureBorrowing", secureBorrowingContract.address, {
    client: { wallet: ownerLedger },
  })

  const hash = await secureBorrowingAsOwner.write.settleTransaction([
    transactionId,
    true, // reportDamageByOwnerAction = true
  ])

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return { receipt, initialBalance, arbitrationAddress }
}

/**
 * Verifica todos los aspectos de una disputa (estado, balance y eventos)
 */
export async function verifyDisputeState(
  arbitrationContract,
  transactionId,
  ownerLedger,
  borrowerAccount,
  deposit,
  initialBalance,
  receipt,
  publicClient,
) {
  // Calcular incentivo esperado
  const incentivePercentage = await arbitrationContract.read.INCENTIVE_PERCENTAGE_OF_DEPOSIT()
  const expectedIncentivePool = (deposit * incentivePercentage) / 100n

  // 1. Verificar estado del contrato
  const dispute = await arbitrationContract.read.disputesData([transactionId])
  expect(dispute, "La disputa no existe").to.not.be.undefined

  // 2. Verificar campos de la disputa
  expect(dispute[4].toLowerCase()).to.equal(ownerLedger.account.address.toLowerCase()) // itemOwner
  expect(dispute[5].toLowerCase()).to.equal(borrowerAccount.account.address.toLowerCase()) // borrower
  expect(dispute[1]).to.equal(deposit) // depositAtStake
  expect(dispute[2]).to.equal(expectedIncentivePool) // incentivePoolPaidIn
  expect(dispute[6]).to.be.true // isActive
  expect(dispute[7]).to.be.false // isResolved

  // 3. Verificar que el balance aumentó
  const finalBalance = await publicClient.getBalance({ address: arbitrationContract.address })
  expect(finalBalance).to.equal(initialBalance + expectedIncentivePool)

  // 4. Verificar evento emitido
  const ArbitrationArtifact = require("../../artifacts/contracts/Arbitration.sol/Arbitration.json")
  const eventSignature = "DisputeOpened(uint256,address,address,uint256,uint256)"
  const eventHash = keccak256(stringToHex(eventSignature))

  const eventLog = receipt.logs.find(
    (log) => log.topics[0] === eventHash && log.address.toLowerCase() === arbitrationContract.address.toLowerCase(),
  )
  expect(eventLog, `Event ${eventSignature} not found`).to.exist

  // 5. Verificar argumentos del evento
  const decodedLog = decodeEventLog({
    abi: ArbitrationArtifact.abi,
    data: eventLog.data,
    topics: eventLog.topics,
  })

  expect(decodedLog.args.originalTransactionId).to.equal(transactionId)
  expect(decodedLog.args.itemOwner.toLowerCase()).to.equal(ownerLedger.account.address.toLowerCase())
  expect(decodedLog.args.borrower.toLowerCase()).to.equal(borrowerAccount.account.address.toLowerCase())
  expect(decodedLog.args.depositAtStake).to.equal(deposit)
  expect(decodedLog.args.incentivePoolAmount).to.equal(expectedIncentivePool)

  return { expectedIncentivePool }
}

/**
 * Despliega una versión de ArbitrationTestHelper para pruebas específicas
 */
export async function deployArbitrationTestHelper(
  secureBorrowingContract,
  ownerArbitration,
  arbitrator1,
  arbitrator2,
  arbitrator3,
) {
  // Crear instancia de ArbitrationTestHelper
  const arbitrationTestHelper = await hre.viem.deployContract("ArbitrationTestHelper", [
    secureBorrowingContract.address,
    ownerArbitration.account.address,
  ])

  // Obtener una instancia conectada con el owner
  const arbitrationAsOwner = await hre.viem.getContractAt("ArbitrationTestHelper", arbitrationTestHelper.address, {
    client: { wallet: ownerArbitration },
  })

  // Configurar árbitros
  await arbitrationAsOwner.write.setArbitratorsPanel([
    [arbitrator1.account.address, arbitrator2.account.address, arbitrator3.account.address],
  ])

  return { arbitrationTestHelper, arbitrationAsOwner }
}

/**
 * Configura un escenario para prueba de período de votación expirado
 */
export async function setupExpiredVotingPeriod(activeDisputeResult, ownerArbitration) {
  const { arbitrationContract, transactionId } = activeDisputeResult

  // Crear un nuevo helper específico para manipulación de tiempo
  const { arbitrationTestHelper, arbitrationAsOwner } = await deployArbitrationTestHelper(
    activeDisputeResult.secureBorrowingContract,
    ownerArbitration,
    activeDisputeResult.arbitrator1,
    activeDisputeResult.arbitrator2,
    activeDisputeResult.arbitrator3,
  )

  // Crear una disputa con los mismos datos pero en el nuevo helper
  await arbitrationAsOwner.write.testOpenDispute(
    [
      transactionId,
      activeDisputeResult.ownerLedger.account.address,
      activeDisputeResult.borrowerAccount.account.address,
      activeDisputeResult.deposit,
    ],
    { value: activeDisputeResult.deposit / 10n }, // 10% para incentivos
  )

  // Obtener y calcular el tiempo futuro
  const votingPeriod = await arbitrationTestHelper.read.disputeVotingPeriod()
  const dispute = await arbitrationTestHelper.read.disputesData([transactionId])
  const creationTime = dispute[3]
  const futureTimestamp = creationTime + votingPeriod + 100n

  // Configurar el timestamp
  await arbitrationAsOwner.write.setTestTimestamp([futureTimestamp])

  return {
    arbitrationTestHelper,
    transactionId,
    futureTimestamp,
    arbitrationAsOwner,
  }
}

/**
 * Verifica si un árbitro ya votó en una disputa.
 * Requiere que el contrato Arbitration tenga una función `getArbitratorHasVoted`.
 */
export async function hasArbitratorVoted(
  arbitrationContract: any,
  transactionId: bigint,
  arbitratorAddress: string,
): Promise<boolean> {
  try {
    // Llama a la nueva función getter en el contrato
    const hasVotedStatus = await arbitrationContract.read.getArbitratorHasVoted([transactionId, arbitratorAddress])
    return hasVotedStatus
  } catch (error) {
    console.error("Error en hasArbitratorVoted (helper):", error)
    // Podrías optar por relanzar el error o devolver un valor que indique fallo
    // Por ahora, devolvemos false para que el test falle si la lectura no es posible.
    return false
  }
}

/**
 * Obtiene los detalles del voto de un árbitro
 */
export async function getArbitratorVoteDetails(arbitrationContract, transactionId, arbitratorAddress) {
  try {
    const voteDetails = await arbitrationContract.read.getArbitratorVote([transactionId, arbitratorAddress])

    return {
      voteInFavorOfOwner: voteDetails[0],
      damageSeverityPercentage: voteDetails[1],
    }
  } catch (error) {
    console.error("Error al obtener detalles del voto:", error)
    return { voteInFavorOfOwner: false, damageSeverityPercentage: 0 }
  }
}

// Add this function to testUtils.ts
export async function setupActiveDispute() {
  const {
    secureBorrowingContract,
    arbitrationContract,
    ownerLedger,
    borrowerAccount,
    publicClient,
    testClient,
    arbitrator1,
    arbitrator2,
    arbitrator3,
    ownerArbitration, // Make sure this is included
  } = await loadFixture(deployTestContractsFixture)

  // 1. Create a transaction of loan
  const { deposit, transactionId } = await setupBorrowingTransactionAndGetId(
    secureBorrowingContract,
    ownerLedger,
    borrowerAccount,
    publicClient,
  )

  // 2. Begin a dispute for this transaction
  const { receipt, initialBalance, arbitrationAddress } = await initiateDisputeAndGetReceipt(
    secureBorrowingContract,
    ownerLedger,
    transactionId,
    publicClient,
  )

  return {
    secureBorrowingContract,
    arbitrationContract,
    ownerLedger,
    ownerArbitration, // Make sure this is included in the return
    borrowerAccount,
    publicClient,
    testClient,
    arbitrator1,
    arbitrator2,
    arbitrator3,
    transactionId,
    deposit,
  }
}
