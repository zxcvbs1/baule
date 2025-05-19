// scripts/delete-all-items.ts
const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('==============================================');
  console.log('     ELIMINAR TODOS LOS ITEMS DE LA BD      ');
  console.log('==============================================\n');
  
  const prisma = new PrismaClient();
  
  try {
    const itemCount = await prisma.item.count();
    console.log(`Actualmente hay ${itemCount} items en la base de datos.\n`);

    if (itemCount === 0) {
      console.log('No hay items para eliminar. La base de datos ya está vacía.');
      // No es necesario desconectar explícitamente aquí si el script va a terminar.
      // El finally se encargará de ello si prisma fue instanciado.
      return;
    }
    
    console.log('⚠️  ADVERTENCIA: Esta operación eliminará TODOS los items de la base de datos.');
    console.log('⚠️  Esta acción NO SE PUEDE DESHACER.');
    console.log('⚠️  Los items en blockchain seguirán existiendo en la blockchain pero');
    console.log('⚠️  se perderá la conexión con ellos en la base de datos local.');
    
    const blockchainItems = await prisma.item.count({
      where: {
        NOT: { contractItemId: null }
      }
    });
    
    const localItems = await prisma.item.count({
      where: {
        contractItemId: null
      }
    });
    
    console.log('\nSe eliminarán:');
    console.log(`- ${localItems} items locales (no en blockchain)`);
    console.log(`- ${blockchainItems} items vinculados a la blockchain`);
    console.log('La referencia a estos items se perderá en la base de datos local.\n');
    
    // Primero, eliminar todas las solicitudes de préstamo para evitar errores de clave foránea
    const deletedBorrowRequestsCount = await prisma.borrowRequest.deleteMany({});
    console.log(`🧹 Se eliminaron ${deletedBorrowRequestsCount.count} solicitudes de préstamo.`);

    // Luego, eliminar todos los items
    const { count } = await prisma.item.deleteMany({});
    
    console.log(`\n✅ Operación completada. Se eliminaron ${count} items de la base de datos.`);
    
    const remainingItems = await prisma.item.count();
    if (remainingItems === 0) {
      console.log('✅ La base de datos ahora está vacía.');
    } else {
      console.log(`⚠️ Aún quedan ${remainingItems} items en la base de datos.`);
    }
    
  } catch (error) {
    console.error('❌ Error al eliminar los items:', error);
  } finally {
    if (prisma) { // Solo desconectar si prisma fue instanciado
      await prisma.$disconnect();
    }
  }
}

main()
  .catch((e) => {
    console.error('❌ Error en el script principal:', e);
    process.exit(1);
  });