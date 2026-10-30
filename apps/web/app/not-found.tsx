import type { Metadata } from "next"
import { PaginaDeError } from "@/components/pagina-de-error"

// El layout declara index: true para todo el sitio; acá lo pisamos con noindex.
// Next además inyecta su propio <meta name="robots" content="noindex"> en las
// respuestas 404 (server-inserted HTML), así que en el HTML puede haber dos metas
// robots, ambas noindex. A verificar en la preview mirando una URL inexistente.
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
