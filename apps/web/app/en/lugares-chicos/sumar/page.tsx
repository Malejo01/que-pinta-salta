import type { Metadata } from "next"
import { PaginaSumarLugar } from "@/components/lugares-chicos/pagina-sumar"
import { idiomasAlternos } from "@/lib/i18n/seo"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: { absolute: "Suggest a place for kids in Salta | Qué Pinta Salta" },
  description: "Tell us about a playground, an indoor play area, a play center or a cultural space for kids in Salta City.",
  alternates: { canonical: "/en/lugares-chicos/sumar", languages: idiomasAlternos("/lugares-chicos/sumar") },
  robots: { index: false, follow: true },
}

export default function SumarLugarPageEn() {
  return <PaginaSumarLugar idioma="en" />
}
