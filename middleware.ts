import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // Add logic here if needed for route protection
  // For now, we'll rely on client-side protection with the useAuth hook
  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/items/:path*", "/borrowing/:path*"],
}
