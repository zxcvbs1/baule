"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Menu, X, User, Package, Home, LogOut } from "lucide-react"
import { useState } from "react"

export function Navigation() {
  const pathname = usePathname()
  const { authenticated, logout, profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  const routes = [
    {
      href: "/",
      label: "Home",
      icon: <Home className="h-4 w-4 mr-2" />,
      active: pathname === "/",
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: <Package className="h-4 w-4 mr-2" />,
      active: pathname === "/dashboard",
      protected: true,
    },
    {
      href: "/items",
      label: "Browse Items",
      icon: <Package className="h-4 w-4 mr-2" />,
      active: pathname === "/items",
    },
    {
      href: "/profile",
      label: "Profile",
      icon: <User className="h-4 w-4 mr-2" />,
      active: pathname === "/profile",
      protected: true,
    },
  ]

  return (
    <header className="border-b border-border">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-xl">
            BAULERA
          </Link>
          <nav className="hidden md:flex gap-6">
            {routes.map((route) => {
              if (route.protected && !authenticated) return null
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    route.active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {route.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {authenticated ? (
            <div className="hidden md:flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {profile?.username || "Account"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard">My Items</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/borrowing">Borrowing</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => logout()}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button asChild className="hidden md:inline-flex">
              <Link href="/login">Login</Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>
      {isOpen && (
        <div className="container md:hidden py-4 border-t">
          <nav className="grid gap-4">
            {routes.map((route) => {
              if (route.protected && !authenticated) return null
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className={`flex items-center text-sm font-medium transition-colors hover:text-primary ${
                    route.active ? "text-primary" : "text-muted-foreground"
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  {route.icon}
                  {route.label}
                </Link>
              )
            })}
            {authenticated ? (
              <Button
                variant="ghost"
                className="flex items-center justify-start px-2"
                onClick={() => {
                  logout()
                  setIsOpen(false)
                }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            ) : (
              <Button asChild>
                <Link href="/login" onClick={() => setIsOpen(false)}>
                  Login
                </Link>
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
