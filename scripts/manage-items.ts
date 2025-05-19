// scripts/manage-items.ts
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
  transactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Procesar argumentos de la línea de comandos
const args = process.argv.slice(2);
const action = args.find(arg => arg.startsWith('--action='))?.split('=')[1];
const itemIdArg = args.find(arg => arg.startsWith('--id='))?.split('=')[1];
const fieldArg = args.find(arg => arg.startsWith('--field='))?.split('=')[1];
const valueArg = args.find(arg => arg.startsWith('--value='))?.split('=')[1];

async function main() {
  console.log('==============================================');
  console.log('GESTIÓN DE ITEMS EN LA BASE DE DATOS');
  console.log('==============================================\n');
  
  const prisma = new PrismaClient();
  
  try {
    // Si no se proporciona acción, mostrar ayuda
    if (!action) {
      showHelp();
      return;
    }
    
    // Casos según la acción solicitada
    switch (action) {
      case 'list':
        await listItems(prisma);
        break;
      case 'delete':
        await deleteItem(prisma, itemIdArg);
        break;
      case 'edit':
        await editItem(prisma, itemIdArg, fieldArg, valueArg);
        break;
      default:
        console.log(`Acción desconocida: ${action}`);
        showHelp();
    }
    
  } catch (error) {
    console.error('Error en la operación:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Función para mostrar todos los ítems con sus IDs
async function listItems(prisma: any) {
  const items: Item[] = await prisma.item.findMany({
    orderBy: {
      createdAt: 'desc',
    }
  });
  
  console.log(`Se encontraron ${items.length} elementos en total\n`);
  
  items.forEach((item: Item, index: number) => {
    console.log(`\n${'-'.repeat(50)}`);
    console.log(`ITEM #${index + 1} - ID: ${item.id}`);
    console.log(`${'-'.repeat(50)}`);
    console.log(`Nombre:               ${item.name}`);
    console.log(`Descripción:          ${item.description || 'N/A'}`);
    console.log(`Dirección del dueño:  ${item.ownerAddress}`);
    console.log(`Estado:               ${item.status}`);
    console.log(`ID en blockchain:     ${item.contractItemId || 'NO ESTÁ EN BLOCKCHAIN'}`);
    console.log(`Tipo:                 ${item.contractItemId ? 'BLOCKCHAIN' : 'LOCAL'}`);
  });
}

// Función para eliminar un ítem específico
async function deleteItem(prisma: any, itemId: string | undefined) {
  if (!itemId) {
    console.log('Error: Debe proporcionar un ID de ítem para eliminar.');
    console.log('Ejemplo: npm run db:manage -- --action=delete --id=clXYZ123');
    return;
  }
  
  // Verificar que el ítem existe
  const item = await prisma.item.findUnique({
    where: { id: itemId }
  });
  
  if (!item) {
    console.log(`Error: No se encontró ningún ítem con ID: ${itemId}`);
    return;
  }

  // Obtener la dirección de propietario para verificación
  const ownerArg = args.find(arg => arg.startsWith('--owner='))?.split('=')[1];
  
  if (!ownerArg) {
    console.log('Error: Debe proporcionar la dirección del propietario para verificar la propiedad.');
    console.log('Ejemplo: npm run db:manage -- --action=delete --id=clXYZ123 --owner=0x123... --confirm');
    return;
  }

  // Verificar que la dirección proporcionada coincide con el propietario del ítem
  if (ownerArg.toLowerCase() !== item.ownerAddress.toLowerCase()) {
    console.log(`Error: La dirección proporcionada no coincide con el propietario del ítem.`);
    console.log(`Propietario registrado: ${item.ownerAddress}`);
    console.log(`Dirección proporcionada: ${ownerArg}`);
    return;
  }
  
  // Mostrar información del ítem a eliminar
  console.log('Se eliminará el siguiente ítem:');
  console.log(`ID: ${item.id}`);
  console.log(`Nombre: ${item.name}`);
  console.log(`Tipo: ${item.contractItemId ? 'BLOCKCHAIN' : 'LOCAL'}\n`);
  
  // Confirmar con un argumento extra para evitar eliminaciones accidentales
  const confirmArg = args.find(arg => arg === '--confirm');
  
  if (!confirmArg) {
    console.log('Para confirmar la eliminación, agregue el argumento --confirm');
    console.log('Ejemplo: npm run db:manage -- --action=delete --id=clXYZ123 --owner=0x123... --confirm');
    return;
  }
  
  // Eliminar el ítem
  await prisma.item.delete({
    where: { id: itemId }
  });
  
  console.log(`¡El ítem con ID ${itemId} ha sido eliminado con éxito!`);
}

// Función para editar un campo específico de un ítem
async function editItem(prisma: any, itemId: string | undefined, field: string | undefined, value: string | undefined) {
  if (!itemId || !field) {
    console.log('Error: Debe proporcionar un ID de ítem y un campo para editar.');
    console.log('Ejemplo: npm run db:manage -- --action=edit --id=clXYZ123 --field=name --value="Nuevo nombre"');
    return;
  }
  
  // Verificar que el ítem existe
  const item = await prisma.item.findUnique({
    where: { id: itemId }
  });
  
  if (!item) {
    console.log(`Error: No se encontró ningún ítem con ID: ${itemId}`);
    return;
  }

  // Obtener la dirección de propietario para verificación
  const ownerArg = args.find(arg => arg.startsWith('--owner='))?.split('=')[1];
  
  if (!ownerArg) {
    console.log('Error: Debe proporcionar la dirección del propietario para verificar la propiedad.');
    console.log('Ejemplo: npm run db:manage -- --action=edit --id=clXYZ123 --field=name --value="Nuevo nombre" --owner=0x123...');
    return;
  }

  // Verificar que la dirección proporcionada coincide con el propietario del ítem
  if (ownerArg.toLowerCase() !== item.ownerAddress.toLowerCase()) {
    console.log(`Error: La dirección proporcionada no coincide con el propietario del ítem.`);
    console.log(`Propietario registrado: ${item.ownerAddress}`);
    console.log(`Dirección proporcionada: ${ownerArg}`);
    return;
  }
  
  // Verificar que el campo existe
  const validFields = ['name', 'description', 'photoUrl', 'status', 'borrowingFee', 'depositAmount', 'contractItemId', 'ownerAddress'];
  
  if (!validFields.includes(field)) {
    console.log(`Error: Campo inválido: ${field}`);
    console.log(`Campos válidos: ${validFields.join(', ')}`);
    return;
  }
  
  // Mostrar información actual
  console.log('Información actual del ítem:');
  console.log(`ID: ${item.id}`);
  console.log(`Nombre: ${item.name}`);
  console.log(`${field}: ${item[field as keyof typeof item] || 'N/A'}\n`);
  
  // Confirmar cambio
  if (value === undefined) {
    console.log('Error: Debe proporcionar un valor para el campo.');
    console.log('Ejemplo: npm run db:manage -- --action=edit --id=clXYZ123 --field=name --value="Nuevo nombre"');
    return;
  }
  
  // Preparar los datos para actualizar
  const updateData: Record<string, any> = {};
  
  // Manejar casos especiales (conversiones de tipos)
  if (field === 'contractItemId' && value.toLowerCase() === 'null') {
    updateData[field] = null;
  } else if ((field === 'borrowingFee' || field === 'depositAmount') && !isNaN(Number(value))) {
    updateData[field] = value;
  } else {
    updateData[field] = value;
  }
  
  // Actualizar el ítem
  await prisma.item.update({
    where: { id: itemId },
    data: updateData
  });
  
  // Verificar que se actualizó correctamente
  const updatedItem = await prisma.item.findUnique({
    where: { id: itemId }
  });
  
  console.log('\nÍtem actualizado con éxito:');
  console.log(`ID: ${updatedItem.id}`);
  console.log(`${field}: ${updatedItem[field as keyof typeof updatedItem] || 'null'}`);
}

// Función para mostrar la ayuda
function showHelp() {
  console.log('Uso del script manage-items.ts:\n');
  console.log('1. Listar todos los ítems:');
  console.log('   npm run db:manage -- --action=list\n');
  
  console.log('2. Eliminar un ítem específico:');
  console.log('   npm run db:manage -- --action=delete --id=ID_DEL_ITEM --confirm\n');
  
  console.log('3. Editar un campo de un ítem:');
  console.log('   npm run db:manage -- --action=edit --id=ID_DEL_ITEM --field=NOMBRE_CAMPO --value=NUEVO_VALOR\n');
  
  console.log('Campos editables:');
  console.log('- name: Nombre del ítem');
  console.log('- description: Descripción del ítem');
  console.log('- photoUrl: URL de la foto');
  console.log('- status: Estado (available, borrowed, etc.)');
  console.log('- borrowingFee: Tarifa de préstamo');
  console.log('- depositAmount: Depósito');
  console.log('- contractItemId: ID en blockchain (use "null" para eliminar la asociación)');
  console.log('- ownerAddress: Dirección del propietario\n');
  
  console.log('Ejemplos:');
  console.log('- Editar nombre: npm run db:manage -- --action=edit --id=clXYZ123 --field=name --value="Nuevo nombre"');
  console.log('- Eliminar asociación blockchain: npm run db:manage -- --action=edit --id=clXYZ123 --field=contractItemId --value=null');
}

main()
  .then(() => {
    console.log('\nOperación completada exitosamente.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error en la ejecución del script:', error);
    process.exit(1);
  });
