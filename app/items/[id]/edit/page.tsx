"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter, useParams } from "next/navigation"
import { PageLayout } from "@/components/page-layout"
import { ItemForm } from "@/components/item-form"
import { getSupabaseClient, type Item } from "@/lib/supabase"

export default function EditItemPage() {
  const { authenticated, ready, user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const [item, setItem] = useState<Item | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/login")
    }
  }, [ready, authenticated, router])

  useEffect(() => {
    async function fetchItem() {
      if (!params.id || !user?.id) return

      try {
        const supabase = getSupabaseClient()
        const { data, error } = await supabase.from("items").select("*").eq("id", params.id).single()

        if (error) throw error

        // Check if user owns the item
        if (data.owner_id !== user.id) {
          setError("You don't have permission to edit this item")
          return
        }

        setItem(data)
      } catch (error) {
        console.error("Error fetching item:", error)
        setError("Failed to load item")
      } finally {
        setLoading(false)
      }
    }

    if (authenticated && user?.id) {
      fetchItem()
    }
  }, [authenticated, user?.id, params.id])

  if (!ready || !authenticated) {
    return null
  }

  return (
    <PageLayout>
      <div className="container py-10">
        <h1 className="text-3xl font-bold mb-8">Edit Item</h1>
        <div className="max-w-2xl mx-auto">
          {loading ? (
            <div className="text-center py-10">Loading item...</div>
          ) : error ? (
            <div className="text-center py-10 text-destructive">{error}</div>
          ) : item ? (
            <ItemForm item={item} isEditing />
          ) : (
            <div className="text-center py-10">Item not found</div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
