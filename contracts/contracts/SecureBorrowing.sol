// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Interface para llamar al contrato de Arbitraje
interface IArbitration {
    function openDispute(
        uint256 originalTransactionId,
        address itemOwner,
        address borrower,
        uint256 depositAtStake
    ) external payable returns (bool);

    function INCENTIVE_PERCENTAGE_OF_DEPOSIT() external view returns (uint256);
}

contract SecureBorrowing is ReentrancyGuard, Ownable, Pausable {
    using ECDSA for bytes32;

    struct ItemInfo {
        address owner;
        uint256 nonce;
        uint256 fee;
        uint256 deposit;
        bytes32 metadataHash;
        bool isAvailable; // Sigue siendo útil para saber si un item listado está actualmente en un préstamo
        int256 minBorrowerReputation;
    }

    struct Transaction {
        address borrower;
        bytes32 itemId;
        uint256 feePaid;
        uint256 depositPaid; // Depósito original al momento de la transacción
        uint256 returnTime;
        bool isConcluded;
        bool damageReported;
        // Campos para rastrear lo que ya se pagó del depósito original
        uint256 amountFromDepositPaidToOwner;
        uint256 amountFromDepositRefundedToBorrower;
    }

    event ItemListed(bytes32 indexed itemId, address indexed owner, uint256 fee, uint256 deposit, int256 minBorrowerReputation);
    event ItemUpdated(bytes32 indexed itemId, address indexed owner, uint256 newFee, uint256 newDeposit, int256 newMinBorrowerReputation);
    event ItemDelisted(bytes32 indexed itemId, address indexed owner); // Item eliminado
    event TransactionCreated(uint256 indexed transactionId, bytes32 indexed itemId, address indexed borrower);
    event TransactionSettledAmicably(uint256 indexed transactionId, uint256 refundToBorrower, uint256 paymentToOwner);
    event DisputeSentToArbitration(uint256 indexed transactionId, address indexed itemOwner, address indexed borrower, uint256 depositAtStake, uint256 incentiveSent); // MODIFICADO: añadido incentiveSent
    event ArbitrationOutcomeProcessed(
        uint256 indexed transactionId,
        bool ownerWonDispute,
        uint256 penaltyAmountPaidToOwner,
        uint256 refundAmountToBorrower
    );
    event DamageReportedNoArbitration(uint256 indexed transactionId, address indexed itemOwner, address indexed borrower, int256 ownerReputationChange, int256 borrowerReputationChange);
    event ReputationUpdated(address indexed user, int256 newReputation, bool isOwner);
    event UserSuspended(address indexed user, uint256 suspensionEndTime);
    event UserBanned(address indexed user);
    event SuspensionParametersUpdated(int256 newThreshold, uint256 newDuration, uint256 newMaxSuspensions);

    bytes32 private constant BORROW_TYPEHASH = keccak256(
        "Borrow(bytes32 itemId,uint256 fee,uint256 deposit,uint256 nonce,address borrower)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    int256 public constant MAX_REPUTATION = 10000;
    int256 public constant MIN_REPUTATION = -10000;
    int256 public suspensionThreshold = -20;
    uint256 public suspensionDuration = 30 days;
    uint256 public maxSuspensions = 3;

    mapping(bytes32 => ItemInfo) public items;
    mapping(uint256 => Transaction) public transactions;
    mapping(address => int256) public ownerReputation;
    mapping(address => int256) public borrowerReputation;
    mapping(address => uint256) public suspensionEndTime;
    mapping(address => uint256) public suspensionCount;
    mapping(address => bool) public isBanned;
    mapping(address => uint256) public lastAboveThresholdTime;
    uint256 public transactionCount;

    uint256 public activeLoanCount;
    uint256 public activeDisputeCount;

    // ELIMINADO: uint256 public constant UNCLAIMED_FUNDS_TIMEOUT = 90 days;

    IArbitration public arbitrationContract;

    constructor(address initialOwner, address _arbitrationContractAddress) Ownable(initialOwner) {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("SecureBorrowing_1.1"),
            keccak256("1.1"),
            block.chainid,
            address(this)
        ));
        require(_arbitrationContractAddress != address(0), "SecureBorrowing: Invalid arbitration contract address");
        arbitrationContract = IArbitration(_arbitrationContractAddress);
    }

    modifier notSuspendedOrBanned() {
        require(!isBanned[msg.sender], "User is permanently banned");
        require(suspensionEndTime[msg.sender] == 0 || block.timestamp >= suspensionEndTime[msg.sender], "User is suspended");
        _;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _areAnyTransactionsOrDisputesActive() internal view returns (bool) {
        return activeLoanCount > 0 || activeDisputeCount > 0;
    }

    function emergencyWithdrawEther() external onlyOwner nonReentrant {
        require(!_areAnyTransactionsOrDisputesActive(), "SecureBorrowing: Active loans or disputes exist");
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "SecureBorrowing: Ether transfer failed");
    }

    function emergencyWithdrawERC20(address tokenAddress) external onlyOwner nonReentrant {
        require(!_areAnyTransactionsOrDisputesActive(), "SecureBorrowing: Active loans or disputes exist");
        IERC20 token = IERC20(tokenAddress);
        bool success = token.transfer(owner(), token.balanceOf(address(this)));
        require(success, "SecureBorrowing: ERC20 transfer failed");
    }

    function setArbitrationContract(address _newArbitrationContractAddress) external onlyOwner {
        require(_newArbitrationContractAddress != address(0), "SecureBorrowing: Invalid new arbitration contract address");
        arbitrationContract = IArbitration(_newArbitrationContractAddress);
    }

    function setSuspensionThreshold(int256 newThreshold) external onlyOwner {
        require(newThreshold <= 0 && newThreshold >= MIN_REPUTATION, "Invalid suspension threshold");
        suspensionThreshold = newThreshold;
        emit SuspensionParametersUpdated(suspensionThreshold, suspensionDuration, maxSuspensions);
    }

    function setSuspensionDuration(uint256 newDuration) external onlyOwner {
        require(newDuration >= 1 days && newDuration <= 365 days, "Invalid suspension duration");
        suspensionDuration = newDuration;
        emit SuspensionParametersUpdated(suspensionThreshold, suspensionDuration, maxSuspensions);
    }

    function setMaxSuspensions(uint256 newMaxSuspensions) external onlyOwner {
        require(newMaxSuspensions >= 1, "Invalid max suspensions");
        maxSuspensions = newMaxSuspensions;
        emit SuspensionParametersUpdated(suspensionThreshold, suspensionDuration, maxSuspensions);
    }

    function listItem(
        bytes32 itemId,
        uint256 fee,
        uint256 deposit,
        bytes32 metadataHash,
        int256 minReputation
    ) external whenNotPaused notSuspendedOrBanned {
        // MODIFICADO: Ahora que delistItem usa 'delete', esta condición es correcta para permitir relistar.
        require(items[itemId].owner == address(0), "Item ID in use or not properly delisted");
        require(minReputation >= MIN_REPUTATION && minReputation <= MAX_REPUTATION, "Invalid reputation requirement");
        items[itemId] = ItemInfo({
            owner: msg.sender,
            nonce: 0,
            fee: fee,
            deposit: deposit,
            metadataHash: metadataHash,
            isAvailable: true,
            minBorrowerReputation: minReputation
        });
        emit ItemListed(itemId, msg.sender, fee, deposit, minReputation);
    }

    function updateItem(
        bytes32 itemId,
        uint256 newFee,
        uint256 newDeposit,
        bytes32 newMetadataHash,
        int256 newMinReputation
    ) external whenNotPaused notSuspendedOrBanned {
        ItemInfo storage item = items[itemId];
        require(item.owner == msg.sender, "No autorizado o item no existe"); // item.owner será address(0) si no existe
        require(item.isAvailable, "Item not available for update (e.g., in a loan)"); // Solo actualizar si no está en préstamo activo
        require(newMinReputation >= MIN_REPUTATION && newMinReputation <= MAX_REPUTATION, "Invalid reputation requirement");
        item.fee = newFee;
        item.deposit = newDeposit;
        item.metadataHash = newMetadataHash;
        item.minBorrowerReputation = newMinReputation;
        emit ItemUpdated(itemId, msg.sender, newFee, newDeposit, newMinReputation);
    }

    function delistItem(bytes32 itemId) external whenNotPaused notSuspendedOrBanned {
        ItemInfo storage item = items[itemId];
        require(item.owner == msg.sender, "No autorizado o item no existe");
        require(item.isAvailable, "Item is currently in a loan/dispute, cannot delist"); // Asegura que no esté en un préstamo activo
        
        // MODIFICADO: Usar delete para limpiar el almacenamiento y permitir reutilización del itemId.
        delete items[itemId];
        emit ItemDelisted(itemId, msg.sender);
    }

    function borrowItem(
        bytes32 itemId,
        uint256 fee,
        uint256 deposit,
        bytes calldata ownerSignature
    ) external payable nonReentrant whenNotPaused notSuspendedOrBanned {
        ItemInfo storage item = items[itemId];
        require(item.owner != address(0), "Item no existe");
        require(item.isAvailable, "Item no disponible");
        require(borrowerReputation[msg.sender] >= item.minBorrowerReputation, "Reputacion insuficiente");
        require(msg.value == fee + deposit, "Pago debe ser exacto");

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                BORROW_TYPEHASH,
                itemId,
                item.fee, // Usar el fee del item para la firma
                item.deposit, // Usar el deposit del item para la firma
                item.nonce,
                msg.sender
            ))
        ));
        // La firma debe ser sobre los parámetros actuales del item, no los que envía el prestatario
        require(item.fee == fee, "Fee mismatch with item's current fee");
        require(item.deposit == deposit, "Deposit mismatch with item's current deposit");
        require(digest.recover(ownerSignature) == item.owner, "Firma invalida");

        uint256 currentTransactionId = transactionCount;
        transactionCount++;
        item.nonce++;
        item.isAvailable = false;
        activeLoanCount++;

        transactions[currentTransactionId] = Transaction({
            borrower: msg.sender,
            itemId: itemId,
            feePaid: fee,
            depositPaid: deposit,
            returnTime: 0,
            isConcluded: false,
            damageReported: false,
            amountFromDepositPaidToOwner: 0, // Inicializar
            amountFromDepositRefundedToBorrower: 0 // Inicializar
        });

        emit TransactionCreated(currentTransactionId, itemId, msg.sender);

        if (fee > 0) {
            (bool success, ) = payable(item.owner).call{value: fee}("");
            require(success, "Ledger: Fee transfer failed");
        }
    }

    // Definir constantes para los umbrales de reputación directamente en el contrato
    uint256 private constant ONE_ETH_FOR_REP_CALC = 1 ether; // Usar un nombre único si 'ONE_ETH' ya existe
    uint256 private constant THRESHOLD_REP_1 = ONE_ETH_FOR_REP_CALC / 10; // 0.1 ETH
    uint256 private constant THRESHOLD_REP_2 = ONE_ETH_FOR_REP_CALC;       // 1 ETH
    uint256 private constant THRESHOLD_REP_3 = 10 * ONE_ETH_FOR_REP_CALC;  // 10 ETH
    uint256 private constant THRESHOLD_REP_4 = 50 * ONE_ETH_FOR_REP_CALC;  // 50 ETH

    function _calculateReputationChange(uint256 amountInWei) internal pure returns (int256) {
        if (amountInWei == 0) { 
            return 1; 
        }
        // Esta es la lógica de rangos que quieres aplicar
        if (amountInWei < THRESHOLD_REP_1) { return 1; }       // < 0.1 ETH -> 1 punto
        else if (amountInWei < THRESHOLD_REP_2) { return 2; }  // 0.1 ETH a < 1 ETH -> 2 puntos
        else if (amountInWei < THRESHOLD_REP_3) { return 3; }  // 1 ETH a < 10 ETH -> 3 puntos
        else if (amountInWei < THRESHOLD_REP_4) { return 4; }  // 10 ETH a < 50 ETH -> 4 puntos
        else { return 10; }                                     // >= 50 ETH -> 5 puntos
    }

    function updateReputation(address user, int256 reputationChange, bool isOwner) internal returns (int256) {
        int256 currentReputation = isOwner ? ownerReputation[user] : borrowerReputation[user];
        int256 newReputation = currentReputation + reputationChange;

        if (newReputation > MAX_REPUTATION) newReputation = MAX_REPUTATION;
        else if (newReputation < MIN_REPUTATION) newReputation = MIN_REPUTATION;

        if (isOwner) ownerReputation[user] = newReputation;
        else borrowerReputation[user] = newReputation;

        if (newReputation <= suspensionThreshold && !isBanned[user]) {
            if (suspensionEndTime[user] == 0 || block.timestamp >= suspensionEndTime[user]) {
                if (currentReputation > suspensionThreshold || suspensionEndTime[user] != 0) {
                    suspensionCount[user]++;
                }
            }
            if (suspensionCount[user] >= maxSuspensions) {
                isBanned[user] = true;
                suspensionEndTime[user] = 0;
                suspensionCount[user] = 0;
                emit UserBanned(user);
            } else {
                suspensionEndTime[user] = block.timestamp + suspensionDuration;
                emit UserSuspended(user, suspensionEndTime[user]);
            }
        } else if (newReputation > suspensionThreshold && !isBanned[user]) {
            // CORREGIDO: Lógica de reseteo de suspensionCount
            if (currentReputation <= suspensionThreshold) { // Si acaba de cruzar el umbral hacia arriba
                lastAboveThresholdTime[user] = block.timestamp;
            }
            // Solo resetear si ha cruzado el umbral (lastAboveThresholdTime > 0)
            // Y ha pasado suficiente tiempo desde que cruzó.
            if (lastAboveThresholdTime[user] > 0 && 
                block.timestamp >= lastAboveThresholdTime[user] + suspensionDuration &&
                suspensionCount[user] > 0) { // Solo resetear si había algo que resetear
                suspensionCount[user] = 0;
                suspensionEndTime[user] = 0; // Limpiar también el tiempo de suspensión
                lastAboveThresholdTime[user] = 0; // Resetear para el próximo ciclo
            }
        }
        emit ReputationUpdated(user, newReputation, isOwner);
        return newReputation;
    }

    function settleTransaction(uint256 transactionId, bool reportDamageByOwnerAction)
        external nonReentrant whenNotPaused notSuspendedOrBanned {
        Transaction storage txn = transactions[transactionId];
        require(!txn.isConcluded, "Transaccion ya concluida o disputa iniciada");

        ItemInfo storage item = items[txn.itemId];
        require(item.owner != address(0), "Item associated with transaction no longer exists");
        require(msg.sender == txn.borrower || msg.sender == item.owner, "No autorizado para esta accion");

        if (msg.sender == item.owner && reportDamageByOwnerAction) {
            txn.damageReported = true;

            if (txn.depositPaid == 0) { // NO HAY DEPÓSITO, RESOLVER DIRECTAMENTE CON REPUTACIÓN
                txn.isConcluded = true;
                txn.returnTime = block.timestamp; // Registrar tiempo de "retorno/reporte"
                activeLoanCount--; // El préstamo activo termina

                int256 ownerRepChange = 1;
                int256 borrowerRepChange = -2; // MODIFIED: Changed from -2 to -3

                updateReputation(item.owner, ownerRepChange, true);
                updateReputation(txn.borrower, borrowerRepChange, false);

                if (items[txn.itemId].owner != address(0)) { // Solo si el item aún existe
                    item.isAvailable = true;
                }

                emit DamageReportedNoArbitration(transactionId, item.owner, txn.borrower, ownerRepChange, borrowerRepChange);
                // NO SE ENVÍA A ARBITRAJE
            } else { // HAY DEPÓSITO, PROCEDER CON ARBITRAJE COMO ANTES
                txn.isConcluded = true; // Marcar como concluida para evitar otras acciones, pero la disputa sigue
                txn.returnTime = block.timestamp; // Registrar tiempo de "retorno/reporte"
                activeLoanCount--; // El préstamo activo termina, pasa a disputa
                activeDisputeCount++;

                uint256 incentivePercentage = arbitrationContract.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
                uint256 expectedIncentivePool = (txn.depositPaid * incentivePercentage) / 100;
                
                emit DisputeSentToArbitration(transactionId, item.owner, txn.borrower, txn.depositPaid, expectedIncentivePool);
                
                bool success = arbitrationContract.openDispute{value: expectedIncentivePool}(transactionId, item.owner, txn.borrower, txn.depositPaid);
                require(success, "Ledger: Failed to open dispute in Arbitration contract");
            }
        } else { // ACUERDO AMIGABLE O DEVOLUCIÓN NORMAL POR EL BORROWER
            txn.isConcluded = true;
            txn.returnTime = block.timestamp;
            activeLoanCount--;

            if (items[txn.itemId].owner != address(0)) { // Solo si el item aún existe
                item.isAvailable = true;
            }

            // Ahora _calculateReputationChange usa la lógica de rangos con txn.feePaid
            updateReputation(item.owner, _calculateReputationChange(txn.feePaid), true);
            updateReputation(txn.borrower, _calculateReputationChange(txn.feePaid), false);

            uint256 refundToBorrower = txn.depositPaid;
            txn.amountFromDepositRefundedToBorrower = refundToBorrower;
            emit TransactionSettledAmicably(transactionId, refundToBorrower, 0);

            if (refundToBorrower > 0) {
                (bool successL, ) = payable(txn.borrower).call{value: refundToBorrower}("");
                require(successL, "Ledger: Refund transfer failed");
            }
        }
    }

    function processArbitrationOutcome(
        uint256 transactionId,
        bool ownerWonDispute,
        uint8 penaltyPercentToOwner,
        address itemOwnerFromArbitration,
        address borrowerFromArbitration
    ) external virtual whenNotPaused nonReentrant {
        require(msg.sender == address(arbitrationContract), "Ledger: Caller is not the Arbitration contract");

        Transaction storage txn = transactions[transactionId];
        ItemInfo storage item = items[txn.itemId];

        require(txn.isConcluded && txn.damageReported, "Ledger: No active dispute to process for this transaction");
        require(itemOwnerFromArbitration != address(0), "Ledger: Invalid item owner from arbitration");
        require(txn.borrower == borrowerFromArbitration, "Ledger: Borrower mismatch");
        
        // Calculate actual amounts based on the percentage and the deposit held
        uint256 incentivePercentage = arbitrationContract.INCENTIVE_PERCENTAGE_OF_DEPOSIT();
        uint256 arbitrationIncentiveAmount = (txn.depositPaid * incentivePercentage) / 100;
        uint256 remainingDeposit = txn.depositPaid - arbitrationIncentiveAmount;
        uint256 penaltyAmountToOwner = (remainingDeposit * penaltyPercentToOwner) / 100;
        uint256 refundAmountToBorrower = remainingDeposit - penaltyAmountToOwner;

        // Use the item variable here instead of accessing items[txn.itemId] again
        if (item.owner != address(0)) {
            item.isAvailable = true;
        }
        activeDisputeCount--;

        txn.amountFromDepositPaidToOwner = penaltyAmountToOwner;
        txn.amountFromDepositRefundedToBorrower = refundAmountToBorrower;

        if (ownerWonDispute) {
            // Ahora _calculateReputationChange usa la lógica de rangos con penaltyAmountToOwner
            updateReputation(txn.borrower, -_calculateReputationChange(penaltyAmountToOwner), false);
            updateReputation(itemOwnerFromArbitration, 1, true); // O _calculateReputationChange(penaltyAmountToOwner) si la recompensa del dueño también escala
        } else {
            // Ahora _calculateReputationChange usa la lógica de rangos con refundAmountToBorrower (que es lo que el dueño "pierde" de su depósito reclamado)
            updateReputation(itemOwnerFromArbitration, -_calculateReputationChange(refundAmountToBorrower), true);
            updateReputation(txn.borrower, 1, false); // O _calculateReputationChange(refundAmountToBorrower) si la "ganancia" del prestatario también escala
        }

        emit ArbitrationOutcomeProcessed(
            transactionId,
            ownerWonDispute,
            penaltyAmountToOwner,
            refundAmountToBorrower
        );

        if (penaltyAmountToOwner > 0) {
            (bool successP, ) = payable(itemOwnerFromArbitration).call{value: penaltyAmountToOwner}("");
            require(successP, "Ledger: Penalty transfer to owner failed");
        }
        if (refundAmountToBorrower > 0) {
            (bool successR, ) = payable(txn.borrower).call{value: refundAmountToBorrower}("");
            require(successR, "Ledger: Refund transfer to borrower failed");
        }
    }

    // AÑADIDO: receive() para que el contrato pueda recibir ETH (necesario si va a pagar incentivos de sus propios fondos)
    receive() external payable {}

    // ELIMINADA: function withdrawUnclaimedFunds(...)
}