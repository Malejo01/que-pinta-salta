/**
 * Prioridad de fuentes para la resolución de conflictos en la deduplicación.
 *
 * Cuando dos registros son el mismo evento (misma clave de dedup) pero traen
 * valores distintos para un campo, gana el valor de la fuente de mayor
 * prioridad. El valor perdedor no se descarta en silencio: queda guardado en
 * `events.merge_audit`.
 *
 * Orden y justificación
 * ---------------------
 *   ticketera  (400)  La ticketera vende la entrada. Si el evento se mudó de
 *                     sala o cambió de horario, la ticketera es la que tiene
 *                     que estar bien o no cobra: su venue y su fecha son el
 *                     dato correcto por construcción.
 *   portal     (300)  vamos.gob.ar publica agenda oficial de la Provincia.
 *                     Confiable para eventos públicos y gratuitos, pero copia
 *                     a mano y llega tarde a los cambios de última hora.
 *   manual     (200)  Carga de admin/colaborador. Puede ser más precisa que
 *                     cualquier scraper, pero es la que más se desactualiza:
 *                     nadie vuelve a editar un evento ya cargado.
 *   instagram  (100)  Flyer + extracción por IA. Es la fuente con más
 *                     cobertura y la de peor precisión: el lugar suele venir
 *                     del handle de la cuenta, no del flyer, y el horario es
 *                     el que Gemini leyó de una imagen.
 *
 * Cualquier `source_key` desconocido cae en el tramo más bajo a propósito:
 * una fuente que nadie clasificó nunca debería pisar a una que sí.
 */

export type SourceTier = 'ticketera' | 'portal' | 'manual' | 'instagram'

export const SOURCE_PRIORITY: Record<SourceTier, number> = {
  ticketera: 400,
  portal: 300,
  manual: 200,
  instagram: 100,
}

/**
 * Mapa `source_key` -> tramo. Las claves son las que efectivamente se escriben
 * en `events.scrape_source_key` y las que se pasan a
 * upsertEventWithDeduplication(), no sólo las de SCRAPE_SOURCES:
 *   - 'instagram-ai' lo escribe lib/ai/process-flyer-ai.ts
 *   - 'manual' / 'usuario' vienen de la carga por formulario
 *   - 'unknown' es el fallback de saveEventsToSupabase()
 */
export const SOURCE_TIERS: Record<string, SourceTier> = {
  // Ticketeras: venden la entrada.
  norteticket: 'ticketera',
  entradauno: 'ticketera',
  alpogo: 'ticketera',
  paseshow: 'ticketera',
  tuentrada: 'ticketera',
  ticketek: 'ticketera',
  passline: 'ticketera',
  eventbrite: 'ticketera',

  // Portal provincial.
  vamos: 'portal',
  'vamos.gob.ar': 'portal',

  // Carga manual (admin, colaborador, productor independiente).
  manual: 'manual',
  admin: 'manual',
  usuario: 'manual',
  independientes: 'manual',

  // Instagram vía Apify + Gemini.
  instagram: 'instagram',
  'instagram-ai': 'instagram',
  apify: 'instagram',
}

/** Tramo asignado a un source_key no reconocido. Ver nota de arriba. */
export const FALLBACK_TIER: SourceTier = 'instagram'

export function getSourceTier(sourceKey?: string | null): SourceTier {
  if (!sourceKey) return FALLBACK_TIER
  return SOURCE_TIERS[sourceKey.trim().toLowerCase()] ?? FALLBACK_TIER
}

/**
 * Fuente efectiva de una fila de `events`.
 *
 * Los eventos cargados por formulario no escriben `scrape_source_key` (queda
 * NULL) pero sí `created_by`. Sin esta corrección caerían en el tramo más bajo
 * y un flyer de Instagram les pisaría el lugar y el horario, que es lo
 * contrario de lo que dice la tabla de prioridades.
 */
export function resolveEventSource(row: {
  scrape_source_key?: string | null
  created_by?: string | null
}): string {
  const key = row?.scrape_source_key?.trim()
  if (key) return key
  return row?.created_by ? 'manual' : 'unknown'
}

export function getSourcePriority(sourceKey?: string | null): number {
  return SOURCE_PRIORITY[getSourceTier(sourceKey)]
}

/**
 * `> 0` si `a` le gana a `b`, `< 0` si pierde, `0` si empatan.
 * El empate NO se rompe acá: lo resuelve quien llama, y siempre a favor del
 * registro que ya estaba (ver mergeEvents / pickKeeper).
 */
export function compareSourcePriority(a?: string | null, b?: string | null): number {
  return getSourcePriority(a) - getSourcePriority(b)
}

/** Etiqueta legible para los reportes del job de limpieza. */
export function describeSource(sourceKey?: string | null): string {
  const tier = getSourceTier(sourceKey)
  return `${sourceKey || 'sin-fuente'} (${tier}/${SOURCE_PRIORITY[tier]})`
}
