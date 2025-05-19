// remove-invalid-items.js
const { PrismaClient } = require('@prisma/client');
const viem = require('viem');
const contractAdapter = require('./contract-adapter');

// Valores del contrato
const contractAddress = contractAdapter.secureBorrowingContractAddress;
const abi = contractAdapter.secureBorrowingABI;

async function main() {
  console.log('==============================================');
  console.log('ELIMINAR ITEMS INVÁLIDOS EN LA BLOCKCHAIN');
  console.log('==============================================\n');
  
  const prisma = new PrismaClient();
  const publicClient = viem.createPublicClient({
    chain: viem.chains.hardhat, 
    transport: viem.http('http://127.0.0.1:8545')
  });
  
  try {
    // Buscar items con contractItemId
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

    let itemsEliminados = 0;
    
    // Verificar cada item en la blockchain
    for (const item of blockchainItems) {
      console.log(`\nVerificando item: ${item.name} (ID: ${item.id})`);
      console.log(`contractItemId: ${item.contractItemId}`);
      
      try {
        // Consultar el contrato para verificar si el item existe
        console.log('Consultando contrato en dirección:', contractAddress);
        console.log('Con el item ID:', item.contractItemId);
        
        const itemInfo = await publicClient.readContract({
          address: contractAddress,
          abi: abi,
          functionName: 'items',
          args: [item.contractItemId]
        });
        
        console.log('Respuesta del contrato:', itemInfo);
        const ownerAddress = itemInfo[0];
        console.log(`Propietario on-chain: ${ownerAddress}`);
        
        // Verificar si el propietario es address(0)
        if (ownerAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
          console.log('❌ Item tiene propietario address(0), eliminando...');
            // Eliminar el item
          try {
            console.log(`Intentando eliminar item con ID: ${item.id}...`);
            const deleteResult = await prisma.item.delete({
              where: { id: item.id }
            });
            console.log('Resultado de eliminación:', deleteResult);
            console.log(`✅ Item eliminado (ID: ${item.id})`);
            itemsEliminados++;
          } catch (deleteError) {
            console.error(`⚠️ Error al eliminar item (ID: ${item.id}):`, deleteError);
          }
        } else {
          console.log('✅ Item válido, no se elimina');
        }
      } catch (error) {
        console.error('Error al consultar la blockchain:', error);
        console.log('❌ Error al verificar el item, se intentará eliminar...');
        
        // Intentar eliminar el item si hay un error        try {
          await prisma.item.delete({
            where: { id: item.id }
          });
          console.log(`✅ Item eliminado (ID: ${item.id})`);
          itemsEliminados++;
        } catch (deleteError) {
          console.error(`⚠️ Error al eliminar item (ID: ${item.id}):`, deleteError);
        }
      }
    }
    
    console.log('\n==============================================');
    console.log('RESUMEN');
    console.log('==============================================');
    console.log(`Total de items verificados: ${blockchainItems.length}`);
    console.log(`Items eliminados: ${itemsEliminados}`);
    
  } catch (error) {
    console.error('Error general durante la ejecución:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\nProceso completado.');
  }
}

main();
