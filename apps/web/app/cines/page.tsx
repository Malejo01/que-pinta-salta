import { Metadata } from 'next'
import { PaginaCines } from '@/components/cines/pagina-cines'
import { idiomasAlternos } from '@/lib/i18n/seo'

// Metadata para SEO
export const metadata: Metadata = {
  title: 'Cartelera de Cines en Salta | Qué Pinta Salta',
  description: 'Consultá los horarios, formatos y películas en cartelera para Cinemark Alto NOA, Cinemark Paseo Salta y Cine Ópera. Comprá tus entradas al instante.',
  alternates: { canonical: '/cines', languages: idiomasAlternos('/cines') },
  openGraph: {
    title: 'Cartelera de Cines en Salta | Qué Pinta Salta',
    description: 'Toda la cartelera de cines de Salta unificada de forma inteligente.',
    type: 'website',
  }
}

export const revalidate = 0 // Evita cache estático para reflejar cambios diarios del scraper

// El cuerpo (datos + contenido) vive en components/cines/pagina-cines.tsx,
// compartido con la versión en inglés (app/en/cines/page.tsx).
export default function CinesPage() {
  return <PaginaCines idioma="es" />
}
