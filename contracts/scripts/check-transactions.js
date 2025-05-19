const hre = require("hardhat");

async function main() {
  const txHashes = [
    "0x42f0faaef32977314468e0efd8f25966fd1ae3ee606876ab6122bde2ee77bd3c" // Replaced with the new hash
  ];

  if (txHashes.length === 0) {
    console.log("No transaction hashes provided to check.");
    return;
  }

  console.log("Checking status of transactions on Hardhat network...");

  for (const txHash of txHashes) {
    console.log(`\n--- Checking Transaction: ${txHash} ---`);
    try {
      const txReceipt = await hre.ethers.provider.getTransactionReceipt(txHash);

      if (txReceipt) {
        console.log("Transaction Receipt Found:");
        console.log("  Block Number:", txReceipt.blockNumber.toString());
        console.log("  Status:", txReceipt.status === 1 ? "Success" : "Failed/Reverted");
        console.log("  From:", txReceipt.from);
        console.log("  To:", txReceipt.to); // This should be your SecureBorrowing contract address
        console.log("  Gas Used:", txReceipt.gasUsed.toString());
        
        if (txReceipt.status !== 1) {
          console.warn(`  Transaction ${txHash} FAILED or was reverted.`);
        } else {
          console.log(`  Transaction ${txHash} was successful.`);
          // You could add further checks here, e.g., decoding logs if you know the event signature
        }
      } else {
        console.warn(`  Transaction ${txHash} not found or not yet mined.`);
        console.log("  This could mean it's still pending, or the hash is incorrect, or it's on a different network.");
      }
    } catch (error) {
      console.error(`  Error checking transaction ${txHash}:`, error.message);
    }
  }
  console.log("\n--- Finished Checking Transactions ---");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
