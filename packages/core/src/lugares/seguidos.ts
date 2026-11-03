/** Q5-6 · Cuántos eventos próximos tiene cada lugar seguido (puro). */
export function contarProximosPorLugar(eventos: readonly { venue_id: string | null }[]): Map<string, number> {
  const conteo = new Map<string, number>()
  for (const e of eventos) {
    if (!e.venue_id) continue
    conteo.set(e.venue_id, (conteo.get(e.venue_id) ?? 0) + 1)
  }
  return conteo
}
