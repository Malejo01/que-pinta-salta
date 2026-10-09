/**
 * Reporte imprimible de un evento para su organizador (QPS-kit de anunciantes,
 * Ronda 20): vistas y clics por día y por origen.
 *
 * `buildEventReport()` es pura (no toca la red) y es la que testea 20-c; su
 * firma y la forma de lo que devuelve no deberían cambiar sin avisar.
 *
 * "Apariciones en los correos del Radar" (cuántas veces salió el evento en un
 * envío) no se registra en ningún lado hoy: `desdeRadar` solo puede reportar
 * las vistas/clics que llegaron con `?o=radar`, no las apariciones. Para eso
 * haría falta una tabla (o columna) que registre, por envío de Radar, qué
 * eventos incluyó — pendiente de backlog, con su propia migración.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/metricas/url'

export type EventMetricRow = {
  day: string
  origin: string
  featured: boolean
  views: number
  clicks: number
}

export type DailyReportRow = {
  day: string
  views: number
  clicks: number
}

export type OriginReportRow = {
  origin: string
  views: number
  clicks: number
}

export type EventReportTotals = {
  views: number
  clicks: number
  /** Porcentaje con un decimal (12.3 = 12,3%). `null` si no hubo vistas. */
  ctr: number | null
}

export type EventReport = {
  dias: DailyReportRow[]
  totales: EventReportTotals
  porOrigen: OriginReportRow[]
  desdeRadar: { views: number; clicks: number }
  diasDestacado: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function dayKeyToUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}

function utcMsToDayKey(ms: number): string {
  const d = new Date(ms)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const date = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

/**
 * Función pura: suma `rows` (de todos los orígenes) por día y por origen.
 *
 * - `dias` queda sin huecos entre el primer y el último día con datos: los
 *   días intermedios sin filas entran con 0 vistas y 0 clics.
 * - `porOrigen` va de mayor a menor cantidad de vistas.
 * - `desdeRadar` es el subtotal del origen `'radar'` (no un conteo de
 *   apariciones: ver nota de archivo).
 * - `diasDestacado` cuenta días de calendario con al menos una fila
 *   `featured = true`, sin importar el origen.
 */
export function buildEventReport(rows: EventMetricRow[]): EventReport {
  if (rows.length === 0) {
    return {
      dias: [],
      totales: { views: 0, clicks: 0, ctr: null },
      porOrigen: [],
      desdeRadar: { views: 0, clicks: 0 },
      diasDestacado: 0,
    }
  }

  const porDiaMap = new Map<string, { views: number; clicks: number }>()
  const porOrigenMap = new Map<string, { views: number; clicks: number }>()
  const diasDestacadoSet = new Set<string>()

  let totalViews = 0
  let totalClicks = 0
  let radarViews = 0
  let radarClicks = 0

  for (const row of rows) {
    const dia = porDiaMap.get(row.day) ?? { views: 0, clicks: 0 }
    dia.views += row.views
    dia.clicks += row.clicks
    porDiaMap.set(row.day, dia)

    const origen = porOrigenMap.get(row.origin) ?? { views: 0, clicks: 0 }
    origen.views += row.views
    origen.clicks += row.clicks
    porOrigenMap.set(row.origin, origen)

    totalViews += row.views
    totalClicks += row.clicks

    if (row.origin === 'radar') {
      radarViews += row.views
      radarClicks += row.clicks
    }

    if (row.featured) diasDestacadoSet.add(row.day)
  }

  const dayKeys = [...porDiaMap.keys()].sort()
  const firstMs = dayKeyToUtcMs(dayKeys[0])
  const lastMs = dayKeyToUtcMs(dayKeys[dayKeys.length - 1])

  const dias: DailyReportRow[] = []
  for (let ms = firstMs; ms <= lastMs; ms += DAY_MS) {
    const key = utcMsToDayKey(ms)
    const data = porDiaMap.get(key) ?? { views: 0, clicks: 0 }
    dias.push({ day: key, views: data.views, clicks: data.clicks })
  }

  const porOrigen: OriginReportRow[] = [...porOrigenMap.entries()]
    .map(([origin, data]) => ({ origin, views: data.views, clicks: data.clicks }))
    .sort((a, b) => b.views - a.views)

  const ctr = totalViews > 0 ? Math.round((totalClicks / totalViews) * 1000) / 10 : null

  return {
    dias,
    totales: { views: totalViews, clicks: totalClicks, ctr },
    porOrigen,
    desdeRadar: { views: radarViews, clicks: radarClicks },
    diasDestacado: diasDestacadoSet.size,
  }
}

export type EventReportEvent = {
  id: string
  title: string
  start_date: string
  status: string | null
  venue: { name: string | null } | null
}

export type EventReportResult = {
  event: EventReportEvent
  report: EventReport
}

/**
 * Carga el evento y sus métricas con el cliente de la sesión (la RLS de
 * `event_metrics_daily` ya restringe la lectura a admins). Devuelve `null`
 * si el uuid es inválido o el evento no existe, para que la página resuelva
 * con `notFound()`.
 */
export async function getEventReport(
  supabase: SupabaseClient,
  eventId: string
): Promise<EventReportResult | null> {
  if (!isUuid(eventId)) return null

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, start_date, status, venue:venues(name)')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('[reporte-evento] no se pudo traer el evento:', eventError.message)
    return null
  }
  if (!event) return null

  // La relación events -> venues es ambigua para el tipado (hay dos FK a
  // venues: directa y vía venues_canonical), así que el cliente tipado puede
  // devolver `venue` como arreglo en vez de objeto (ver duplicate-candidates.ts).
  const rawVenue = (event as { venue?: { name: string | null } | { name: string | null }[] | null }).venue
  const venue = Array.isArray(rawVenue) ? rawVenue[0] ?? null : rawVenue ?? null

  const { data: rows, error: rowsError } = await supabase
    .from('event_metrics_daily')
    .select('day, origin, featured, views, clicks')
    .eq('event_id', eventId)

  if (rowsError) {
    console.error('[reporte-evento] no se pudieron traer las métricas:', rowsError.message)
  }

  return {
    event: {
      id: event.id,
      title: event.title,
      start_date: event.start_date,
      status: event.status,
      venue,
    },
    report: buildEventReport(rows ?? []),
  }
}
