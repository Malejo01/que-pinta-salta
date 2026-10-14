/* eslint-disable @typescript-eslint/no-explicit-any -- filas de Supabase de events con joins, sin tipo común */
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyVigenciaPrefilter, isVigente } from '@/lib/events/vigencia'

export type RadarFollows = { categoryIds: string[]; venueIds: string[]; instagramAccountIds: string[] }

export const RADAR_DAYS_AHEAD = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SELECT = '*, venue:venues(*), category:categories(*)'

/**
 * Ventana común a toda consulta de events: prefiltro de vigencia (lib/events/vigencia.ts,
 * el mismo criterio que la agenda del sitio) hasta RADAR_DAYS_AHEAD días. El filtro exacto
 * (isVigente) se aplica después sobre las filas.
 */
function radarWindow(query: any, now: Date): any {
  const hasta = new Date(now.getTime() + RADAR_DAYS_AHEAD * 86_400_000).toISOString()
  return applyVigenciaPrefilter(query.eq('status', 'PUBLISHED'), now)
    .lte('start_date', hasta)
    .order('start_date', { ascending: true })
}

const PER_PATH_LIMIT = 30
export const RADAR_MAX_EVENTS = 12
export const RADAR_MAX_IN_PROGRESS = 3

/** Lista única del Radar (prueba y cron): eventos futuros publicados de lo que sigue el usuario. */
export async function getRadarEvents(
  supabase: SupabaseClient,
  follows: RadarFollows,
  now: Date = new Date(),
): Promise<any[]> {
  const { categoryIds, venueIds, instagramAccountIds } = follows
  const found: any[] = []

  const collect = async (label: string, run: () => PromiseLike<{ data: any[] | null; error: { message: string } | null }>) => {
    const { data, error } = await run()
    if (error) {
      console.error(`[Radar] Error obteniendo ${label}:`, error.message)
      return
    }
    if (data) found.push(...data)
  }

  if (categoryIds.length > 0) {
    await collect('eventos por categoría', () =>
      radarWindow(supabase.from('events').select(SELECT).in('category_id', categoryIds), now).limit(PER_PATH_LIMIT),
    )
  }

  if (venueIds.length > 0) {
    await collect('eventos por lugar', () =>
      radarWindow(supabase.from('events').select(SELECT).in('venue_id', venueIds), now).limit(PER_PATH_LIMIT),
    )
  }

  if (instagramAccountIds.length > 0) {
    const { data: flyers, error } = await supabase
      .from('instagram_flyers')
      .select('ai_metadata')
      .eq('status', 'ACTIVE')
      .eq('ai_status', 'PROCESSED')
      .in('account_id', instagramAccountIds)
      .order('published_at', { ascending: false })
      .limit(30)

    if (error) {
      console.error('[Radar] Error obteniendo flyers:', error.message)
    } else {
      const eventIds = (flyers ?? [])
        .map((f: any) => f?.ai_metadata?.event_id)
        .filter((id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id))
      if (eventIds.length > 0) {
        await collect('eventos de flyers', () =>
          radarWindow(supabase.from('events').select(SELECT).in('id', eventIds), now).limit(PER_PATH_LIMIT),
        )
      }
    }
  }

  const byId = new Map<string, any>()
  for (const ev of found) if (!byId.has(ev.id)) byId.set(ev.id, ev)

  // Orden por max(inicio, ahora): lo en curso cuenta como "ahora" y se ordena entre sí por inicio.
  const nowMs = now.getTime()
  const sorted = [...byId.values()]
    .filter((ev) => isVigente(ev, now))
    .sort((a, b) => {
      const sa = Date.parse(a.start_date)
      const sb = Date.parse(b.start_date)
      return Math.max(sa, nowMs) - Math.max(sb, nowMs) || sa - sb
    })

  // Máximo 3 en curso (ya empezaron: muestras o eventos de hoy) por correo.
  const result: any[] = []
  let inProgress = 0
  for (const ev of sorted) {
    if (result.length >= RADAR_MAX_EVENTS) break
    if (Date.parse(ev.start_date) < nowMs) {
      if (inProgress >= RADAR_MAX_IN_PROGRESS) continue
      inProgress++
    }
    result.push(ev)
  }
  return result
}
