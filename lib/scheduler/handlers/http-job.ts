import type { JobHandler, JobOutcome } from '../types'

/**
 * Handler genérico para procesos cuya lógica vive dentro de un route handler
 * y no en una función de `lib/`.
 *
 * En esos casos el scheduler los invoca por HTTP contra el propio deploy en
 * vez de mover el código: así la capa de scheduling no toca ni una línea de
 * la lógica existente, que es exactamente la restricción de este track. El
 * costo es una invocación serverless extra por corrida.
 */

/** Cuerpo JSON de una ruta interna. La forma la conoce cada `summarize`. */
export type JobResponseBody = Record<string, unknown>

function isRecord(value: unknown): value is JobResponseBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Lee una ruta anidada del cuerpo sin asumir su forma. Las rutas invocadas
 * son de este mismo repo, pero sus respuestas cambian sin que el scheduler se
 * entere: leer así hace que un cambio de forma se traduzca en un contador en
 * cero y no en una excepción a mitad de la corrida.
 */
export function readPath(body: JobResponseBody, ...path: string[]): unknown {
  let current: unknown = body

  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }

  return current
}

export function readNumber(body: JobResponseBody, ...path: string[]): number | undefined {
  const value = readPath(body, ...path)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readString(body: JobResponseBody, ...path: string[]): string | undefined {
  const value = readPath(body, ...path)
  return typeof value === 'string' ? value : undefined
}

export function readRecord(body: JobResponseBody, ...path: string[]): JobResponseBody {
  const value = readPath(body, ...path)
  return isRecord(value) ? value : {}
}

export function resolveBaseUrl(): string {
  const explicit = process.env.SCHEDULER_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  // En Vercel siempre existe, pero apunta a la URL del deploy y no al dominio
  // productivo. Sirve de red de contención, no como configuración deseada.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

  return 'http://localhost:3000'
}

export interface HttpJobConfig {
  path: string
  method?: 'GET' | 'POST'
  /** Traduce el cuerpo de la respuesta a los contadores de la bitácora. */
  summarize: (body: JobResponseBody) => JobOutcome
}

export function createHttpJobHandler(config: HttpJobConfig): JobHandler {
  const method = config.method ?? 'GET'

  return async (ctx) => {
    const url = `${resolveBaseUrl()}${config.path}`
    const secret = process.env.CRON_SECRET

    const headers: Record<string, string> = { accept: 'application/json' }
    if (secret) {
      headers.authorization = `Bearer ${secret}`
    }

    ctx.log(`Invocando ${method} ${config.path}`)

    const response = await fetch(url, { method, headers, cache: 'no-store' })
    const raw = await response.text()

    let body: JobResponseBody = {}
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (isRecord(parsed)) body = parsed
      } catch {
        // Respuesta no JSON: casi siempre una página de error de la
        // plataforma (protección de deploy, 502 del edge). Se conserva un
        // fragmento para poder diagnosticarla.
        throw new Error(
          `${config.path} devolvió ${response.status} con una respuesta no-JSON: ${raw.slice(0, 200)}`,
        )
      }
    }

    if (!response.ok) {
      throw new Error(
        `${config.path} devolvió ${response.status}: ${readString(body, 'error') ?? response.statusText}`,
      )
    }

    // Las rutas del proyecto responden 200 con `success: false` cuando el
    // trabajo salió mal pero el handler no explotó (p. ej. una fuente caída).
    if (body.success === false) {
      throw new Error(
        `${config.path} reportó fallo: ${readString(body, 'error') ?? 'sin detalle'}`,
      )
    }

    return config.summarize(body)
  }
}
