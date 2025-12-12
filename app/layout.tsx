import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Beihang Quiz',
  description: 'Quiz interactif en temps réel',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    viewportFit: 'cover', // Important pour les safe-area-inset sur iPhone
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}


