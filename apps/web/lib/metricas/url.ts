/**
 * Devuelve el link de compra solo si es http(s); si no, null. Es la única
 * puerta por la que /go/[id] puede obtener un destino externo.
 */
export function safeTicketUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    // Credenciales embebidas (https://ticketera.com@sitio-malo.com): se rechazan.
    if (parsed.username || parsed.password) return null
    return parsed.toString()
  } catch {
    return null
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
