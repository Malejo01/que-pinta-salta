import { createAdminClient } from '@/lib/supabase/server'
import type { JobError, JobStatus, JobRunRow, TriggerSource } from './types'

/**
 * Capa de persistencia de la bitácora (`job_runs`).
 *
 * Regla de oro: nada de acá puede tumbar una corrida. Si Supabase falla al
 * escribir el log, se loguea a consola y el job sigue. Perder una fila de
 * bitácora es molesto; perder la ingesta del día porque no se pudo escribir
 * la bitácora sería peor.
 */

const MAX_LOGGED_ERRORS = 25
const MAX_ERROR_MESSAGE_LENGTH = 500

/** Código de Postgres para violación de índice único. */
const UNIQUE_VIOLATION = '23505'

function trimErrors(errors: JobError[]): JobError[] {
  const trimmed = errors.slice(0, MAX_LOGGED_ERRORS).map((e) => ({
    ...e,
    message: e.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
  }))

  if (errors.length > MAX_LOGGED_ERRORS) {
    trimmed.push({
      scope: 'job',
      message: `… y ${errors.length - MAX_LOGGED_ERRORS} errores más omitidos de la bitácora.`,
    })
  }

  return trimmed
}

export type StartRunResult =
  | { ok: true; runId: string }
  /** Ya hay una corrida de este job en vuelo (lo garantiza el índice único parcial). */
  | { ok: false; conflict: true }
  /** No se pudo escribir la bitácora; el job igual debe correr. */
  | { ok: false; conflict: false; error: string }

export async function startRun(
  jobKey: string,
  trigger: TriggerSource,
): Promise<StartRunResult> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('job_runs')
      .insert({ job_key: jobKey, status: 'RUNNING', trigger_source: trigger })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return { ok: false, conflict: true }
      }
      return { ok: false, conflict: false, error: error.message }
    }

    return { ok: true, runId: data.id }
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export interface FinishRunInput {
  status: JobStatus
  itemsProcessed: number
  itemsFailed: number
  attempts: number
  errors: JobError[]
  details: Record<string, unknown>
  durationMs: number
}

export async function finishRun(runId: string, input: FinishRunInput): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('job_runs')
      .update({
        status: input.status,
        finished_at: new Date().toISOString(),
        duration_ms: input.durationMs,
        items_processed: input.itemsProcessed,
        items_failed: input.itemsFailed,
        attempts: input.attempts,
        errors: trimErrors(input.errors),
        details: input.details,
      })
      .eq('id', runId)

    if (error) {
      console.error(`[scheduler] No se pudo cerrar el run ${runId}:`, error.message)
    }
  } catch (err) {
    console.error(`[scheduler] Excepción cerrando el run ${runId}:`, err)
  }
}

/**
 * Cierra como TIMEOUT las corridas que quedaron en RUNNING más de lo
 * razonable. Pasa cuando la función serverless se corta por límite de
 * ejecución: el proceso muere sin poder cerrar su fila, y esa fila huérfana
 * bloquearía el índice único para siempre.
 */
export async function reapStaleRuns(staleAfterMs: number): Promise<number> {
  try {
    const supabase = createAdminClient()
    const cutoff = new Date(Date.now() - staleAfterMs).toISOString()

    const { data, error } = await supabase
      .from('job_runs')
      .update({
        status: 'TIMEOUT',
        finished_at: new Date().toISOString(),
        errors: [
          {
            scope: 'job',
            message:
              'La corrida quedó en RUNNING y fue cerrada por el barrido; probablemente la función serverless se cortó por límite de ejecución.',
          },
        ],
      })
      .eq('status', 'RUNNING')
      .lt('started_at', cutoff)
      .select('id')

    if (error) {
      console.error('[scheduler] Falló el barrido de corridas colgadas:', error.message)
      return 0
    }

    if (data && data.length > 0) {
      console.warn(`[scheduler] Se cerraron ${data.length} corridas colgadas.`)
    }

    return data?.length ?? 0
  } catch (err) {
    console.error('[scheduler] Excepción en el barrido de corridas colgadas:', err)
    return 0
  }
}

export interface LastRunRow {
  job_key: string
  last_run_id: string
  last_status: JobStatus
  last_started_at: string
  last_finished_at: string | null
  last_duration_ms: number | null
  last_items_processed: number
  last_items_failed: number
  last_errors: JobError[]
  last_ok_started_at: string | null
  last_ok_finished_at: string | null
  last_ok_status: JobStatus | null
  last_ok_items_processed: number | null
}

/** Última corrida y última corrida sana de cada job. */
export async function getLastRuns(): Promise<LastRunRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('job_last_runs').select('*')

  if (error) {
    throw new Error(`No se pudo leer la bitácora de corridas: ${error.message}`)
  }

  return (data ?? []) as LastRunRow[]
}

/**
 * Última corrida "sana" de un job, que es la referencia para decidir si
 * venció el intervalo. Cuenta SKIPPED además de SUCCESS y PARTIAL: un tick
 * que corrió y no tenía trabajo comprobó el proceso igual.
 */
export async function getLastOkRunAt(jobKey: string): Promise<Date | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('job_runs')
    .select('started_at')
    .eq('job_key', jobKey)
    .in('status', ['SUCCESS', 'PARTIAL', 'SKIPPED'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(`[scheduler] No se pudo leer la última corrida de ${jobKey}:`, error.message)
    // Devolver null haría que el job se considere vencido y corra igual.
    // Es la falla segura correcta: ante duda, correr.
    return null
  }

  return data ? new Date(data.started_at) : null
}

/** Historial reciente de un job, para el panel admin y el debug. */
export async function getRecentRuns(jobKey: string, limit = 20): Promise<JobRunRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('job_runs')
    .select('*')
    .eq('job_key', jobKey)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`No se pudo leer el historial de ${jobKey}: ${error.message}`)
  }

  return (data ?? []) as JobRunRow[]
}
