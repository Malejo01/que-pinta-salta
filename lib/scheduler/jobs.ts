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
 * Cadencia: UN tick diario
 * -------------------------
 * El proyecto está en Vercel Hobby, y ese plan admite como máximo una
 * ejecución por día por cron. No es un límite blando: el build falla con
 * "Hobby accounts are limited to daily Cron Jobs" si alguna expresión
 * dispara más seguido. El dispatcher está en `0 21 * * *`, o sea
 * 21:00 UTC = 18:00 de Salta, todos los días (ver `vercel.json`).
 *
 * Consecuencia de diseño: la HORA de cada job ya no la elige el job, la
 * define el cron. Por eso ninguno de los `managed` usa `hoursSalta`: con un
 * solo tick al día, pedir una hora distinta a las 18:00 equivale a no correr
 * nunca, y pedir exactamente las 18:00 lo vuelve frágil ante un tick que
 * llegue tarde (Vercel no garantiza el minuto exacto, y `toSaltaParts` lee
 * la hora entera). `daysOfWeekSalta` sí se sigue usando: filtrar por día es
 * compatible con un tick diario.
 *
 * Todas las expresiones cron de Vercel se interpretan en UTC. Salta es
 * UTC-3 fijo, sin horario de verano, igual que asume `SALTA_UTC_OFFSET` en
 * `lib/date-format.ts`. Cada `label` de acá abajo indica las dos horas.
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
      // Antes eran las 06:00 con reintento a las 12:00 y 18:00. Con un solo
      // tick diario esa ventana de reintento ya no existe: si la corrida
      // falla, el job queda vencido y se reintenta en el tick de mañana.
      // La red de contención sigue siendo `IN_RUN_RETRY`, que reintenta
      // dentro de la misma invocación.
      label: 'Todos los días a las 18:00 de Salta (21:00 UTC)',
      everyMinutes: 24 * 60,
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
      // Era cada 6 h. Pasa a diario porque Hobby no admite un cron más
      // frecuente, y el tope por corrida sube para compensar el caudal.
      label: 'Todos los días a las 18:00 de Salta (21:00 UTC)',
      everyMinutes: 24 * 60,
    },
    // Sin reintento a nivel job: cada llamada a Gemini se paga y el handler
    // ya aísla el fallo por flyer. Reintentar el lote entero volvería a
    // gastar por los que sí salieron bien.
    retry: NO_RETRY,
    // Tope por corrida — es el control de costo del modelo.
    //
    // Antes: 4 corridas/día x 10 = 40 flyers/día.
    // Ahora: 1 corrida/día x 20 = 20 flyers/día.
    //
    // 20 y no 40 porque la corrida entera tiene que entrar en
    // SINGLE_ATTEMPT_TIMEOUT_MS (50 s) dentro del `maxDuration = 60` de la
    // ruta. Con CONCURRENCY = 3 son ceil(20/3) = 7 tandas; a ~6 s por
    // llamada de Gemini Vision da ~42 s, con margen. Con 40 serían 14 tandas
    // (~84 s) y la corrida se cortaría por timeout todos los días.
    //
    // 20/día alcanza para el caudal real: entran ~11 flyers/día en promedio,
    // con picos de ~33 los días que corre el cron de Instagram. Los picos se
    // absorben al día siguiente.
    //
    // Para drenar un backlog grande sin esperar, disparar a mano varias
    // veces: POST /api/cron/run/flyers-ai
    defaultLimit: envInt('SCHEDULER_FLYERS_BATCH_LIMIT', 20),
    timeoutMs: SINGLE_ATTEMPT_TIMEOUT_MS,
    // Ahora es una corrida por día: 36 h sin ninguna es lo que delata que se
    // rompió, no 12.
    staleAfterMinutes: 36 * 60,
    handler: flyersAiHandler,
  },
  {
    key: 'newsletter',
    name: 'Newsletter semanal del Radar',
    description:
      'Envía por Resend la agenda personalizada a los usuarios con `email_frequency = weekly`.',
    managed: true,
    schedule: {
      // El único job que necesita filtro de día. La hora sale del cron
      // (21:00 UTC = 18:00 de Salta), que es justo la hora de envío que ya
      // tenía, así que el cambio de cadencia no lo movió. `hoursSalta` se
      // saca a propósito: con un solo tick diario sería redundante, y un
      // tick que llegue tarde haría que el envío se saltee la semana entera.
      label: 'Jueves a las 18:00 de Salta (21:00 UTC)',
      everyMinutes: 7 * 24 * 60,
      daysOfWeekSalta: [4], // jueves en hora de Salta
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
      // vercel.json: "0 8 * * *" -> 08:00 UTC = 05:00 de Salta. 1 disparo/día.
      label: 'Todos los días a las 05:00 de Salta (08:00 UTC) — cron propio en vercel.json',
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
      // vercel.json: "0 0 * * 0,1,5,6" -> 00:00 UTC de dom/lun/vie/sáb.
      // Restando 3 h cae 21:00 del día ANTERIOR en Salta: sáb/dom/jue/vie.
      // 1 disparo por día en los días que corre.
      label: 'Jueves, viernes, sábado y domingo a las 21:00 de Salta (00:00 UTC del día siguiente) — cron propio en vercel.json',
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
