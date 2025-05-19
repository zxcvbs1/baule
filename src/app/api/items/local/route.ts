// app/api/items/local/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Buscar elementos sin contractItemId (que no están en la blockchain)
    const localItems = await prisma.item.findMany({
      where: {
        contractItemId: null
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return NextResponse.json(localItems, { status: 200 });
  } catch (error) {
    console.error('[API /items/local GET] Error fetching local items:', error);
    return NextResponse.json({ error: 'Failed to fetch local items' }, { status: 500 });
  }
}

// Esta función permite crear elementos sin vincularlos a la blockchain
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, photoUrl, ownerAddress } = body;
    let rawBorrowingFee = body.borrowingFee;
    let rawDepositAmount = body.depositAmount;

    if (!name || !ownerAddress) {
      return NextResponse.json({ error: 'Name and owner address are required' }, { status: 400 });
    }

    function parseToBigInt(rawValue: any, fieldName: string): bigint | null {
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        console.log(`[API /items/local POST] ${fieldName} is null, undefined, or empty, returning null.`);
        return null;
      }

      let valueToParse = rawValue;
      if (typeof rawValue === 'object' && rawValue !== null && rawValue.$type === 'BigInt' && typeof rawValue.value === 'string') {
        console.log(`[API /items/local POST] ${fieldName} was a special BigInt object, extracting value: ${rawValue.value}`);
        valueToParse = rawValue.value;
      }

      try {
        // Ensure valueToParse is a string before passing to BigInt constructor
        const stringValue = String(valueToParse);
        const result = BigInt(stringValue);
        console.log(`[API /items/local POST] Parsed ${fieldName} from string '${stringValue}' to BigInt:`, result, 'type:', typeof result);
        return result;
      } catch (e: any) {
        console.error(`[API /items/local POST] Failed to parse ${fieldName} ('${valueToParse}') to BigInt:`, e.message);
        throw new Error(`Invalid ${fieldName} format: '${valueToParse}' cannot be converted to BigInt.`);
      }
    }

    let finalBorrowingFee: bigint | null = null;
    let finalDepositAmount: bigint | null = null;

    try {
      finalBorrowingFee = parseToBigInt(rawBorrowingFee, 'borrowingFee');
      finalDepositAmount = parseToBigInt(rawDepositAmount, 'depositAmount');
    } catch (parseError: any) {
      return NextResponse.json({ error: parseError.message }, { status: 400 });
    }
    
    const dataToSave = { 
      name,
      description,
      photoUrl,
      ownerAddress,
      // contractItemId es null ya que no está en la blockchain
      borrowingFee: finalBorrowingFee !== null ? finalBorrowingFee.toString() : null, 
      depositAmount: finalDepositAmount !== null ? finalDepositAmount.toString() : null, 
    };

    console.log('[API /items/local POST] Data for Prisma create (all values as strings):', dataToSave);

    const newItem = await prisma.item.create({
      data: dataToSave, 
    });

    return NextResponse.json(newItem, { status: 201 });
  } catch (error: any) {
    console.error('[API /items/local POST] Error creating local item:', error);
    if (error.code === 'P2002') { 
        return NextResponse.json({ error: `Failed to create item. An item with this identifier might already exist. Details: ${error.meta?.target}` }, { status: 409 });
    }
    if (error.message?.includes("cannot be converted to BigInt")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create local item', details: error.message }, { status: 500 });
  }
}
