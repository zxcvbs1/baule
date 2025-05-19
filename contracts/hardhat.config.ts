import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-chai-matchers";
import { task } from "hardhat/config";

task("accounts", "Imprime la lista de todas las cuentas", async (taskArgs, hre) => {
  const accounts = await hre.viem.getWalletClients();
  
  console.log("Lista de cuentas:");
  for (const account of accounts) {
    console.log(account.account.address);
  }
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // Add this line
    },
  },
};

export default config;
