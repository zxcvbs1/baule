"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter, useParams } from "next/navigation"
import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getSupabaseClient, type Item, type Profile } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"
import { Calendar, Edit, User } from "lucide-react"
import Image from "next/image"

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ItemDetailPage() {
  const { authenticated, ready, user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const [item, setItem] = useState<Item | null>(null)
  const [owner, setOwner] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [requestLoading, setRequestLoading] = useState(false)
  const [hasRequested, setHasRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchItem() {
      if (!params.id) return

      // Check if the ID is a valid UUID
      if (!UUID_REGEX.test(params.id as string)) {
        setError("Invalid item ID")
        setLoading(false)
        return
      }

      try {
        const supabase = getSupabaseClient()
        const { data, error } = await supabase
          .from("items")
          .select("*, profiles:owner_id(*)")
          .eq("id", params.id)
          .single()

        if (error) throw error
        setItem(data)
        setOwner(data.profiles)

        // Fetch borrow requests for this item
        const { data: requestsData, error: requestsError } = await supabase
          .from("borrow_requests")
          .select("*")
          .eq("item_id", params.id)
          .order("created_at", { ascending: false })

        if (requestsError) throw requestsError

        // Check if the current user has already requested this item
        if (user?.id) {
          const userRequests = requestsData?.filter((req) => req.borrower_id === user.id)
          setHasRequested(userRequests && userRequests.length > 0)
        }
      } catch (error) {
        console.error("Error fetching item:", error)
        setError("Failed to load item details")
      } finally {
        setLoading(false)
      }
    }

    fetchItem()
  }, [params.id, user?.id])

  const handleBorrowRequest = async () => {
    if (!authenticated) {
      router.push("/login")
      return
    }

    if (!item || !user?.id) return

    setRequestLoading(true)
    try {
      const supabase = getSupabaseClient()
      // Calculate default borrow period (7 days from now)
      const startDate = new Date()
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + 7)

      const { error } = await supabase.from("borrow_requests").insert({
        item_id: item.id,
        borrower_id: user.id,
        status: "pending",
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (error) throw error

      toast({
        title: "Request sent",
        description: "Your borrowing request has been sent to the owner.",
      })

      // Update local state to prevent multiple requests
      setHasRequested(true)
    } catch (error) {
      console.error("Error sending borrow request:", error)
      toast({
        title: "Error",
        description: "Failed to send borrowing request",
        variant: "destructive",
      })
    } finally {
      setRequestLoading(false)
    }
  }

  const isOwner = user?.id === item?.owner_id

  return (
    <PageLayout>
      <div className="container py-10">
        {loading ? (
          <div className="text-center py-10">Loading item details...</div>
        ) : error ? (
          <div className="text-center py-10">
            <p className="text-destructive mb-4">{error}</p>
            <Button asChild>
              <Link href="/items">Browse Items</Link>
            </Button>
          </div>
        ) : !item ? (
          <div className="text-center py-10">Item not found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="aspect-square relative bg-muted rounded-lg overflow-hidden">
              {item.image_url ? (
                <Image
                  src={item.image_url || "/placeholder.svg"}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">No image available</div>
              )}
            </div>
            <div>
              <div className="flex justify-between items-start mb-4">
                <h1 className="text-3xl font-bold">{item.title}</h1>
                <Badge variant={item.available ? "default" : "outline"}>
                  {item.available ? "Available" : "Unavailable"}
                </Badge>
              </div>

              <div className="flex items-center mb-6">
                <User className="h-4 w-4 mr-2" />
                <span className="text-muted-foreground">
                  Shared by <span className="font-medium">{owner?.username || "Unknown user"}</span>
                  {owner?.bio && <span className="block text-xs mt-1">{owner.bio}</span>}
                </span>
              </div>

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Item Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-medium">Description</h3>
                    <p className="mt-1">{item.description}</p>
                  </div>
                  <div>
                    <h3 className="font-medium">Condition</h3>
                    <p className="mt-1 capitalize">{item.condition.replace("_", " ")}</p>
                  </div>
                  <div>
                    <h3 className="font-medium">Added on</h3>
                    <div className="flex items-center mt-1">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  {isOwner ? (
                    <Button asChild>
                      <Link href={`/items/${item.id}/edit`}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Item
                      </Link>
                    </Button>
                  ) : (
                    <Button onClick={handleBorrowRequest} disabled={!item.available || requestLoading || hasRequested}>
                      {requestLoading ? "Sending Request..." : hasRequested ? "Already Requested" : "Request to Borrow"}
                    </Button>
                  )}
                </CardFooter>
              </Card>

              <div className="bg-muted p-4 rounded-lg">
                <h3 className="font-medium mb-2">How Borrowing Works</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Request to borrow this item from the owner</li>
                  <li>Owner approves your request</li>
                  <li>Arrange pickup/delivery with the owner</li>
                  <li>Return the item by the agreed date</li>
                  <li>Owner confirms the return</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
