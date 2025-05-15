"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type Item, type BorrowRequest, getSupabaseClient } from "@/lib/supabase"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import Image from "next/image"

export default function DashboardPage() {
  const { authenticated, ready, user } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [itemRequests, setItemRequests] = useState<Record<string, any[]>>({})

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/login")
    }
  }, [ready, authenticated, router])

  useEffect(() => {
    async function fetchData() {
      if (!user?.id) return

      try {
        const supabase = getSupabaseClient()
        // Fetch user's items
        const { data: itemsData, error: itemsError } = await supabase.from("items").select("*").eq("owner_id", user.id)

        if (itemsError) throw itemsError
        setItems(itemsData || [])

        // Fetch borrow requests for user's items
        const { data: requestsData, error: requestsError } = await supabase
          .from("borrow_requests")
          .select("*")
          .eq("borrower_id", user.id)
          .order("created_at", { ascending: false })

        if (requestsError) throw requestsError
        setBorrowRequests(requestsData || [])
      } catch (error) {
        console.error("Error fetching dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    async function fetchRequestsForUserItems() {
      if (!user?.id) return

      try {
        const supabase = getSupabaseClient()
        const { data: userItems } = await supabase.from("items").select("id").eq("owner_id", user.id)

        if (!userItems || userItems.length === 0) return

        const itemIds = userItems.map((item) => item.id)

        const { data: requestsData, error: requestsError } = await supabase
          .from("borrow_requests")
          .select("*, profiles:borrower_id(*)")
          .in("item_id", itemIds)
          .order("created_at", { ascending: false })

        if (requestsError) throw requestsError

        // Group requests by item_id
        const requestsByItem = {}
        requestsData?.forEach((request) => {
          if (!requestsByItem[request.item_id]) {
            requestsByItem[request.item_id] = []
          }
          requestsByItem[request.item_id].push(request)
        })

        setItemRequests(requestsByItem)
      } catch (error) {
        console.error("Error fetching requests:", error)
      }
    }

    if (authenticated && user?.id) {
      fetchData()
      fetchRequestsForUserItems()
    }
  }, [authenticated, user?.id])

  const handleUpdateRequest = async (requestId: string, status: string) => {
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from("borrow_requests")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)

      if (error) throw error

      // Update local state
      setItemRequests((prev) => {
        const updated = { ...prev }
        Object.keys(updated).forEach((itemId) => {
          updated[itemId] = updated[itemId].map((request) =>
            request.id === requestId ? { ...request, status } : request,
          )
        })
        return updated
      })

      toast({
        title: "Request updated",
        description: `The borrowing request has been ${status}`,
      })
    } catch (error) {
      console.error("Error updating request:", error)
      toast({
        title: "Error",
        description: "Failed to update request",
        variant: "destructive",
      })
    }
  }

  if (!ready || !authenticated) {
    return null
  }

  return (
    <PageLayout>
      <div className="container py-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Button asChild>
            <Link href="/add-item">
              <Plus className="mr-2 h-4 w-4" /> Add New Item
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="my-items" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="my-items">My Items</TabsTrigger>
            <TabsTrigger value="borrowing">Borrowing</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
          </TabsList>
          <TabsContent value="my-items" className="mt-6">
            {loading ? (
              <div className="text-center py-10">Loading your items...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-muted-foreground mb-4">You haven't added any items yet.</p>
                <Button asChild>
                  <Link href="/add-item">Add Your First Item</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((item) => (
                  <Card key={item.id}>
                    <CardHeader>
                      <CardTitle className="truncate">{item.title}</CardTitle>
                      <CardDescription>Condition: {item.condition.replace("_", " ")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="aspect-square relative bg-muted rounded-md overflow-hidden mb-4">
                        {item.image_url ? (
                          <Image
                            src={item.image_url || "/placeholder.svg"}
                            alt={item.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">No image</div>
                        )}
                      </div>
                      <p className="text-sm line-clamp-2">{item.description}</p>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="outline" asChild>
                        <Link href={`/items/${item.id}`}>View</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link href={`/items/${item.id}/edit`}>Edit</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="borrowing" className="mt-6">
            {loading ? (
              <div className="text-center py-10">Loading your borrowing history...</div>
            ) : borrowRequests.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-muted-foreground mb-4">You haven't borrowed any items yet.</p>
                <Button asChild>
                  <Link href="/items">Browse Items</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {borrowRequests.map((request) => (
                  <Card key={request.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Borrowing Request</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="font-medium">Status:</span>
                          <span
                            className={`${
                              request.status === "approved"
                                ? "text-green-600"
                                : request.status === "rejected"
                                  ? "text-red-600"
                                  : request.status === "conflict"
                                    ? "text-orange-600"
                                    : "text-gray-600"
                            }`}
                          >
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">From:</span>
                          <span>{new Date(request.start_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">To:</span>
                          <span>{new Date(request.end_date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" asChild className="w-full">
                        <Link href={`/items/${request.item_id}`}>View Item</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="requests" className="mt-6">
            {loading ? (
              <div className="text-center py-10">Loading incoming requests...</div>
            ) : Object.keys(itemRequests).length === 0 ? (
              <div className="text-center py-10">
                <p className="text-muted-foreground">No requests for your items yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {Object.entries(itemRequests).map(([itemId, requests]) => {
                  // Find the item details
                  const itemDetails = items.find((item) => item.id === itemId)

                  return (
                    <Card key={itemId}>
                      <CardHeader>
                        <CardTitle>{itemDetails?.title || "Unknown Item"}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {requests.map((request) => (
                            <div key={request.id} className="border p-4 rounded-md">
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-medium">
                                  Requested by: {request.profiles?.username || "Unknown user"}
                                </span>
                                <Badge
                                  variant={
                                    request.status === "approved"
                                      ? "default"
                                      : request.status === "rejected"
                                        ? "destructive"
                                        : request.status === "returned"
                                          ? "secondary"
                                          : "outline"
                                  }
                                >
                                  {request.status}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                From {new Date(request.start_date).toLocaleDateString()} to{" "}
                                {new Date(request.end_date).toLocaleDateString()}
                              </div>
                              {request.status === "pending" && (
                                <div className="flex gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleUpdateRequest(request.id, "rejected")}
                                  >
                                    Reject
                                  </Button>
                                  <Button size="sm" onClick={() => handleUpdateRequest(request.id, "approved")}>
                                    Approve
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button variant="outline" asChild className="w-full">
                          <Link href={`/items/${itemId}`}>View Item</Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  )
}
