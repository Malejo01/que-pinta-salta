import { Metadata } from 'next'
import { PaginaCines } from '@/components/cines/pagina-cines'
import { idiomasAlternos } from '@/lib/i18n/seo'

const TITULO = 'Movie Showtimes in Salta, Argentina | Que pinta Salta'
const DESCRIPCION =
  'Showtimes, formats and movies playing today at Cinemark Alto NOA, Cinemark Paseo Salta and Cine Ópera. Buy your tickets in seconds.'

// /cines en inglés (Q3). Metadata propia: el openGraph de la página reemplaza
// entero al del layout (en castellano), por eso repite la imagen. `absolute`
// para que no se le sume el template del layout.
export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: '/en/cines', languages: idiomasAlternos('/cines') },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['es_AR'],
    url: '/en/cines',
    title: TITULO,
    description: 'Every movie showing in Salta, all in one place.',
    siteName: 'Que pinta Salta',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Que pinta Salta - Movie showtimes in Salta, Argentina',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRIPCION,
    images: ['/og-image.png'],
  },
}

// Literal, igual que en app/cines/page.tsx: Next no toma `revalidate` reexportado.
export const revalidate = 0 // Evita cache estático para reflejar cambios diarios del scraper

export default function CinesPageEn() {
  return <PaginaCines idioma="en" />
}
