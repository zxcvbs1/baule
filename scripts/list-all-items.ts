// scripts/list-all-items.ts
const { PrismaClient } = require('@prisma/client');

// Definir tipos para el Item basado en el schema de Prisma
interface Item {
  id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  ownerAddress: string;
  borrowerAddress: string | null;
  status: string;
  borrowingFee: string | null; 
  depositAmount: string | null; 
  contractItemId: string | null;
  itemNonce: string | null; // Added itemNonce
  transactionId: string | null;
  blockNumber: bigint | null; // Added blockNumber
  createdAt: Date;
  updatedAt: Date;
}

async function main() {
  console.log('==============================================');
  console.log('LISTADO COMPLETO DE TODOS LOS ITEMS EN LA BD');
  console.log('==============================================\n');
  
  const prisma = new PrismaClient();
  
  try {
    // Consultar todos los elementos ordenados por fecha de creación (más reciente primero)
    const items: Item[] = await prisma.item.findMany({
      orderBy: {
        createdAt: 'desc',
      }
    });
    
    console.log(`Se encontraron ${items.length} elementos en total\n`);
    
    // Mostrar todos los campos de cada elemento
    items.forEach((item: Item, index: number) => {
      console.log(`\n${'-'.repeat(50)}`);
      console.log(`ITEM #${index + 1}`);
      console.log(`${'-'.repeat(50)}`);
      
      // Mostrar todos los campos disponibles
      console.log(`ID en BD:             ${item.id}`);
      console.log(`Nombre:               ${item.name}`);
      console.log(`Descripción:          ${item.description || 'N/A'}`);
      console.log(`URL de la foto:       ${item.photoUrl || 'N/A'}`);
      console.log(`Dirección del dueño:  ${item.ownerAddress}`);
      console.log(`Dirección prestador:  ${item.borrowerAddress || 'N/A'}`);
      console.log(`Estado:               ${item.status}`);
      console.log(`Tarifa préstamo:      ${item.borrowingFee || 'N/A'}`);
      console.log(`Depósito:             ${item.depositAmount || 'N/A'}`);
      console.log(`ID en blockchain:     ${item.contractItemId || 'NO ESTÁ EN BLOCKCHAIN'}`);
      console.log(`Nonce del item (UUID):${item.itemNonce || 'N/A'}`); // Added itemNonce display
      console.log(`ID de transacción:    ${item.transactionId || 'N/A'}`);
      console.log(`Número de bloque:     ${item.blockNumber !== null && item.blockNumber !== undefined ? item.blockNumber.toString() : 'N/A'}`); // Added blockNumber display
      console.log(`Fecha de creación:    ${item.createdAt.toLocaleString()}`);
      console.log(`Última actualización: ${item.updatedAt.toLocaleString()}`);
      
      // Indicador visual simple para ítems en blockchain vs locales
      const isOnBlockchain = item.contractItemId ? true : false;
      console.log(`Tipo:                 ${isOnBlockchain ? 'BLOCKCHAIN' : 'LOCAL'}`);
      
      console.log(`${'-'.repeat(50)}`);
    });
    
    // Estadísticas de resumen
    const blockchainItems = items.filter((item: Item) => item.contractItemId !== null);
    const localItems = items.filter((item: Item) => item.contractItemId === null);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log('RESUMEN');
    console.log(`${'='.repeat(50)}`);
    console.log(`Total de elementos:           ${items.length}`);
    console.log(`Elementos en blockchain:      ${blockchainItems.length}`);
    console.log(`Elementos locales (sin BC):   ${localItems.length}`);
    console.log(`${'='.repeat(50)}\n`);
    
  } catch (error) {
    console.error('Error al consultar la base de datos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('Consulta completada exitosamente.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error en la ejecución del script:', error);
    process.exit(1);
  });