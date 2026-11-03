import type { Metadata } from "next"
import { PaginaNuevoEvento } from "@/app/nuevo-evento/pagina-nuevo-evento"

// Q6-2: /nuevo-evento en inglés. Con sesión (el middleware manda a
// /en/auth/login?next=/en/nuevo-evento): `noindex, follow` y sin hreflang.
export const metadata: Metadata = {
  title: { absolute: "Add an event | Qué Pinta Salta" },
  robots: { index: false, follow: true },
}

export default async function NuevoEventoPageEn({
  searchParams,
}: {
  searchParams: Promise<{ cloneId?: string; editId?: string }>
}) {
  return PaginaNuevoEvento({ searchParams, idioma: "en" })
}
