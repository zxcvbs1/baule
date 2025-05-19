// scripts/verify-blockchain-items.ts
const { PrismaClient } = require('@prisma/client');
const viem = require('viem');
const viemChains = require('viem/chains');
const contractAdapter = require('./contract-adapter');

// Extract the needed imports
const createPublicClient = viem.createPublicClient;
const http = viem.http;
const hardhat = viemChains.hardhat;
const secureBorrowingContractAddress = contractAdapter.secureBorrowingContractAddress;
const secureBorrowingABI = contractAdapter.secureBorrowingABI;

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
const fixFlag = args.includes('--fix');
const removeFlag = args.includes('--remove');

async function main() {
  console.log('==============================================');
  console.log('VERIFICACIÓN DE ITEMS EN LA BLOCKCHAIN');
  console.log('==============================================\n');

  if (fixFlag) {
    console.log('Modo: FIX (se actualizarán los items incorrectos)');
  } else if (removeFlag) {
    console.log('Modo: REMOVE (se eliminarán los items incorrectos)');
  } else {
    console.log('Modo: SOLO VERIFICACIÓN (no se realizarán cambios)');
    console.log('Use --fix para actualizar items o --remove para eliminarlos');
  }
  console.log('');
    const prisma = new PrismaClient();
  const publicClient = viem.createPublicClient({
    chain: viemChains.hardhat, 
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

    let itemsNoEncontrados = 0;

    // Verificar cada item en la blockchain
    for (const item of blockchainItems) {
      console.log(`\nVerificando item: ${item.name} (ID: ${item.id})`);
      console.log(`contractItemId: ${item.contractItemId}`);
        try {        // Consultar el contrato para verificar si el item existe
        const itemInfo = await publicClient.readContract({
          address: secureBorrowingContractAddress,
          abi: secureBorrowingABI,
          functionName: 'items',
          args: [item.contractItemId as `0x${string}`]
        });
          // Si llegamos aquí, el item existe en la blockchain
        console.log('✅ Item verificado en la blockchain');
        console.log(`Propietario on-chain: ${itemInfo[0]}`);
        console.log(`Propietario en base de datos: ${item.ownerAddress}`);
        
        // Verificar si el propietario es address(0), lo que indica que no existe realmente
        if (itemInfo[0].toLowerCase() === '0x0000000000000000000000000000000000000000') {
          console.log('❌ Item tiene propietario address(0), lo que indica que NO existe en la blockchain');
          itemsNoEncontrados++;
          
          if (fixFlag) {
            await prisma.item.update({
              where: { id: item.id },
              data: { contractItemId: null }
            });
            console.log('✅ Item actualizado: contractItemId establecido a null');
          } else if (removeFlag) {
            await prisma.item.delete({
              where: { id: item.id }
            });
            console.log('✅ Item eliminado de la base de datos');
          }
        }
        // Verificar si el propietario coincide (solo para items válidos)
        else if (itemInfo[0].toLowerCase() !== item.ownerAddress.toLowerCase()) {
          console.log('⚠️ ADVERTENCIA: Las direcciones de propietario no coinciden');
          
          if (fixFlag) {
            await prisma.item.update({
              where: { id: item.id },
              data: { ownerAddress: itemInfo[0] }
            });
            console.log('✅ Dirección de propietario actualizada en la base de datos');
          }
        }
      } catch (error) {
        // Si hay un error, asumimos que el item no existe en la blockchain
        console.log('❌ Item NO encontrado en la blockchain');
        itemsNoEncontrados++;
        
        if (fixFlag) {
          await prisma.item.update({
            where: { id: item.id },
            data: { contractItemId: null }
          });
          console.log('✅ Item actualizado: contractItemId establecido a null');
        } else if (removeFlag) {
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
    console.log(`Items encontrados en blockchain: ${blockchainItems.length - itemsNoEncontrados}`);
    console.log(`Items NO encontrados en blockchain: ${itemsNoEncontrados}`);
    
    if (itemsNoEncontrados > 0) {
      if (fixFlag) {
        console.log(`\n✅ Se actualizaron ${itemsNoEncontrados} items (contractItemId = null)`);
      } else if (removeFlag) {
        console.log(`\n✅ Se eliminaron ${itemsNoEncontrados} items de la base de datos`);
      } else {
        console.log('\n⚠️ Use --fix para actualizar estos items o --remove para eliminarlos');
      }
    }
    
  } catch (error) {
    console.error('Error durante la verificación:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\nVerificación completada.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error en la ejecución del script:', error);
    process.exit(1);
  });
