"use client"

import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { PageLayout } from "@/components/page-layout"

export default function LoginPage() {
  const { login, authenticated, ready } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (ready && authenticated) {
      router.push("/dashboard")
    }
  }, [ready, authenticated, router])

  return (
    <PageLayout>
      <div className="container flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to Baulera</h1>
            <p className="text-sm text-muted-foreground">Sign in to start sharing and borrowing items</p>
          </div>
          <Button onClick={() => login()} className="w-full" size="lg">
            Sign In with Wallet or Email
          </Button>
        </div>
      </div>
    </PageLayout>
  )
}
