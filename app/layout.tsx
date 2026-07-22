import type { Metadata } from 'next'
import './globals.css'
import { PortalHeader } from '@/components/PortalHeader'

/**
 * Layout raiz da aplicação.
 * Aplicado a TODAS as páginas (login, dashboard, conta, etc).
 */

export const metadata: Metadata = {
  title: 'Spin Solar — Portal Interno',
  description: 'Sistema interno Spin Solar: representantes, instaladores e admin.',
  // noindex/nofollow já configurado em next.config.js
  robots: 'noindex, nofollow',
  icons: {
    icon: [
      { url: '/icon.png?v=2', type: 'image/png', sizes: '196x196' },
    ],
    apple: [
      { url: '/apple-icon.png?v=2', type: 'image/png', sizes: '196x196' },
    ],
    shortcut: '/icon.png?v=2',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Favicon explicito — reforca alem do metadata.icons pra bypass cache */}
        <link rel="icon" type="image/png" href="/icon.png?v=2" />
        <link rel="apple-touch-icon" href="/apple-icon.png?v=2" />
        <link rel="shortcut icon" href="/icon.png?v=2" />

        {/* Fonte Inter — mesma do menu-spin pra consistência visual */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PortalHeader />
        {children}
      </body>
    </html>
  )
}
