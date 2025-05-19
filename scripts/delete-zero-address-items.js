// delete-zero-address-items.js
const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('==============================================');
  console.log('ELIMINAR ITEMS CON DIRECCIÓN PROPIETARIO 0x0');
  console.log('==============================================\n');
  
  const prisma = new PrismaClient();
  
  try {
    // Buscar elementos con dirección del propietario 0x0
    const zeroAddressItems = await prisma.item.findMany({
      where: {
        ownerAddress: '0x0000000000000000000000000000000000000000'
      }
    });
    
    console.log(`Encontrados ${zeroAddressItems.length} items con dirección del propietario 0x0\n`);
    
    if (zeroAddressItems.length === 0) {
      console.log('No hay items que eliminar.');
      return;
    }

    // Mostrar los items para confirmar
    console.log('Items a eliminar:');
    for (const item of zeroAddressItems) {
      console.log(`- ID: ${item.id}, Nombre: ${item.name}`);
    }
    
    console.log('\nEliminando items...');
    
    let eliminadosConExito = 0;
    
    for (const item of zeroAddressItems) {
      try {
        await prisma.item.delete({
          where: { id: item.id }
        });
        
        console.log(`✅ Item eliminado: ${item.name} (ID: ${item.id})`);
        eliminadosConExito++;
      } catch (error) {
        console.error(`❌ Error al eliminar item ${item.id}:`, error);
      }
    }
    
    console.log(`\nSe eliminaron ${eliminadosConExito} de ${zeroAddressItems.length} items con dirección 0x0`);
    
    // Verificar
    const remainingItems = await prisma.item.findMany({
      where: {
        ownerAddress: '0x0000000000000000000000000000000000000000'
      }
    });
    
    if (remainingItems.length > 0) {
      console.log(`\n⚠️ Todavía quedan ${remainingItems.length} items con dirección 0x0 en la base de datos.`);
    } else {
      console.log('\n✅ No quedan items con dirección 0x0 en la base de datos.');
    }
    
  } catch (error) {
    console.error('Error general:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\nProceso completado.');
  }
}

main();
