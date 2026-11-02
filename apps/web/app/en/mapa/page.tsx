import type { Metadata } from "next"
import { PaginaMapa, type MapaPageProps } from "@/components/mapa/pagina-mapa"
import { idiomasAlternos } from "@/lib/i18n/seo"

const TITULO = "Events Map for Salta, Argentina | Qué Pinta Salta"
const DESCRIPCION =
  "See on the map where events are happening in Salta City: folk music nights (peñas), concerts, nightclubs, fairs and more, today, this weekend or on the day you pick."

// /mapa en inglés (C4). Metadata propia: el openGraph de la página reemplaza
// entero al del layout (en castellano), por eso repite la imagen. `absolute`
// para que no se le sume el template del layout.
export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: "/en/mapa", languages: idiomasAlternos("/mapa") },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["es_AR"],
    url: "/en/mapa",
    title: TITULO,
    description: "See where events are happening in Salta City, today, this weekend or on the day you pick.",
    siteName: "Que pinta Salta",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Que pinta Salta - Events map for Salta, Argentina",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRIPCION,
    images: ["/og-image.png"],
  },
}

// Mismo cuerpo que app/mapa/page.tsx, en inglés.
export default function MapaPageEn({ searchParams }: MapaPageProps) {
  return PaginaMapa({ searchParams, idioma: "en" })
}
