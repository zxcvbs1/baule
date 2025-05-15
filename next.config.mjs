/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['images.unsplash.com', process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '')].filter(Boolean),
    unoptimized: true,
  },
}

export default nextConfig
