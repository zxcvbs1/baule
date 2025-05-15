"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { getSupabaseClient, type Conflict, type BorrowRequest, type Item, type Profile } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"

type ConflictWithDetails = Conflict & {
  borrow_request: BorrowRequest & {
    items: Item
    borrower: Profile
  }
  reporter: Profile
}

export default function ConflictsPage() {
  const { authenticated, ready, user } = useAuth()
  const router = useRouter()
  const [conflicts, setConflicts] = useState<ConflictWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [resolutions, setResolutions] = useState<Record<string, string>>({})

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/login")
    }
  }, [ready, authenticated, router])

  useEffect(() => {
    async function fetchConflicts() {
      if (!user?.id) return

      try {
        const supabase = getSupabaseClient()
        // For a real app, you would check if the user is an admin
        // For now, we'll just show all conflicts
        const { data, error } = await supabase
          .from("conflicts")
          .select(`
            *,
            borrow_request:borrow_request_id (
              *,
              items (*),
              borrower:borrower_id (*)
            ),
            reporter:reporter_id (*)
          `)
          .order("created_at", { ascending: false })

        if (error) throw error
        setConflicts(data || [])
      } catch (error) {
        console.error("Error fetching conflicts:", error)
        toast({
          title: "Error",
          description: "Failed to load conflicts",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    if (authenticated && user?.id) {
      fetchConflicts()
    }
  }, [authenticated, user?.id])

  const handleResolutionChange = (conflictId: string, value: string) => {
    setResolutions((prev) => ({ ...prev, [conflictId]: value }))
  }

  const handleResolveConflict = async (conflictId: string) => {
    const resolution = resolutions[conflictId]
    if (!resolution) {
      toast({
        title: "Error",
        description: "Please provide a resolution",
        variant: "destructive",
      })
      return
    }

    try {
      const supabase = getSupabaseClient()
      // Update conflict status
      const { error: conflictError } = await supabase
        .from("conflicts")
        .update({
          status: "resolved",
          resolution,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conflictId)

      if (conflictError) throw conflictError

      // Find the conflict in our local state
      const conflict = conflicts.find((c) => c.id === conflictId)
      if (!conflict) return

      // Update borrow request status to returned
      const { error: requestError } = await supabase
        .from("borrow_requests")
        .update({
          status: "returned",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conflict.borrow_request_id)

      if (requestError) throw requestError

      // Update local state
      setConflicts((prev) => prev.map((c) => (c.id === conflictId ? { ...c, status: "resolved", resolution } : c)))

      toast({
        title: "Conflict resolved",
        description: "The conflict has been successfully resolved",
      })
    } catch (error) {
      console.error("Error resolving conflict:", error)
      toast({
        title: "Error",
        description: "Failed to resolve conflict",
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
        <h1 className="text-3xl font-bold mb-8">Conflict Resolution</h1>

        {loading ? (
          <div className="text-center py-10">Loading conflicts...</div>
        ) : conflicts.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground">No conflicts to resolve.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {conflicts.map((conflict) => (
              <Card key={conflict.id}>
                <CardHeader>
                  <CardTitle>Conflict: {conflict.borrow_request.items.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-medium mb-2">Item Details</h3>
                      <p className="text-sm">
                        <span className="font-medium">Title:</span> {conflict.borrow_request.items.title}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Condition:</span>{" "}
                        {conflict.borrow_request.items.condition.replace("_", " ")}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Borrowing Details</h3>
                      <p className="text-sm">
                        <span className="font-medium">Borrower:</span> {conflict.borrow_request.borrower.username}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Reported by:</span> {conflict.reporter.username}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Borrow Period:</span>{" "}
                        {new Date(conflict.borrow_request.start_date).toLocaleDateString()} to{" "}
                        {new Date(conflict.borrow_request.end_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-medium mb-2">Issue Description</h3>
                    <p className="text-sm bg-muted p-3 rounded-md">{conflict.description}</p>
                  </div>
                  {conflict.status === "open" ? (
                    <div>
                      <h3 className="font-medium mb-2">Resolution</h3>
                      <Textarea
                        placeholder="Describe how this conflict was resolved..."
                        value={resolutions[conflict.id] || ""}
                        onChange={(e) => handleResolutionChange(conflict.id, e.target.value)}
                        rows={3}
                      />
                    </div>
                  ) : (
                    <div>
                      <h3 className="font-medium mb-2">Resolution</h3>
                      <p className="text-sm bg-muted p-3 rounded-md">{conflict.resolution}</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-end">
                  {conflict.status === "open" ? (
                    <Button onClick={() => handleResolveConflict(conflict.id)}>Resolve Conflict</Button>
                  ) : (
                    <Button disabled>Resolved</Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
