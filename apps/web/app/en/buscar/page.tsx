import type { Metadata } from "next"
import { PaginaBuscar } from "@/components/buscar/pagina-buscar"
import { idiomasAlternos } from "@/lib/i18n/seo"

const TITULO = "Search Events in Salta, Argentina | Qué Pinta Salta"
const DESCRIPCION =
  "Search folk music nights (peñas), concerts, nightclubs, fairs, workshops and theater in Salta City. Find out what to do in town today."

// /buscar en inglés (C4). Metadata propia: el openGraph de la página reemplaza
// entero al del layout (en castellano), por eso repite la imagen. `absolute`
// para que no se le sume el template del layout.
export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: "/en/buscar", languages: idiomasAlternos("/buscar") },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["es_AR"],
    url: "/en/buscar",
    title: TITULO,
    description: "Search every event happening in Salta City.",
    siteName: "Que pinta Salta",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Que pinta Salta - Search events in Salta, Argentina",
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

export default function BuscarPageEn() {
  return <PaginaBuscar idioma="en" />
}
