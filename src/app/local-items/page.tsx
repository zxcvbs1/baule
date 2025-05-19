'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Define a type for your item based on your Prisma schema
interface Item {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  ownerAddress: string;
  status: string;
  borrowingFee?: string | null;
  depositAmount?: string | null;
  createdAt: Date;
}

export default function LocalItemsPage() {
  const router = useRouter();
  const { user, ready, authenticated, login } = usePrivy();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLocalItems() {
      try {
        setIsLoading(true);
        const response = await fetch("/api/items/local");
        if (!response.ok) {
          throw new Error("Failed to fetch local items");
        }
        const data = await response.json();
        setItems(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchLocalItems();
  }, []);

  return (
    <div className="container mx-auto px-4 py-2 relative">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Items Not on Blockchain</h1>
        <Button asChild>
          <Link href="/list-local-item">Add New Local Item</Link>
        </Button>
      </div>

      {!authenticated && (
        <div className="mb-6 p-4 bg-yellow-50 rounded border border-yellow-200">
          <p className="text-yellow-700 mb-2">You need to be logged in to manage items.</p>
          <Button onClick={() => login()} size="sm">Log In</Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-center">Loading items...</p>
      ) : error ? (
        <p className="text-center text-red-500">Error: {error}</p>
      ) : (
        <>
          {items.length === 0 ? (
            <div className="text-center p-6 bg-gray-50 rounded">
              <p className="mb-4">No local items found. These are items that have not been added to the blockchain.</p>
              <Button asChild>
                <Link href="/list-local-item">Add Your First Local Item</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
              {items.map((item) => (
                <Card key={item.id} className="flex flex-col">
                  <CardHeader>
                    <CardTitle>{item.name}</CardTitle>
                    {item.description && (
                      <CardDescription>
                        {item.description.substring(0, 100)}
                        {item.description.length > 100 ? "..." : ""}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex-grow">
                    {item.photoUrl ? (
                      <div className="relative w-full h-48 mb-4 rounded overflow-hidden">
                        <Image
                          src={item.photoUrl}
                          alt={item.name}
                          layout="fill"
                          objectFit="cover"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-48 mb-4 bg-gray-200 flex items-center justify-center rounded">
                        <span className="text-gray-500">No Image</span>
                      </div>
                    )}
                    <div className="text-sm space-y-1">
                      <p>
                        <strong>Owner:</strong> {item.ownerAddress.slice(0, 6)}...
                        {item.ownerAddress.slice(-4)}
                      </p>
                      <p>
                        <strong>Status:</strong>{" "}
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          Local Only
                        </span>
                      </p>
                      {item.borrowingFee && (
                        <p>
                          <strong>Fee:</strong> {item.borrowingFee} wei
                        </p>
                      )}
                      {item.depositAmount && (
                        <p>
                          <strong>Deposit:</strong> {item.depositAmount} wei
                        </p>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <div className="w-full space-y-2">
                      <Button variant="outline" className="w-full" disabled={!authenticated}>
                        Edit Item
                      </Button>
                      <Button className="w-full" disabled={!authenticated}>
                        Add to Blockchain
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
