import type { Metadata } from "next"
import { BuscarContent } from "./buscar-content"

export const metadata: Metadata = {
  title: "Buscar Eventos en Salta Capital",
  description: "Buscá peñas, recitales, boliches, ferias, talleres y teatro en Salta Capital. Encontrá qué hacer hoy en la ciudad.",
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

export default function BuscarPage() {
  return <BuscarContent />
}
