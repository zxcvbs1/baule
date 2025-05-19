'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { BorrowRequestStatus, Item as PrismaItem } from '@prisma/client'; // Assuming Item is also exported or define it here
import { createWalletClient, custom, publicActions, Hex, parseEther, getContract } from 'viem';
import { hardhat } from 'viem/chains';
import { secureBorrowingABI, secureBorrowingContractAddress } from '@/lib/contract';

interface Item extends PrismaItem {
  // any additional frontend-specific fields for Item can be added here
}

interface BorrowRequest {
  id: string;
  itemId: string;
  item: Item;
  borrowerAddress: string;
  ownerAddress: string;
  status: BorrowRequestStatus;
  ownerSignature?: string | null;
  requestedAt: Date;
  updatedAt: Date;
}

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<BorrowRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const { user, authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const fetchMyRequests = useCallback(async () => {
    if (!authenticated || !user?.wallet?.address) {
      setRequests([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setMessage(null);

    const userAddress = user.wallet.address.toLowerCase();

    try {
      const response = await fetch(`/api/borrow-requests?userId=${userAddress}&asOwner=false`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch your borrow requests');
      }
      const myRequests: BorrowRequest[] = await response.json();
      console.log('[My Requests Page] Fetched requests for borrower:', JSON.stringify(myRequests, null, 2)); // <--- MODIFIED THIS LINE FOR BETTER LOGGING
      setRequests(myRequests);
    } catch (err: any) {
      console.error("Error fetching your borrow requests:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, user?.wallet?.address]);

  useEffect(() => {
    fetchMyRequests();
  }, [fetchMyRequests]);

  const handleConfirmAndPay = async (request: BorrowRequest) => {
    if (!authenticated || !user?.wallet?.address || !wallets || wallets.length === 0 || !request.ownerSignature) {
      setMessage({ text: 'Error: Wallet not connected or missing owner signature.', type: 'error' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    if (!request.item.contractItemId || !request.item.borrowingFee || !request.item.depositAmount) {
        setMessage({ text: 'Error: Item contract details (ID, fee, deposit) are missing.', type: 'error' });
        setTimeout(() => setMessage(null), 5000);
        return;
    }

    const activeWallet = wallets[0];
    const provider = await activeWallet.getEthereumProvider();
    const walletClient = createWalletClient({
      account: user.wallet.address as Hex,
      chain: hardhat,
      transport: custom(provider),
    }).extend(publicActions);

    setMessage({ text: 'Processing payment and confirming borrow...', type: 'success' });

    try {
      const itemId = request.item.contractItemId as Hex;
      const fee = parseEther(request.item.borrowingFee.toString()); // Ensure fee is string
      const deposit = parseEther(request.item.depositAmount.toString()); // Ensure deposit is string
      const totalValue = fee + deposit;
      const ownerSignature = request.ownerSignature as Hex;

      const contract = getContract({
        address: secureBorrowingContractAddress,
        abi: secureBorrowingABI,
        client: walletClient,
      });
      
      // Fetch the current item nonce from the contract for the borrowItem function
      // This nonce is specific to the borrowItem action and is different from itemNonce used for item ID generation
      const borrowItemNonce = await contract.read.getItemNonce([itemId]);


      const { request: contractRequest } = await walletClient.simulateContract({
        address: secureBorrowingContractAddress,
        abi: secureBorrowingABI,
        functionName: 'borrowItem',
        args: [itemId, ownerSignature, borrowItemNonce], // Ensure args match contract: itemId, ownerSignature, nonce
        value: totalValue,
        account: user.wallet.address as Hex,
      });

      const hash = await walletClient.writeContract(contractRequest);
      setMessage({ text: `Transaction sent: ${hash}. Waiting for confirmation...`, type: 'success' });

      const publicClientForReceipt = walletClient.extend(publicActions);
      const receipt = await publicClientForReceipt.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        setMessage({ text: 'Borrow confirmed and payment sent! Updating status...', type: 'success' });
        // Update request status to COMPLETED
        const updateResponse = await fetch(`/api/borrow-requests/${request.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            status: BorrowRequestStatus.COMPLETED,
            actingUserAddress: user.wallet.address // Pass acting user for authorization
          }),
        });

        if (!updateResponse.ok) {
          const errorData = await updateResponse.json();
          throw new Error(errorData.error || 'Failed to update request status after successful transaction.');
        }
        setMessage({ text: 'Item successfully borrowed and status updated!', type: 'success' });
        fetchMyRequests(); // Refresh the list
      } else {
        throw new Error('Blockchain transaction failed.');
      }
    } catch (err: any) {
      console.error('Error confirming borrow and paying:', err);
      let detailedMessage = 'Error confirming borrow:';
      if (err.shortMessage) detailedMessage += ` ${err.shortMessage}`;
      else if (err.message) detailedMessage += ` ${err.message}`;
      setMessage({ text: detailedMessage, type: 'error' });
      setTimeout(() => setMessage(null), 7000);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!authenticated || !user?.wallet?.address) {
      setMessage({ text: 'You must be logged in to cancel a request.', type: 'error' });
      return;
    }
    setMessage({ text: 'Cancelling request...', type: 'success' });
    try {
      const response = await fetch(`/api/borrow-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: BorrowRequestStatus.CANCELLED_BY_BORROWER,
          actingUserAddress: user.wallet.address // Pass acting user for authorization
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel borrow request.');
      }
      setMessage({ text: 'Request cancelled successfully.', type: 'success' });
      fetchMyRequests(); // Refresh list
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error cancelling request:', err);
      setMessage({ text: err.message, type: 'error' });
      setTimeout(() => setMessage(null), 5000);
    }
  };


  if (!authenticated) {
    return (
      <div className="container max-w-5xl mx-auto p-6 text-center">
        <h1 className="text-3xl font-bold mb-6">My Borrow Requests</h1>
        <p className="mb-4">Please log in to see your borrow requests.</p>
        <Button onClick={login}>Log In</Button>
      </div>
    );
  }

  if (isLoading) return <p className="text-center p-8">Loading your requests...</p>;
  if (error) return <p className="text-center text-red-500 p-8">Error: {error}</p>;

  return (
    <div className="container max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-center">My Borrow Requests</h1>
      {message && (
        <div
          className={`mb-4 p-3 rounded-md text-center ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}
      {requests.length === 0 ? (
        <p className="text-center text-gray-500">You have not made any borrow requests yet.</p>
      ) : (
        <div className="space-y-6">
          {requests.map((request) => (
            <Card key={request.id} className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl">Request for: {request.item.name}</CardTitle>
                <CardDescription>
                  Owner: {request.item.ownerAddress.slice(0,6)}...{request.item.ownerAddress.slice(-4)} | Status: <span className={`font-semibold ${
                    request.status === BorrowRequestStatus.PENDING_OWNER_APPROVAL ? 'text-yellow-600' :
                    request.status === BorrowRequestStatus.APPROVED_BY_OWNER ? 'text-blue-600' :
                    request.status === BorrowRequestStatus.COMPLETED ? 'text-green-600' :
                    request.status === BorrowRequestStatus.REJECTED_BY_OWNER ? 'text-red-600' :
                    request.status === BorrowRequestStatus.CANCELLED_BY_BORROWER ? 'text-gray-600' :
                    'text-gray-500'
                  }`}>{request.status.replace(/_/g, ' ')}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">Requested on: {new Date(request.requestedAt).toLocaleDateString()}</p>
                {request.item.photoUrl && <img src={request.item.photoUrl} alt={request.item.name} className="mt-2 rounded-md max-h-40 object-cover" />}
                <p className="mt-2 text-sm">Fee: {request.item.borrowingFee} ETH</p>
                <p className="text-sm">Deposit: {request.item.depositAmount} ETH</p>
              </CardContent>
              <CardFooter className="flex justify-end space-x-3">
                {request.status === BorrowRequestStatus.PENDING_OWNER_APPROVAL && (
                  <Button variant="outline" onClick={() => handleCancelRequest(request.id)}>Cancel Request</Button>
                )}
                {request.status === BorrowRequestStatus.APPROVED_BY_OWNER && request.ownerSignature && (
                  <Button onClick={() => handleConfirmAndPay(request)}>Confirm Borrow & Pay</Button>
                )}
                 {(request.status === BorrowRequestStatus.REJECTED_BY_OWNER || request.status === BorrowRequestStatus.CANCELLED_BY_BORROWER || request.status === BorrowRequestStatus.EXPIRED) && (
                  <p className="text-sm text-gray-500">This request is closed.</p>
                )}
                {request.status === BorrowRequestStatus.COMPLETED && (
                  <p className="text-sm text-green-600 font-semibold">Item Borrowed Successfully!</p>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

