// src/components/layout/Navbar.tsx
'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';

export default function Navbar() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  return (
    <nav className="bg-gray-100 border-b border-gray-200">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="font-bold text-xl text-gray-800">
          Baulera
        </Link>
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-gray-600 hover:text-gray-900">
            Browse Items
          </Link>
          <Link href="/list-item" className="text-gray-600 hover:text-gray-900">
            List an Item
          </Link>
          <Link href="/manage-items" className="text-gray-600 hover:text-gray-900">
            Manage Items
          </Link>
          <Link href="/my-requests" className="text-gray-600 hover:text-gray-900">
            My Requests
          </Link>
          {ready && (
            <>
              {authenticated ? (
                <div className="flex items-center space-x-2">
                  {user?.wallet && (
                    <span className="text-sm text-gray-500">
                      {user.wallet.address.slice(0, 6)}...{user.wallet.address.slice(-4)}
                    </span>
                  )}
                  <Button onClick={logout} variant="outline" size="sm">
                    Log Out
                  </Button>
                </div>
              ) : (
                <Button onClick={login} size="sm">
                  Log In
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
