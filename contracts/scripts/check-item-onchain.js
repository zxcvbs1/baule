const hre = require("hardhat");

async function main() {
  const itemIdToCheck = "0xf8eeb93fb60c495be550a3c61662ebc9043640e6c129b0aeaccdda290b69b712"
  const secureBorrowingContractAddress = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"; // Address from previous deployment

  if (!hre.ethers.isBytesLike(itemIdToCheck) || hre.ethers.dataLength(itemIdToCheck) !== 32) {
    console.error(`Error: Invalid itemId \"${itemIdToCheck}\". It must be a 32-byte hex string (bytes32).`);
    process.exit(1);
  }

  console.log(`Checking if itemId: ${itemIdToCheck} exists on the SecureBorrowing contract at ${secureBorrowingContractAddress}...`);

  try {
    const SecureBorrowing = await hre.ethers.getContractFactory("SecureBorrowing");
    const secureBorrowing = SecureBorrowing.attach(secureBorrowingContractAddress);

    const itemInfo = await secureBorrowing.items(itemIdToCheck);
    const ownerAddress = itemInfo.owner;

    if (ownerAddress && ownerAddress !== hre.ethers.ZeroAddress) {
      console.log("\n--- Item Found on Blockchain ---");
      console.log(`Item ID: ${itemIdToCheck}`);
      console.log(`  Owner: ${itemInfo.owner}`);
      console.log(`  Nonce: ${itemInfo.nonce.toString()}`);
      console.log(`  Fee: ${hre.ethers.formatEther(itemInfo.fee)} ETH`);
      console.log(`  Deposit: ${hre.ethers.formatEther(itemInfo.deposit)} ETH`);
      console.log(`  Metadata Hash: ${itemInfo.metadataHash}`);
      console.log(`  Is Available: ${itemInfo.isAvailable}`);
      console.log(`  Min Borrower Reputation: ${itemInfo.minBorrowerReputation.toString()}`);
    } else {
      console.log("\n--- Item Not Found ---");
      console.log(`Item ID: ${itemIdToCheck} is not listed or has been delisted from the contract.`);
      console.log(`  Returned Owner Address: ${ownerAddress}`);
    }
  } catch (error) {
    console.error("\nError checking item on blockchain:", error.message);
    if (error.message.includes("contract not found") || error.message.includes("call revert exception")) {
        console.error("This could be due to an incorrect contract address, the contract not being deployed on this network, or an issue with the network connection.");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
