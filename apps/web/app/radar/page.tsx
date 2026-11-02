import { PaginaRadar } from "@/components/radar/pagina-radar"
import type { Metadata } from "next"

// B2: sin la marca (la agrega la plantilla del layout) ni el emoji (Google
// suele sacarlo del título del resultado). `noindex, follow`: es una página
// privada; sin sesión redirige al ingreso.
export const metadata: Metadata = {
  title: "Mi Radar Salteño",
  description: "Personalizá tu suscripción de novedades para recibir la agenda cultural de Salta en tu email.",
  robots: { index: false, follow: true },
}

export default async function RadarPage() {
  return PaginaRadar({ idioma: "es" })
}
