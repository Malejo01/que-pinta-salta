import { getJob, getManagedJobs } from './jobs'
import { isDue, type DueCheck } from './schedule'
import { withRetry, withTimeout } from './retry'
import { finishRun, getLastOkRunAt, reapStaleRuns, startRun } from './runs'
import type {
  JobDefinition,
  JobError,
  JobRunResult,
  JobStatus,
  TriggerSource,
} from './types'

/**
 * Núcleo del scheduler: correr un job dejando bitácora, reintentar con
 * backoff y no dejar que el fallo de uno afecte a los demás.
 */

/**
 * Margen antes de dar por colgada una corrida que quedó en RUNNING. Se toma
 * generoso frente al presupuesto de una invocación (60 s) para no cerrar por
 * error una corrida que todavía está viva.
 */
const STALE_RUN_MS = 30 * 60 * 1000

export interface RunJobOptions {
  trigger?: TriggerSource
  /** Sobrescribe el tope de items de la corrida. */
  limit?: number
}

function classify(itemsFailed: number, skipped: boolean | undefined): JobStatus {
  if (skipped) return 'SKIPPED'
  return itemsFailed > 0 ? 'PARTIAL' : 'SUCCESS'
}

/**
 * Corre un job de punta a punta. **Nunca lanza**: cualquier fallo vuelve
 * dentro de `JobRunResult` con `status: 'FAILED'`. Es lo que permite que el
 * dispatcher siga con los demás procesos pase lo que pase.
 */
export async function runJob(
  jobKey: string,
  options: RunJobOptions = {},
): Promise<JobRunResult> {
  const trigger = options.trigger ?? 'cron'
  const job = getJob(jobKey)

  if (!job) {
    return {
      jobKey,
      runId: null,
      status: 'FAILED',
      itemsProcessed: 0,
      itemsFailed: 0,
      attempts: 0,
      durationMs: 0,
      errors: [{ scope: 'job', message: `Job desconocido: ${jobKey}` }],
      details: {},
    }
  }

  const limit = options.limit ?? job.defaultLimit
  const startedAt = Date.now()

  // Abrir la corrida. El índice único parcial sobre (job_key) where
  // status = 'RUNNING' hace de lock: si ya hay una en vuelo, esta se saltea
  // en vez de duplicar trabajo (y de gastar dos veces en Gemini).
  const started = await startRun(job.key, trigger)

  if (!started.ok && started.conflict) {
    return {
      jobKey: job.key,
      runId: null,
      status: 'SKIPPED',
      itemsProcessed: 0,
      itemsFailed: 0,
      attempts: 0,
      durationMs: 0,
      errors: [],
      details: {},
      skipReason: 'Ya hay una corrida de este proceso en curso.',
    }
  }

  // Si la bitácora no se pudo escribir, el job corre igual sin registro: es
  // preferible una corrida sin log que un día sin cartelera.
  const runId = started.ok ? started.runId : null
  if (!started.ok) {
    console.error(
      `[scheduler:${job.key}] Se corre sin bitácora, falló el registro: ${started.error}`,
    )
  }

  const log = (message: string, ...rest: unknown[]) =>
    console.log(`[scheduler:${job.key}] ${message}`, ...rest)

  log(`Arranca (trigger=${trigger}, limit=${limit || 'n/a'}).`)

  const outcome = await withRetry(
    (attempt) =>
      withTimeout(
        job.handler({
          jobKey: job.key,
          runId: runId ?? 'sin-bitacora',
          trigger,
          limit,
          attempt,
          log,
        }),
        job.timeoutMs,
        `El job ${job.key}`,
      ),
    job.retry,
    (attempt, delayMs, error) => {
      console.warn(
        `[scheduler:${job.key}] Intento ${attempt} falló (${
          error instanceof Error ? error.message : String(error)
        }). Reintenta en ${delayMs}ms.`,
      )
    },
  )

  const durationMs = Date.now() - startedAt

  let status: JobStatus
  let itemsProcessed = 0
  let itemsFailed = 0
  let errors: JobError[] = []
  let details: Record<string, unknown> = {}
  let skipReason: string | undefined

  if (outcome.value) {
    const value = outcome.value
    itemsProcessed = value.itemsProcessed
    itemsFailed = value.itemsFailed ?? 0
    // Los errores por item se suman a los de los intentos previos, así queda
    // registrada tanto la cadena de reintentos como lo que falló adentro.
    errors = [...outcome.errors, ...(value.errors ?? [])]
    details = value.details ?? {}
    skipReason = value.skipReason
    status = classify(itemsFailed, value.skipped)
    if (skipReason) details = { ...details, reason: skipReason }
  } else {
    status = 'FAILED'
    errors = outcome.errors
  }

  log(
    `Termina con ${status} en ${durationMs}ms (${itemsProcessed} procesados, ${itemsFailed} con error, ${outcome.attempts} intento/s).`,
  )

  if (runId) {
    await finishRun(runId, {
      status,
      itemsProcessed,
      itemsFailed,
      attempts: outcome.attempts,
      errors,
      details,
      durationMs,
    })
  }

  return {
    jobKey: job.key,
    runId,
    status,
    itemsProcessed,
    itemsFailed,
    attempts: outcome.attempts,
    durationMs,
    errors,
    details,
    skipReason,
  }
}

export interface DispatchEntry {
  jobKey: string
  name: string
  due: DueCheck
  result: JobRunResult | null
}

export interface DispatchSummary {
  dispatchedAt: string
  durationMs: number
  staleRunsClosed: number
  ran: number
  failed: number
  notDue: number
  jobs: DispatchEntry[]
}

export interface DispatchOptions {
  /** Corre sólo estos jobs (incluidos los `managed: false`). */
  only?: string[]
  /** Ignora el calendario y corre igual. No saltea el lock de concurrencia. */
  force?: boolean
  /** Evalúa el calendario y no ejecuta nada. Para diagnosticar por qué un job no arranca. */
  dryRun?: boolean
  trigger?: TriggerSource
  limit?: number
  now?: Date
}

/**
 * Evalúa el calendario y corre lo que corresponda.
 *
 * Cada job se corre con `Promise.allSettled` y `runJob` no lanza, así que un
 * proceso caído no arrastra a los demás ni deja al dispatcher sin responder.
 */
export async function dispatchDueJobs(
  options: DispatchOptions = {},
): Promise<DispatchSummary> {
  const now = options.now ?? new Date()
  const startedAt = Date.now()

  // Antes de evaluar nada, cerrar corridas que quedaron colgadas: si no, su
  // fila RUNNING mantiene tomado el lock y el job no vuelve a correr nunca.
  const staleRunsClosed = await reapStaleRuns(STALE_RUN_MS)

  const explicit = options.only?.length ? options.only : null

  const candidates: JobDefinition[] = explicit
    ? explicit
        .map((key) => getJob(key))
        .filter((job): job is JobDefinition => Boolean(job))
    : getManagedJobs()

  const entries: DispatchEntry[] = await Promise.all(
    candidates.map(async (job) => {
      // Nombrar un job explícitamente ya es la decisión de correrlo; el
      // calendario sólo se evalúa en el barrido automático.
      if (options.force || explicit) {
        return {
          jobKey: job.key,
          name: job.name,
          due: {
            due: true,
            reason: options.force ? 'forzado' : 'pedido explícitamente',
            minutesSinceLastSuccess: null,
          },
          result: null,
        }
      }

      const lastOkAt = await getLastOkRunAt(job.key)
      return {
        jobKey: job.key,
        name: job.name,
        due: isDue(job.schedule, lastOkAt, now),
        result: null,
      }
    }),
  )

  const toRun = options.dryRun ? [] : entries.filter((entry) => entry.due.due)

  const settled = await Promise.allSettled(
    toRun.map((entry) =>
      runJob(entry.jobKey, { trigger: options.trigger ?? 'cron', limit: options.limit }),
    ),
  )

  settled.forEach((outcome, index) => {
    const entry = toRun[index]

    if (outcome.status === 'fulfilled') {
      entry.result = outcome.value
      return
    }

    // `runJob` está escrito para no lanzar, así que llegar acá significa un
    // bug del propio scheduler. Se registra sin tumbar el dispatcher.
    const message =
      outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
    console.error(`[scheduler] runJob(${entry.jobKey}) lanzó inesperadamente: ${message}`)
    entry.result = {
      jobKey: entry.jobKey,
      runId: null,
      status: 'FAILED',
      itemsProcessed: 0,
      itemsFailed: 0,
      attempts: 0,
      durationMs: 0,
      errors: [{ scope: 'scheduler', message }],
      details: {},
    }
  })

  const results = entries
    .map((entry) => entry.result)
    .filter((result): result is JobRunResult => result !== null)

  return {
    dispatchedAt: now.toISOString(),
    durationMs: Date.now() - startedAt,
    staleRunsClosed,
    ran: results.length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    notDue: entries.filter((entry) => !entry.due.due).length,
    jobs: entries,
  }
}
