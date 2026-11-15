/**
 * Orden de la lista de /admin/lugares (Q7-2).
 *
 * Con `sugerenciasPrimero` (pestaña «Sin ubicación»), los lugares con una
 * ubicación sugerida pendiente van arriba: confirmarla es un botón y, mientras
 * esté pendiente, la geocodificación diaria no vuelve a consultar ese lugar
 * (Q5-16). Antes quedaban mezclados entre todos los lugares sin ubicación.
 * Después, de más a menos eventos próximos; a igual cantidad, por nombre.
 *
 * Puro: no modifica la lista.
 */
export function ordenarLugaresAdmin<T extends { id: string; name: string; geocode_sugerencia_lat: number | null }>(
  lugares: T[],
  conteoPorVenue: Map<string, number>,
  { sugerenciasPrimero }: { sugerenciasPrimero: boolean }
): T[] {
  const conSugerencia = (v: T) => (sugerenciasPrimero && v.geocode_sugerencia_lat !== null ? 1 : 0)
  return [...lugares].sort(
    (a, b) =>
      conSugerencia(b) - conSugerencia(a) ||
      (conteoPorVenue.get(b.id) ?? 0) - (conteoPorVenue.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name, 'es')
  )
}
