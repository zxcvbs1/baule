// src/app/list-item/page.tsx
'use client';

import { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createWalletClient, custom, createPublicClient, http } from 'viem';
import { keccak256, stringToBytes } from 'viem';
import { v4 as uuidv4 } from 'uuid'; // Importar uuid
import { hardhat } from 'viem/chains'; // Import hardhat chain
import { secureBorrowingContractAddress, secureBorrowingABI } from '@/lib/contract'; // Corrected ABI import name
import { usePrivy, useWallets } from '@privy-io/react-auth';

// Import shadcn/ui components as needed
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ListItemPage() {
  const router = useRouter();
  const { user, ready } = usePrivy(); // Get user info and ready state from Privy
  const { wallets } = useWallets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState(''); // For simplicity, direct URL input
  const [borrowingFee, setBorrowingFee] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListing, setIsListing] = useState(false);
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);

  // Effect to log wallets when they change or the page loads
  useEffect(() => {
    if (ready) {
      const walletInfos = wallets.map(w => `${w.walletClientType} (${w.address.slice(0, 6)}...${w.address.slice(-4)})`);
      setAvailableWallets(walletInfos);
      console.log('Available wallets:', walletInfos);
      
      if (wallets.length === 0 && user?.wallet) {
        console.log('User has a wallet but no wallets in the wallets array:', user.wallet.address);
      }
    }
  }, [wallets, ready, user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!user || !user.wallet) {
      setError('Please connect your wallet to list an item.');
      setIsLoading(false);
      return;
    }

    const ownerAddress = user.wallet.address as `0x${string}`; // Ensure type is 0x${string}

    if (!name) {
      setError('Item name is required.');
      setIsLoading(false);
      return;
    }

    // Generar un UUID (nonce) para este item
    const itemNonce = uuidv4();

    // Generate itemId as keccak256 hash of itemNonce and owner address
    const itemId = keccak256(stringToBytes(`${itemNonce}-${ownerAddress}`));
    const metadataHash = keccak256(stringToBytes(description));
    setIsListing(true);

    // La lógica de save to off-chain ahora la haremos DESPUÉS de la transacción blockchain
    try {

      // 2. Interact with smart contract
      console.log('Wallets detected:', wallets.map(w => `${w.walletClientType} (${w.address})`));
      
      // Try to find a wallet that can be used for transactions
      let activeWallet = null;
      
      // First try Privy embedded wallet
      activeWallet = wallets.find(wallet => 
        wallet.walletClientType === 'privy' || 
        wallet.walletClientType === 'embedded'
      );
      
      // If no embedded wallet found, try to find a wallet matching user's primary wallet
      if (!activeWallet && user?.wallet) {
        console.log('Trying to match with primary wallet address:', user.wallet.address);
        activeWallet = wallets.find(wallet => 
          wallet.address.toLowerCase() === user.wallet.address.toLowerCase()
        );
      }
      
      // As a fallback, just use any available wallet
      if (!activeWallet && wallets.length > 0) {
        console.log('Using first available wallet as fallback');
        activeWallet = wallets[0];
      }
      
      if (!activeWallet) {
        console.error('No compatible wallet found');
        setError('No compatible wallet found. Please ensure you are logged in with a wallet that supports transactions.');
        setIsListing(false);
        setIsLoading(false);
        return;
      }
      
      console.log('Selected wallet for transaction:', activeWallet.walletClientType, activeWallet.address);

      // Ensure the wallet is on the correct chain (Hardhat)
      if (activeWallet.chainId !== `eip155:${hardhat.id}`) {
        try {
          console.log(`Switching chain to Hardhat (ID: ${hardhat.id})`);
          await activeWallet.switchChain(hardhat.id);
        } catch (switchError) {
          console.error('Failed to switch chain:', switchError);
          alert(`Failed to switch to Hardhat network (Chain ID: ${hardhat.id}). Please switch manually in your wallet or ensure Hardhat is running.`);
          setIsListing(false);
          setIsLoading(false);
          return;
        }
      }
      
      const publicClient = createPublicClient({
        chain: hardhat, 
        transport: http('http://127.0.0.1:8545') 
      });

      console.log('Preparing to call listItem on smart contract...');
      const feeInWei = borrowingFee ? BigInt(Math.round(parseFloat(borrowingFee) * 1e18)) : BigInt(0);
      const depositInWei = depositAmount ? BigInt(Math.round(parseFloat(depositAmount) * 1e18)) : BigInt(0);

      const { request } = await publicClient.simulateContract({
        address: secureBorrowingContractAddress,
        abi: secureBorrowingABI,
        functionName: 'listItem',
        args: [
          itemId,
          feeInWei,
          depositInWei,
          metadataHash,
          BigInt(0), 
        ],
        account: ownerAddress, 
      });

      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: ownerAddress, 
        chain: hardhat, // Use hardhat chain for the wallet client
        transport: custom(provider),
      });

      const hash = await walletClient.writeContract(request);

      console.log('Transaction hash:', hash);
      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log('Transaction receipt:', receipt);
      if (receipt.status === 'success') {
        // Ahora que la transacción blockchain fue exitosa, guardamos en la base de datos
        const response = await fetch('/api/items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            description,
            photoUrl,
            ownerAddress,
            itemId, 
            itemNonce, // <-- NUEVO: Enviar itemNonce
            borrowingFee: borrowingFee ? BigInt(Math.round(parseFloat(borrowingFee) * 1e18)).toString() : undefined,
            depositAmount: depositAmount ? BigInt(Math.round(parseFloat(depositAmount) * 1e18)).toString() : undefined,
            transactionId: receipt.transactionHash, 
            blockNumber: receipt.blockNumber.toString(), 
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to list item off-chain after successful blockchain transaction');
        }

        console.log('Item listed off-chain successfully after blockchain confirmation');
        alert('Item listed successfully both on-chain and in database! Transaction hash: ' + hash);
        setName('');
        setDescription('');
        setPhotoUrl('');
        setBorrowingFee('');
        setDepositAmount('');
      } else {
        setError('Transaction failed. Please check the console for details.');
        console.error('Transaction failed:', receipt);
      }    } catch (err: any) {
      console.error("Error during listing process:", err); // Log the full error for debugging

      // Check for user rejection (code 4001, specific messages, or error name)
      const isUserRejection =
        err.code === 4001 ||
        err.cause?.code === 4001 ||
        (typeof err.message === 'string' && (
          err.message.includes('User rejected the request') ||
          err.message.includes('User denied transaction signature') ||
          err.message.includes('Transaction declined') // Another common phrase
        )) ||
        (typeof err.shortMessage === 'string' && err.shortMessage.includes('User rejected')) ||
        err.name === 'UserRejectedRequestError'; // Viem specific error name

      if (isUserRejection) {
        setError("Transacción cancelada por el usuario. El item no ha sido listado.");
      } else {
        // For other errors, provide a concise message
        // Prefer shortMessage if available (Viem specific and usually cleaner)
        // Otherwise, use the main message.
        const displayMessage = err.shortMessage || err.message || 'Ocurrió un error inesperado al listar el item.';
        setError(displayMessage);
      }
    } finally {
      setIsLoading(false);
      setIsListing(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">List a New Item</h1>
      
      {availableWallets.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-700 font-medium">Detected wallets:</p>
          <ul className="text-xs text-green-600 mt-1">
            {availableWallets.map((wallet, i) => (
              <li key={i}>{wallet}</li>
            ))}
          </ul>
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="name">Item Name*</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="photoUrl">Photo URL</Label>
          <Input
            id="photoUrl"
            type="url"
            value={photoUrl}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPhotoUrl(e.target.value)}
            className="mt-1"
            placeholder="https://example.com/image.jpg"
          />
          {/* For actual file uploads, you'd need a more complex setup (e.g., to S3 or similar) */}
        </div>

        <div>
          <Label htmlFor="borrowingFee">Borrowing Fee (in wei)</Label>
          <Input
            id="borrowingFee"
            type="number"
            value={borrowingFee}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBorrowingFee(e.target.value)}
            className="mt-1"
            placeholder="e.g., 10000000000000000 (0.01 ETH)"
          />
        </div>

        <div>
          <Label htmlFor="depositAmount">Deposit Amount (in wei)</Label>
          <Input
            id="depositAmount"
            type="number"
            value={depositAmount}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDepositAmount(e.target.value)}
            className="mt-1"
            placeholder="e.g., 100000000000000000 (0.1 ETH)"
          />
        </div>

        <Button type="submit" disabled={isLoading || !user?.wallet} className="w-full">
          {isListing ? 'Listing Item...' : 'List Item'}
        </Button>
        {!user?.wallet && <p className="text-sm text-center text-gray-500 mt-2">Connect your wallet to list an item.</p>}
      </form>
    </div>
  );
}
