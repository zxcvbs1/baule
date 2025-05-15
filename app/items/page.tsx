"use client"

import { useEffect, useState } from "react"
import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getSupabaseClient, type Item } from "@/lib/supabase"
import Link from "next/link"
import { Search } from "lucide-react"
import Image from "next/image"

type ItemWithOwner = Item & {
  profiles: {
    username: string
  }
}

export default function ItemsPage() {
  const [items, setItems] = useState<ItemWithOwner[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [condition, setCondition] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchItems() {
      try {
        const supabase = getSupabaseClient()
        let query = supabase.from("items").select("*, profiles:owner_id(username)").eq("available", true)

        if (condition !== "all") {
          query = query.eq("condition", condition)
        }

        // Apply sorting
        switch (sortBy) {
          case "newest":
            query = query.order("created_at", { ascending: false })
            break
          case "oldest":
            query = query.order("created_at", { ascending: true })
            break
          case "title_asc":
            query = query.order("title", { ascending: true })
            break
          case "title_desc":
            query = query.order("title", { ascending: false })
            break
        }

        const { data, error } = await query

        if (error) throw error
        setItems(data || [])
      } catch (error) {
        console.error("Error fetching items:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchItems()
  }, [condition, sortBy])

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <PageLayout>
      <div className="container py-10">
        <h1 className="text-3xl font-bold mb-8">Browse Items</h1>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="w-full md:w-48">
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Conditions</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="like_new">Like New</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="fair">Fair</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-48">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="title_asc">Title (A-Z)</SelectItem>
                <SelectItem value="title_desc">Title (Z-A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10">Loading items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground mb-4">No items found matching your criteria.</p>
            <Button asChild>
              <Link href="/add-item">Share an Item</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <Card key={item.id} className="flex flex-col">
                <div className="aspect-video relative bg-muted overflow-hidden">
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
                <CardHeader className="pb-2">
                  <CardTitle className="line-clamp-1">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="pb-2 flex-grow">
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-xs bg-muted px-2 py-1 rounded-md">{item.condition.replace("_", " ")}</span>
                    <span className="text-xs bg-muted px-2 py-1 rounded-md">
                      By {item.profiles?.username || "Unknown"}
                    </span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full">
                    <Link href={`/items/${item.id}`}>View Details</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
