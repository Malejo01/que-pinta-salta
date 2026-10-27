import { PaginaPortada } from "@/components/portada/pagina-portada"
import { idiomasAlternos } from "@/lib/i18n/seo"
import type { Metadata } from "next"

const TITULO = "Que pinta Salta - Events, Peñas and Nightlife in Salta, Argentina"
const DESCRIPCION =
  "What's on in Salta, Argentina: folk music peñas, nightclubs, concerts, theater, fairs, workshops and movies, updated every day."

// La portada en inglés (Q3). Metadata propia: el openGraph y el twitter de la
// página reemplazan enteros a los del layout (que están en castellano), por
// eso repiten la imagen. `absolute` para que no se le sume el template del
// layout ("%s | Que pinta Salta"), igual que el título por omisión de `/`.
export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: "/en", languages: idiomasAlternos("/") },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["es_AR"],
    url: "/en",
    title: TITULO,
    description: DESCRIPCION,
    siteName: "Que pinta Salta",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Que pinta Salta - Events and peñas in Salta, Argentina",
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

export default function HomePageEn() {
  return <PaginaPortada idioma="en" />
}
