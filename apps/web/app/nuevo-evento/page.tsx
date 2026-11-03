import { PaginaNuevoEvento } from "./pagina-nuevo-evento"

// Q6-2: el cuerpo vive en `pagina-nuevo-evento.tsx`, compartido con /en/nuevo-evento.
export default async function NuevoEventoPage({
  searchParams,
}: {
  searchParams: Promise<{ cloneId?: string; editId?: string }>
}) {
  return PaginaNuevoEvento({ searchParams, idioma: "es" })
}
