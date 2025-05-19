const hre = require("hardhat");

async function main() {
  const contractAddress = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"; // Contract to query events from

  console.log(`Querying ItemListed and ItemDelisted events from contract at ${contractAddress}...`);

  try {
    const SecureBorrowing = await hre.ethers.getContractFactory("SecureBorrowing");
    const secureBorrowing = SecureBorrowing.attach(contractAddress);

    // Define filters for both event types
    const listedEventFilter = secureBorrowing.filters.ItemListed();
    const delistedEventFilter = secureBorrowing.filters.ItemDelisted();

    // Query both types of events
    const listedEventsRaw = await secureBorrowing.queryFilter(listedEventFilter, 0, "latest");
    const delistedEventsRaw = await secureBorrowing.queryFilter(delistedEventFilter, 0, "latest");

    // Add a type property to each event and combine them
    const allEvents = [];
    listedEventsRaw.forEach(event => allEvents.push({ ...event, type: 'ItemListed' }));
    delistedEventsRaw.forEach(event => allEvents.push({ ...event, type: 'ItemDelisted' }));

    // Sort events chronologically by block number, then by log index within the block
    allEvents.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      return a.logIndex - b.logIndex;
    });

    if (allEvents.length === 0) {
      console.log("No ItemListed or ItemDelisted events found for this contract.");
      return;
    }

    console.log(`
--- Found ${allEvents.length} Total Event(s) (ItemListed & ItemDelisted) ---`);
    allEvents.forEach(event => {
      if (event.type === 'ItemListed') {
        const { itemId, owner, fee, deposit, minBorrowerReputation } = event.args;
        console.log("\n  --- ItemListed Event ---");
        console.log(`  Block: ${event.blockNumber}, Log Index: ${event.logIndex}`);
        console.log(`  Item ID: ${itemId}`);
        console.log(`  Owner: ${owner}`);
        console.log(`  Fee: ${hre.ethers.formatEther(fee)} ETH`);
        console.log(`  Deposit: ${hre.ethers.formatEther(deposit)} ETH`);
        console.log(`  Min Borrower Reputation: ${minBorrowerReputation.toString()}`);
        console.log(`  Transaction Hash: ${event.transactionHash}`);
      } else if (event.type === 'ItemDelisted') {
        const { itemId, owner } = event.args;
        console.log("\n  --- ItemDelisted Event ---");
        console.log(`  Block: ${event.blockNumber}, Log Index: ${event.logIndex}`);
        console.log(`  Item ID: ${itemId}`);
        console.log(`  Owner (who delisted): ${owner}`);
        console.log(`  Transaction Hash: ${event.transactionHash}`);
      }
    });

  } catch (error) {
    console.error("\nError querying events:", error.message);
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
