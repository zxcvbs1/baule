import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// Remove direct import of PrivyProvider from here
import Navbar from "@/components/layout/Navbar";
import PrivyProviderWrapper from "./privy-provider-wrapper"; // Import the wrapper

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Baulera - Alquiler Seguro de Objetos", // Changed title
  description: "Plataforma para alquilar y tomar prestados objetos de forma segura usando blockchain.", // Changed description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PrivyProviderWrapper> { /* Use the wrapper */}
          <Navbar />
          <main className="container mx-auto px-4 py-8 mt-4 relative z-0">
            {children}
          </main>
        </PrivyProviderWrapper>
      </body>
    </html>
  );
}
