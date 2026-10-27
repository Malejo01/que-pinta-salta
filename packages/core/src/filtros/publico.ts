/**
 * Filtros por público (A3, nube Q1): si un evento es "para chicos". Lo usan
 * el chip "Para chicos" de la app (portada y Buscar) y, con la misma firma,
 * la web. Sin React ni next/*.
 *
 * Un evento es para chicos si su categoría es `infantil` o si alguno de sus
 * `tags` (la columna `events.tags`, que ya viene en `PUBLIC_EVENT_COLUMNS`) es
 * una de las marcas de `TAGS_PARA_CHICOS`. Se compara la marca ENTERA (en
 * minúsculas, sin tildes y sin espacios alrededor), nunca "contiene": con
 * "contiene", "no-apto-chicos" pasaría por "apto-chicos" y "chicos-grandes" o
 * "infantiles" pasarían sin que nadie lo haya decidido. Una marca nueva se
 * suma a la lista, a propósito.
 */

/** Slug de `categories` que es, toda entera, para chicos. */
export const CATEGORIA_PARA_CHICOS = "infantil"

/** Las marcas de `events.tags` que hacen que un evento sea para chicos (ya normalizadas). */
export const TAGS_PARA_CHICOS: readonly string[] = ["infantil", "apto-chicos", "ninos", "chicos", "familia"]

const MARCAS = new Set(TAGS_PARA_CHICOS)

/**
 * Minúsculas, sin tildes (NFD y sin las marcas combinantes: "Niños" -> "ninos")
 * y sin espacios alrededor. Cualquier cosa que no sea un string da `""`.
 */
function normalizarMarca(valor: unknown): string {
  if (typeof valor !== "string") return ""
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
}

/**
 * `true` si el evento es para chicos: categoría `infantil` o algún tag de
 * `TAGS_PARA_CHICOS`. Tolerante a `null`/`undefined`, a strings vacíos, a
 * `tags` que no sea un array y a tags que no sean strings (se ignoran).
 */
export function esParaChicos(e: { categorySlug?: string | null; tags?: readonly string[] | null }): boolean {
  if (normalizarMarca(e.categorySlug) === CATEGORIA_PARA_CHICOS) return true
  const tags: unknown = e.tags
  if (!Array.isArray(tags)) return false
  return tags.some((tag) => MARCAS.has(normalizarMarca(tag)))
}
