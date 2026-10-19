/**
 * Destacados de eventos (QPS-239, etapa 2 — "destacados"). Módulo puro: sin
 * red, sin base y sin reloj propio (ninguna regla lee la hora del sistema
 * por su cuenta; el `ahora` siempre lo manda quien llama, como parámetro
 * explícito).
 *
 * Tres cosas quedan dichas una sola vez, acá, para no repetirlas en cada
 * función:
 *
 * (a) `is_featured` es legado. La columna sigue en la base y en
 *     `PUBLIC_EVENT_COLUMNS` (no molesta), pero ninguna función de este
 *     archivo la mira: el destacado de hoy en más es, únicamente,
 *     `events.featured_until`.
 * (b) El destacado vence solo, sin cron: no hay ningún proceso programado
 *     que "apague" el destacado llegado su vencimiento. Lo decide, en cada
 *     lectura, quien compara `featured_until` contra su propio `ahora`
 *     (`estaDestacado`).
 * (c) Limitaciones aceptadas (Mauro): el ISR de la web puede tardar unos
 *     minutos en sacar la insignia de "destacado" después de que vence (la
 *     página no se revalida en el instante exacto). La caché sin conexión
 *     de la app (48 h) puede mostrar un destacado ya vencido durante hasta
 *     48 h, si el teléfono estuvo todo ese tiempo sin red.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `true` si `featuredUntil` es una fecha válida y es estrictamente posterior
 * a `ahora`. `null`, `undefined`, `''` y cualquier string que no parsea dan
 * `false` (nunca tira). No conoce `is_featured`: ver (a) en el comentario
 * del archivo.
 */
export function estaDestacado(featuredUntil: string | null | undefined, ahora: Date): boolean {
  if (!featuredUntil) return false
  const fin = new Date(featuredUntil)
  if (Number.isNaN(fin.getTime())) return false
  return fin.getTime() > ahora.getTime()
}

/** `true` si `fecha` tiene el formato exacto "YYYY-MM-DD" y corresponde a un día que existe en el calendario. */
function esFechaCalendarioValida(fecha: string): boolean {
  const match = FECHA_RE.exec(fecha)
  if (!match) return false
  const anio = Number(match[1])
  const mes = Number(match[2])
  const dia = Number(match[3])
  // Se arma en UTC (sin zona de Salta: acá solo interesa si el día existe) y
  // se vuelve a leer: si "rebalsó" (ej. 2026-02-30 -> 2026-03-02), alguna de
  // las tres partes no coincide con lo que se pidió.
  const utc = new Date(Date.UTC(anio, mes - 1, dia))
  return utc.getUTCFullYear() === anio && utc.getUTCMonth() === mes - 1 && utc.getUTCDate() === dia
}

/**
 * Recibe "YYYY-MM-DD" y devuelve el ISO del fin de ese día en Salta
 * (UTC-3 fijo, como el resto del repo: Argentina no tiene horario de
 * verano desde 2009). Valida de verdad el formato y que el día exista
 * ("2026-02-30" y "2026-13-01" no son válidas); si no, tira un `Error` en
 * castellano. `validarDestacado` nunca deja llegar una fecha inválida hasta
 * aquí.
 */
export function finDeDiaSalta(fecha: string): string {
  if (!esFechaCalendarioValida(fecha)) {
    throw new Error(`"${fecha}" no es una fecha válida: se espera el formato "YYYY-MM-DD" y un día que exista.`)
  }
  return `${fecha}T23:59:59-03:00`
}

/** Duraciones que ofrece la pantalla de admin para destacar un evento. */
export const DURACIONES_DESTACADO_DIAS = [7, 14, 30] as const

/** Tope de días hacia adelante que puede durar un destacado, contado desde `ahora`. */
export const MAXIMO_DIAS_DESTACADO = 365

export type ErrorValidarDestacado = 'INVALID_ID' | 'FECHA_INVALIDA' | 'FECHA_PASADA' | 'FECHA_LEJANA'

export type ResultadoValidarDestacado =
  | { ok: true; eventId: string; featuredUntil: string }
  | { ok: false; error: ErrorValidarDestacado }

/**
 * Valida lo que manda el navegador a la server action que destaca un evento.
 * `entrada` es `unknown` a propósito: no se confía en la forma del body.
 * Acepta un objeto con `{ eventId, hasta }`; cualquier otra forma (no
 * objeto, campos que no son string, campos faltantes) cae en el error que
 * corresponde, sin tirar nunca.
 *
 * Orden de validación (estable a propósito, para que el error reportado no
 * dependa de qué se mire primero):
 *   1. `eventId` tiene que ser un uuid -> si no, `INVALID_ID`.
 *   2. `hasta` tiene que ser "YYYY-MM-DD" válido -> si no, `FECHA_INVALIDA`.
 *   3. `finDeDiaSalta(hasta)` tiene que ser estrictamente posterior a
 *      `ahora` -> si no, `FECHA_PASADA`.
 *   4. y a no más de `MAXIMO_DIAS_DESTACADO` días de `ahora` -> si no,
 *      `FECHA_LEJANA`. Los días se cuentan en milisegundos desde `ahora`
 *      (`365 * 24 * 60 * 60 * 1000`); el límite es inclusivo: justo 365
 *      días pasa, 366 no.
 */
export function validarDestacado(entrada: unknown, ahora: Date): ResultadoValidarDestacado {
  if (typeof entrada !== 'object' || entrada === null) {
    return { ok: false, error: 'INVALID_ID' }
  }

  const { eventId, hasta } = entrada as Record<string, unknown>

  if (typeof eventId !== 'string' || !UUID_RE.test(eventId)) {
    return { ok: false, error: 'INVALID_ID' }
  }

  if (typeof hasta !== 'string' || !esFechaCalendarioValida(hasta)) {
    return { ok: false, error: 'FECHA_INVALIDA' }
  }

  const featuredUntil = finDeDiaSalta(hasta)
  const finMs = new Date(featuredUntil).getTime()

  if (finMs <= ahora.getTime()) {
    return { ok: false, error: 'FECHA_PASADA' }
  }

  // Tope inclusivo: 365 días desde `ahora`, en milisegundos.
  const limiteMs = ahora.getTime() + MAXIMO_DIAS_DESTACADO * 24 * 60 * 60 * 1000
  if (finMs > limiteMs) {
    return { ok: false, error: 'FECHA_LEJANA' }
  }

  return { ok: true, eventId, featuredUntil }
}

/** "30/10": día y mes con dos dígitos, en hora de Salta (no en la zona del servidor). */
function formatDiaMesSalta(fecha: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Salta',
    day: '2-digit',
    month: '2-digit',
  }).format(fecha)
}

/**
 * Texto para la pantalla de admin: "Destacado hasta el 30/10" si
 * `featuredUntil` está vigente, "Venció el 12/10" si ya pasó, y "Sin
 * destacado" si no hay fecha (null/undefined/inválida). El día y el mes se
 * formatean en hora de Salta, no en la zona del servidor.
 */
export function textoVenceDestacado(featuredUntil: string | null | undefined, ahora: Date): string {
  if (!featuredUntil) return 'Sin destacado'
  const fin = new Date(featuredUntil)
  if (Number.isNaN(fin.getTime())) return 'Sin destacado'

  const diaMes = formatDiaMesSalta(fin)
  return fin.getTime() > ahora.getTime() ? `Destacado hasta el ${diaMes}` : `Venció el ${diaMes}`
}
