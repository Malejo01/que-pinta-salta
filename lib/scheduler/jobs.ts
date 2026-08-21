import { NO_RETRY } from './retry'
import type { RetryPolicy } from './types'
import { cinesHandler } from './handlers/cines'
import { flyersAiHandler } from './handlers/flyers-ai'
import { newsletterHandler } from './handlers/newsletter'
import {
  createHttpJobHandler,
  readNumber,
  readPath,
  readRecord,
  readString,
} from './handlers/http-job'
import type { JobDefinition } from './types'

/**
 * Registro único de procesos programados.
 *
 * Agregar un proceso al scheduler es agregar una entrada acá: el dispatcher,
 * el trigger manual, la bitácora y el health check lo toman de este registro
 * sin tocar nada más.
 *
 * Horarios en hora local de Salta (UTC-3). El dispatcher corre cada 6 h
 * (00, 06, 12 y 18 de Salta), así que las horas de `hoursSalta` tienen que
 * caer en esos ticks; ver `vercel.json`.
 */

/**
 * Presupuesto de tiempo de una corrida.
 *
 * Todo tiene que entrar en el `maxDuration = 60` de los route handlers: si el
 * job se corta solo, la corrida queda cerrada en la bitácora como FAILED con
 * su motivo; si en cambio lo corta la plataforma, el proceso muere sin poder
 * escribir y la fila queda huérfana en RUNNING hasta el barrido.
 *
 * De ahí las dos variantes: un solo intento largo, o dos intentos cortos con
 * backoff en el medio. Con Fluid compute o un plan que permita más, se suben
 * juntos `maxDuration` en `app/api/cron/**` y estas constantes.
 */
const SINGLE_ATTEMPT_TIMEOUT_MS = 50_000
const RETRIED_ATTEMPT_TIMEOUT_MS = 24_000

/**
 * Reintento que entra en una sola invocación serverless:
 * 24 s + hasta 5 s de espera + 24 s ≈ 53 s.
 *
 * Es la primera de dos capas de reintento. La segunda es el propio tick: un
 * job que termina FAILED no actualiza su última corrida sana, así que sigue
 * vencido y el dispatcher lo vuelve a intentar en el tick siguiente.
 */
const IN_RUN_RETRY: RetryPolicy = {
  attempts: 2,
  baseDelayMs: 1_500,
  factor: 2,
  maxDelayMs: 5_000,
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const JOBS: JobDefinition[] = [
  {
    key: 'cines',
    name: 'Cartelera de cines',
    description:
      'Scrapea Cinemark Alto NOA, Cinemark Paseo Salta y Cine Ópera, y sincroniza `cinema_movies`.',
    managed: true,
    schedule: {
      // Las 12 y las 18 son la ventana de reintento del día: con
      // `everyMinutes` de 24 h, si la corrida de las 06 salió bien no vuelve
      // a estar vencido hasta mañana, y si falló lo reintenta al mediodía.
      label: 'Todos los días a las 06:00 (Salta), con reintento a las 12:00 y 18:00',
      everyMinutes: 24 * 60,
      hoursSalta: [6, 12, 18],
    },
    // La cartelera es idempotente (upsert por slug), así que reintentar es
    // seguro y conviene: la fuente falla sobre todo por timeouts puntuales.
    retry: IN_RUN_RETRY,
    defaultLimit: 0, // no aplica: el scraper trae la cartelera completa
    timeoutMs: RETRIED_ATTEMPT_TIMEOUT_MS,
    // Un día y medio sin cartelera nueva ya se nota en el sitio.
    staleAfterMinutes: 36 * 60,
    handler: cinesHandler,
  },
  {
    key: 'flyers-ai',
    name: 'Cola de lectura de flyers con IA',
    description:
      'Toma flyers de Instagram con `ai_status = PENDING` y los pasa por Gemini Vision, con tope de items por corrida.',
    managed: true,
    schedule: {
      label: 'Cada 6 horas (00, 06, 12 y 18 de Salta)',
      everyMinutes: 6 * 60,
    },
    // Sin reintento a nivel job: cada llamada a Gemini se paga y el handler
    // ya aísla el fallo por flyer. Reintentar el lote entero volvería a
    // gastar por los que sí salieron bien.
    retry: NO_RETRY,
    defaultLimit: envInt('SCHEDULER_FLYERS_BATCH_LIMIT', 10),
    timeoutMs: SINGLE_ATTEMPT_TIMEOUT_MS,
    // Son 4 corridas por día: 12 h sin ninguna significa que algo se rompió.
    staleAfterMinutes: 12 * 60,
    handler: flyersAiHandler,
  },
  {
    key: 'newsletter',
    name: 'Newsletter semanal del Radar',
    description:
      'Envía por Resend la agenda personalizada a los usuarios con `email_frequency = weekly`.',
    managed: true,
    schedule: {
      label: 'Jueves a las 18:00 (Salta)',
      everyMinutes: 7 * 24 * 60,
      daysOfWeekSalta: [4], // jueves
      hoursSalta: [18],
    },
    // Reintentar reenvía mails a quien ya los recibió: el envío no es
    // idempotente y la ruta no lleva registro por destinatario. Si falla, se
    // dispara a mano con /api/cron/run/newsletter después de mirar el error.
    retry: NO_RETRY,
    defaultLimit: 0,
    timeoutMs: SINGLE_ATTEMPT_TIMEOUT_MS,
    // Semanal más un día de margen.
    staleAfterMinutes: 8 * 24 * 60,
    handler: newsletterHandler,
  },

  // ----------------------------------------------------------------
  // Procesos que ya tienen su propio cron en `vercel.json` y siguen
  // disparándose por ahí. Se registran con `managed: false` para poder
  // dispararlos a mano por el mismo endpoint y para que aparezcan en el
  // health check. El dispatcher no los evalúa, así que no hay riesgo de
  // doble ejecución.
  //
  // Para pasarlos al scheduler: `managed: true` acá y sacar su entrada de
  // `vercel.json`.
  // ----------------------------------------------------------------
  {
    key: 'ticketeras',
    name: 'Ingesta de ticketeras',
    description:
      'NorteTicket, EntradaUno y AlPogo. Hoy lo dispara su propio cron de Vercel a las 05:00 (Salta).',
    managed: false,
    schedule: {
      label: 'Todos los días a las 05:00 (Salta) — cron propio en vercel.json',
      everyMinutes: 24 * 60,
    },
    retry: NO_RETRY,
    defaultLimit: 0,
    timeoutMs: SINGLE_ATTEMPT_TIMEOUT_MS,
    staleAfterMinutes: 36 * 60,
    handler: createHttpJobHandler({
      path: '/api/cron/scrape',
      summarize: (body) => ({
        itemsProcessed: readNumber(body, 'scraped', 'total') ?? 0,
        itemsFailed: readNumber(body, 'database', 'errors') ?? 0,
        errors: Object.entries(readRecord(body, 'sourceErrors')).map(([source, message]) => ({
          scope: `fuente:${source}`,
          message: String(message),
        })),
        details: {
          scraped: readPath(body, 'scraped'),
          database: readPath(body, 'database'),
        },
      }),
    }),
  },
  {
    key: 'instagram',
    name: 'Ingesta de flyers de Instagram',
    description:
      'Dispara el actor de Apify sobre las cuentas activas. Hoy lo dispara su propio cron de Vercel.',
    managed: false,
    schedule: {
      label: 'Jueves, viernes, sábado y domingo a las 21:00 (Salta) — cron propio en vercel.json',
      everyMinutes: 24 * 60,
    },
    retry: NO_RETRY,
    defaultLimit: 0,
    timeoutMs: SINGLE_ATTEMPT_TIMEOUT_MS,
    staleAfterMinutes: 48 * 60,
    handler: createHttpJobHandler({
      path: '/api/cron/instagram',
      summarize: (body) => ({
        itemsProcessed: 0,
        details: {
          message: readString(body, 'message'),
          runId: readString(body, 'runId'),
        },
      }),
    }),
  },
]

export const JOB_KEYS = JOBS.map((job) => job.key)

export function getJob(key: string): JobDefinition | undefined {
  return JOBS.find((job) => job.key === key)
}

/** Jobs que el dispatcher evalúa en cada tick. */
export function getManagedJobs(): JobDefinition[] {
  return JOBS.filter((job) => job.managed)
}
