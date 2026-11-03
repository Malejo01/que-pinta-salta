/**
 * Q5-16 (decisión nº13 de Mauro sobre la Q4): el `name`, la `description` y el
 * `inLanguage` del JSON-LD de la ficha del evento, según el idioma de la página.
 *
 * - En /en/evento/<id>, si el evento tiene traducción (`title_en`), van el
 *   título y la descripción traducidos, con `inLanguage: "en"`. Si falta solo
 *   la descripción traducida, va la original (igual que la página).
 * - Sin traducción (o en castellano), van los originales con `inLanguage: "es-AR"`.
 *
 * Puro: sin red ni base.
 */
export interface TextosEventoJsonLd {
  title: string
  title_en?: string | null
  description?: string | null
  description_en?: string | null
  short_description?: string | null
}

export function textosJsonLdEvento(
  evento: TextosEventoJsonLd,
  idioma: 'es' | 'en',
): { name: string; description: string; inLanguage: 'en' | 'es-AR' } {
  const original = evento.short_description || evento.description || `${evento.title} en Salta Capital.`
  const tituloEn = evento.title_en?.trim()
  if (idioma === 'en' && tituloEn) {
    const descripcionEn = evento.description_en?.trim()
    return {
      name: tituloEn,
      description: descripcionEn || original,
      inLanguage: 'en',
    }
  }
  return { name: evento.title, description: original, inLanguage: 'es-AR' }
}
