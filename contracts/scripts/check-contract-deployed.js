// scripts/check-contract-deployed.js
const hre = require("hardhat");

async function main() {
  // Define the addresses to check directly in the script
  let addressesToCheck = [
    "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    "0x0165878A594ca255338adfa4d48449f69242Eb8F"
    // Add more addresses here if needed
  ];

  // The previous logic for parsing process.argv has been removed.
  
  // Remove duplicates, if any were present in the hardcoded list.
  addressesToCheck = [...new Set(addressesToCheck)];

  if (addressesToCheck.length === 0) {
    console.log("Error: La lista 'addressesToCheck' en el script está vacía. Por favor, defina las direcciones directamente en el script.");
    process.exit(1);
  }

  console.log(`Chequeando direcciones en la red: ${hre.network.name}`);

  for (const address of addressesToCheck) {
    try {
      // No es necesario chequear hre.ethers.isAddress(address) de nuevo si el filtrado de arriba es bueno.
      // Pero lo mantenemos por seguridad.
      if (!hre.ethers.isAddress(address)) {
        console.log(`- ${address}: Formato de dirección Ethereum inválido.`);
        continue;
      }
      const code = await hre.ethers.provider.getCode(address);
      if (code && code !== "0x" && code !== "0x0") {
        console.log(`- ${address}: Código encontrado (probablemente un contrato). Longitud del bytecode: ${code.length}`);
      } else {
        console.log(`- ${address}: No se encontró código (probablemente una EOA o contrato vacío/destruido).`);
      }
    } catch (error) {
      console.error(`- ${address}: Error al chequear la dirección: ${error.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
