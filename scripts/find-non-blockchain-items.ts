// scripts/find-non-blockchain-items.ts
// @ts-nocheck
const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('Iniciando búsqueda de elementos no vinculados a la blockchain...');
  
  const prisma = new PrismaClient();
  
  try {
    // Buscar elementos sin contractItemId (no vinculados a la blockchain)
    const localItems = await prisma.item.findMany({
      where: {
        contractItemId: null
      },
      orderBy: {
        createdAt: 'desc',
      }
    });
    
    console.log(`Encontrados ${localItems.length} elementos no vinculados a la blockchain:`);
    console.log('\n===================================================');
    
    if (localItems.length === 0) {
      console.log('No se encontraron elementos sin vínculo a la blockchain.');
    } else {
      localItems.forEach((item, index) => {
        console.log(`\nItem #${index + 1}:`);
        console.log(`ID: ${item.id}`);
        console.log(`Nombre: ${item.name}`);
        console.log(`Descripción: ${item.description || 'Sin descripción'}`);
        console.log(`Dirección del propietario: ${item.ownerAddress}`);
        console.log(`Estado: ${item.status}`);
        console.log(`Fecha de creación: ${item.createdAt.toLocaleString()}`);
        
        if (item.borrowingFee) {
          console.log(`Tarifa de préstamo: ${item.borrowingFee} wei`);
        }
        
        if (item.depositAmount) {
          console.log(`Depósito: ${item.depositAmount} wei`);
        }
        
        console.log('---------------------------------------------------');
      });
    }
    
    // Buscar elementos con contractItemId (vinculados a la blockchain)
    const blockchainItems = await prisma.item.findMany({
      where: {
        NOT: {
          contractItemId: null
        }
      },
      orderBy: {
        createdAt: 'desc',
      }
    });
    
    console.log(`\nEncontrados ${blockchainItems.length} elementos vinculados a la blockchain.`);
    
    if (blockchainItems.length > 0) {
      console.log('\n===================================================');
      console.log('IDs de elementos vinculados a la blockchain:');
      blockchainItems.forEach((item, index) => {
        console.log(`${index + 1}. ${item.name} - ContractItemId: ${item.contractItemId}`);
      });
    }
    
  } catch (error) {
    console.error('Error al buscar elementos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\nBúsqueda completada.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error en la ejecución del script:', error);
    process.exit(1);
  });
