"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getSupabaseClient, type Profile } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"

export default function ProfilePage() {
  const { authenticated, ready, user } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    username: "",
    bio: "",
  })

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/login")
    }
  }, [ready, authenticated, router])

  useEffect(() => {
    async function fetchProfile() {
      if (!user?.id) return

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
            setFormData({
              username: insertData.username,
              bio: insertData.bio || "",
            })
          } else {
            throw error
          }
        } else {
          setProfile(data)
          setFormData({
            username: data.username,
            bio: data.bio || "",
          })
        }
      } catch (error) {
        console.error("Error fetching profile:", error)
      } finally {
        setLoading(false)
      }
    }

    if (authenticated && user?.id) {
      fetchProfile()
    }
  }, [authenticated, user?.id])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return

    setSaving(true)
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from("profiles")
        .update({
          username: formData.username,
          bio: formData.bio,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (error) throw error
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      })

      // Update local profile state
      setProfile((prev) => {
        if (!prev) return null
        return {
          ...prev,
          username: formData.username,
          bio: formData.bio,
        }
      })
    } catch (error) {
      console.error("Error updating profile:", error)
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (!ready || !authenticated) {
    return null
  }

  return (
    <PageLayout>
      <div className="container py-10">
        <h1 className="text-3xl font-bold mb-8">Your Profile</h1>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your profile information</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="text-center py-4">Loading profile...</div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input id="username" name="username" value={formData.username} onChange={handleChange} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        name="bio"
                        value={formData.bio}
                        onChange={handleChange}
                        rows={4}
                        placeholder="Tell us about yourself"
                      />
                    </div>
                    {user?.email && (
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" value={user.email} disabled className="bg-muted" />
                      </div>
                    )}
                    {user?.wallet?.address && (
                      <div className="space-y-2">
                        <Label htmlFor="wallet">Wallet Address</Label>
                        <Input
                          id="wallet"
                          value={`${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                    )}
                  </>
                )}
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={loading || saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your account details and connected services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Account ID</Label>
                <div className="p-2 border rounded-md bg-muted">
                  <code className="text-sm">{user?.id || "Not available"}</code>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Connected Services</Label>
                <div className="flex flex-col gap-2">
                  {user?.email && (
                    <div className="flex items-center p-2 border rounded-md">
                      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center mr-2">
                        E
                      </div>
                      <div>
                        <p className="text-sm font-medium">Email</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  )}
                  {user?.wallet && (
                    <div className="flex items-center p-2 border rounded-md">
                      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center mr-2">
                        W
                      </div>
                      <div>
                        <p className="text-sm font-medium">Wallet</p>
                        <p className="text-xs text-muted-foreground">
                          {`${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  )
}
