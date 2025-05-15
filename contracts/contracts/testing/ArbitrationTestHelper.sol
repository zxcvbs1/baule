// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../Arbitration.sol";

// Un contrato de ayuda para testing que expone funciones de prueba
contract ArbitrationTestHelper is Arbitration {
    // Timestamp ficticio para pruebas
    uint256 private testTimestamp;
    bool private useTestTimestamp;

    constructor(address _secureBorrowingAddress, address _initialOwner) 
        Arbitration(_secureBorrowingAddress, _initialOwner) {
        useTestTimestamp = false;
    }
    
    // Función para configurar un timestamp ficticio
    function setTestTimestamp(uint256 _timestamp) external onlyOwner {
        if (_timestamp == 0) {
            useTestTimestamp = false;
        } else {
            testTimestamp = _timestamp;
            useTestTimestamp = true;
        }
    }
    
    // Esta función ahora puede usar override porque existe en el padre
    function _getCurrentTimestamp() internal view override returns (uint256) {
        return useTestTimestamp ? testTimestamp : block.timestamp;
    }
    
    // La función existente de testOpenDispute
    function testOpenDispute(
        uint256 originalTransactionId,
        address itemOwner,
        address borrower,
        uint256 depositAtStake
    ) external payable returns (bool) {
        // Calculamos el incentivo esperado
        uint256 expectedIncentivePool = (depositAtStake * INCENTIVE_PERCENTAGE_OF_DEPOSIT) / 100;
        
        // Verificamos que se envió suficiente ETH para el incentivo
        require(msg.value >= expectedIncentivePool, "Insufficient incentive pool");
        
        // Resto de la lógica igual que en openDispute, excepto la verificación del caller
        DisputeInfo storage dispute = disputesData[originalTransactionId]; // MODIFICADO: DisputeData → DisputeInfo
        require(dispute.creationTime == 0, "Dispute already active or resolved");
        
        dispute.creationTime = _getCurrentTimestamp();
        dispute.itemOwner = itemOwner;
        dispute.borrower = borrower;
        dispute.depositAtStake = depositAtStake;
        dispute.incentivePoolPaidIn = msg.value;
        dispute.isActive = true;
        dispute.isResolved = false;
        
        // Asignar los árbitros del panel actual
        dispute.disputeArbitrators = arbitratorsPanel;
        
        bool hasValidArbitrator = false;
        for (uint i = 0; i < arbitratorsPanel.length; i++) {
            if (arbitratorsPanel[i] != address(0)) {
                hasValidArbitrator = true;
                break;
            }
        }
        require(hasValidArbitrator, "No valid arbitrators set in panel");
        
        emit DisputeOpened(originalTransactionId, itemOwner, borrower, depositAtStake, msg.value);
        return true;
    }

    // Añadir esta función para testing
    function testSetDisputeInactive(uint256 originalTransactionId) external onlyOwner {
        DisputeInfo storage dispute = disputesData[originalTransactionId];
        require(dispute.creationTime > 0, "Dispute does not exist");
        dispute.isActive = false;
    }

    function testCreateDisputeAsResolved(
        uint256 originalTransactionId,
        address itemOwner,
        address borrower,
        uint256 depositAtStake
    ) external onlyOwner {
        DisputeInfo storage dispute = disputesData[originalTransactionId];
        
        // Configurar arbitradores usando el panel actual
        dispute.disputeArbitrators = arbitratorsPanel;
        
        // Crear la disputa ya resuelta
        dispute.creationTime = block.timestamp - 1 days;
        dispute.itemOwner = itemOwner;
        dispute.borrower = borrower;
        dispute.depositAtStake = depositAtStake;
        dispute.incentivePoolPaidIn = 0; // No importa para este test
        
        // Lo importante: marcar como resuelta (no activa)
        dispute.isActive = false;
        dispute.isResolved = true;
    }
}