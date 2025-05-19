// app/api/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, photoUrl, ownerAddress, itemId, itemNonce, transactionId } = body; 
    let rawBorrowingFee = body.borrowingFee;
    let rawDepositAmount = body.depositAmount;

    console.log('[API /items POST] Received rawBorrowingFee:', rawBorrowingFee, 'type:', typeof rawBorrowingFee);
    console.log('[API /items POST] Received rawDepositAmount:', rawDepositAmount, 'type:', typeof rawDepositAmount);

    if (!name || !ownerAddress) {
      return NextResponse.json({ error: 'Name and owner address are required' }, { status: 400 });
    }
    if (!itemId) { // Assuming itemId is now contractItemId (a string hash)
      return NextResponse.json({ error: 'Item ID (contractItemId) is required' }, { status: 400 });
    }
    if (!itemNonce) { // <-- NUEVO: Validar itemNonce
      return NextResponse.json({ error: 'Item Nonce (itemNonce) is required' }, { status: 400 });
    }

    function parseToBigInt(rawValue: any, fieldName: string): bigint | null {
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        console.log(`[API /items POST] ${fieldName} is null, undefined, or empty, returning null.`);
        return null;
      }

      let valueToParse = rawValue;
      if (typeof rawValue === 'object' && rawValue !== null && rawValue.$type === 'BigInt' && typeof rawValue.value === 'string') {
        console.log(`[API /items POST] ${fieldName} was a special BigInt object, extracting value: ${rawValue.value}`);
        valueToParse = rawValue.value;
      }

      try {
        // Ensure valueToParse is a string before passing to BigInt constructor
        const stringValue = String(valueToParse);
        const result = BigInt(stringValue);
        console.log(`[API /items POST] Parsed ${fieldName} from string '${stringValue}' to BigInt:`, result, 'type:', typeof result);
        return result;
      } catch (e: any) {
        console.error(`[API /items POST] Failed to parse ${fieldName} ('${valueToParse}') to BigInt:`, e.message);
        throw new Error(`Invalid ${fieldName} format: '${valueToParse}' cannot be converted to BigInt.`);
      }
    }

    let finalBorrowingFee: bigint | null = null;
    let finalDepositAmount: bigint | null = null;
    // let finalContractItemId: bigint | null = null; // No necesitamos convertir contractItemId a BigInt para guardarlo

    try {
      finalBorrowingFee = parseToBigInt(rawBorrowingFee, 'borrowingFee');
      finalDepositAmount = parseToBigInt(rawDepositAmount, 'depositAmount');
    } catch (parseError: any) {
      return NextResponse.json({ error: parseError.message }, { status: 400 });
    }    // Convert itemId (hex string) to BigInt primitive and then to String for Prisma
    if (itemId) { 
      if (typeof itemId !== 'string' || !/^0x[0-9a-fA-F]+$/.test(itemId)) {
        console.error(`[API /items POST] Invalid hex format for itemId: ${itemId}`);
        return NextResponse.json({ error: `Invalid itemId hex format: ${itemId}. Must be a 0x-prefixed hex string.` }, { status: 400 });
      }
      try {
        // For display/logging only - we actually save the string representation
        const tempBigInt = BigInt(itemId); 
        console.log(`[API /items POST] Converted itemId (hex string) '${itemId}' to BigInt primitive for reference:`, tempBigInt);
      } catch (e: any) {
        console.error(`[API /items POST] Failed to convert itemId hex string '${itemId}' to BigInt:`, e.message);
        return NextResponse.json({ error: `Invalid itemId format '${itemId}'. Could not convert hex to BigInt.` }, { status: 400 });
      }
    } else {
      // This case should ideally be caught by the earlier !itemId check, but good for robustness
      return NextResponse.json({ error: 'Item ID (contractItemId) is required and was not provided or was invalid before conversion.' }, { status: 400 });
    }
    
    const dataToSave: any = { 
      name,
      description,
      photoUrl,
      ownerAddress: ownerAddress ? ownerAddress.toLowerCase() : null, // Store in lowercase
      contractItemId: itemId, // Raw hex string
      itemNonce, 
      borrowingFee: finalBorrowingFee !== null ? finalBorrowingFee.toString() : null, 
      depositAmount: finalDepositAmount !== null ? finalDepositAmount.toString() : null,
      transactionId: transactionId, 
      // blockNumber related logic removed
    };

    console.log('[API /items POST] Data for Prisma create:', dataToSave);
    console.log('[API /items POST] Type of contractItemId for Prisma:', typeof dataToSave.contractItemId, 'Value:', dataToSave.contractItemId);
    console.log('[API /items POST] Type of borrowingFee for Prisma:', typeof dataToSave.borrowingFee, 'Value:', dataToSave.borrowingFee);
    console.log('[API /items POST] Type of depositAmount for Prisma:', typeof dataToSave.depositAmount, 'Value:', dataToSave.depositAmount);

    const newItem = await prisma.item.create({
      data: dataToSave,
    });

    // Convertir BigInts a strings para la respuesta JSON
    // Aseguramos que todos los campos que podrían ser BigInt en el modelo Prisma
    // se conviertan a string para la serialización JSON.
    const serializableNewItem = {
      ...newItem,
      borrowingFee: newItem.borrowingFee?.toString() ?? null,
      depositAmount: newItem.depositAmount?.toString() ?? null,
      // itemNonce, contractItemId, transactionId are already strings or null
      // blockNumber serialization removed
    };

    console.log('[API /items POST] Serializable newItem for response:', serializableNewItem);
    return NextResponse.json(serializableNewItem, { status: 201 });
  } catch (error: any) {
    console.error('[API /items POST] Error creating item:', error);
    if (error.code === 'P2002') { 
        return NextResponse.json({ error: `Failed to create item. An item with this identifier might already exist. Details: ${error.meta?.target}` }, { status: 409 });
    }
    if (error.message?.includes("cannot be converted to BigInt")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create item', details: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) { // Added NextRequest type for searchParams
  try {
    const { searchParams } = new URL(request.url);
    const ownerAddressQuery = searchParams.get('ownerAddress');

    let whereCondition = {};
    if (ownerAddressQuery) {
      whereCondition = {
        ownerAddress: ownerAddressQuery.toLowerCase(), // Query with lowercase
      };
    }

    const items = await prisma.item.findMany({
      where: whereCondition, // Apply filter if ownerAddress is provided
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Convertir BigInts a strings para cada item en la respuesta JSON
    const serializableItems = items.map(item => ({
      ...item,
      borrowingFee: item.borrowingFee?.toString() ?? null,
      depositAmount: item.depositAmount?.toString() ?? null,
      // blockNumber serialization removed
    }));

    return NextResponse.json(serializableItems, { status: 200 });
  } catch (error: any) { // Added :any to error
    console.error('[API /items GET] Error fetching items:', error);
    // It's good practice to provide the actual error message in development or under a flag
    return NextResponse.json({ error: 'Failed to fetch items', details: error.message }, { status: 500 });
  }
}
