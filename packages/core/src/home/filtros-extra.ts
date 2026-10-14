/**
 * Filtros extra de la portada que no entraron en `home/filters.ts` (R26,
 * tarea 26-a). Sin React ni next/*.
 */
import type { DisplayEvent } from "./types"

/** Solo los eventos gratis. `'confirmar'` y cualquier número (incluido 0) no pasan. */
export function soloGratis(eventos: DisplayEvent[]): DisplayEvent[] {
  return eventos.filter((evento) => evento.price === "gratis")
}
