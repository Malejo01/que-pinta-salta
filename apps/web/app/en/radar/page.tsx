import { PaginaRadar } from "@/components/radar/pagina-radar"
import type { Metadata } from "next"

// /radar en inglés. Privada: `noindex, follow` y sin hreflang. Sin sesión
// redirige al ingreso (en castellano) y vuelve a /en/radar. `absolute`: sin la
// plantilla del layout (que está en castellano).
export const metadata: Metadata = {
  title: { absolute: "My Salta Radar | Qué Pinta Salta" },
  description: "Customize your event updates to get Salta's cultural agenda in your email.",
  robots: { index: false, follow: true },
}

export default async function RadarPageEn() {
  return PaginaRadar({ idioma: "en" })
}
