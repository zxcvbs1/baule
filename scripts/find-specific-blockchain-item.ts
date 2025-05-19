// scripts/find-specific-blockchain-item.ts
// @ts-nocheck
const { PrismaClient } = require('@prisma/client');

// Argumentos de la línea de comandos
const args = process.argv.slice(2);
const contractItemIdArg = args.find(arg => arg.startsWith('--id='))?.split('=')[1];
const ownerAddressArg = args.find(arg => arg.startsWith('--owner='))?.split('=')[1];

async function main() {
  console.log('Iniciando búsqueda de elementos específicos...');
  
  const prisma = new PrismaClient();
  
  try {    // Construir las condiciones de búsqueda
    const whereCondition = {};
    if (contractItemIdArg) {
      whereCondition.contractItemId = contractItemIdArg;
      console.log(`Buscando elemento con ID en blockchain: ${contractItemIdArg}`);
    }
    
    if (ownerAddressArg) {
      whereCondition.ownerAddress = ownerAddressArg;
      console.log(`Filtrando por dirección de propietario: ${ownerAddressArg}`);
    }
    
    // Si no se proporcionaron argumentos, buscar todos los elementos
    if (!contractItemIdArg && !ownerAddressArg) {
      console.log('No se proporcionaron filtros. Mostrando todos los elementos:');
    }
    
    const items = await prisma.item.findMany({
      where: whereCondition,
      orderBy: {
        createdAt: 'desc',
      }
    });
    
    console.log(`\nEncontrados ${items.length} elementos:`);
    console.log('\n===================================================');
      if (items.length === 0) {
      console.log('No se encontraron elementos con los criterios especificados.');
    } else {
      items.forEach(function(item, index) {
        console.log(`\nItem #${index + 1}:`);
        console.log(`ID en base de datos: ${item.id}`);
        console.log(`Nombre: ${item.name}`);
        console.log(`Descripción: ${item.description || 'Sin descripción'}`);
        console.log(`Dirección del propietario: ${item.ownerAddress}`);
        console.log(`Estado: ${item.status}`);
        console.log(`ID en blockchain: ${item.contractItemId || 'No está en blockchain'}`);
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
