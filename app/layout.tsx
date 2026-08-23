import type { Metadata, Viewport } from 'next'
import { Montserrat, Yellowtail, Poppins } from 'next/font/google'
import { GoogleTagManager } from '@next/third-parties/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Footer } from '@/components/footer'
import { Toaster } from '@/components/ui/toaster'
import { AuthModalProvider } from '@/components/auth-modal'
import { DonationProvider } from '@/components/donation-context'
import { DonationModal } from '@/components/donation-modal'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-montserrat',
})

const yellowtail = Yellowtail({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-yellowtail',
})

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['800'],
  display: 'swap',
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.quepintasalta.com.ar'),
  title: {
    default: 'Que pinta Salta - Eventos, Peñas y Boliches en Salta Capital',
    template: '%s | Que pinta Salta',
  },
  description: 'La agenda cultural definitiva de Salta Capital. Encontrá peñas folclóricas, boliches, recitales, teatros, ferias, talleres y cine hoy en Salta.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: 'https://www.quepintasalta.com.ar',
    title: 'Que pinta Salta - Eventos, Peñas y Boliches en Salta Capital',
    description: 'La agenda cultural definitiva de Salta Capital. Encontrá peñas folclóricas, boliches, recitales, teatros, ferias, talleres y cine hoy en Salta.',
    siteName: 'Que pinta Salta',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Que pinta Salta - Agenda de Eventos y Peñas en Salta Capital',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Que pinta Salta - Eventos, Peñas y Boliches en Salta Capital',
    description: 'La agenda cultural definitiva de Salta Capital. Encontrá peñas folclóricas, boliches, recitales, teatros, ferias, talleres y cine hoy en Salta.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#AA1B1B' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode
  modal: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${montserrat.variable} ${yellowtail.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        {process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <GoogleTagManager gtmId="GTM-WZK9W6BJ" />
      <body className="font-sans antialiased bg-background">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthModalProvider>
            <DonationProvider>
              {children}
              {modal}
              <Footer />
              <Toaster />
              <DonationModal />
            </DonationProvider>
          </AuthModalProvider>
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

