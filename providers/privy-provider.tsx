"use client"

import type React from "react"

import { PrivyProvider } from "@privy-io/react-auth"
import { useRouter } from "next/navigation"

export default function PrivyAuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID as string

  return (
    <PrivyProvider
      appId={appId}
      onSuccess={() => router.push("/dashboard")}
      config={{
        loginMethods: ["wallet", "email"],
        appearance: {
          theme: "light",
          accentColor: "#000000",
          logo: "/logo.png",
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
