// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SecureBorrowingLedgerV6 is ReentrancyGuard {
    using ECDSA for bytes32;

    struct ItemInfo {
        address owner;
        uint256 nonce;
        uint256 fee;
        uint256 deposit;
        bytes32 metadataHash;
        bool isAvailable;
    }

    struct Transaction {
        address borrower;
        bytes32 itemId; // Añadido para mapear transactionId → itemId
        uint256 feePaid;
        uint256 depositPaid;
        uint256 returnTime;
        bool isSettled;
        bool damageReported;
    }

    event ItemListed(bytes32 indexed itemId, address owner, uint256 fee, uint256 deposit);
    event TransactionCreated(uint256 indexed transactionId, bytes32 itemId, address borrower);
    event TransactionSettled(uint256 indexed transactionId, uint256 refund, uint256 penalty);

    bytes32 private constant BORROW_TYPEHASH = keccak256(
        "Borrow(bytes32 itemId,uint256 fee,uint256 deposit,uint256 nonce,address borrower)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(bytes32 => ItemInfo) public items;
    mapping(uint256 => Transaction) public transactions;
    mapping(address => int256) public ownerReputation;
    mapping(address => int256) public borrowerReputation;
    uint256 public transactionCount;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("SecureBorrowingLedgerV6"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    function listItem(
        bytes32 itemId,
        uint256 fee,
        uint256 deposit,
        bytes32 metadataHash
    ) external {
        if (items[itemId].owner == address(0)) {
            items[itemId] = ItemInfo({
                owner: msg.sender,
                nonce: 0,
                fee: fee,
                deposit: deposit,
                metadataHash: metadataHash,
                isAvailable: true
            });
            emit ItemListed(itemId, msg.sender, fee, deposit);
        } else {
            require(msg.sender == items[itemId].owner, "No autorizado");
            
            // Solo actualizar si hay cambios
            if (items[itemId].fee != fee || 
                items[itemId].deposit != deposit || 
                items[itemId].metadataHash != metadataHash) {
                
                items[itemId].fee = fee;
                items[itemId].deposit = deposit;
                items[itemId].metadataHash = metadataHash;
                emit ItemListed(itemId, msg.sender, fee, deposit);
            }
        }
    }

    function borrowItem(
        bytes32 itemId,
        uint256 fee,
        uint256 deposit,
        bytes calldata ownerSignature
    ) external payable nonReentrant {
        ItemInfo storage item = items[itemId];
        require(item.owner != address(0), "Item no existe");
        require(msg.value >= fee + deposit, "Pago insuficiente");

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                BORROW_TYPEHASH,
                itemId,
                fee,
                deposit,
                item.nonce,
                msg.sender
            ))
        ));
        require(digest.recover(ownerSignature) == item.owner, "Firma invalida");

        item.nonce++;
        item.isAvailable = false;

        transactions[transactionCount] = Transaction({
            borrower: msg.sender,
            itemId: itemId, // Guardamos itemId en la transacción
            feePaid: fee,
            depositPaid: deposit,
            returnTime: 0,
            isSettled: false,
            damageReported: false
        });

        if (fee > 0) {
            payable(item.owner).transfer(fee);
        }

        emit TransactionCreated(transactionCount, itemId, msg.sender);
        transactionCount++;
    }

    function settleTransaction(uint256 transactionId, bool reportDamage) external nonReentrant {
        Transaction storage txn = transactions[transactionId];
        require(!txn.isSettled, "Ya liquidado");
        ItemInfo storage item = items[txn.itemId]; // Usamos itemId guardado en la transacción

        require(
            msg.sender == txn.borrower || msg.sender == item.owner,
            "No autorizado"
        );

        txn.isSettled = true;
        txn.returnTime = block.timestamp;

        if (reportDamage && msg.sender == item.owner) {
            txn.damageReported = true;
        }

        uint256 refund = txn.depositPaid;
        uint256 penalty = 0;

        if (txn.damageReported) {
            penalty = (txn.depositPaid * 50) / 100;
            refund -= penalty;
            payable(item.owner).transfer(penalty);
            ownerReputation[item.owner] += 1;
            borrowerReputation[txn.borrower] -= 2;
        } else {
            ownerReputation[item.owner] += 1;
            borrowerReputation[txn.borrower] += 1;
        }

        if (refund > 0) {
            payable(txn.borrower).transfer(refund);
        }

        item.isAvailable = true;
        emit TransactionSettled(transactionId, refund, penalty);
    }
}