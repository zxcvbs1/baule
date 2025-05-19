// Este script lista todos los eventos ItemListed emitidos por el contrato SecureBorrowing.

const viem = require('viem');
const viemChains = require('viem/chains');
const contractAdapter = require('./contract-adapter'); // Usamos el adaptador para la ABI y dirección

// Extraer las importaciones necesarias de viem y el adaptador
const createPublicClient = viem.createPublicClient;
const http = viem.http;
const hardhat = viemChains.hardhat; // Asumimos que estamos trabajando con la red Hardhat
const { secureBorrowingContractAddress, secureBorrowingABI } = contractAdapter;

async function main() {
  console.log('==============================================');
  console.log('LISTADO DE EVENTOS ItemListed');
  console.log('==============================================\n');

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http('http://127.0.0.1:8545'), // URL RPC de tu nodo Hardhat
  });

  try {
    console.log(`Consultando eventos ItemListed para el contrato: ${secureBorrowingContractAddress}\n`);

    // Obtener los logs de los eventos ItemListed
    // Nos aseguramos de que 'ItemListed' es el nombre exacto del evento en tu ABI
    // y que la ABI en contract-adapter.js incluye este evento.
    // const itemListedLogs = await publicClient.getLogs({
    //   address: secureBorrowingContractAddress,
    //   event: viem.parseAbiItem('event ItemListed(bytes32 indexed itemId, address indexed owner, uint256 fee, uint256 deposit, bytes32 metadataHash)'),
    //   fromBlock: 0n, // Desde el bloque génesis
    //   toBlock: 'latest', // Hasta el último bloque
    // });

    // Alternativa: Usar eventName y el ABI completo.
    // Esto ayuda a verificar si el ABI cargado por contract-adapter.js es correcto.
    const itemListedLogs = await publicClient.getLogs({
      address: secureBorrowingContractAddress,
      abi: secureBorrowingABI, // El ABI completo del contract-adapter
      eventName: 'ItemListed',    // Nombre del evento como string
      fromBlock: 0n,
      toBlock: 'latest',
    });

    if (itemListedLogs.length === 0) {
      console.log('No se encontraron eventos ItemListed.');
      return;
    }

    console.log(`Se encontraron ${itemListedLogs.length} eventos ItemListed:\n`);

    itemListedLogs.forEach((log, index) => {
      const { itemId, owner, fee, deposit, metadataHash } = log.args;
      console.log(`Evento #${index + 1}:`);
      console.log(`  ID del Item (bytes32): ${itemId}`);
      console.log(`  Propietario: ${owner}`);
      console.log(`  Tarifa (wei): ${fee?.toString()}`);
      console.log(`  Depósito (wei): ${deposit?.toString()}`);
      console.log(`  Hash de Metadatos (bytes32): ${metadataHash}`);
      console.log(`  Block Number: ${log.blockNumber?.toString()}`);
      console.log(`  Transaction Hash: ${log.transactionHash}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Error al obtener los eventos ItemListed:', error);
  }
}

main()
  .then(() => {
    console.log('\nConsulta de eventos completada.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error en la ejecución del script:', error);
    process.exit(1);
  });
