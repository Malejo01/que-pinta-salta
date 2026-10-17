import { createAdminClient, createClient } from '@/lib/supabase/server'

/**
 * Bitácora de corridas de los procesos programados (tabla job_runs). Cada cron
 * de Vercel y cada workflow de GitHub Actions envuelve su trabajo con
 * withJobRun: abre una fila RUNNING al empezar y la cierra con el resultado.
 * La leen /admin/scrape y /api/cron/health.
 *
 * Registrar nunca rompe el proceso: si la base no responde, se loguea y el
 * trabajo corre igual.
 */

export type JobKey = 'ticketeras' | 'instagram' | 'cines' | 'cola_ia' | 'radar_newsletter' | 'recurrentes' | 'notificaciones'

export const JOB_LABELS: Record<JobKey, string> = {
  recurrentes: 'Peñas y museos (recurrentes)',
  ticketeras: 'Ticketeras',
  instagram: 'Instagram',
  cines: 'Cines',
  cola_ia: 'Cola de IA de flyers',
  radar_newsletter: 'Radar Salteño (newsletter)',
  notificaciones: 'Notificaciones push',
}

export type JobRunStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED'

export type JobOutcome = {
  status: Exclude<JobRunStatus, 'RUNNING'>
  itemsProcessed?: number
  itemsFailed?: number
  errors?: string[]
  details?: Record<string, unknown>
}

/**
 * Quién disparó la corrida. Los workflows mandan `x-job-trigger:
 * github-actions`; el cron de Vercel se reconoce por su user-agent.
 */
export function jobTriggerFrom(request: Request): string {
  const explicit = request.headers.get('x-job-trigger')?.trim()
  if (explicit) return explicit.slice(0, 40)
  if ((request.headers.get('user-agent') ?? '').startsWith('vercel-cron')) return 'vercel-cron'
  return 'manual'
}

async function openRun(jobKey: JobKey, trigger: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('job_runs')
      .insert({ job_key: jobKey, status: 'RUNNING', trigger_source: trigger })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  } catch (err) {
    console.error(`[job-runs] No se pudo abrir la corrida de ${jobKey}:`, err)
    return null
  }
}

async function closeRun(id: string | null, jobKey: JobKey, startedAt: number, outcome: JobOutcome) {
  if (!id) return
  try {
    const { error } = await createAdminClient()
      .from('job_runs')
      .update({
        status: outcome.status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        items_processed: outcome.itemsProcessed ?? 0,
        items_failed: outcome.itemsFailed ?? 0,
        errors: (outcome.errors ?? []).slice(0, 20),
        details: (outcome.details ?? {}) as never,
      })
      .eq('id', id)
    if (error) throw error
  } catch (err) {
    console.error(`[job-runs] No se pudo cerrar la corrida de ${jobKey}:`, err)
  }
}

/**
 * Corre `work` registrando la corrida. `toOutcome` traduce el resultado del
 * proceso a la fila de job_runs. Si `work` lanza, la corrida queda FAILED y
 * la excepción sigue de largo.
 */
export async function withJobRun<T>(
  jobKey: JobKey,
  trigger: string,
  work: () => Promise<T>,
  toOutcome: (result: T) => JobOutcome,
): Promise<T> {
  const startedAt = Date.now()
  const id = await openRun(jobKey, trigger)
  try {
    const result = await work()
    await closeRun(id, jobKey, startedAt, toOutcome(result))
    return result
  } catch (err) {
    await closeRun(id, jobKey, startedAt, {
      status: 'FAILED',
      errors: [err instanceof Error ? err.message : String(err)],
    })
    throw err
  }
}

export type JobLastRun = {
  job_key: string
  last_status: JobRunStatus
  last_trigger_source: string
  last_started_at: string
  last_finished_at: string | null
  last_duration_ms: number | null
  last_items_processed: number
  last_items_failed: number
  last_errors: unknown
  last_ok_started_at: string | null
  last_ok_status: string | null
}

export type JobRunRow = {
  id: string
  job_key: string
  status: JobRunStatus
  trigger_source: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  items_processed: number
  items_failed: number
  errors: unknown
}

/** Para el panel admin: lee con la sesión del usuario (RLS: solo admins). */
export async function getJobRunsDashboard(): Promise<{ lastRuns: JobLastRun[]; recent: JobRunRow[]; error: string | null }> {
  const supabase = await createClient()
  const [last, recent] = await Promise.all([
    supabase.from('job_last_runs').select('*'),
    supabase
      .from('job_runs')
      .select('id, job_key, status, trigger_source, started_at, finished_at, duration_ms, items_processed, items_failed, errors')
      .order('started_at', { ascending: false })
      .limit(25),
  ])
  return {
    lastRuns: (last.data ?? []) as JobLastRun[],
    recent: (recent.data ?? []) as JobRunRow[],
    error: last.error?.message ?? recent.error?.message ?? null,
  }
}
