/**
 * Q5-9 · ¿Son el mismo evento dos filas de FUENTES distintas (un flyer de
 * Instagram y una ticketera, por ejemplo)? Puntaje puro, sin red ni base.
 *
 * La ingesta ya fusiona sola lo seguro (mismo link de compra, clave exacta de
 * título + día + hora, o mismo lugar con título muy parecido: ver
 * apps/web/lib/scraper/deduplicate.ts). Lo que se le escapa es lo que llega
 * con OTRO nombre y OTRO lugar escrito distinto: «LOS ARTISTAS - GIRA 2026»
 * en el Teatro Provincial Juan Carlos Saravia contra «Los Artistas en Salta 🔥»
 * en el «Teatro Provincial» que la IA creó como venue aparte.
 *
 * Esta función NUNCA fusiona: devuelve una confianza y los motivos, y el que
 * llama (la cola de revisión de /admin/duplicados) muestra el par a un admin.
 * Ni la confianza alta ni la media fusionan solas (decisión de la tanda Q5).
 */

export type ConfianzaDuplicado = 'alta' | 'media' | 'baja'

export interface EventoComparable {
  id: string
  title: string
  start_date: string
  venue_id: string | null
  venueNombre: string | null
  /** `scrape_source_key` (o `null` si se cargó a mano). */
  fuente: string | null
}

export interface ResultadoComparacion {
  confianza: ConfianzaDuplicado
  tituloSimilitud: number
  motivos: string[]
}

/** Palabras que no dicen qué evento es (el ruido típico de flyers y ticketeras). */
const RUIDO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'con', 'para', 'por', 'a', 'al', 'un', 'una',
  'salta', 'capital', 'show', 'gira', 'tour', 'presenta', 'presentan', 'presentacion', 'vivo', 'live',
  'concierto', 'recital', 'entradas', 'venta', 'anticipadas', 'noche', 'especial', 'edicion', 'oficial',
  'nuevo', 'nueva', 'ya', 'hoy', 'este', 'esta', 'sabado', 'domingo', 'viernes', 'jueves',
])

const RUIDO_LUGAR = new Set(['teatro', 'salon', 'centro', 'cultural', 'complejo', 'estadio', 'club', 'bar', 'pub', 'de', 'del', 'la', 'el', 'los', 'las', 'salta', 'juan', 'carlos'])

function tokens(texto: string, ruido: Set<string>): string[] {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p.length > 1 && !ruido.has(p) && !/^(19|20)\d\d$/.test(p) && !/^\d{1,2}$/.test(p))
}

/** Parecido de títulos de 0 a 1: el máximo entre Dice y la inclusión del más corto en el más largo. */
export function similitudDeTitulos(a: string, b: string): number {
  const ta = new Set(tokens(a, RUIDO))
  const tb = new Set(tokens(b, RUIDO))
  if (ta.size === 0 || tb.size === 0) return 0
  let comunes = 0
  for (const t of ta) if (tb.has(t)) comunes++
  const dice = (2 * comunes) / (ta.size + tb.size)
  const inclusion = comunes / Math.min(ta.size, tb.size)
  // La inclusión solo vale con al menos dos palabras en común (una sola, «Fiesta», no alcanza).
  return Math.max(dice, comunes >= 2 ? inclusion : 0)
}

/** `true` si los nombres de lugar son compatibles: uno contiene las palabras del otro. */
export function lugaresParecidos(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const ta = new Set(tokens(a, RUIDO_LUGAR))
  const tb = new Set(tokens(b, RUIDO_LUGAR))
  if (ta.size === 0 || tb.size === 0) return false
  const [chico, grande] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  for (const t of chico) if (!grande.has(t)) return false
  return true
}

const MIN = 60 * 1000

function horaSalta(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * MIN)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function diaSalta(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 60 * MIN).toISOString().slice(0, 10)
}

/** Tolerancia de hora entre fuentes: 90 minutos (un flyer dice «desde las 21», la ticketera «22:30»). */
export const TOLERANCIA_ENTRE_FUENTES_MIN = 90

export function compararEntreFuentes(a: EventoComparable, b: EventoComparable): ResultadoComparacion {
  const motivos: string[] = []
  const baja = (motivo: string): ResultadoComparacion => ({ confianza: 'baja', tituloSimilitud: 0, motivos: [motivo] })

  if (a.id === b.id) return baja('mismo evento')
  if ((a.fuente ?? 'manual') === (b.fuente ?? 'manual')) return baja('misma fuente (lo cubre la dedup de la ingesta)')
  if (diaSalta(a.start_date) !== diaSalta(b.start_date)) return baja('otro día')

  const sinHora = horaSalta(a.start_date) === '00:00' || horaSalta(b.start_date) === '00:00'
  const diferenciaMin = Math.abs(new Date(a.start_date).getTime() - new Date(b.start_date).getTime()) / MIN
  if (!sinHora && diferenciaMin > TOLERANCIA_ENTRE_FUENTES_MIN) return baja('horarios distintos')
  motivos.push(sinHora ? 'mismo día (una sin hora)' : diferenciaMin === 0 ? 'mismo día y hora' : `mismo día, ${Math.round(diferenciaMin)} min de diferencia`)

  const titulo = similitudDeTitulos(a.title, b.title)
  const mismoLugar = a.venue_id !== null && a.venue_id === b.venue_id
  const lugarParecido = mismoLugar || lugaresParecidos(a.venueNombre, b.venueNombre)
  const lugarDesconocido = !a.venue_id || !b.venue_id
  if (!lugarParecido && !lugarDesconocido) return { confianza: 'baja', tituloSimilitud: titulo, motivos: [...motivos, 'lugares distintos'] }
  motivos.push(mismoLugar ? 'mismo lugar' : lugarParecido ? 'nombres de lugar compatibles' : 'a uno le falta el lugar')
  motivos.push(`títulos ${Math.round(titulo * 100)} % parecidos`)

  if (titulo >= 0.85 && lugarParecido && (!sinHora ? diferenciaMin <= 30 : true)) return { confianza: 'alta', tituloSimilitud: titulo, motivos }
  if (titulo >= 0.6) return { confianza: 'media', tituloSimilitud: titulo, motivos }
  return { confianza: 'baja', tituloSimilitud: titulo, motivos }
}
