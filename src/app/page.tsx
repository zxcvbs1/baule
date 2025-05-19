'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePrivy } from "@privy-io/react-auth";

// Define a type for your item based on your Prisma schema
interface Item {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  ownerAddress: string;
  status: string;
  borrowingFee?: bigint | null;
  depositAmount?: bigint | null;
  contractItemId?: string | null;
  createdAt: Date;
  itemNonce?: string | null; // Added itemNonce
}

export default function HomePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, authenticated } = usePrivy(); 
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    async function fetchItems() {
      try {
        setIsLoading(true);
        const response = await fetch("/api/items");
        if (!response.ok) {
          throw new Error("Failed to fetch items");
        }
        const data = await response.json();
        setItems(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchItems();
  }, []);

  const handleRequestBorrow = async (item: Item) => {
    setFeedbackMessage(null); // Clear previous feedback
    if (!authenticated || !user?.wallet?.address) {
      setFeedbackMessage({ type: 'error', message: "Please log in to request a borrow." });
      return;
    }
    if (item.ownerAddress.toLowerCase() === user.wallet.address.toLowerCase()) {
      setFeedbackMessage({ type: 'error', message: "You cannot borrow your own item." });
      return;
    }

    try {
      const response = await fetch("/api/borrow-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: item.id,
          borrowerAddress: user.wallet.address,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create borrow request");
      }

      // const newRequest = await response.json(); // Not strictly needed here if just showing a message
      await response.json();
      setFeedbackMessage({ type: 'success', message: "Borrow request sent successfully!" });
      // Optionally, update UI or redirect user
      // For example, disable the button or show a pending status on the item
      // Or refetch items to reflect any potential status changes if your API updates item status upon request creation (though unlikely for a PENDING request)
    } catch (err: any) {
      console.error("Error requesting borrow:", err);
      setFeedbackMessage({ type: 'error', message: err.message || "An error occurred while sending the borrow request." });
    }
  };

  if (isLoading) return <p className="text-center">Loading items...</p>;
  if (error) return <p className="text-center text-red-500">Error: {error}</p>;

  return (
    <div className="container mx-auto px-4 py-2 relative">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-6">Available Items</h1>
        {feedbackMessage && (
          <div 
            className={`mb-4 p-3 rounded-md text-sm ${
              feedbackMessage.type === 'success' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}
          >
            {feedbackMessage.message}
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-center">
            <p className="mb-4">No items listed yet.</p>
            <Button asChild>
              <Link href="/list-item">List Your First Item</Link>
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
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.status === "available"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {item.status}
                      </span>
                    </p>
                    {item.borrowingFee && (
                      <p>
                        <strong>Fee:</strong> {item.borrowingFee.toString()} wei
                      </p>
                    )}
                    {item.depositAmount && (
                      <p>
                        <strong>Deposit:</strong> {item.depositAmount.toString()} wei
                      </p>
                    )}
                  </div>
                </CardContent>
                <CardFooter>
                  {item.status === "available" && item.contractItemId && authenticated && user?.wallet?.address && item.ownerAddress.toLowerCase() !== user.wallet.address.toLowerCase() ? (
                    <Button 
                      className="w-full"
                      onClick={() => handleRequestBorrow(item)}
                    >
                      Solicitar Préstamo
                    </Button>
                  ) : item.status === "available" && item.contractItemId && authenticated && user?.wallet?.address && item.ownerAddress.toLowerCase() === user.wallet.address.toLowerCase() ? (
                    <Button variant="outline" className="w-full" disabled>
                      Cannot Borrow Own Item
                    </Button>
                  ) : item.status === "available" && item.contractItemId && !authenticated ? (
                    <Button variant="outline" className="w-full" disabled>
                      Log in to Borrow
                    </Button>
                  ) : item.status !== "available" ? (
                     <Button variant="outline" className="w-full" disabled>
                      Not Available
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>
                      Details (Coming Soon)
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
