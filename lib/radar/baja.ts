import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Baja del Radar con un clic (QPS-016).
 *
 * Token = HMAC-SHA256(RADAR_UNSUBSCRIBE_SECRET, "radar-baja:v1:" + userId) en
 * base64url. No vence. Falla cerrado: sin secreto no se firma ni se verifica.
 * La URL lleva el user_id (uuid), nunca el email.
 */

const SITE = 'https://quepintasalta.com.ar'
const PREFIX = 'radar-baja:v1:'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getSecret(): string | null {
  const secret = process.env.RADAR_UNSUBSCRIBE_SECRET?.trim()
  return secret ? secret : null
}

function isUuidString(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** Token de baja para el usuario, o `null` si falta el secreto o el uuid es inválido. */
export function signUnsubscribe(userId: string): string | null {
  const secret = getSecret()
  if (!secret || !isUuidString(userId)) return null
  return createHmac('sha256', secret).update(PREFIX + userId.toLowerCase()).digest('base64url')
}

/** Verifica el token en tiempo constante. `false` si falta el secreto o el uuid es inválido. */
export function verifyUnsubscribe(userId: string, token: string): boolean {
  if (typeof token !== 'string' || !token) return false
  const expected = signUnsubscribe(userId)
  if (!expected) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function buildUrl(path: string, userId: string): string | null {
  const token = signUnsubscribe(userId)
  if (!token) return null
  return `${SITE}${path}?u=${encodeURIComponent(userId.toLowerCase())}&t=${encodeURIComponent(token)}`
}

/** Link a la página de baja (`/radar/baja`), para el pie del mail. */
export function unsubscribeUrl(userId: string): string | null {
  return buildUrl('/radar/baja', userId)
}

/** Link al endpoint POST de baja, para `List-Unsubscribe`. */
export function unsubscribeApiUrl(userId: string): string | null {
  return buildUrl('/api/radar/baja', userId)
}

/**
 * Cabeceras `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) para
 * Resend, o `undefined` si falta el secreto (el mail sale como antes).
 */
export function unsubscribeHeaders(userId: string): Record<string, string> | undefined {
  const url = unsubscribeApiUrl(userId)
  if (!url) return undefined
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
