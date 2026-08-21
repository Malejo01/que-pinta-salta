import type { JobError, RetryPolicy } from './types'

/** Sin reintentos: para jobs donde reintentar duplica efectos o costo. */
export const NO_RETRY: RetryPolicy = {
  attempts: 1,
  baseDelayMs: 0,
  factor: 1,
  maxDelayMs: 0,
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Backoff exponencial con jitter completo. El jitter importa cuando varios
 * jobs reintentan contra la misma fuente caída: sin él, todos reintentan en
 * el mismo instante y la vuelven a tirar.
 */
export function backoffDelay(attempt: number, policy: RetryPolicy): number {
  const exponential = policy.baseDelayMs * Math.pow(policy.factor, attempt - 1)
  const capped = Math.min(exponential, policy.maxDelayMs)
  return Math.floor(Math.random() * capped)
}

export interface RetryOutcome<T> {
  value?: T
  error?: unknown
  attempts: number
  /** Un elemento por intento fallido, para que la bitácora muestre la cadena. */
  errors: JobError[]
}

/**
 * Ejecuta `fn` hasta `policy.attempts` veces. Nunca lanza: devuelve el valor
 * o el último error, más el historial de intentos.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void,
): Promise<RetryOutcome<T>> {
  const errors: JobError[] = []
  let lastError: unknown

  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    try {
      const value = await fn(attempt)
      return { value, attempts: attempt, errors }
    } catch (error) {
      lastError = error
      errors.push({
        scope: 'job',
        attempt,
        message: error instanceof Error ? error.message : String(error),
      })

      if (attempt < policy.attempts) {
        const delay = backoffDelay(attempt, policy)
        onRetry?.(attempt, delay, error)
        await sleep(delay)
      }
    }
  }

  return { error: lastError, attempts: policy.attempts, errors }
}

/** Corre una promesa con timeout duro. Rechaza si se pasa del tiempo. */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} superó el timeout de ${timeoutMs}ms`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
