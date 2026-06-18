/** @type {import('next').NextConfig} */
const nextConfig = {
  // Imagens do Supabase Storage liberadas
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'menu.spinsolar.com.br',
      },
    ],
  },
  // O portal interno NÃO é indexável (não vai pro Google)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
