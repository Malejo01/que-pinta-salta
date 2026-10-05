/**
 * Filtro de bots y prefetch para el contador de vistas y clics (QPS-027).
 * Lógica pura: el user agent se lee para decidir y nunca se guarda.
 */

const BOT_UA_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|skype|linkedin|pinterest|embedly|quora|curl|wget|python|java\/|go-http|axios|node-fetch|okhttp|httpclient|libwww|headless|lighthouse|pagespeed|gtmetrix|uptime|monitor|vercel|scrapy|apify/i

type HeadersLike = { get(name: string): string | null }

/** true si el request NO debe contarse: sin UA, bot, HEAD o prefetch. */
export function isBotOrPrefetch(headers: HeadersLike, method: string): boolean {
  if (method.toUpperCase() === 'HEAD') return true

  const ua = (headers.get('user-agent') ?? '').trim()
  if (!ua || BOT_UA_RE.test(ua)) return true

  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''}`
  if (/prefetch|prerender/i.test(purpose)) return true
  if (headers.get('next-router-prefetch')) return true

  return false
}
