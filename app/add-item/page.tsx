"use client"

import { useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { PageLayout } from "@/components/page-layout"
import { ItemForm } from "@/components/item-form"

export default function NewItemPage() {
  const { authenticated, ready } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/login")
    }
  }, [ready, authenticated, router])

  if (!ready || !authenticated) {
    return null
  }

  return (
    <PageLayout>
      <div className="container py-10">
        <h1 className="text-3xl font-bold mb-8">Add New Item</h1>
        <div className="max-w-2xl mx-auto">
          <ItemForm />
        </div>
      </div>
    </PageLayout>
  )
}
