import type { Metadata } from "next"
import { PaginaAnunciantes } from "@/components/anunciantes/pagina-anunciantes"
import { ANUNCIANTES } from "@/lib/config/anunciantes"
import { idiomasAlternos } from "@/lib/i18n/seo"

/**
 * Página 100% estática desde el punto de vista de Next (ISR): ningún
 * componente cliente nuevo ni API dinámica (`cookies()`, `headers()`). El
 * cuerpo vive en `components/anunciantes/pagina-anunciantes.tsx`, compartido
 * con `/en/anunciantes`. El `revalidate` va literal acá (Next no toma uno
 * reexportado).
 */
export const revalidate = 3600

export const metadata: Metadata = {
  title: "Publicitá tu evento | Qué Pinta Salta",
  description:
    "Llegá al público que ya está buscando salidas en Salta Capital: destacados en la portada, packs para organizadores y RRPP, con precios publicados y reporte de clics.",
  alternates: { canonical: "/anunciantes", languages: idiomasAlternos("/anunciantes") },
  // Si ANUNCIANTES.publicada fuera false, la página no se indexa ni entra
  // al sitemap (ver app/sitemap.ts).
  ...(ANUNCIANTES.publicada ? {} : { robots: { index: false, follow: false } }),
}

export default async function AnunciantesPage() {
  return PaginaAnunciantes({ idioma: "es" })
}
