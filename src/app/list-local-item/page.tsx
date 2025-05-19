'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ListLocalItemPage() {
  const router = useRouter();
  const { user, ready, authenticated, login } = usePrivy();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [borrowingFee, setBorrowingFee] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!user || !user.wallet) {
      setError('Please connect your wallet to list an item.');
      setIsLoading(false);
      return;
    }

    const ownerAddress = user.wallet.address;

    if (!name) {
      setError('Item name is required.');
      setIsLoading(false);
      return;
    }

    try {
      // Guardar el elemento localmente sin interactuar con la blockchain
      const response = await fetch('/api/items/local', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description,
          photoUrl,
          ownerAddress,
          borrowingFee: borrowingFee ? BigInt(Math.round(parseFloat(borrowingFee) * 1e18)).toString() : undefined,
          depositAmount: depositAmount ? BigInt(Math.round(parseFloat(depositAmount) * 1e18)).toString() : undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to create local item');
      }

      const result = await response.json();
      console.log('Item created locally successfully:', result);

      // Limpiar el formulario y redirigir
      setName('');
      setDescription('');
      setPhotoUrl('');
      setBorrowingFee('');
      setDepositAmount('');
      
      alert('Item saved locally successfully!');
      router.push('/local-items');

    } catch (err: any) {
      console.error("Error during local item creation:", err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Add Local Item (Not on Blockchain)</h1>
      
      {!authenticated ? (
        <div className="mb-6 p-4 bg-yellow-50 rounded border border-yellow-200">
          <p className="text-yellow-700 mb-2">You need to be logged in to create items.</p>
          <Button onClick={() => login()} size="sm">Log In</Button>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          
          <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-200">
            <p className="text-blue-700">
              This item will be stored locally and not on the blockchain.
              You can add it to the blockchain later.
            </p>
          </div>
          
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
            </div>

            <div>
              <Label htmlFor="borrowingFee">Borrowing Fee (in wei)</Label>
              <Input
                id="borrowingFee"
                type="number"
                value={borrowingFee}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBorrowingFee(e.target.value)}
                className="mt-1"
                placeholder="e.g., 0.01 (converted to wei)"
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
                placeholder="e.g., 0.1 (converted to wei)"
              />
            </div>

            <div className="flex space-x-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => router.push('/local-items')}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !authenticated} className="flex-1">
                {isLoading ? 'Saving...' : 'Save Item Locally'}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
