import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))
vi.mock('@/lib/job-runs', () => ({
  withJobRun: async (_k: string, _t: string, work: () => Promise<unknown>) => work(),
  jobTriggerFrom: () => 'test',
}))

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => createAdminClient(),
}))

import { GET } from '@/app/api/cron/radar-newsletter/route'

const UID = '44444444-4444-4444-8444-444444444444'
const CRON = 'cron-de-prueba-no-real'
const SECRET = 'secreto-de-prueba-no-real'
const EVENTO = {
  id: 'ev-1',
  title: 'Evento de Prueba',
  start_date: '2030-01-01T21:00:00Z',
  is_free: true,
  price_min: 0,
  venue: { name: 'Venue de Prueba' },
  category: { name: 'Música' },
}

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'in', 'or', 'limit']) c[m] = () => c
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return c
}

function mockDb() {
  const tables: Record<string, { data: unknown; error: unknown }> = {
    user_radar_settings: { data: [{ user_id: UID, email_target: 'usuario@ejemplo.test' }], error: null },
    user_followed_categories: { data: [{ category_id: 'cat-1' }], error: null },
    user_followed_venues: { data: [], error: null },
    user_followed_instagram_accounts: { data: [], error: null },
    events: { data: [EVENTO], error: null },
  }
  createAdminClient.mockReturnValue({
    from: (t: string) => {
      if (!(t in tables)) throw new Error('tabla inesperada: ' + t)
      return chain(tables[t])
    },
  })
}

const call = () =>
  GET(new Request('http://localhost/api/cron/radar-newsletter', { headers: { authorization: `Bearer ${CRON}` } }))

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', CRON)
  vi.stubEnv('RESEND_API_KEY', 'clave-falsa')
  vi.stubEnv('VERCEL_ENV', 'production')
  send.mockReset()
  send.mockResolvedValue({ error: null })
  createAdminClient.mockReset()
  mockDb()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('cron radar-newsletter: baja en el correo real', () => {
  it('sin Bearer: 401 y no envía', async () => {
    const res = await GET(new Request('http://localhost/api/cron/radar-newsletter'))
    expect(res.status).toBe(401)
    expect(send).not.toHaveBeenCalled()
  })

  it('con secreto: cabeceras de baja y link del usuario en el html', async () => {
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', SECRET)
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).stats).toMatchObject({ sent: 1, errors: 0 })
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg.to).toBe('usuario@ejemplo.test')
    expect(msg.subject).toBe('📡 ¡Tu Radar Salteño está activo! Agenda del Fin de Semana')
    expect(msg.headers['List-Unsubscribe']).toMatch(
      new RegExp(`^<https://quepintasalta\\.com\\.ar/api/radar/baja\\?u=${UID}&t=[\\w-]+>$`),
    )
    expect(msg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(msg.html).toContain('Darme de baja')
    expect(msg.html).toContain(`href="https://quepintasalta.com.ar/radar/baja?u=${UID}&t=`)
  })

  it('en preview el cron real igual usa quepintasalta.com.ar (S-1)', async () => {
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', SECRET)
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_BRANCH_URL', 'rama-prueba.vercel.test')
    vi.stubEnv('VERCEL_URL', 'hash-prueba.vercel.test')
    const res = await call()
    expect(res.status).toBe(200)
    const msg = send.mock.calls[0][0]
    expect(msg.headers['List-Unsubscribe']).toMatch(
      new RegExp(`^<https://quepintasalta\\.com\\.ar/api/radar/baja\\?u=${UID}&t=[\\w-]+>$`),
    )
    expect(msg.html).toContain(`href="https://quepintasalta.com.ar/radar/baja?u=${UID}&t=`)
    expect(msg.html).not.toContain('vercel.test')
    expect(msg.headers['List-Unsubscribe']).not.toContain('vercel.test')
  })

  it('sin secreto: envía igual, sin headers ni link, y avisa con console.warn', async () => {
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', '')
    const res = await call()
    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg.headers).toBeUndefined()
    expect(msg.html).not.toContain('Darme de baja')
    expect(console.warn).toHaveBeenCalled()
  })
})
