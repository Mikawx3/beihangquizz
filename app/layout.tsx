import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Beihang Quiz',
  description: 'Quiz interactif en temps réel',
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

