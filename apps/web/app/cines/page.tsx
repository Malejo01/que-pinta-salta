import { Metadata } from 'next'
import { PaginaCines } from '@/components/cines/pagina-cines'
import { idiomasAlternos } from '@/lib/i18n/seo'
import { IMAGEN_OG_POR_DEFECTO, SITE_NAME, tituloConMarca } from '@/lib/seo/sitio'

const TITULO = 'Cartelera de Cines en Salta'
const DESCRIPCION_SOCIAL = 'Toda la cartelera de cines de Salta unificada de forma inteligente.'

// Metadata para SEO. B2: el `title` sin marca (la agrega la plantilla del
// layout; antes quedaba «… | Qué Pinta Salta | Que pinta Salta»). Open Graph
// y Twitter van completos porque Next no los mezcla con los del layout: el
// bloque de la página reemplaza al del layout entero, y sin `images` ni
// `url` la página se quedaba sin `og:image` ni `og:url`. Sin `twitter`
// propio quedaba el del layout, con el título y la descripción de la portada.
export const metadata: Metadata = {
  title: TITULO,
  description: 'Consultá los horarios, formatos y películas en cartelera para Cinemark Alto NOA, Cinemark Paseo Salta y Cine Ópera. Comprá tus entradas al instante.',
  alternates: { canonical: '/cines', languages: idiomasAlternos('/cines') },
  openGraph: {
    title: tituloConMarca(TITULO),
    description: DESCRIPCION_SOCIAL,
    type: 'website',
    url: '/cines',
    siteName: SITE_NAME,
    locale: 'es_AR',
    images: [{ ...IMAGEN_OG_POR_DEFECTO }],
  },
  twitter: {
    card: 'summary_large_image',
    title: tituloConMarca(TITULO),
    description: DESCRIPCION_SOCIAL,
    images: [IMAGEN_OG_POR_DEFECTO.url],
  },
}

export const revalidate = 0 // Evita cache estático para reflejar cambios diarios del scraper

// El cuerpo (datos + contenido + JSON-LD) vive en components/cines/pagina-cines.tsx,
// compartido con la versión en inglés (app/en/cines/page.tsx).
export default function CinesPage() {
  return <PaginaCines idioma="es" />
}
