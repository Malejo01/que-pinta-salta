/**
 * Tipos compartidos del scheduler unificado.
 *
 * El scheduler es sólo la capa de disparo, reintento y bitácora. La lógica de
 * cada proceso (scrapers, parser de flyers, armado del mail) vive donde ya
 * vivía y se invoca desde `lib/scheduler/handlers/`.
 */

export type JobStatus =
  | 'RUNNING'
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED'
  | 'TIMEOUT'

export type TriggerSource = 'cron' | 'manual' | 'backfill'

/** Error puntual dentro de una corrida; no implica que el job entero falle. */
export interface JobError {
  /** Qué falló: un item concreto (`flyer:abc123`) o la corrida entera (`job`). */
  scope: string
  message: string
  /** Número de intento en el que se registró (1-based). */
  attempt?: number
}

/** Lo que devuelve el handler de un job cuando termina. */
export interface JobOutcome {
  itemsProcessed: number
  itemsFailed?: number
  errors?: JobError[]
  /** Contadores propios del proceso, se guardan tal cual en `job_runs.details`. */
  details?: Record<string, unknown>
  /** El job no tenía nada que hacer (cola vacía, sin suscriptores, etc.). */
  skipped?: boolean
  skipReason?: string
}

export interface JobContext {
  jobKey: string
  runId: string
  trigger: TriggerSource
  /** Tope de items para esta corrida. Lo usan los jobs con costo por item. */
  limit: number
  /** Intento actual (1-based) dentro de la política de reintentos. */
  attempt: number
  log: (message: string, ...rest: unknown[]) => void
}

export type JobHandler = (ctx: JobContext) => Promise<JobOutcome>

export interface RetryPolicy {
  /** Intentos totales, incluyendo el primero. `1` = sin reintentos. */
  attempts: number
  baseDelayMs: number
  /** Multiplicador del backoff exponencial entre intentos. */
  factor: number
  maxDelayMs: number
}

/**
 * Ventana de ejecución evaluada en hora local de Salta (UTC-3, sin horario
 * de verano). Se usa hora local y no UTC porque "el newsletter sale los
 * jueves" es una afirmación sobre el calendario del lector, no sobre UTC:
 * un jueves 00:00 UTC es todavía miércoles a la noche en Salta.
 */
export interface JobSchedule {
  /** Descripción legible, la devuelve el health check. */
  label: string
  /** Separación mínima entre corridas exitosas. */
  everyMinutes: number
  /** Si se define, sólo puede arrancar en estas horas locales de Salta. */
  hoursSalta?: number[]
  /** Si se define, sólo estos días (0 = domingo … 4 = jueves … 6 = sábado). */
  daysOfWeekSalta?: number[]
}

export interface JobDefinition {
  key: string
  name: string
  description: string
  /**
   * `true`: el dispatcher lo evalúa y lo corre solo.
   * `false`: queda registrado (se puede disparar a mano y aparece en health)
   * pero el dispatcher no lo toca, porque ya lo dispara otro cron.
   */
  managed: boolean
  schedule: JobSchedule
  retry: RetryPolicy
  /** Tope de items por corrida; controla el costo de los jobs que pagan por item. */
  defaultLimit: number
  /** Timeout duro de la corrida entera, incluyendo reintentos. */
  timeoutMs: number
  /**
   * A partir de cuántos minutos sin una corrida exitosa el health check
   * considera al proceso desactualizado.
   */
  staleAfterMinutes: number
  handler: JobHandler
}

/** Fila de `job_runs` tal como la devuelve Supabase. */
export interface JobRunRow {
  id: string
  job_key: string
  status: JobStatus
  trigger_source: TriggerSource
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  items_processed: number
  items_failed: number
  attempts: number
  errors: JobError[]
  details: Record<string, unknown>
}

/** Resultado que el runner devuelve a los endpoints. */
export interface JobRunResult {
  jobKey: string
  runId: string | null
  status: JobStatus
  itemsProcessed: number
  itemsFailed: number
  attempts: number
  durationMs: number
  errors: JobError[]
  details: Record<string, unknown>
  skipReason?: string
}
