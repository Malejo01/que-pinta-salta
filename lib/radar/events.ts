/* eslint-disable @typescript-eslint/no-explicit-any -- filas de Supabase de events con joins, sin tipo común */
import type { SupabaseClient } from '@supabase/supabase-js'
import { saltaStartOfDayISO } from '@/lib/event-display'

export type RadarFollows = { categoryIds: string[]; venueIds: string[]; instagramAccountIds: string[] }

export const RADAR_DAYS_AHEAD = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SELECT = '*, venue:venues(*), category:categories(*)'

/**
 * Ventana común a toda consulta de events: desde el inicio del día de Salta
 * (coalesce(end_date, start_date) >= desde, para no perder muestras en curso)
 * hasta RADAR_DAYS_AHEAD días.
 */
function radarWindow(query: any, now: Date): any {
  const desde = saltaStartOfDayISO(now)
  const hasta = new Date(now.getTime() + RADAR_DAYS_AHEAD * 86_400_000).toISOString()
  return query
    .eq('status', 'PUBLISHED')
    .or(`end_date.gte.${desde},and(end_date.is.null,start_date.gte.${desde})`)
    .lte('start_date', hasta)
    .order('start_date', { ascending: true })
}

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
      radarWindow(supabase.from('events').select(SELECT).in('category_id', categoryIds), now).limit(10),
    )
  }

  if (venueIds.length > 0) {
    await collect('eventos por lugar', () =>
      radarWindow(supabase.from('events').select(SELECT).in('venue_id', venueIds), now).limit(10),
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
          radarWindow(supabase.from('events').select(SELECT).in('id', eventIds), now).limit(10),
        )
      }
    }
  }

  const byId = new Map<string, any>()
  for (const ev of found) if (!byId.has(ev.id)) byId.set(ev.id, ev)

  return [...byId.values()]
    .sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date))
    .slice(0, 12)
}
