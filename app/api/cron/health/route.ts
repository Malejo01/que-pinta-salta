import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasBearerSecret } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/health
 *
 * Antigüedad de cada proceso de ingesta, para el workflow diario de GitHub
 * Actions (.github/workflows/health.yml). Responde 200 si todos están dentro
 * de su umbral y 503 si alguno no, así el workflow falla y GitHub manda mail.
 *
 * No hay una tabla de corridas de cron (scrape_runs solo registra las del
 * admin), así que cada proceso se mide por el rastro que deja en sus datos:
 * - ticketeras: último updated_at de un evento de entradauno/norteticket/
 *   alpogo/vamos (el upsert diario los toca aunque no haya eventos nuevos).
 * - cines: último updated_at de cinema_movies (el sync diario los toca).
 * - instagram: último fetched_at de instagram_flyers. El cron corre
 *   vie/sáb/dom/lun a las 00:00 UTC: de lunes a viernes pasan 96 h, así que
 *   su umbral es 100 h y no 36.
 * - cola de IA: antigüedad del flyer ACTIVE/PENDING más viejo. Con la cola
 *   vacía está sana aunque no haya procesado nada.
 */

const TICKETERAS = ['entradauno', 'norteticket', 'alpogo', 'vamos']

type Check = {
  name: string
  last_at: string | null
  age_hours: number | null
  max_hours: number
  ok: boolean
  detail?: string
}

function ageHours(iso: string | null, now: number): number | null {
  if (!iso) return null
  return Math.round(((now - new Date(iso).getTime()) / 3_600_000) * 10) / 10
}

function check(name: string, lastAt: string | null, maxHours: number, now: number, detail?: string): Check {
  const age = ageHours(lastAt, now)
  return { name, last_at: lastAt, age_hours: age, max_hours: maxHours, ok: age !== null && age <= maxHours, detail }
}

export async function GET(request: Request) {
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = Date.now()

  const [ticketeras, cines, instagram, oldestPending, lastProcessed] = await Promise.all([
    supabase.from('events').select('updated_at').in('scrape_source_key', TICKETERAS)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('cinema_movies').select('updated_at')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('instagram_flyers').select('fetched_at').not('fetched_at', 'is', null)
      .order('fetched_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('instagram_flyers').select('fetched_at').eq('status', 'ACTIVE').eq('ai_status', 'PENDING')
      .order('fetched_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('instagram_flyers').select('ai_processed_at').not('ai_processed_at', 'is', null)
      .order('ai_processed_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const dbError = [ticketeras, cines, instagram, oldestPending, lastProcessed].find((r) => r.error)?.error
  if (dbError) {
    console.error('[Health] Error consultando la base:', dbError)
    return NextResponse.json({ ok: false, error: dbError.message }, { status: 503 })
  }

  const queueCheck: Check = oldestPending.data
    ? check('cola_ia', oldestPending.data.fetched_at, 36, now, 'antigüedad del flyer pendiente más viejo')
    : {
        name: 'cola_ia',
        last_at: null,
        age_hours: 0,
        max_hours: 36,
        ok: true,
        detail: `cola vacía; último procesado ${lastProcessed.data?.ai_processed_at ?? 'nunca'}`,
      }

  const checks: Check[] = [
    check('ticketeras', ticketeras.data?.updated_at ?? null, 36, now),
    check('cines', cines.data?.updated_at ?? null, 36, now),
    check('instagram', instagram.data?.fetched_at ?? null, 100, now, 'cron vie/sáb/dom/lun 00:00 UTC'),
    queueCheck,
  ]

  const ok = checks.every((c) => c.ok)
  return NextResponse.json({ ok, checks, timestamp: new Date(now).toISOString() }, { status: ok ? 200 : 503 })
}
