"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { getSupabaseClient, type BorrowRequest, type Item } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"
import { AlertCircle } from "lucide-react"

type BorrowRequestWithItem = BorrowRequest & {
  items: Item
}

export default function BorrowingPage() {
  const { authenticated, ready, user } = useAuth()
  const router = useRouter()
  const [borrowing, setBorrowing] = useState<BorrowRequestWithItem[]>([])
  const [lending, setLending] = useState<BorrowRequestWithItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/login")
    }
  }, [ready, authenticated, router])

  useEffect(() => {
    async function fetchBorrowingData() {
      if (!user?.id) return

      try {
        const supabase = getSupabaseClient()
        // Fetch items user is borrowing
        const { data: borrowingData, error: borrowingError } = await supabase
          .from("borrow_requests")
          .select("*, items(*)")
          .eq("borrower_id", user.id)
          .order("created_at", { ascending: false })

        if (borrowingError) throw borrowingError
        setBorrowing(borrowingData || [])

        // Fetch items user is lending (requests for user's items)
        const { data: lendingData, error: lendingError } = await supabase
          .from("borrow_requests")
          .select("*, items!inner(*)")
          .eq("items.owner_id", user.id)
          .order("created_at", { ascending: false })

        if (lendingError) throw lendingError
        setLending(lendingData || [])
      } catch (error) {
        console.error("Error fetching borrowing data:", error)
        toast({
          title: "Error",
          description: "Failed to load borrowing data",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    if (authenticated && user?.id) {
      fetchBorrowingData()
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
      setLending((prev) => prev.map((request) => (request.id === requestId ? { ...request, status } : request)))

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

  const handleReportConflict = async (requestId: string) => {
    if (!user?.id) return

    try {
      const supabase = getSupabaseClient()
      // First update the request status to conflict
      const { error: updateError } = await supabase
        .from("borrow_requests")
        .update({
          status: "conflict",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)

      if (updateError) throw updateError

      // Then create a conflict record
      const { error: conflictError } = await supabase.from("conflicts").insert({
        borrow_request_id: requestId,
        reporter_id: user.id,
        description: "Issue reported with borrowing",
        status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (conflictError) throw conflictError

      // Update local state
      setBorrowing((prev) =>
        prev.map((request) => (request.id === requestId ? { ...request, status: "conflict" } : request)),
      )

      toast({
        title: "Conflict reported",
        description: "An administrator will review your report",
      })
    } catch (error) {
      console.error("Error reporting conflict:", error)
      toast({
        title: "Error",
        description: "Failed to report conflict",
        variant: "destructive",
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>
      case "approved":
        return <Badge>Approved</Badge>
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>
      case "returned":
        return <Badge variant="secondary">Returned</Badge>
      case "conflict":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Conflict
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (!ready || !authenticated) {
    return null
  }

  return (
    <PageLayout>
      <div className="container py-10">
        <h1 className="text-3xl font-bold mb-8">Borrowing & Lending</h1>

        <Tabs defaultValue="borrowing" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="borrowing">Items I'm Borrowing</TabsTrigger>
            <TabsTrigger value="lending">Items I'm Lending</TabsTrigger>
          </TabsList>
          <TabsContent value="borrowing" className="mt-6">
            {loading ? (
              <div className="text-center py-10">Loading your borrowing history...</div>
            ) : borrowing.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-muted-foreground mb-4">You haven't borrowed any items yet.</p>
                <Button asChild>
                  <Link href="/items">Browse Items</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {borrowing.map((request) => (
                  <Card key={request.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="line-clamp-1">{request.items.title}</CardTitle>
                        {getStatusBadge(request.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="aspect-video relative bg-muted rounded-md overflow-hidden">
                          {request.items.image_url ? (
                            <img
                              src={request.items.image_url || "/placeholder.svg?height=200&width=350"}
                              alt={request.items.title}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-sm font-medium">Borrow Period</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(request.start_date).toLocaleDateString()} to{" "}
                              {new Date(request.end_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Request Date</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(request.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Status</p>
                            <p className="text-sm text-muted-foreground capitalize">{request.status}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                      <Button variant="outline" asChild>
                        <Link href={`/items/${request.items.id}`}>View Item</Link>
                      </Button>
                      {request.status === "approved" && (
                        <Button variant="outline" onClick={() => handleReportConflict(request.id)}>
                          Report Issue
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="lending" className="mt-6">
            {loading ? (
              <div className="text-center py-10">Loading lending requests...</div>
            ) : lending.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-muted-foreground mb-4">You don't have any lending requests yet.</p>
                <Button asChild>
                  <Link href="/items/new">Share an Item</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {lending.map((request) => (
                  <Card key={request.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="line-clamp-1">{request.items.title}</CardTitle>
                        {getStatusBadge(request.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="aspect-video relative bg-muted rounded-md overflow-hidden">
                          {request.items.image_url ? (
                            <img
                              src={request.items.image_url || "/placeholder.svg?height=200&width=350"}
                              alt={request.items.title}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-sm font-medium">Borrow Period</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(request.start_date).toLocaleDateString()} to{" "}
                              {new Date(request.end_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Request Date</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(request.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                      {request.status === "pending" && (
                        <>
                          <Button variant="outline" onClick={() => handleUpdateRequest(request.id, "rejected")}>
                            Reject
                          </Button>
                          <Button onClick={() => handleUpdateRequest(request.id, "approved")}>Approve</Button>
                        </>
                      )}
                      {request.status === "approved" && (
                        <Button onClick={() => handleUpdateRequest(request.id, "returned")}>Mark as Returned</Button>
                      )}
                      <Button variant="outline" asChild>
                        <Link href={`/items/${request.items.id}`}>View Item</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  )
}
