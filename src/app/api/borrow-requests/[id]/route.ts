import { NextResponse } from 'next/server';
import { PrismaClient, BorrowRequestStatus, ItemStatus } from '@prisma/client';
// import { getAuth } from '@privy-io/server-auth';

const prisma = new PrismaClient();

interface PatchRequestBody {
  status?: BorrowRequestStatus;
  ownerSignature?: string;
  // Potentially other fields to update, e.g., transaction hash for completion
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const borrowRequestId = params.id;
  // const session = await getAuth(request.headers.get('Authorization'));
  // if (!session || !session.userId) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }
  // const privyUser = await privy.getUser(session.userId);
  // const authenticatedUserAddress = privyUser?.wallet?.address;
  // if (!authenticatedUserAddress) {
  //    return NextResponse.json({ error: 'Wallet address not found for user' }, { status: 400 });
  // }

  try {
    const body: PatchRequestBody = await request.json();
    const { status, ownerSignature } = body;
    console.log('[API PATCH /borrow-requests/{id}] Received body:', body);
    console.log(`[API PATCH /borrow-requests/{id}] Request ID: ${borrowRequestId}, Status to set: ${status}, Owner Signature: ${ownerSignature ? 'Present' : 'Missing'}`);


    const existingRequest = await prisma.borrowRequest.findUnique({
      where: { id: borrowRequestId },
      include: { item: true },
    });

    if (!existingRequest) {
      return NextResponse.json({ error: 'Borrow request not found' }, { status: 404 });
    }

    // TODO: Add logic to verify that the authenticatedUserAddress is authorized to make this change
    // e.g., if changing status to APPROVED_BY_OWNER, authenticatedUserAddress must be existingRequest.ownerAddress
    // e.g., if changing status to CANCELLED_BY_BORROWER, authenticatedUserAddress must be existingRequest.borrowerAddress

    const updateData: Partial<PatchRequestBody & { status?: BorrowRequestStatus }> = {};

    if (status) {
      updateData.status = status;
    }
    if (ownerSignature) {
      updateData.ownerSignature = ownerSignature;
    }

    // Handle specific status transitions and side effects
    if (status === BorrowRequestStatus.APPROVED_BY_OWNER) {
      if (!ownerSignature) {
        return NextResponse.json({ error: 'Owner signature is required to approve the request' }, { status: 400 });
      }
      // TODO: Validate authenticatedUserAddress is the ownerAddress
    } else if (status === BorrowRequestStatus.REJECTED_BY_OWNER) {
      // TODO: Validate authenticatedUserAddress is the ownerAddress
    } else if (status === BorrowRequestStatus.CANCELLED_BY_BORROWER) {
      // TODO: Validate authenticatedUserAddress is the borrowerAddress
      // Ensure the request is in a state that allows cancellation (e.g., PENDING_OWNER_APPROVAL)
      if (existingRequest.status !== BorrowRequestStatus.PENDING_OWNER_APPROVAL && existingRequest.status !== BorrowRequestStatus.APPROVED_BY_OWNER) {
        return NextResponse.json({ error: 'Request cannot be cancelled in its current state' }, { status: 400 });
      }
    } else if (status === BorrowRequestStatus.COMPLETED) {
      // This status should ideally be set after blockchain transaction confirmation.
      // The request to this endpoint would come from our own frontend after a successful contract call.
      // We might also want to update the item's status to 'borrowed'.
      await prisma.item.update({
        where: { id: existingRequest.itemId },
        data: { 
          status: ItemStatus.borrowed,
          // Potentially store borrowerAddress on the item if not already, or transaction details
        },
      });
    }


    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }
    
    // updateData.updatedAt = new Date(); // Prisma handles this automatically if @updatedAt is in schema

    const updatedRequest = await prisma.borrowRequest.update({
      where: { id: borrowRequestId },
      data: updateData,
    });

    console.log('[API PATCH /borrow-requests/{id}] Updated request in DB:', updatedRequest);

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error(`Error updating borrow request ${borrowRequestId}:`, error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
