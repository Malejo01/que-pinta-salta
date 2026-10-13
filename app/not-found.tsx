import type { Metadata } from "next"
import { PaginaDeError } from "@/components/pagina-de-error"

// El layout declara index: true para todo el sitio; acá lo pisamos para que
// quede una sola meta robots, con noindex.
export const metadata: Metadata = {
  title: "No encontramos esa página",
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
}

export default function NotFound() {
  return (
    <PaginaDeError
      titulo="No encontramos esa página"
      texto="El link puede estar mal o el evento ya no está. Mirá qué pinta hoy o buscá otra cosa."
    />
  )
}
