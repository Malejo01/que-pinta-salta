import { createHttpJobHandler, readNumber, readString } from './http-job'
import type { JobError } from '../types'

/**
 * Newsletter semanal del Radar.
 *
 * La lógica (consulta de suscriptores, armado del HTML, envío por Resend) ya
 * está entera dentro de `/api/cron/radar-newsletter`, que hasta ahora no
 * estaba enganchado a ningún cron y sólo se disparaba a mano. El scheduler la
 * invoca por HTTP en vez de mover ese código a `lib/`.
 */
export const newsletterHandler = createHttpJobHandler({
  path: '/api/cron/radar-newsletter',
  method: 'GET',
  summarize: (body) => {
    // Respuesta sin suscriptores: la ruta contesta `{ success, message }`
    // sin `stats`.
    if (!body.stats) {
      return {
        itemsProcessed: 0,
        skipped: true,
        skipReason:
          readString(body, 'message') ?? 'No hay usuarios suscritos a alertas semanales.',
      }
    }

    const sent = readNumber(body, 'stats', 'sent') ?? 0
    const skipped = readNumber(body, 'stats', 'skipped') ?? 0
    const errors = readNumber(body, 'stats', 'errors') ?? 0

    const jobErrors: JobError[] =
      errors > 0
        ? [
            {
              scope: 'resend',
              message: `${errors} envío(s) fallaron. El detalle por destinatario queda en los logs de /api/cron/radar-newsletter.`,
            },
          ]
        : []

    return {
      itemsProcessed: sent,
      itemsFailed: errors,
      errors: jobErrors,
      details: { sent, skippedUsers: skipped, failed: errors },
    }
  },
})
