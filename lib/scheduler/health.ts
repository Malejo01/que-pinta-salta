import { JOBS } from './jobs'
import { getLastRuns, type LastRunRow } from './runs'
import { humanizeAge } from './schedule'
import type { JobError, JobStatus } from './types'

/**
 * Estado de frescura de cada proceso.
 *
 * Responde la pregunta operativa concreta: "¿cuándo se actualizó esto por
 * última vez?" y "¿está corriendo solo o se colgó?".
 */

export type JobHealthState =
  /** Corrió dentro de su ventana y sin fallar. */
  | 'ok'
  /** Pasó más tiempo del tolerado sin una corrida sana: el dato está viejo. */
  | 'stale'
  /** La última corrida falló o se cortó, aunque todavía haya dato fresco. */
  | 'failing'
  /** Está corriendo ahora mismo. */
  | 'running'
  /** El job existe en el registro pero nunca corrió. */
  | 'never-run'
  /** Lo dispara otro cron fuera del scheduler y todavía no dejó bitácora. */
  | 'not-tracked'

export interface JobHealth {
  key: string
  name: string
  description: string
  managed: boolean
  schedule: string
  staleAfterMinutes: number
  limitPerRun: number | null

  health: JobHealthState

  /** Antigüedad de la última corrida sana. Es la respuesta a la pregunta. */
  lastOkAt: string | null
  ageMinutes: number | null
  ageHuman: string

  lastRunAt: string | null
  lastRunStatus: JobStatus | null
  lastRunFinishedAt: string | null
  lastRunDurationMs: number | null
  lastRunItemsProcessed: number | null
  lastRunItemsFailed: number | null
  lastRunErrors: JobError[]
}

export interface HealthReport {
  /** `ok` si todo al día; `degraded` si algo falla; `down` si algo está vencido. */
  status: 'ok' | 'degraded' | 'down'
  checkedAt: string
  jobs: JobHealth[]
}

function resolveState(
  row: LastRunRow | undefined,
  managed: boolean,
  ageMinutes: number | null,
  staleAfterMinutes: number,
): JobHealthState {
  if (!row) {
    // Los procesos que dispara otro cron todavía no tienen bitácora propia;
    // marcarlos como caídos sería una falsa alarma.
    return managed ? 'never-run' : 'not-tracked'
  }

  if (row.last_status === 'RUNNING') return 'running'
  if (ageMinutes === null || ageMinutes > staleAfterMinutes) return 'stale'
  if (row.last_status === 'FAILED' || row.last_status === 'TIMEOUT') return 'failing'

  return 'ok'
}

export async function buildHealthReport(now: Date = new Date()): Promise<HealthReport> {
  const rows = await getLastRuns()
  const byKey = new Map(rows.map((row) => [row.job_key, row]))

  const jobs: JobHealth[] = JOBS.map((job) => {
    const row = byKey.get(job.key)

    const lastOkAt = row?.last_ok_started_at ?? null
    const ageMinutes = lastOkAt
      ? (now.getTime() - new Date(lastOkAt).getTime()) / 60_000
      : null

    return {
      key: job.key,
      name: job.name,
      description: job.description,
      managed: job.managed,
      schedule: job.schedule.label,
      staleAfterMinutes: job.staleAfterMinutes,
      limitPerRun: job.defaultLimit > 0 ? job.defaultLimit : null,

      health: resolveState(row, job.managed, ageMinutes, job.staleAfterMinutes),

      lastOkAt,
      ageMinutes: ageMinutes === null ? null : Math.round(ageMinutes),
      ageHuman: humanizeAge(ageMinutes),

      lastRunAt: row?.last_started_at ?? null,
      lastRunStatus: row?.last_status ?? null,
      lastRunFinishedAt: row?.last_finished_at ?? null,
      lastRunDurationMs: row?.last_duration_ms ?? null,
      lastRunItemsProcessed: row?.last_items_processed ?? null,
      lastRunItemsFailed: row?.last_items_failed ?? null,
      lastRunErrors: row?.last_errors ?? [],
    }
  })

  // Los `not-tracked` no cuentan para el semáforo: el scheduler no los corre,
  // así que no puede afirmar nada sobre ellos.
  const relevant = jobs.filter((job) => job.health !== 'not-tracked')

  const status: HealthReport['status'] = relevant.some(
    (job) => job.health === 'stale' || job.health === 'never-run',
  )
    ? 'down'
    : relevant.some((job) => job.health === 'failing')
      ? 'degraded'
      : 'ok'

  return { status, checkedAt: now.toISOString(), jobs }
}
