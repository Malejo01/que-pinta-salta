import type { Metadata } from "next"
import { PaginaBuscar } from "@/components/buscar/pagina-buscar"
import { idiomasAlternos } from "@/lib/i18n/seo"

export const metadata: Metadata = {
  title: "Buscar Eventos en Salta Capital",
  description: "Buscá peñas, recitales, boliches, ferias, talleres y teatro en Salta Capital. Encontrá qué hacer hoy en la ciudad.",
  alternates: { canonical: "/buscar", languages: idiomasAlternos("/buscar") },
  openGraph: {
    title: "Buscar Eventos en Salta Capital | Qué Pinta Salta",
    description: "Buscá peñas, recitales, boliches, ferias, talleres y teatro en Salta Capital.",
    url: "https://www.quepintasalta.com.ar/buscar",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Buscar Eventos en Salta Capital | Qué Pinta Salta",
    description: "Buscá peñas, recitales, boliches, ferias, talleres y teatro en Salta Capital.",
  },
}

// El cuerpo (datos + contenido) vive en components/buscar/pagina-buscar.tsx,
// compartido con la versión en inglés (app/en/buscar/page.tsx).
export default function BuscarPage() {
  return <PaginaBuscar idioma="es" />
}
