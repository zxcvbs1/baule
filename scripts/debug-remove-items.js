// debug-remove-items.js
const { PrismaClient } = require('@prisma/client');
const viem = require('viem');
const contractAdapter = require('./contract-adapter');

// Valores del contrato
const contractAddress = contractAdapter.secureBorrowingContractAddress;
const abi = contractAdapter.secureBorrowingABI;

async function main() {
  console.log('==============================================');
  console.log('DEBUG - BORRAR ITEMS INVÁLIDOS');
  console.log('==============================================\n');
  
  const prisma = new PrismaClient();
  
  try {
    // Primero, veamos qué base de datos estamos usando
    const databaseUrl = process.env.DATABASE_URL || 'No definido';
    console.log('URL de la base de datos:', databaseUrl);
    
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

    // Mostrar los items para confirmar
    console.log('Items con contractItemId:');
    for (const item of blockchainItems) {
      console.log(`- ID: ${item.id}, Nombre: ${item.name}, ContractItemId: ${item.contractItemId}`);
    }
    
    console.log('\n¿Deseas eliminar estos items? (s/n)');
    
    // Simular la respuesta (en una aplicación real, esto sería una entrada del usuario)
    const respuesta = 's';
    
    if (respuesta.toLowerCase() === 's') {
      console.log('\nEliminando items...');
      
      let eliminadosConExito = 0;
      let fallosAlEliminar = 0;
      
      for (const item of blockchainItems) {
        console.log(`\nIntentando eliminar item: ${item.name} (ID: ${item.id})`);
        
        try {
          // Intentar eliminar
          await prisma.item.delete({
            where: { id: item.id }
          });
          
          console.log(`✅ Item eliminado correctamente (ID: ${item.id})`);
          eliminadosConExito++;
        } catch (error) {
          console.error(`❌ Error al eliminar item (ID: ${item.id}):`, error);
          fallosAlEliminar++;
        }
      }
      
      console.log('\n==============================================');
      console.log('RESUMEN DE ELIMINACIÓN');
      console.log('==============================================');
      console.log(`Total intentados: ${blockchainItems.length}`);
      console.log(`Eliminados con éxito: ${eliminadosConExito}`);
      console.log(`Fallos al eliminar: ${fallosAlEliminar}`);
    } else {
      console.log('Operación cancelada. No se eliminó ningún item.');
    }
    
    // Verificar el estado después de la eliminación
    const itemsRestantes = await prisma.item.findMany({
      where: {
        NOT: {
          contractItemId: null
        }
      }
    });
    
    console.log(`\nDespués de la operación, quedan ${itemsRestantes.length} items con contractItemId en la base de datos`);
    
  } catch (error) {
    console.error('Error general durante la ejecución:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\nProceso completado.');
  }
}

main();
