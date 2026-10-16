/**
 * Búsqueda de texto única de Buscar (R29, 29-j; ops/paridad-web-app.md §3.5).
 * La usan la web (`apps/web/app/buscar/buscar-content.tsx`) y la app
 * (`apps/mobile/app/(tabs)/buscar.tsx`). Que las dos la llamen, sin una copia
 * propia, lo fijan `apps/web/tests/core/busqueda.test.ts` y
 * `apps/mobile/tests/buscar.test.ts`.
 *
 * QPS-021 (R30, Fase 2, 16/10): ignora tildes y mayúsculas con
 * `normalizeFilterText`, la misma normalización que los filtros de la portada
 * (`home/filters.ts`). "pena" encuentra "Peña", en la web y en la app.
 */
import { normalizeFilterText } from "./filters"
import type { DisplayEvent } from "./types"

/**
 * Busca en título, lugar (`venue`) y descripción. Sin texto (o solo espacios),
 * lista vacía: mismo criterio que `buscar-content.tsx`, que sin
 * `deferredSearchQuery` no muestra resultados.
 */
export function buscarEventosPorTexto(eventos: DisplayEvent[], query: string): DisplayEvent[] {
  if (!query) return []
  const q = normalizeFilterText(query)
  if (!q) return []
  return eventos.filter(
    (evento) =>
      normalizeFilterText(evento.title).includes(q) ||
      normalizeFilterText(evento.venue).includes(q) ||
      normalizeFilterText(evento.description).includes(q)
  )
}
