import { formatSaltaDayKey, saltaWallClockToUtcISO } from "@/lib/date-format"
import type { PaqueteAnunciante } from "@/lib/config/anunciantes"

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Formatea un conteo público (eventos, vistas) sin exponer números chicos
 * que identificarían actividad puntual: por debajo de 5 se oculta como "<5".
 * `null` o negativo (dato que no se pudo cargar) se muestra como "—".
 */
export function formatPublicCount(n: number | null): string {
  if (n == null || n < 0) return "—"
  if (n < 5) return "<5"
  return n.toLocaleString("es-AR")
}

/**
 * Formatea la cantidad de suscriptos al Radar. Regla de Mauro (no cambiar):
 * menos de 5 → "<5"; de 5 a 9 → "5+"; 10 o más → redondeado HACIA ABAJO a la
 * decena, con "+", para no inflar el número ante un anunciante
 * (47 → "40+", 1234 → "1.230+").
 */
export function formatRadarSubscribers(n: number | null): string {
  if (n == null || n < 0) return "—"
  if (n < 5) return "<5"
  if (n < 10) return "5+"
  const redondeado = Math.floor(n / 10) * 10
  return `${redondeado.toLocaleString("es-AR")}+`
}

export interface Last30DaysRange {
  /** Día de Salta ("YYYY-MM-DD") de hace 30 días: el extremo inferior del rango. */
  desdeDay: string
  /** Día de Salta ("YYYY-MM-DD") de ayer: el extremo superior del rango. */
  hastaDay: string
  /** Instante UTC (ISO) del inicio de `desdeDay` en hora de Salta. Para columnas timestamptz como `created_at` (`>= desdeISO`). */
  desdeISO: string
  /** Instante UTC (ISO) del inicio de hoy en hora de Salta: el fin exacto de `hastaDay`. */
  hastaISO: string
}

/**
 * Rango de "los últimos 30 días" para reportes a anunciantes: desde el
 * inicio del día de Salta de hace 30 días hasta el fin de ayer (en días de
 * Salta, como `event_metrics_daily.day`, que no cuenta el día de hoy todavía
 * en curso). Argentina no tiene horario de verano desde 2009 (offset fijo
 * -03:00), así que restar 24h exactas desplaza el día calendario de Salta sin
 * importar la hora del día de `now`.
 */
export function last30DaysRange(now: Date): Last30DaysRange {
  const hastaDay = formatSaltaDayKey(new Date(now.getTime() - MS_PER_DAY))
  const desdeDay = formatSaltaDayKey(new Date(now.getTime() - 30 * MS_PER_DAY))
  const desdeISO = saltaWallClockToUtcISO(desdeDay)
  const hastaISO = saltaWallClockToUtcISO(formatSaltaDayKey(now))

  return { desdeDay, hastaDay, desdeISO, hastaISO }
}

export interface PagedViewsResult {
  total: number
  truncated: boolean
}

export interface FetchPageResult {
  data: Array<{ views: number }> | null
  error: unknown
}

export interface SumViewsPagedOptions {
  pageSize?: number
  maxPages?: number
}

/**
 * Suma `views` pidiendo páginas con `fetchPage(from, to)` (los mismos límites
 * 0-indexados e inclusivos que `.range()` de Supabase) hasta que una página
 * venga incompleta (fin de los datos) o se llegue a `maxPages` sin terminar
 * (`truncated: true`: hay más datos de los que se sumaron).
 *
 * Si `fetchPage` devuelve un error, se interrumpe y se propaga (throw) para
 * que el llamador decida: en `getAdvertiserMetrics` cada métrica se calcula
 * por separado y un error acá vuelve esa métrica `null`, sin tocar las demás.
 */
export async function sumViewsPaged(
  fetchPage: (from: number, to: number) => Promise<FetchPageResult>,
  { pageSize = 1000, maxPages = 50 }: SumViewsPagedOptions = {},
): Promise<PagedViewsResult> {
  let total = 0

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await fetchPage(from, to)
    if (error) throw error

    const rows = data ?? []
    for (const row of rows) total += row.views ?? 0

    if (rows.length < pageSize) {
      return { total, truncated: false }
    }
  }

  return { total, truncated: true }
}

/**
 * "Consultar" mientras no haya precio fijado (`precio: null`, a propósito:
 * ver lib/config/anunciantes.ts). Con precio, formato es-AR con el período.
 */
export function precioVisible(paquete: Pick<PaqueteAnunciante, "precio" | "periodo">): string {
  if (paquete.precio == null) return "Consultar"
  const monto = `$ ${paquete.precio.toLocaleString("es-AR")}`
  return paquete.periodo ? `${monto} / ${paquete.periodo}` : monto
}

export interface AdvertiserMetrics {
  /** Eventos con status PUBLISHED creados en los últimos 30 días. `null` si falló la consulta. */
  eventsLast30: number | null
  /** Suma de vistas de ficha de los últimos 30 días (hasta ayer, días de Salta). `null` si falló. */
  viewsLast30: number | null
  /** Personas suscriptas al Radar con frecuencia semanal, quincenal o mensual. `null` si falló. */
  radarSubscribers: number | null
  /** true si viewsLast30 es un piso (se llegó a maxPages de sumViewsPaged sin agotar los datos). */
  truncated: boolean
}

/**
 * Cliente mínimo que necesita este módulo: solo `.from(tabla)`, con las
 * llamadas encadenadas (`.select()`, `.eq()`, `.gte()`, `.in()`, `.range()`,
 * etc.) sin tipar para no atar este archivo a una versión concreta del
 * cliente de Supabase ni complicar los mocks de los tests.
 */
export interface AdvertiserMetricsClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

async function loadEventsLast30(client: AdvertiserMetricsClient, desdeISO: string): Promise<number | null> {
  try {
    const { count, error } = await client
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("status", "PUBLISHED")
      .gte("created_at", desdeISO)

    if (error) throw error
    return count ?? 0
  } catch (error) {
    console.error("[anunciantes] Error contando eventos publicados en los últimos 30 días:", error)
    return null
  }
}

async function loadRadarSubscribers(client: AdvertiserMetricsClient): Promise<number | null> {
  try {
    const { count, error } = await client
      .from("user_radar_settings")
      .select("user_id", { count: "exact", head: true })
      .in("email_frequency", ["weekly", "biweekly", "monthly"])

    if (error) throw error
    return count ?? 0
  } catch (error) {
    console.error("[anunciantes] Error contando suscriptos al Radar:", error)
    return null
  }
}

async function loadViewsLast30(
  client: AdvertiserMetricsClient,
  desdeDay: string,
  hastaDay: string,
): Promise<{ total: number | null; truncated: boolean }> {
  try {
    const { total, truncated } = await sumViewsPaged((from, to) =>
      client
        .from("event_metrics_daily")
        .select("views")
        .gte("day", desdeDay)
        .lte("day", hastaDay)
        .range(from, to),
    )
    return { total, truncated }
  } catch (error) {
    console.error("[anunciantes] Error sumando vistas de los últimos 30 días:", error)
    return { total: null, truncated: false }
  }
}

/**
 * Carga las tres métricas públicas para `/anunciantes`. Cada una se calcula
 * por separado: si una falla, queda en `null` y se loguea el error, sin
 * tumbar a las otras dos. Devuelve solo números (y `truncated`), nada de
 * filas ni datos personales.
 */
export async function getAdvertiserMetrics(
  client: AdvertiserMetricsClient,
  now: Date,
): Promise<AdvertiserMetrics> {
  const { desdeDay, hastaDay, desdeISO } = last30DaysRange(now)

  const [eventsLast30, views, radarSubscribers] = await Promise.all([
    loadEventsLast30(client, desdeISO),
    loadViewsLast30(client, desdeDay, hastaDay),
    loadRadarSubscribers(client),
  ])

  return {
    eventsLast30,
    viewsLast30: views.total,
    radarSubscribers,
    truncated: views.truncated,
  }
}
