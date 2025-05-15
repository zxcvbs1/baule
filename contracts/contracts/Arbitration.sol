// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // Usar ReentrancyGuard de OZ

// Interfaz para comunicarse con SecureBorrowing
interface ISecureBorrowing { // MODIFIED: Renamed from ISecureBorrowingLedger
    function processArbitrationOutcome(
        uint256 transactionId,
        bool ownerWonDispute,
        uint256 penaltyAmountToOwner,
        uint256 refundAmountToBorrower,
        address itemOwner,
        address borrower
    ) external;
}

contract Arbitration is Ownable, Pausable, ReentrancyGuard { // Heredar de OZ
    // Estructura para almacenar información de la disputa
    struct DisputeInfo {
        mapping(address => uint8) arbitratorDamageSeverity;
        mapping(address => bool) arbitratorVoteInFavorOfOwner;
        mapping(address => bool) arbitratorHasVoted;
        address[] disputeArbitrators;
        uint256 votesCasted;
        uint256 depositAtStake; // Depósito original en disputa
        uint256 incentivePoolPaidIn; // Incentivo pagado a este contrato
        uint256 creationTime;
        address itemOwner;
        address borrower;
        bool isActive; // Para saber si la disputa está abierta y no resuelta
        bool isResolved;
    }

    mapping(address => uint256) public arbitratorReputation;
    mapping(uint256 => DisputeInfo) public disputesData;

    uint256 public disputeVotingPeriod = 7 days;
    uint256 public constant MAX_VOTING_PERIOD = 365 days; // Límite superior para el periodo de votación
    uint256 public constant MIN_VOTING_PERIOD = 1 hours; // Límite inferior para el periodo de votación
    uint256 public constant INCENTIVE_PERCENTAGE_OF_DEPOSIT = 10; // Ya es public y constant, accesible
    uint256 public constant FINALIZER_FEE_FROM_POOL = 5; // 5% del incentivePool para quien finaliza

    ISecureBorrowing public secureBorrowingContract; // MODIFIED: Renamed variable and type
    address[3] public arbitratorsPanel; // Panel de 3 árbitros

    // Eventos
    event ArbitratorVoteCastInArbitration(uint256 indexed originalTransactionId, address indexed arbitrator, bool voteInFavorOfOwner, uint8 damageSeverityPercentage);
    event DisputeFinalizedInArbitration(uint256 indexed originalTransactionId, bool ownerWon, uint256 penaltyToOwner, uint256 refundToBorrower, address finalizer);
    event ArbitratorIncentivePaid(uint256 indexed originalTransactionId, address indexed arbitrator, uint256 amount);
    event FinalizerIncentivePaid(uint256 indexed originalTransactionId, address indexed finalizer, uint256 amount);
    event ReputationUpdated(address indexed arbitrator, int256 reputationChange, uint256 newReputation);
    event DisputeOpened(uint256 indexed originalTransactionId, address itemOwner, address borrower, uint256 depositAtStake, uint256 incentivePoolAmount);
    event VotingPeriodUpdated(uint256 newPeriod);
    event ArbitratorsPanelUpdated(address[3] newArbitrators);
    event UnusedIncentivesReturned(uint256 indexed originalTransactionId, uint256 amount);


    constructor(address _secureBorrowingAddress, address _initialOwner) Ownable(_initialOwner) {
        require(_secureBorrowingAddress != address(0), "Invalid SecureBorrowing address");
        secureBorrowingContract = ISecureBorrowing(_secureBorrowingAddress);
    }

    receive() external payable {} // Para recibir ETH para incentivos

    modifier onlyArbitrator(uint256 originalTransactionId) {
        require(_isAssignedArbitrator(originalTransactionId, msg.sender), "Not an assigned arbitrator for this dispute");
        _;
    }

    function setArbitratorsPanel(address[3] calldata _newArbitrators) external onlyOwner {
        for (uint i = 0; i < _newArbitrators.length; i++) {
            require(_newArbitrators[i] != address(0), "Invalid arbitrator address");
        }
        arbitratorsPanel = _newArbitrators;
        emit ArbitratorsPanelUpdated(_newArbitrators);
    }

    function _isAssignedArbitrator(uint256 originalTransactionId, address _arbitrator) internal view returns (bool) {
        DisputeInfo storage dispute = disputesData[originalTransactionId];
        for (uint i = 0; i < dispute.disputeArbitrators.length; i++) {
            if (dispute.disputeArbitrators[i] == _arbitrator) {
                return true;
            }
        }
        return false;
    }

    function openDispute(
        uint256 originalTransactionId,
        address itemOwner,
        address borrower,
        uint256 depositAtStake
    ) external payable returns (bool) { // Ahora es payable
        require(msg.sender == address(secureBorrowingContract), "Only SecureBorrowing can open dispute"); // MODIFIED: Error message and variable name
        
        DisputeInfo storage dispute = disputesData[originalTransactionId];
        require(!dispute.isActive && !dispute.isResolved, "Dispute already active or resolved");

        uint256 expectedIncentivePool = (depositAtStake * INCENTIVE_PERCENTAGE_OF_DEPOSIT) / 100;
        require(msg.value >= expectedIncentivePool, "Insufficient ETH sent for incentive pool");

        dispute.itemOwner = itemOwner;
        dispute.borrower = borrower;
        dispute.depositAtStake = depositAtStake;
        dispute.incentivePoolPaidIn = msg.value; // Guardar lo que realmente se pagó
        dispute.creationTime = _getCurrentTimestamp();
        dispute.isResolved = false;
        dispute.isActive = true; // Marcar como activa
        dispute.votesCasted = 0;

        // Asignar los árbitros del panel actual
        dispute.disputeArbitrators = arbitratorsPanel;
        // require(dispute.disputeArbitrators.length > 0, "No arbitrators set in panel"); // Eliminar o comentar esta línea
        
        // Verificar que al menos un árbitro sea una dirección válida
        bool hasValidArbitrator = false;
        for (uint i = 0; i < arbitratorsPanel.length; i++) {
            if (arbitratorsPanel[i] != address(0)) {
                hasValidArbitrator = true;
                break;
            }
        }
        require(hasValidArbitrator, "No valid arbitrators set in panel");
        
        emit DisputeOpened(originalTransactionId, itemOwner, borrower, depositAtStake, msg.value);
        return true; // <--- AÑADIR ESTO
    }

    function castArbitratorVote(
        uint256 originalTransactionId,
        bool voteInFavorOfOwner,
        uint8 damageSeverityPercentage
    ) external onlyArbitrator(originalTransactionId) whenNotPaused nonReentrant {
        DisputeInfo storage dispute = disputesData[originalTransactionId];
        require(dispute.isActive && !dispute.isResolved, "Dispute not active or already resolved");
        require(_getCurrentTimestamp() <= dispute.creationTime + disputeVotingPeriod, "Voting period over");
        require(!dispute.arbitratorHasVoted[msg.sender], "Arbitrator already voted");
        
        if (voteInFavorOfOwner) {
            require(damageSeverityPercentage > 0 && damageSeverityPercentage <= 100, "Owner vote: Severity must be 1-100%");
        } else {
            // Si vota por el prestatario, la severidad no importa y podría ser 0 por defecto.
            // Opcionalmente, podrías requerir que sea 0 si no vota por el propietario:
            // require(damageSeverityPercentage == 0, "Borrower vote: Severity must be 0%");
        }

        dispute.arbitratorDamageSeverity[msg.sender] = damageSeverityPercentage;
        dispute.arbitratorVoteInFavorOfOwner[msg.sender] = voteInFavorOfOwner;
        dispute.arbitratorHasVoted[msg.sender] = true;
        dispute.votesCasted++;

        emit ArbitratorVoteCastInArbitration(originalTransactionId, msg.sender, voteInFavorOfOwner, damageSeverityPercentage);
    }

    function _updateArbitratorReputation(address arbitrator, int256 change) internal {
        uint256 currentReputation = arbitratorReputation[arbitrator];
        uint256 newReputation;
        if (change >= 0) {
            newReputation = currentReputation + uint256(change);
        } else {
            if (currentReputation >= uint256(-change)) {
                newReputation = currentReputation - uint256(-change);
            } else {
                newReputation = 0; // Reputación no puede ser negativa
            }
        }
        arbitratorReputation[arbitrator] = newReputation;
        emit ReputationUpdated(arbitrator, change, newReputation);
    }

    function finalizeDispute(uint256 originalTransactionId) external whenNotPaused nonReentrant {
        DisputeInfo storage dispute = disputesData[originalTransactionId];
        require(dispute.isActive && !dispute.isResolved, "Dispute not active or already resolved");
        require(block.timestamp >= dispute.creationTime + disputeVotingPeriod || dispute.votesCasted == dispute.disputeArbitrators.length, "Voting period not over unless all voted");

        uint256 refundToBorrower = 0;
        uint256 penaltyToOwner = 0;
        bool ownerWonDisputeDecision = false;

        uint256 votesForOwner = 0;
        uint256 votesForBorrower = 0;
        uint256 totalSeverityOwner = 0;

        for (uint i = 0; i < dispute.disputeArbitrators.length; i++) {
            address arbitrator = dispute.disputeArbitrators[i];
            if (dispute.arbitratorHasVoted[arbitrator]) {
                if (dispute.arbitratorVoteInFavorOfOwner[arbitrator]) {
                    votesForOwner++;
                    totalSeverityOwner += dispute.arbitratorDamageSeverity[arbitrator];
                } else { // Votó por el prestatario
                    votesForBorrower++;
                }
            }
        }
        
        uint256 actualIncentivePoolToDistribute = dispute.incentivePoolPaidIn;
        uint256 remainingWeiFromDivision = 0;

        if (votesForOwner + votesForBorrower > 0) { // Si hubo al menos un voto
            if (votesForOwner > votesForBorrower) {
                ownerWonDisputeDecision = true;
                uint256 averageSeverityOwner = totalSeverityOwner / votesForOwner; 
                penaltyToOwner = (dispute.depositAtStake * averageSeverityOwner) / 100;
                refundToBorrower = dispute.depositAtStake - penaltyToOwner;
            } else if (votesForBorrower > votesForOwner) {
                ownerWonDisputeDecision = false;
                penaltyToOwner = 0;
                refundToBorrower = dispute.depositAtStake;
            } else { // Empate
                ownerWonDisputeDecision = false;
                penaltyToOwner = dispute.depositAtStake / 2;
                refundToBorrower = dispute.depositAtStake - penaltyToOwner;
                remainingWeiFromDivision = dispute.depositAtStake % 2;
                refundToBorrower += remainingWeiFromDivision;
            }
        } else { // No hubo votos
            ownerWonDisputeDecision = false;
            penaltyToOwner = 0;
            refundToBorrower = dispute.depositAtStake;
            if (dispute.incentivePoolPaidIn > 0 && address(this).balance >= dispute.incentivePoolPaidIn) {
                (bool successReturnToBorrower, ) = payable(dispute.borrower).call{value: dispute.incentivePoolPaidIn}("");
                if (successReturnToBorrower) {
                    emit UnusedIncentivesReturned(originalTransactionId, dispute.incentivePoolPaidIn);
                } else {
                    (bool successReturnToOwner, ) = payable(owner()).call{value: dispute.incentivePoolPaidIn}("");
                    if(successReturnToOwner) {
                         emit UnusedIncentivesReturned(originalTransactionId, dispute.incentivePoolPaidIn);
                    }
                }
            }
            actualIncentivePoolToDistribute = 0;
        }

        uint256 finalizerShare = 0;
        uint256 poolForArbitrators = actualIncentivePoolToDistribute;

        if (actualIncentivePoolToDistribute > 0) {
            finalizerShare = (actualIncentivePoolToDistribute * FINALIZER_FEE_FROM_POOL) / 100;
            if (finalizerShare > 0 && address(this).balance >= finalizerShare) {
                 poolForArbitrators = actualIncentivePoolToDistribute - finalizerShare;
                (bool successFinalizer, ) = payable(msg.sender).call{value: finalizerShare}("");
                if (successFinalizer) {
                    emit FinalizerIncentivePaid(originalTransactionId, msg.sender, finalizerShare);
                } else {
                    poolForArbitrators = actualIncentivePoolToDistribute; 
                    finalizerShare = 0; 
                }
            } else {
                 finalizerShare = 0; 
            }

            uint256 totalValidVotedArbitrators = 0; 
            for(uint i = 0; i < dispute.disputeArbitrators.length; i++){
                address arbitrator = dispute.disputeArbitrators[i];
                if (dispute.arbitratorHasVoted[arbitrator]) {
                    // Si ha votado (y castArbitratorVote asegura la validez del voto de propietario),
                    // entonces es un voto válido para compensación.
                    totalValidVotedArbitrators++;
                }
            }

            if (totalValidVotedArbitrators > 0 && poolForArbitrators > 0) {
                uint256 individualArbitratorIncentive = poolForArbitrators / totalValidVotedArbitrators;
                uint256 remainderForArbitrators = poolForArbitrators % totalValidVotedArbitrators;

                for (uint i = 0; i < dispute.disputeArbitrators.length; i++) {
                    address arbitrator = dispute.disputeArbitrators[i];
                    if (dispute.arbitratorHasVoted[arbitrator]) { 
                        uint256 incentiveThisArbitrator = individualArbitratorIncentive;
                        if(remainderForArbitrators > 0){ 
                            incentiveThisArbitrator++;
                            remainderForArbitrators--;
                        }

                        // Actualizar reputación por haber votado, ANTES de intentar el pago
                        _updateArbitratorReputation(arbitrator, 1); 

                        if (incentiveThisArbitrator > 0 && address(this).balance >= incentiveThisArbitrator) {
                            (bool successArbitrator, ) = payable(arbitrator).call{value: incentiveThisArbitrator}("");
                            if (successArbitrator) {
                                emit ArbitratorIncentivePaid(originalTransactionId, arbitrator, incentiveThisArbitrator);
                                // No es necesario actualizar la reputación de nuevo aquí si ya se hizo.
                            } else {
                                // El pago falló, pero la reputación ya fue acreditada por votar.
                                // Podrías emitir un evento aquí si quieres registrar fallos de pago.
                                // emit ArbitratorIncentivePaymentFailed(originalTransactionId, arbitrator, incentiveThisArbitrator);
                            }
                        }
                        // Si incentiveThisArbitrator es 0, o no hay balance, la reputación ya fue acreditada.
                    } else { 
                        // No votó en absoluto
                        _updateArbitratorReputation(arbitrator, -2); 
                    }
                }
            } else if (poolForArbitrators > 0) { 
                 if (address(this).balance >= poolForArbitrators) {
                    (bool successReturn, ) = payable(owner()).call{value: poolForArbitrators}("");
                    if(successReturn) emit UnusedIncentivesReturned(originalTransactionId, poolForArbitrators);
                 }
            }
        } else { // No hay incentivos para distribuir
             for (uint i = 0; i < dispute.disputeArbitrators.length; i++) {
                address arbitrator = dispute.disputeArbitrators[i];
                if (dispute.arbitratorHasVoted[arbitrator]) {
                    _updateArbitratorReputation(arbitrator, 1); // Votó, merece reputación positiva
                } else {
                    _updateArbitratorReputation(arbitrator, -2); // No votó
                }
            }
        }

        dispute.isResolved = true;
        dispute.isActive = false;

        secureBorrowingContract.processArbitrationOutcome( // MODIFIED: Variable name
            originalTransactionId,
            ownerWonDisputeDecision,
            penaltyToOwner,
            refundToBorrower,
            dispute.itemOwner,
            dispute.borrower
        );

        emit DisputeFinalizedInArbitration(originalTransactionId, ownerWonDisputeDecision, penaltyToOwner, refundToBorrower, msg.sender);
    }

    function updateVotingPeriod(uint256 _newPeriod) external onlyOwner {
        require(_newPeriod >= MIN_VOTING_PERIOD && _newPeriod <= MAX_VOTING_PERIOD, "Voting period out of bounds");
        disputeVotingPeriod = _newPeriod;
        emit VotingPeriodUpdated(_newPeriod);
    }

    function updateSecureBorrowing(address _newSecureBorrowingAddress) external onlyOwner { // MODIFIED: Function and parameter name
        require(_newSecureBorrowingAddress != address(0), "Invalid address"); // MODIFIED: Error message
        secureBorrowingContract = ISecureBorrowing(_newSecureBorrowingAddress); // MODIFIED: Type cast and variable name
    }

    // Función para que el owner retire fondos ETH del contrato (ej. incentivos no distribuidos o fondos enviados por error)
    function withdrawStuckETH(uint256 amount, address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH withdrawal failed");
    }

    // Función para obtener el timestamp actual, puede ser sobreescrita para testing
    function _getCurrentTimestamp() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    function getArbitratorHasVoted(uint256 originalTransactionId, address arbitrator) external view returns (bool) {
        return disputesData[originalTransactionId].arbitratorHasVoted[arbitrator];
    }

    function getVoteDetails(uint256 originalTransactionId, address arbitrator) external view returns (bool voteInFavor, uint8 severity) {
        DisputeInfo storage dispute = disputesData[originalTransactionId];
        voteInFavor = dispute.arbitratorVoteInFavorOfOwner[arbitrator];
        severity = dispute.arbitratorDamageSeverity[arbitrator];
    }

    function getDisputeVotesCasted(uint256 transactionId) external view returns (uint256) {
        return disputesData[transactionId].votesCasted;
    }
}