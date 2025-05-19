// simple-verify.js
const { PrismaClient } = require('@prisma/client');
const viem = require('viem');
const contractAdapter = require('./contract-adapter');

// Usar el adaptador para obtener la dirección del contrato y el ABI
const contractAddress = contractAdapter.secureBorrowingContractAddress;
const abi = contractAdapter.secureBorrowingABI;

async function main() {
  console.log('==============================================');
  console.log('VERIFICACIÓN SIMPLE DE ITEMS EN LA BLOCKCHAIN');
  console.log('==============================================\n');
  
  const prisma = new PrismaClient();
  const publicClient = viem.createPublicClient({
    chain: viem.chains.hardhat, 
    transport: viem.http('http://127.0.0.1:8545')
  });
  
  try {
    // Buscar items con contractItemId (que deberían estar en blockchain)
    const blockchainItems = await prisma.item.findMany({
      where: {
        NOT: {
          contractItemId: null
        }
      }
    });
    
    console.log(`Encontrados ${blockchainItems.length} items con contractItemId en la base de datos\n`);
    
    if (blockchainItems.length === 0) {
      console.log('No hay items que verificar.');
      return;
    }

    let itemsValidos = 0;
    let itemsNoValidos = 0;
    
    // Preguntar al usuario qué quiere hacer con los items no válidos
    console.log('¿Qué quieres hacer con los items que no existen en la blockchain?');
    console.log('1. Solo mostrar (no hacer cambios)');
    console.log('2. Marcar como no-blockchain (establecer contractItemId a null)');
    console.log('3. Eliminar completamente de la base de datos');
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Elige una opción (1, 2 o 3): ', async (opcion) => {
      readline.close();
      
      const modo = opcion.trim();
      console.log('');
      
      // Verificar cada item en la blockchain
      for (const item of blockchainItems) {
        console.log(`\nVerificando item: ${item.name} (ID: ${item.id})`);
        console.log(`contractItemId: ${item.contractItemId}`);
        
        try {
          // Consultar el contrato para verificar si el item existe
          const itemInfo = await publicClient.readContract({
            address: contractAddress,
            abi: abi,
            functionName: 'items',
            args: [item.contractItemId]
          });
          
          // Si llegamos aquí, el item existe en la blockchain
          console.log('✅ Item verificado en la blockchain');
          console.log(`Propietario on-chain: ${itemInfo[0]}`);
          console.log(`Propietario en base de datos: ${item.ownerAddress}`);
          
          itemsValidos++;
        } catch (error) {
          // Si hay un error, asumimos que el item no existe en la blockchain
          console.log('❌ Item NO encontrado en la blockchain');
          itemsNoValidos++;
          
          if (modo === '2') {
            await prisma.item.update({
              where: { id: item.id },
              data: { contractItemId: null }
            });
            console.log('✅ Item actualizado: contractItemId establecido a null');
          } else if (modo === '3') {
            await prisma.item.delete({
              where: { id: item.id }
            });
            console.log('✅ Item eliminado de la base de datos');
          }
        }
      }
      
      console.log('\n==============================================');
      console.log('RESUMEN DE VERIFICACIÓN');
      console.log('==============================================');
      console.log(`Total de items verificados: ${blockchainItems.length}`);
      console.log(`Items válidos en blockchain: ${itemsValidos}`);
      console.log(`Items NO válidos en blockchain: ${itemsNoValidos}`);
      
      if (itemsNoValidos > 0) {
        if (modo === '1') {
          console.log('\nNo se realizaron cambios (modo solo mostrar)');
        } else if (modo === '2') {
          console.log(`\n✅ Se actualizaron ${itemsNoValidos} items (contractItemId = null)`);
        } else if (modo === '3') {
          console.log(`\n✅ Se eliminaron ${itemsNoValidos} items de la base de datos`);
        }
      }
      
      await prisma.$disconnect();
      console.log('\nVerificación completada.');
    });
    
  } catch (error) {
    console.error('Error durante la verificación:', error);
    await prisma.$disconnect();
  }
}

main();
