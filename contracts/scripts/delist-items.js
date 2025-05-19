const hre = require("hardhat");

async function main() {
  const contractAddress = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"; // The contract with the items
  const itemsToDelist = [
    { itemId: "0xca95bfc89b33e617bc28631a735d1d489dd40053620ddf8711f2049ea1d9ee6b", ownerAddress: "0xC59995bD02AA8e129cbB36d22246678ac8c356b2" },
    { itemId: "0x42f0faaef32977314468e0efd8f25966fd1ae3ee606876ab6122bde2ee77bd3c", ownerAddress: "0xC59995bD02AA8e129cbB36d22246678ac8c356b2" },
    { itemId: "0x22c3bc0e372c6c201eeb21eea955676ac96d451503dc1e1e628026150c6eb49a", ownerAddress: "0x7Afb1348Eb86c2e1f8a6442f0FB724CA423eD9DE" },
  ];

  const SecureBorrowing = await hre.ethers.getContractFactory("SecureBorrowing");
  const secureBorrowing = SecureBorrowing.attach(contractAddress);

  const [funder] = await hre.ethers.getSigners(); // Default Hardhat account to fund impersonated accounts

  for (const item of itemsToDelist) {
    console.log(`\nAttempting to delist item ID: ${item.itemId} by owner: ${item.ownerAddress}`);

    try {
      // Impersonate the item owner
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [item.ownerAddress],
      });
      const ownerSigner = await hre.ethers.getSigner(item.ownerAddress);

      // Ensure the impersonated account has ETH for gas
      const balance = await hre.ethers.provider.getBalance(ownerSigner.address);
      // Check if balance is less than 0.1 ETH, for example
      if (balance < hre.ethers.parseEther("0.1")) { 
          console.log(`Funding account ${ownerSigner.address} with 1 ETH for gas...`);
          await funder.sendTransaction({
              to: ownerSigner.address,
              value: hre.ethers.parseEther("1.0") // Send 1 ETH
          });
          const newBalance = await hre.ethers.provider.getBalance(ownerSigner.address);
          console.log(`New balance for ${ownerSigner.address}: ${hre.ethers.formatEther(newBalance)} ETH`);
      }

      // Connect to the contract with the impersonated signer and call delistItem
      console.log(`Calling delistItem for ${item.itemId} as ${ownerSigner.address}...`);
      const tx = await secureBorrowing.connect(ownerSigner).delistItem(item.itemId);
      await tx.wait();
      console.log(`Successfully delisted item ID: ${item.itemId}. Transaction hash: ${tx.hash}`);

    } catch (error) {
      console.error(`Failed to delist item ID: ${item.itemId}.`);
      // Log the full error for more details, especially revert reasons
      console.error("Error details:", error);
      if (error.message.includes("SB: Item not listed")) {
        console.warn("This item might have already been delisted or its status is not 'Listed'.");
      } else if (error.message.includes("SB: Not owner")) {
        console.warn("Impersonation or owner address might be incorrect, or you are not the owner.");
      }
    } finally {
      // Stop impersonating the account
      await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [item.ownerAddress],
      });
      console.log(`Stopped impersonating ${item.ownerAddress}.`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
