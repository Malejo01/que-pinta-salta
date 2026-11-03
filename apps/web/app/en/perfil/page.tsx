import type { Metadata } from "next"
import { PaginaPerfil } from "@/app/perfil/pagina-perfil"

export const revalidate = 0 // Evitar caché estática para esta página privada

// Q6-2: /perfil en inglés. Privada: `noindex, follow` y sin hreflang (como
// /en/radar). Sin sesión redirige a /en/auth/login y vuelve a /en/perfil.
export const metadata: Metadata = {
  title: { absolute: "My profile | Qué Pinta Salta" },
  robots: { index: false, follow: true },
}

export default async function PerfilPageEn() {
  return PaginaPerfil({ idioma: "en" })
}
