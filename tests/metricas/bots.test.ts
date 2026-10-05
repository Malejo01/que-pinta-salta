import { describe, expect, it } from 'vitest'
import { isBotOrPrefetch } from '@/lib/metricas'

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const SAFARI_MOVIL =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const h = (o: Record<string, string>) => ({
  get: (n: string) => o[n.toLowerCase()] ?? null,
})

describe('isBotOrPrefetch', () => {
  it('sin user agent es bot', () => {
    expect(isBotOrPrefetch(h({}), 'GET')).toBe(true)
    expect(isBotOrPrefetch(h({ 'user-agent': '   ' }), 'GET')).toBe(true)
  })
  it.each([
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['facebookexternalhit', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
    ['WhatsApp', 'WhatsApp/2.23.20.0 A'],
    ['curl', 'curl/8.4.0'],
  ])('%s es bot', (_n, ua) => {
    expect(isBotOrPrefetch(h({ 'user-agent': ua }), 'GET')).toBe(true)
  })
  it('HEAD es bot, aunque sea un Chrome (también en minúsculas)', () => {
    expect(isBotOrPrefetch(h({ 'user-agent': CHROME }), 'HEAD')).toBe(true)
    expect(isBotOrPrefetch(h({ 'user-agent': CHROME }), 'head')).toBe(true)
  })
  it('Purpose: prefetch no cuenta', () => {
    expect(isBotOrPrefetch(h({ 'user-agent': CHROME, purpose: 'prefetch' }), 'GET')).toBe(true)
  })
  it('Sec-Purpose: prefetch no cuenta', () => {
    expect(isBotOrPrefetch(h({ 'user-agent': CHROME, 'sec-purpose': 'prefetch;prerender' }), 'GET')).toBe(true)
  })
  it('Chrome y Safari móvil normales sí cuentan', () => {
    expect(isBotOrPrefetch(h({ 'user-agent': CHROME }), 'GET')).toBe(false)
    expect(isBotOrPrefetch(h({ 'user-agent': SAFARI_MOVIL }), 'GET')).toBe(false)
    expect(isBotOrPrefetch(h({ 'user-agent': SAFARI_MOVIL }), 'POST')).toBe(false)
  })
})
