"use client"

import { usePrivy } from "@privy-io/react-auth"
import { useEffect, useState } from "react"
import { getSupabaseClient, type Profile } from "@/lib/supabase"

export function useAuth() {
  const { ready, authenticated, user, login, logout, createWallet } = usePrivy()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
      if (!authenticated || !user?.id) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const supabase = getSupabaseClient()
        const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single()

        if (error) {
          if (error.code === "PGRST116") {
            // Record not found, create a new profile
            const newProfile: Partial<Profile> = {
              id: user.id,
              username: user.email?.split("@")[0] || `user_${Date.now().toString().slice(-4)}`,
              wallet_address: user.wallet?.address,
              email: user.email,
              created_at: new Date().toISOString(),
            }

            const { data: insertData, error: insertError } = await supabase
              .from("profiles")
              .insert(newProfile)
              .select()
              .single()

            if (insertError) throw insertError
            setProfile(insertData)
          } else {
            console.error("Error fetching profile:", error)
            setProfile(null)
          }
        } else {
          setProfile(data)
        }
      } catch (error) {
        console.error("Error in profile fetch:", error)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [authenticated, user?.id])

  return {
    ready,
    authenticated,
    user,
    profile,
    loading,
    login,
    logout,
    createWallet,
  }
}
