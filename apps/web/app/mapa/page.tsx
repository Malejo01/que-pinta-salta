import type { Metadata } from "next"
import { PaginaMapa, type MapaPageProps } from "@/components/mapa/pagina-mapa"
import { idiomasAlternos } from "@/lib/i18n/seo"

export const metadata: Metadata = {
  title: "Mapa de eventos en Salta",
  description: "Mirá en el mapa dónde pasan los eventos de Salta Capital: peñas, recitales, boliches, ferias y más, hoy, este finde o el día que elijas.",
  alternates: { canonical: "/mapa", languages: idiomasAlternos("/mapa") },
  openGraph: {
    title: "Mapa de eventos en Salta | Qué Pinta Salta",
    description: "Mirá en el mapa dónde pasan los eventos de Salta Capital, hoy, este finde o el día que elijas.",
    url: "https://www.quepintasalta.com.ar/mapa",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mapa de eventos en Salta | Qué Pinta Salta",
    description: "Mirá en el mapa dónde pasan los eventos de Salta Capital, hoy, este finde o el día que elijas.",
  },
}

// El cuerpo (datos + contenido) vive en components/mapa/pagina-mapa.tsx,
// compartido con la versión en inglés (app/en/mapa/page.tsx). Se llama como
// función y no como <PaginaMapa />: así esta página devuelve el árbol entero.
export default function MapaPage({ searchParams }: MapaPageProps) {
  return PaginaMapa({ searchParams, idioma: "es" })
}
