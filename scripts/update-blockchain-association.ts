// scripts/update-blockchain-association.ts
// @ts-nocheck
const { PrismaClient } = require('@prisma/client');

// Argumentos de la línea de comandos
const args = process.argv.slice(2);
const dbItemIdArg = args.find(arg => arg.startsWith('--dbid='))?.split('=')[1];
const contractItemIdArg = args.find(arg => arg.startsWith('--blockchainid='))?.split('=')[1];
const removeFlag = args.includes('--remove');

if (!dbItemIdArg) {
  console.error('Error: Debe especificar el ID de la base de datos del elemento con --dbid=ID');
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Verificar si el elemento existe
    const existingItem = await prisma.item.findUnique({
      where: {
        id: dbItemIdArg
      }
    });
    
    if (!existingItem) {
      console.error(`Error: No se encontró ningún elemento con el ID de base de datos ${dbItemIdArg}`);
      process.exit(1);
    }
    
    console.log('Elemento encontrado:');
    console.log(`- ID: ${existingItem.id}`);
    console.log(`- Nombre: ${existingItem.name}`);
    console.log(`- ID actual en blockchain: ${existingItem.contractItemId || 'No asociado'}`);
    
    let updateData: any = {};
    
    if (removeFlag) {
      // Eliminar asociación con la blockchain
      updateData.contractItemId = null;
      console.log('\nEliminando asociación con la blockchain...');
    } else if (contractItemIdArg) {
      // Actualizar con nuevo ID de blockchain
      updateData.contractItemId = contractItemIdArg;
      console.log(`\nActualizando asociación a ID de blockchain: ${contractItemIdArg}`);
    } else {
      console.error('Error: Debe especificar un ID de blockchain con --blockchainid=ID o usar --remove para eliminar la asociación');
      process.exit(1);
    }
    
    // Actualizar el elemento
    const updatedItem = await prisma.item.update({
      where: {
        id: dbItemIdArg
      },
      data: updateData
    });
    
    console.log('\nElemento actualizado con éxito:');
    console.log(`- ID: ${updatedItem.id}`);
    console.log(`- Nombre: ${updatedItem.name}`);
    console.log(`- ID en blockchain: ${updatedItem.contractItemId || 'No asociado'}`);
    
  } catch (error) {
    console.error('Error al actualizar el elemento:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\nOperación completada.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error en la ejecución del script:', error);
    process.exit(1);
  });
