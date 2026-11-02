import type { Metadata } from "next"
import { PaginaAnunciantes } from "@/components/anunciantes/pagina-anunciantes"
import { ANUNCIANTES } from "@/lib/config/anunciantes"
import { idiomasAlternos } from "@/lib/i18n/seo"

// ISR como /anunciantes: `revalidate` literal (Next no toma uno reexportado).
export const revalidate = 3600

const TITULO = "Advertise Your Event in Salta, Argentina | Qué Pinta Salta"
const DESCRIPCION =
  "Reach the audience already looking for things to do in Salta City: featured spots on the home page, packs for organizers and promoters, with published prices and a click report."

// /anunciantes en inglés. Metadata propia: el openGraph de la página reemplaza
// entero al del layout (en castellano), por eso repite la imagen. `absolute`
// para que no se le sume el template del layout.
export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: "/en/anunciantes", languages: idiomasAlternos("/anunciantes") },
  // Igual que en castellano: sin publicar, ni se indexa ni entra al sitemap.
  ...(ANUNCIANTES.publicada ? {} : { robots: { index: false, follow: false } }),
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["es_AR"],
    url: "/en/anunciantes",
    title: TITULO,
    description: "Reach the audience already looking for things to do in Salta City.",
    siteName: "Que pinta Salta",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Que pinta Salta - Advertise your event in Salta, Argentina",
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

export default async function AnunciantesPageEn() {
  return PaginaAnunciantes({ idioma: "en" })
}
