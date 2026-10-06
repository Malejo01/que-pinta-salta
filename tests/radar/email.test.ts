import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildRadarEmail, buildRadarEmailHtml, radarEnvLabel } from '@/lib/radar/email'

const UID = '33333333-3333-4333-8333-333333333333'
const SECRET = 'secreto-de-prueba-no-real'
const EVENTS = [
  { id: 'e1', title: 'Evento de Prueba', start_date: '2030-01-01T21:00:00Z', is_free: true, price_min: 0, venue: { name: 'Venue de Prueba' } },
]

afterEach(() => vi.unstubAllEnvs())

function clearVercel() {
  vi.stubEnv('VERCEL_ENV', '')
  vi.stubEnv('VERCEL_URL', '')
  vi.stubEnv('VERCEL_BRANCH_URL', '')
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '')
}

describe('buildRadarEmailHtml', () => {
  it('con link: incluye "Darme de baja" con ese href', () => {
    const html = buildRadarEmailHtml(EVENTS, 'https://x.test/radar/baja?u=1&t=2')
    expect(html).toContain('Darme de baja')
    expect(html).toContain('href="https://x.test/radar/baja?u=1&t=2"')
  })
  it('sin link: no incluye "Darme de baja"', () => {
    expect(buildRadarEmailHtml(EVENTS, null)).not.toContain('Darme de baja')
  })
})

describe('buildRadarEmailHtml: hora, precio, link y copy', () => {
  const EV_ID = 'e0000000-0000-4000-8000-000000000001'
  const base = { id: EV_ID, title: 'Evento de Prueba', is_free: false, price_min: 35000, venue: { name: 'Venue de Prueba' } }
  // 2030-01-02 00:30Z = 21:30 del 1 de enero en Salta; 03:00Z = 00:00 de Salta.
  const fechaLine = (html: string) => /📅 Fecha: <strong[^>]*>([^<]*)<\/strong>/.exec(html)![1]

  it('con hora (21:30 Salta): "a las 21:30hs"', () => {
    const html = buildRadarEmailHtml([{ ...base, start_date: '2030-01-02T00:30:00Z' }], null)
    expect(fechaLine(html)).toContain('a las 21:30hs')
  })
  it('a las 00:00 de Salta (03:00 UTC): solo la fecha, sin hora ni "hs"', () => {
    const html = buildRadarEmailHtml([{ ...base, start_date: '2030-01-02T03:00:00Z' }], null)
    const line = fechaLine(html)
    expect(line).toMatch(/enero/)
    expect(line).not.toContain('00:00')
    expect(line).not.toContain('a las')
    expect(line).not.toContain('hs')
  })
  it('precio 35000 -> $35.000', () => {
    const html = buildRadarEmailHtml([{ ...base, start_date: '2030-01-02T00:30:00Z' }], null)
    expect(html).toContain('$35.000')
  })
  it('gratis y sin precio', () => {
    const html = buildRadarEmailHtml(
      [
        { ...base, id: 'g', is_free: true, start_date: '2030-01-02T00:30:00Z' },
        { ...base, id: 'c', price_min: 0, start_date: '2030-01-02T00:30:00Z' },
      ],
      null,
    )
    expect(html).toContain('Gratis')
    expect(html).toContain('A confirmar')
  })
  it('link al evento con origen radar', () => {
    const html = buildRadarEmailHtml([{ ...base, start_date: '2030-01-02T00:30:00Z' }], null)
    expect(html).toContain(`href="https://quepintasalta.com.ar/evento/${EV_ID}?o=radar"`)
  })
  it('copy: "Lo que se viene" y nada de "fin de semana"', () => {
    const html = buildRadarEmailHtml([{ ...base, start_date: '2030-01-02T00:30:00Z' }], null)
    expect(html).toContain('Lo que se viene')
    expect(html.toLowerCase()).not.toContain('fin de semana')
  })
})

describe('buildRadarEmail', () => {
  it('con secreto en producción: link, cabeceras y hasUnsubscribe', () => {
    clearVercel()
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', SECRET)
    const { message, hasUnsubscribe } = buildRadarEmail({ userId: UID, to: 'a@ejemplo.test', subject: 'Asunto', events: EVENTS })
    expect(hasUnsubscribe).toBe(true)
    expect(message.to).toBe('a@ejemplo.test')
    expect(message.subject).toBe('Asunto')
    expect(message.html).toContain('Darme de baja')
    expect(message.html).toContain(`href="https://quepintasalta.com.ar/radar/baja?u=${UID}&t=`)
    const h = message.headers!
    expect(h['List-Unsubscribe']).toMatch(
      new RegExp(`^<https://quepintasalta\\.com\\.ar/api/radar/baja\\?u=${UID}&t=[\\w-]+>$`),
    )
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    // El mismo token en el link del html y en la cabecera.
    const tHtml = /radar\/baja\?u=[^&]+&t=([\w-]+)"/.exec(message.html)![1]
    expect(h['List-Unsubscribe']).toContain(`&t=${tHtml}>`)
  })

  it.each(['', '   '])('sin secreto (%j): sin link, sin headers, hasUnsubscribe false', (secret) => {
    clearVercel()
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', secret)
    const { message, hasUnsubscribe } = buildRadarEmail({ userId: UID, to: 'a@ejemplo.test', subject: 'Asunto', events: EVENTS })
    expect(hasUnsubscribe).toBe(false)
    expect(message.headers).toBeUndefined()
    expect('headers' in message).toBe(false)
    expect(message.html).not.toContain('Darme de baja')
  })

  it('userId inválido: sin baja aunque haya secreto', () => {
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', SECRET)
    const { message, hasUnsubscribe } = buildRadarEmail({ userId: 'no-es-uuid', to: 'a@ejemplo.test', subject: 'S', events: EVENTS })
    expect(hasUnsubscribe).toBe(false)
    expect(message.headers).toBeUndefined()
  })

  describe('base de las URLs', () => {
    const base = (env: Record<string, string>, previewBase?: boolean) => {
      clearVercel()
      vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', SECRET)
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
      const { message } = buildRadarEmail({ userId: UID, to: 'a@ejemplo.test', subject: 'S', events: EVENTS, previewBase })
      return { header: message.headers!['List-Unsubscribe'], html: message.html }
    }
    it('previewBase: producción -> quepintasalta.com.ar', () => {
      expect(base({ VERCEL_ENV: 'production', VERCEL_BRANCH_URL: 'rama.vercel.test' }, true).header).toContain(
        '<https://quepintasalta.com.ar/api/radar/baja?',
      )
    })
    it('previewBase: sin VERCEL_ENV -> quepintasalta.com.ar', () => {
      expect(base({ VERCEL_URL: 'otro.vercel.test' }, true).header).toContain('<https://quepintasalta.com.ar/api/radar/baja?')
    })
    it('previewBase: preview con VERCEL_BRANCH_URL -> esa', () => {
      const r = base({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'rama.vercel.test', VERCEL_URL: 'hash.vercel.test' }, true)
      expect(r.header).toContain('<https://rama.vercel.test/api/radar/baja?')
      expect(r.html).toContain('href="https://rama.vercel.test/radar/baja?')
    })
    it('previewBase: preview sin branch url -> VERCEL_URL', () => {
      expect(base({ VERCEL_ENV: 'preview', VERCEL_URL: 'hash.vercel.test' }, true).header).toContain(
        '<https://hash.vercel.test/api/radar/baja?',
      )
    })
    it.each([undefined, false])('previewBase %j en preview: link y cabeceras van a producción', (pb) => {
      const r = base({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'rama.vercel.test', VERCEL_URL: 'hash.vercel.test' }, pb)
      expect(r.header).toContain('<https://quepintasalta.com.ar/api/radar/baja?')
      expect(r.html).toContain('href="https://quepintasalta.com.ar/radar/baja?')
      expect(r.html).not.toContain('vercel.test')
      expect(r.header).not.toContain('vercel.test')
    })
  })
})

describe('radarEnvLabel', () => {
  it('production', () => {
    clearVercel()
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(radarEnvLabel()).toBe('production')
  })
  it('preview con sha: primeros 7', () => {
    clearVercel()
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '0123456789abcdef')
    expect(radarEnvLabel()).toBe('preview 0123456')
  })
  it('preview sin sha', () => {
    clearVercel()
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(radarEnvLabel()).toBe('preview')
  })
  it('local', () => {
    clearVercel()
    expect(radarEnvLabel()).toBe('local')
  })
})
