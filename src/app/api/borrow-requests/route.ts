import { NextResponse } from 'next/server';
import { PrismaClient, BorrowRequestStatus } from '@prisma/client';
// import { getAuth } from '@privy-io/server-auth'; // Assuming you'll use Privy for server-side auth

const prisma = new PrismaClient();

export async function GET(request: Request) {
  // const session = await getAuth(request.headers.get('Authorization'));
  // if (!session || !session.userId) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }
  // const privyUser = await privy.getUser(session.userId);
  // const authenticatedUserAddress = privyUser?.wallet?.address;
  // if (!authenticatedUserAddress) {
  //    return NextResponse.json({ error: 'Wallet address not found for user' }, { status: 400 });
  // }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId'); // This should eventually be authenticatedUserAddress
  const asOwner = searchParams.get('asOwner') === 'true';

  if (!userId) {
    // TODO: Once Privy auth is integrated, this check should be for authenticatedUserAddress
    return NextResponse.json({ error: 'Missing userId query parameter' }, { status: 400 });
  }

  try {
    let requests;
    if (asOwner) {
      requests = await prisma.borrowRequest.findMany({
        where: {
          ownerAddress: {
            equals: userId, // Removed mode: 'insensitive'
          },
          status: BorrowRequestStatus.PENDING_OWNER_APPROVAL,
        },
        include: { 
          item: true, // Include related item details
        },
        orderBy: { requestedAt: 'desc' },
      });
    } else {
      requests = await prisma.borrowRequest.findMany({
        where: {
          borrowerAddress: {
            equals: userId, // Removed mode: 'insensitive'
          },
        },
        include: { 
          item: true, // Include related item details
        },
        orderBy: { requestedAt: 'desc' },
      });
    }
    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error fetching borrow requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
  // No prisma.$disconnect() needed here for Next.js as Prisma manages connections
}

export async function POST(request: Request) {
  // TODO: Implement proper server-side authentication to get borrowerAddress
  // For now, we'll expect it in the body or handle it once Privy server-side auth is set up.
  // const session = await getAuth(request.headers.get('Authorization'));
  // if (!session || !session.userId) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }
  // const privyUser = await privy.getUser(session.userId);
  // const borrowerAddressAuthenticated = privyUser?.wallet?.address;
  // if (!borrowerAddressAuthenticated) {
  //    return NextResponse.json({ error: 'Wallet address not found for user' }, { status: 400 });
  // }

  try {
    const body = await request.json();
    // const { itemId } = body; // borrowerAddress should come from session
    // For now, taking borrowerAddress from body until Privy auth is fully integrated
    const { itemId, borrowerAddress } = body; 


    if (!itemId || !borrowerAddress) { // Should be just !itemId once auth is integrated
      return NextResponse.json({ error: 'Missing itemId or borrowerAddress' }, { status: 400 });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (!item.contractItemId) {
      return NextResponse.json({ error: 'Item is not listed on the blockchain' }, { status: 400 });
    }

    if (item.status !== 'available') {
      return NextResponse.json({ error: 'Item is not available for borrowing' }, { status: 400 });
    }

    if (item.ownerAddress.toLowerCase() === borrowerAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot borrow your own item' }, { status: 400 });
    }

    // Check for existing active borrow request by the same borrower for the same item
    const existingRequest = await prisma.borrowRequest.findFirst({
      where: {
        itemId: itemId,
        borrowerAddress: {
          equals: borrowerAddress, // Removed mode: 'insensitive'
        },
        status: {
          in: [BorrowRequestStatus.PENDING_OWNER_APPROVAL, BorrowRequestStatus.APPROVED_BY_OWNER],
        },
      },
    });

    if (existingRequest) {
      return NextResponse.json({ error: 'An active borrow request for this item already exists' }, { status: 409 });
    }

    const borrowRequest = await prisma.borrowRequest.create({
      data: {
        itemId: itemId,
        borrowerAddress: borrowerAddress,
        ownerAddress: item.ownerAddress,
        status: BorrowRequestStatus.PENDING_OWNER_APPROVAL,
      },
    });

    return NextResponse.json(borrowRequest, { status: 201 });
  } catch (error) {
    console.error('Error creating borrow request:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH Handler for updating borrow requests
export async function PATCH(request: Request) {
  // TODO: Implement proper server-side authentication to get the acting user's address
  // const session = await getAuth(request.headers.get('Authorization'));
  // if (!session || !session.userId) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }
  // const privyUser = await privy.getUser(session.userId);
  // const actingUserAddress = privyUser?.wallet?.address;
  // if (!actingUserAddress) {
  //    return NextResponse.json({ error: 'Wallet address not found for user' }, { status: 400 });
  // }

  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId');
    const body = await request.json();
    const { status, ownerSignature, actingUserAddress } = body; // Temporarily taking actingUserAddress from body

    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId in query parameters' }, { status: 400 });
    }

    if (!status || !actingUserAddress) {
      return NextResponse.json({ error: 'Missing status or actingUserAddress in request body' }, { status: 400 });
    }

    const borrowRequest = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: { item: true },
    });

    if (!borrowRequest) {
      return NextResponse.json({ error: 'Borrow request not found' }, { status: 404 });
    }

    let updatedRequest;

    // Logic for owner actions
    if (actingUserAddress.toLowerCase() === borrowRequest.ownerAddress.toLowerCase()) {
      if (status === BorrowRequestStatus.APPROVED_BY_OWNER) {
        if (!ownerSignature) {
          return NextResponse.json({ error: 'Missing ownerSignature for approval' }, { status: 400 });
        }
        updatedRequest = await prisma.borrowRequest.update({
          where: { id: requestId },
          data: { status: BorrowRequestStatus.APPROVED_BY_OWNER, ownerSignature },
        });
      } else if (status === BorrowRequestStatus.REJECTED_BY_OWNER) {
        updatedRequest = await prisma.borrowRequest.update({
          where: { id: requestId },
          data: { status: BorrowRequestStatus.REJECTED_BY_OWNER },
        });
      } else {
        return NextResponse.json({ error: 'Invalid status update for owner' }, { status: 400 });
      }
    } 
    // Logic for borrower actions
    else if (actingUserAddress.toLowerCase() === borrowRequest.borrowerAddress.toLowerCase()) {
      if (status === BorrowRequestStatus.CANCELLED_BY_BORROWER) {
        // Add validation: can only cancel if PENDING_OWNER_APPROVAL or APPROVED_BY_OWNER (before completion)
        if (borrowRequest.status !== BorrowRequestStatus.PENDING_OWNER_APPROVAL && borrowRequest.status !== BorrowRequestStatus.APPROVED_BY_OWNER) {
          return NextResponse.json({ error: 'Request cannot be cancelled at its current state' }, { status: 400 });
        }
        updatedRequest = await prisma.borrowRequest.update({
          where: { id: requestId },
          data: { status: BorrowRequestStatus.CANCELLED_BY_BORROWER },
        });
      } else if (status === BorrowRequestStatus.COMPLETED) {
        // This status is set after successful on-chain transaction by the borrower
        // Potentially, update item status here as well or have a separate mechanism
        if (borrowRequest.status !== BorrowRequestStatus.APPROVED_BY_OWNER) {
          return NextResponse.json({ error: 'Request must be approved by owner before completion' }, { status: 400 });
        }
        // Update item status to 'borrowed'
        await prisma.item.update({
          where: { id: borrowRequest.itemId },
          data: { 
            status: 'borrowed', 
            borrowerAddress: borrowRequest.borrowerAddress,
            // currentTransactionId: body.transactionId // If you pass transactionId from frontend
          },
        });
        updatedRequest = await prisma.borrowRequest.update({
          where: { id: requestId },
          data: { status: BorrowRequestStatus.COMPLETED },
        });

      } else {
        return NextResponse.json({ error: 'Invalid status update for borrower' }, { status: 400 });
      }
    } 
    // If acting user is neither owner nor borrower
    else {
      return NextResponse.json({ error: 'User not authorized to update this request' }, { status: 403 });
    }

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error('Error updating borrow request:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
