import { PaginaPortada } from "@/components/portada/pagina-portada"
import { idiomasAlternos } from "@/lib/i18n/seo"
import type { Metadata } from "next"

// Canónica acá y no en el layout: en el layout la heredarían todas las páginas
// que no declaran la suya, y quedarían todas apuntando a la portada.
export const metadata: Metadata = {
  alternates: { canonical: "/", languages: idiomasAlternos("/") },
}

// El cuerpo (datos + contenido + JSON-LD) vive en components/portada/pagina-portada.tsx,
// compartido con la versión en inglés (app/en/page.tsx).
export default function HomePage() {
  return <PaginaPortada idioma="es" />
}
