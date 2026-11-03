/**
 * Q4-7: títulos y descripciones de eventos en inglés. Puro: sin red, sin base
 * y sin el modelo (lo llama `apps/web/lib/ai/traducir-evento.ts`).
 *
 * Reglas:
 *  - Tope diario (por defecto 100 eventos por día de Salta). Con tope 0 no se
 *    traduce nada.
 *  - Nunca se traducen los nombres de lugares ni de artistas: si un nombre
 *    protegido aparece en el título original y no aparece igual en la
 *    traducción, la traducción se descarta (se muestra el original con
 *    «(in Spanish)»).
 *  - En /en se muestra la traducción si existe; si no, el original marcado
 *    como castellano.
 */

export const TOPE_DIARIO_POR_DEFECTO = 100
export const LARGO_MAXIMO_TITULO_EN = 200
export const LARGO_MAXIMO_DESCRIPCION_ORIGINAL = 1500
export const LARGO_MAXIMO_DESCRIPCION_EN = 2000

/**
 * El tope diario, desde la variable de entorno (texto). Vacía o inválida →
 * `TOPE_DIARIO_POR_DEFECTO`; `"0"` → 0 (apagado). Nunca negativo ni más de 1000.
 */
export function topeDiario(valor: string | undefined | null): number {
  if (valor === undefined || valor === null || valor.trim() === '') return TOPE_DIARIO_POR_DEFECTO
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 0) return TOPE_DIARIO_POR_DEFECTO
  return Math.min(n, 1000)
}

/** Cuántos se pueden traducir en esta corrida: lo que queda del día, sin pasar el lote. */
export function cupoDeLaCorrida({ tope, traducidosHoy, lote }: { tope: number; traducidosHoy: number; lote: number }): number {
  return Math.max(0, Math.min(lote, tope - Math.max(0, traducidosHoy)))
}

export interface EventoParaTraducir {
  id: string
  title: string
  description: string | null
  venueName: string | null
  artists: string[]
}

export interface TraduccionPropuesta {
  title_en: string
  description_en: string | null
}

function normalizar(texto: string): string {
  return texto.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Los nombres que no se traducen y aparecen en el título original. */
export function nombresProtegidosEnTitulo(evento: Pick<EventoParaTraducir, 'title' | 'venueName' | 'artists'>): string[] {
  const titulo = normalizar(evento.title).toLowerCase()
  const candidatos = [evento.venueName, ...evento.artists]
    .filter((n): n is string => typeof n === 'string')
    .map(normalizar)
    .filter((n) => n.length >= 3)
  return [...new Set(candidatos)].filter((n) => titulo.includes(n.toLowerCase()))
}

/**
 * Q6-10: por qué se descartó una respuesta del modelo. Solo códigos fijos (van
 * a `job_runs.details`): nunca el texto del evento ni de la respuesta.
 *  - `no_es_objeto`: la respuesta no es un objeto JSON.
 *  - `sin_titulo`: falta `title_en`, no es texto o quedó vacío.
 *  - `titulo_largo`: `title_en` pasa `LARGO_MAXIMO_TITULO_EN`.
 *  - `nombre_cambiado`: tradujo o cambió un lugar/artista protegido del título.
 */
export type MotivoDescarteTraduccion = 'no_es_objeto' | 'sin_titulo' | 'titulo_largo' | 'nombre_cambiado'

export const MOTIVOS_DESCARTE_TRADUCCION: readonly MotivoDescarteTraduccion[] = ['no_es_objeto', 'sin_titulo', 'titulo_largo', 'nombre_cambiado']

export type ValidacionTraduccion =
  | { ok: true; traduccion: TraduccionPropuesta }
  | { ok: false; motivo: MotivoDescarteTraduccion }

/**
 * Valida lo que devolvió el modelo y, si lo descarta, dice por qué (Q6-10).
 * Descarta si viene vacía, demasiado larga, o le cambió un nombre protegido.
 * Si el título en inglés quedó igual al original (por ejemplo, un nombre
 * propio), se acepta igual.
 */
export function validarTraduccionConMotivo(evento: EventoParaTraducir, propuesta: unknown): ValidacionTraduccion {
  if (!propuesta || typeof propuesta !== 'object' || Array.isArray(propuesta)) return { ok: false, motivo: 'no_es_objeto' }
  const { title_en, description_en } = propuesta as Record<string, unknown>
  if (typeof title_en !== 'string') return { ok: false, motivo: 'sin_titulo' }
  const titulo = normalizar(title_en)
  if (titulo.length === 0) return { ok: false, motivo: 'sin_titulo' }
  if (titulo.length > LARGO_MAXIMO_TITULO_EN) return { ok: false, motivo: 'titulo_largo' }

  const tituloMinuscula = titulo.toLowerCase()
  for (const nombre of nombresProtegidosEnTitulo(evento)) {
    if (!tituloMinuscula.includes(nombre.toLowerCase())) return { ok: false, motivo: 'nombre_cambiado' }
  }

  let descripcion: string | null = null
  if (typeof description_en === 'string' && evento.description && evento.description.trim()) {
    const d = description_en.trim()
    if (d.length > 0 && d.length <= LARGO_MAXIMO_DESCRIPCION_EN) descripcion = d
  }
  return { ok: true, traduccion: { title_en: titulo, description_en: descripcion } }
}

/**
 * Valida lo que devolvió el modelo. `null` si se descarta (el motivo, con
 * `validarTraduccionConMotivo`).
 */
export function validarTraduccion(evento: EventoParaTraducir, propuesta: unknown): TraduccionPropuesta | null {
  const r = validarTraduccionConMotivo(evento, propuesta)
  return r.ok ? r.traduccion : null
}

/** Lo que se le manda al modelo: la descripción recortada para acotar el costo. */
export function descripcionParaTraducir(descripcion: string | null): string | null {
  if (!descripcion) return null
  const limpia = descripcion.trim()
  if (!limpia) return null
  return limpia.length > LARGO_MAXIMO_DESCRIPCION_ORIGINAL ? `${limpia.slice(0, LARGO_MAXIMO_DESCRIPCION_ORIGINAL)}…` : limpia
}

export interface TextoEnIdioma {
  texto: string
  /** `'es'` si se muestra el original en castellano. */
  lang: 'es' | 'en'
  /** En /en y sin traducción: hay que marcarlo «(in Spanish)». */
  enCastellano: boolean
}

/** El título o la descripción a mostrar según el idioma de la página. */
export function textoEnIdioma(original: string, traduccion: string | null | undefined, idioma: 'es' | 'en'): TextoEnIdioma {
  if (idioma === 'es') return { texto: original, lang: 'es', enCastellano: false }
  const t = typeof traduccion === 'string' ? traduccion.trim() : ''
  if (t) return { texto: t, lang: 'en', enCastellano: false }
  return { texto: original, lang: 'es', enCastellano: true }
}

export const MARCA_EN_CASTELLANO = '(in Spanish)'
