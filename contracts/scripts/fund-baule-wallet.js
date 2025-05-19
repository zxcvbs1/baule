const hre = require("hardhat");

async function main() {
  const [sender] = await hre.ethers.getSigners();
  const recipientAddress = "0x7Afb1348Eb86c2e1f8a6442f0FB724CA423eD9DE";
  const amountToSend = hre.ethers.parseEther("1.0"); // Send 1 ETH

  console.log(`Attempting to send 1 ETH from ${sender.address} to ${recipientAddress}`);

  const tx = await sender.sendTransaction({
    to: recipientAddress,
    value: amountToSend,
  });

  console.log(`Transaction initiated: ${tx.hash}`);
  await tx.wait();
  console.log(`Transaction confirmed: 1 ETH sent to ${recipientAddress}`);

  const balance = await hre.ethers.provider.getBalance(recipientAddress);
  console.log(`Balance of ${recipientAddress}: ${hre.ethers.formatEther(balance)} ETH`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
