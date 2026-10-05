import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasBearerSecret } from '@/lib/api-auth'
import type { JobLastRun } from '@/lib/job-runs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/health
 *
 * Antigüedad de cada proceso de ingesta, para el workflow diario de GitHub
 * Actions (.github/workflows/health.yml). Responde 200 si todos están dentro
 * de su umbral y 503 si alguno no, así el workflow falla y GitHub manda mail.
 *
 * Fuente principal: job_runs (vista job_last_runs), la última corrida sana de
 * cada job (SUCCESS, PARTIAL o SKIPPED). Mientras un job no tenga historial,
 * se mide por el rastro que deja en sus datos:
 * - ticketeras: último updated_at de un evento de entradauno/norteticket/
 *   alpogo/vamos (el upsert diario los toca aunque no haya eventos nuevos).
 * - cines: último updated_at de cinema_movies (el sync diario los toca).
 * - instagram: último fetched_at de instagram_flyers.
 * Instagram corre vie/sáb/dom/lun a las 00:00 UTC: de lunes a viernes pasan
 * 96 h, así que su umbral es 100 h y no 36.
 *
 * eventos_sin_lugar: eventos PUBLISHED futuros con venue_id nulo (QPS-044: una
 * falla de resolve_venue_id los dejaba sin lugar sin avisar). Un evento con
 * lugar "a confirmar" también cuenta, a propósito: hay que asignarlo a mano.
 * Solo pone el chequeo en rojo si alguno es urgente (QPS-049): creado en las
 * últimas 48 h (una falla nueva de la ingesta) o que empieza en los próximos
 * 7 días. El resto se lista en el detail sin alertar todos los días.
 *
 * La cola de IA se mide por la antigüedad del flyer ACTIVE/PENDING más viejo:
 * con la cola vacía está sana aunque no haya procesado nada.
 */

const TICKETERAS = ['entradauno', 'norteticket', 'alpogo', 'vamos']

const SIN_LUGAR_RECIENTE_HORAS = 48
const SIN_LUGAR_PROXIMOS_DIAS = 7

type Check = {
  name: string
  last_at: string | null
  age_hours: number | null
  /** null en los chequeos que no miden antigüedad. */
  max_hours: number | null
  ok: boolean
  source: 'job_runs' | 'datos' | 'cola'
  last_status?: string
  detail?: string
}

function ageHours(iso: string | null, now: number): number | null {
  if (!iso) return null
  return Math.round(((now - new Date(iso).getTime()) / 3_600_000) * 10) / 10
}

function jobCheck(
  name: string,
  lastRun: JobLastRun | undefined,
  traceAt: string | null,
  maxHours: number,
  now: number,
  detail?: string,
): Check {
  const lastAt = lastRun ? lastRun.last_ok_started_at : traceAt
  const age = ageHours(lastAt, now)
  return {
    name,
    last_at: lastAt,
    age_hours: age,
    max_hours: maxHours,
    ok: age !== null && age <= maxHours,
    source: lastRun ? 'job_runs' : 'datos',
    last_status: lastRun?.last_status,
    detail,
  }
}

export async function GET(request: Request) {
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = Date.now()

  const nowIso = new Date(now).toISOString()
  const recienteDesde = new Date(now - SIN_LUGAR_RECIENTE_HORAS * 3_600_000).toISOString()
  const proximosHasta = new Date(now + SIN_LUGAR_PROXIMOS_DIAS * 86_400_000).toISOString()

  const [ticketeras, cines, instagram, oldestPending, lastProcessed, jobRuns, sinLugar, sinLugarUrgente] = await Promise.all([
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
    supabase.from('job_last_runs').select('*'),
    supabase.from('events').select('id', { count: 'exact' })
      .eq('status', 'PUBLISHED').gte('start_date', nowIso).is('venue_id', null)
      .order('start_date', { ascending: true }).limit(5),
    supabase.from('events').select('id', { count: 'exact' })
      .eq('status', 'PUBLISHED').gte('start_date', nowIso).is('venue_id', null)
      .or(`created_at.gte.${recienteDesde},start_date.lte.${proximosHasta}`)
      .order('start_date', { ascending: true }).limit(5),
  ])

  const dbError = [ticketeras, cines, instagram, oldestPending, lastProcessed, sinLugar, sinLugarUrgente]
    .find((r) => r.error)?.error
  if (dbError) {
    console.error('[Health] Error consultando la base:', dbError)
    return NextResponse.json({ ok: false, error: dbError.message }, { status: 503 })
  }
  // Sin job_runs (p. ej. antes de la migración) se cae al rastro en los datos.
  if (jobRuns.error) console.error('[Health] No se pudo leer job_last_runs:', jobRuns.error)
  const runs = new Map(((jobRuns.data ?? []) as JobLastRun[]).map((r) => [r.job_key, r]))

  const queueRun = runs.get('cola_ia')
  const lastQueueRun = queueRun ? `; última corrida ${queueRun.last_started_at} (${queueRun.last_status})` : ''
  const queueCheck: Check = oldestPending.data
    ? {
        ...jobCheck('cola_ia', undefined, oldestPending.data.fetched_at, 36, now),
        source: 'cola',
        detail: `antigüedad del flyer pendiente más viejo${lastQueueRun}`,
      }
    : {
        name: 'cola_ia',
        last_at: null,
        age_hours: 0,
        max_hours: 36,
        ok: true,
        source: 'cola',
        last_status: queueRun?.last_status,
        detail: `cola vacía; último procesado ${lastProcessed.data?.ai_processed_at ?? 'nunca'}${lastQueueRun}`,
      }

  // Semanal (lunes 09:00 UTC): 8 días de margen. Solo job_runs. Sin historial
  // (antes de la primera corrida) no se marca caído: no hay rastro en los datos
  // que lo mida y alertaría todos los días hasta el primer lunes.
  const recurrentesRun = runs.get('recurrentes')
  const recurrentesCheck: Check = recurrentesRun
    ? jobCheck('recurrentes', recurrentesRun, null, 192, now, 'workflow semanal, lunes 09:00 UTC')
    : {
        name: 'recurrentes',
        last_at: null,
        age_hours: null,
        max_hours: 192,
        ok: true,
        source: 'job_runs',
        detail: 'sin corridas registradas todavía',
      }

  // No es de antigüedad: age_hours y max_hours van en null (no aplican).
  const sinLugarCount = sinLugar.count ?? sinLugar.data?.length ?? 0
  const urgentesCount = sinLugarUrgente.count ?? sinLugarUrgente.data?.length ?? 0
  const ids = (r: typeof sinLugar) => (r.data ?? []).map((e) => e.id).join(', ')
  const sinLugarCheck: Check = {
    name: 'eventos_sin_lugar',
    last_at: null,
    age_hours: null,
    max_hours: null,
    ok: urgentesCount === 0,
    source: 'datos',
    detail: sinLugarCount === 0
      ? 'todos los eventos futuros publicados tienen lugar'
      : urgentesCount > 0
        ? `${urgentesCount} evento(s) sin lugar creados en las últimas ${SIN_LUGAR_RECIENTE_HORAS} h o que empiezan en los próximos ${SIN_LUGAR_PROXIMOS_DIAS} días (hasta 5 ids: ${ids(sinLugarUrgente)}); ${sinLugarCount} futuros sin lugar en total`
        : `${sinLugarCount} evento(s) futuros publicados sin lugar, ninguno urgente; los más próximos (hasta 5): ${ids(sinLugar)}`,
  }

  const checks: Check[] = [
    jobCheck('ticketeras', runs.get('ticketeras'), ticketeras.data?.updated_at ?? null, 36, now),
    jobCheck('cines', runs.get('cines'), cines.data?.updated_at ?? null, 36, now),
    jobCheck('instagram', runs.get('instagram'), instagram.data?.fetched_at ?? null, 100, now, 'cron vie/sáb/dom/lun 00:00 UTC'),
    queueCheck,
    recurrentesCheck,
    sinLugarCheck,
  ]

  const ok = checks.every((c) => c.ok)
  return NextResponse.json({ ok, checks, timestamp: new Date(now).toISOString() }, { status: ok ? 200 : 503 })
}
