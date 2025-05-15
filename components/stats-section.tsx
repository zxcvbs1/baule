"use client"

import { useEffect, useState } from "react"
import { getSupabaseClient } from "@/lib/supabase"

export function StatsSection() {
  const [stats, setStats] = useState({
    totalItems: 0,
    totalUsers: 0,
    activeLoans: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const supabase = getSupabaseClient()

        // Get total items
        const { count: itemsCount, error: itemsError } = await supabase
          .from("items")
          .select("*", { count: "exact", head: true })

        if (itemsError) throw itemsError

        // Get total users
        const { count: usersCount, error: usersError } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })

        if (usersError) throw usersError

        // Get active loans (approved borrow requests)
        const { count: loansCount, error: loansError } = await supabase
          .from("borrow_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "approved")

        if (loansError) throw loansError

        setStats({
          totalItems: itemsCount || 0,
          totalUsers: usersCount || 0,
          activeLoans: loansCount || 0,
        })
      } catch (error) {
        console.error("Error fetching stats:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return (
    <section className="py-12 bg-background border-y">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">Our Community in Numbers</h2>
          <p className="text-muted-foreground mt-2">Join our growing community of sharers</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col items-center p-6 bg-muted rounded-lg">
            <span className="text-4xl font-bold">{loading ? "..." : stats.totalItems}</span>
            <span className="text-muted-foreground mt-2">Items Shared</span>
          </div>

          <div className="flex flex-col items-center p-6 bg-muted rounded-lg">
            <span className="text-4xl font-bold">{loading ? "..." : stats.totalUsers}</span>
            <span className="text-muted-foreground mt-2">Community Members</span>
          </div>

          <div className="flex flex-col items-center p-6 bg-muted rounded-lg">
            <span className="text-4xl font-bold">{loading ? "..." : stats.activeLoans}</span>
            <span className="text-muted-foreground mt-2">Active Loans</span>
          </div>
        </div>
      </div>
    </section>
  )
}
