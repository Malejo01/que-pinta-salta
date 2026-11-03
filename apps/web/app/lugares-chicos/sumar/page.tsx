import type { Metadata } from "next"
import { PaginaSumarLugar } from "@/components/lugares-chicos/pagina-sumar"
import { idiomasAlternos } from "@/lib/i18n/seo"

// Dinámica: el formulario lleva la hora del servidor (tiempo mínimo del anti-spam).
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Sumá un lugar para chicos",
  description: "Contanos de una plaza, un pelotero, un salón de juegos o un espacio cultural para chicos en Salta Capital.",
  alternates: { canonical: "/lugares-chicos/sumar", languages: idiomasAlternos("/lugares-chicos/sumar") },
  // Un formulario: no hace falta que aparezca en buscadores.
  robots: { index: false, follow: true },
}

export default function SumarLugarPage() {
  return <PaginaSumarLugar idioma="es" />
}
