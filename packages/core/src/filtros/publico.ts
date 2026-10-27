/**
 * Filtros por público (Q3, C1). "Para chicos" del mapa y de Buscar en la web.
 * Sin React ni next/*.
 *
 * Firma y regla acordadas entre sesiones: si otra rama crea este mismo
 * archivo, tiene que quedar idéntico (mismo nombre, misma firma, misma regla).
 */

/** Tags que marcan un evento como apto para ir con chicos (ya en minúsculas y sin tildes). */
const TAGS_PARA_CHICOS = new Set(['infantil', 'apto-chicos', 'ninos', 'chicos', 'familia'])

/** Minúsculas y sin tildes ni diéresis: "Niños" → "ninos", "FAMILIA" → "familia". */
function normalizarTag(tag: string): string {
  return tag.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * `true` si `categorySlug` es `'infantil'` o algún tag, en minúsculas y sin
 * tildes, es `'infantil'`, `'apto-chicos'`, `'ninos'`, `'chicos'` o `'familia'`.
 */
export function esParaChicos(e: { categorySlug?: string | null; tags?: readonly string[] | null }): boolean {
  if (e.categorySlug === 'infantil') return true
  return (e.tags ?? []).some((tag) => typeof tag === 'string' && TAGS_PARA_CHICOS.has(normalizarTag(tag)))
}
