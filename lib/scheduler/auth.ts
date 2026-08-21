import { timingSafeEqual } from 'crypto'

/**
 * Autorización de los endpoints del scheduler.
 *
 * Se reusa `CRON_SECRET`, el mismo secreto que ya validan `/api/cron/scrape`,
 * `/api/cron/instagram`, `/api/cron/keep-alive` y `/api/scrape-cinemas`, así
 * que no hay un secreto nuevo que rotar ni configurar.
 *
 * Se aceptan tres formas de mandarlo:
 *   1. `Authorization: Bearer <CRON_SECRET>`  ← lo que manda Vercel Cron solo
 *   2. `x-cron-secret: <CRON_SECRET>`
 *   3. `?secret=<CRON_SECRET>`                ← compat con /api/scrape-cinemas
 */

export interface AuthResult {
  ok: boolean
  reason?: string
}

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // timingSafeEqual explota si los largos difieren, así que se compara
  // el largo aparte. Filtrar por largo no filtra el contenido del secreto.
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function extractSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }

  const headerSecret = request.headers.get('x-cron-secret')
  if (headerSecret) return headerSecret.trim()

  try {
    const param = new URL(request.url).searchParams.get('secret')
    if (param) return param.trim()
  } catch {
    // URL inválida: se trata como si no hubiera secreto.
  }

  return null
}

export function checkSchedulerAuth(request: Request): AuthResult {
  const expected = process.env.CRON_SECRET

  if (!expected) {
    // A diferencia de las rutas viejas, acá no se abre el endpoint cuando
    // falta el secreto: el dispatcher gasta cuota de Gemini y manda mails,
    // así que sin `CRON_SECRET` en producción se cierra.
    if (process.env.NODE_ENV === 'development') {
      return { ok: true }
    }
    return {
      ok: false,
      reason: 'CRON_SECRET no está configurado en este deploy; el scheduler queda deshabilitado.',
    }
  }

  const provided = extractSecret(request)
  if (!provided) {
    return { ok: false, reason: 'Falta el secreto del scheduler.' }
  }

  return safeEquals(provided, expected)
    ? { ok: true }
    : { ok: false, reason: 'Secreto del scheduler inválido.' }
}
