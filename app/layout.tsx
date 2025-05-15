import type React from "react"
import "./globals.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import PrivyAuthProvider from "@/providers/privy-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Baulera - Share & Borrow Items",
  description: "A web3 platform for sharing and borrowing physical items within your community",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <PrivyAuthProvider>{children}</PrivyAuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
