/** @type {import('next').NextConfig} */
const nextConfig = {
  // Envio de arquivo pelo inbox passa por server action (padrão 1 MB — foto
  // de celular não cabia). 4.5 MB é o teto de corpo de requisição na Vercel.
  experimental: {
    serverActions: {
      bodySizeLimit: '4.5mb',
    },
  },
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
      // Páginas dinâmicas de projetos NÃO devem ser cacheadas pelo CDN
      {
        source: '/projetos/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
