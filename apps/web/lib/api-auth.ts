import { timingSafeEqual } from 'node:crypto'

/**
 * Autenticación de los route handlers de /api que llaman los crons de Vercel
 * y Apify. Falla cerrado: si la variable de entorno del secreto no está
 * definida (o está vacía), rechaza todo en vez de dejar pasar.
 *
 * El secreto solo se acepta por header, nunca por query string: un
 * `?secret=` queda registrado en los logs de acceso.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

function missingSecret(envName: string): false {
  console.error(`[api-auth] ${envName} no está definida: se rechaza la petición`)
  return false
}

/** `Authorization: Bearer <secret>`, el formato que manda el cron de Vercel. */
export function hasBearerSecret(request: Request, envName: 'CRON_SECRET' | 'APIFY_WEBHOOK_SECRET'): boolean {
  const secret = process.env[envName]?.trim()
  if (!secret) return missingSecret(envName)

  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') && safeEqual(header.slice(7).trim(), secret)
}

/** Header propio de los webhooks de Apify (`x-apify-webhook-secret`). */
export function hasApifyWebhookSecret(request: Request): boolean {
  const secret = process.env.APIFY_WEBHOOK_SECRET?.trim()
  if (!secret) return missingSecret('APIFY_WEBHOOK_SECRET')

  const header = request.headers.get('x-apify-webhook-secret') ?? ''
  return safeEqual(header.trim(), secret)
}
