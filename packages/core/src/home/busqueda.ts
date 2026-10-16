/**
 * Búsqueda de texto única de Buscar (R29, 29-j; ops/paridad-web-app.md §3.5).
 * No tiene archivo puente en `apps/web/lib` (como `home/filtros-extra.ts`):
 * en la web esta lógica vive inline en el `useMemo` `filteredEvents` de
 * `apps/web/app/buscar/buscar-content.tsx`, nunca fue un módulo propio. La
 * prueba de que las dos hacen lo mismo es un test de equivalencia en
 * `apps/web/tests/core/busqueda.test.ts`, que reimplementa ese cuerpo tal
 * cual (copiado) y compara resultado a resultado con fixtures.
 *
 * A propósito, **no** usa `normalizeFilterText` (NFD) como `home/filters.ts`:
 * la web, acá, solo hace `toLowerCase()` + `includes()`, sin tocar acentos.
 * Es un criterio distinto del resto de los filtros de la portada.
 */
import type { DisplayEvent } from "./types"

/**
 * Busca en título, lugar (`venue`) y descripción. Sin texto, lista vacía
 * (mismo criterio que `buscar-content.tsx`: sin `deferredSearchQuery`, no
 * hay `filteredEvents`).
 */
export function buscarEventosPorTexto(eventos: DisplayEvent[], query: string): DisplayEvent[] {
  if (!query) return []
  const q = query.toLowerCase()
  return eventos.filter(
    (evento) =>
      evento.title.toLowerCase().includes(q) ||
      evento.venue.toLowerCase().includes(q) ||
      evento.description.toLowerCase().includes(q)
  )
}
