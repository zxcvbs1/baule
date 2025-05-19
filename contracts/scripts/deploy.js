const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy Arbitration contract first
  const ArbitrationFactory = await hre.ethers.getContractFactory("Arbitration");
  const arbitration = await ArbitrationFactory.deploy(deployer.address);
  await arbitration.waitForDeployment(); // Wait for deployment to complete
  const arbitrationAddress = await arbitration.getAddress(); // Get the deployed address
  console.log("Arbitration contract deployed to:", arbitrationAddress);

  // Deploy SecureBorrowing contract, passing the Arbitration contract's address
  const SecureBorrowingFactory = await hre.ethers.getContractFactory("SecureBorrowing");
  const secureBorrowing = await SecureBorrowingFactory.deploy(deployer.address, arbitrationAddress); // Use the resolved address
  await secureBorrowing.waitForDeployment(); // Wait for deployment to complete
  const secureBorrowingAddress = await secureBorrowing.getAddress(); // Get the deployed address
  console.log("SecureBorrowing contract deployed to:", secureBorrowingAddress);

  // After deploying both, set the SecureBorrowing address in the Arbitration contract
  console.log(`\nCalling updateSecureBorrowing on Arbitration contract (${arbitrationAddress}) with SecureBorrowing address (${secureBorrowingAddress})...`);
  // Use the 'arbitration' contract instance for the call
  const tx = await arbitration.updateSecureBorrowing(secureBorrowingAddress);
  await tx.wait(); // Wait for the transaction to be mined
  console.log("updateSecureBorrowing transaction successful:", tx.hash);

  // Verify the address was set (optional)
  // Use the 'arbitration' contract instance for the call
  const storedSecureBorrowingAddress = await arbitration.secureBorrowingContract();
  console.log("SecureBorrowing address stored in Arbitration contract:", storedSecureBorrowingAddress);
  if (storedSecureBorrowingAddress !== secureBorrowingAddress) {
    console.error("Error: SecureBorrowing address was not set correctly in Arbitration contract!");
  } else {
    console.log("Successfully set SecureBorrowing address in Arbitration contract.");
  }

  console.log("\n--- Deployment Complete ---");
  console.log("Arbitration contract address:", arbitrationAddress);
  console.log("SecureBorrowing contract address:", secureBorrowingAddress);
  console.log("Deployer address:", deployer.address);
  console.log("Make sure to update these addresses in your frontend configuration.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
