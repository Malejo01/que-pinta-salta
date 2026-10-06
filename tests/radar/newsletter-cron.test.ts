import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type Row } from './fake-supabase'

const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))
const jobOutcomes = vi.hoisted(() => [] as unknown[])
vi.mock('@/lib/job-runs', () => ({
  withJobRun: async (_k: string, _t: string, work: () => Promise<unknown>, outcome?: (r: unknown) => unknown) => {
    const r = await work()
    if (outcome) jobOutcomes.push(outcome(r))
    return r
  },
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
const CAT_ID = 'c0000000-0000-4000-8000-000000000001'
const ACC_ID = 'a0000000-0000-4000-8000-000000000001'
const EV_ID = 'e0000000-0000-4000-8000-000000000001'
// Fecha fija: jueves 2030-10-10 18:00 en Salta.
const AHORA = new Date('2030-10-10T21:00:00.000Z')
const EVENTO: Row = {
  id: EV_ID,
  title: 'Evento de Prueba',
  status: 'PUBLISHED',
  start_date: '2030-10-12T00:30:00.000Z', // 21:30 Salta
  end_date: null,
  is_free: false,
  price_min: 35000,
  category_id: CAT_ID,
  venue_id: 'b0000000-0000-4000-8000-000000000001',
  venue: { name: 'Venue de Prueba' },
  category: { name: 'Música' },
}
const FLYER: Row = {
  status: 'ACTIVE',
  ai_status: 'PROCESSED',
  account_id: ACC_ID,
  published_at: '2030-10-01T00:00:00Z',
  ai_metadata: { event_id: EV_ID },
}

// Builder encadenable y "await-able" para las tablas de usuario (no filtra).
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'in', 'or', 'limit']) c[m] = () => c
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return c
}

type Update = { payload: Row; filters: Array<[string, unknown]> }
const updates: Update[] = []

// Builder de update(...).eq(...) para user_radar_settings: registra la escritura.
function updateChain(update: Update, error: unknown) {
  const c: Record<string, unknown> = {}
  c.eq = (col: string, val: unknown) => {
    update.filters.push([col, val])
    return c
  }
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ error }).then(res, rej)
  return c
}

const SETTINGS_SEMANAL: Row = {
  user_id: UID,
  email_target: 'usuario@ejemplo.test',
  email_frequency: 'weekly',
  last_sent_at: null,
}

function mockDb(
  opts: { events?: Row[]; flyers?: Row[]; igIds?: string[]; settings?: Row[]; updateError?: unknown; catIds?: string[] } = {},
) {
  updates.length = 0
  jobOutcomes.length = 0
  const userTables: Record<string, { data: unknown; error: unknown }> = {
    user_radar_settings: { data: opts.settings ?? [SETTINGS_SEMANAL], error: null },
    user_followed_categories: { data: (opts.catIds ?? [CAT_ID]).map((id) => ({ category_id: id })), error: null },
    user_followed_venues: { data: [], error: null },
    user_followed_instagram_accounts: { data: (opts.igIds ?? []).map((id) => ({ instagram_account_id: id })), error: null },
  }
  const fake = createFakeSupabase({
    events: { rows: opts.events ?? [EVENTO] },
    instagram_flyers: { rows: opts.flyers ?? [] },
  })
  createAdminClient.mockReturnValue({
    from: (t: string) => {
      if (t === 'events' || t === 'instagram_flyers') return fake.client.from(t)
      if (!(t in userTables)) throw new Error('tabla inesperada: ' + t)
      const c = chain(userTables[t])
      if (t === 'user_radar_settings') {
        c.update = (payload: Row) => {
          const u: Update = { payload, filters: [] }
          updates.push(u)
          return updateChain(u, opts.updateError ?? null)
        }
      }
      return c
    },
  })
}

const call = () =>
  GET(new Request('http://localhost/api/cron/radar-newsletter', { headers: { authorization: `Bearer ${CRON}` } }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
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
  vi.useRealTimers()
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
    expect(msg.subject).toBe('📡 Tu Radar Salteño: lo que se viene')
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

describe('cron radar-newsletter: contenido de la lista', () => {
  it('evento futuro: título, hora, precio y link /evento/<uuid>, sin "fin de semana"', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const html = send.mock.calls[0][0].html as string
    expect(html).toContain('Evento de Prueba')
    expect(html).toContain('a las 21:30hs')
    expect(html).toContain('$35.000')
    expect(html).toContain(`https://quepintasalta.com.ar/evento/${EV_ID}?o=radar`)
    expect(html.toLowerCase()).not.toContain('fin de semana')
  })

  it('flyer con evento futuro: entra con el título del evento y link /evento/<uuid>', async () => {
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', SECRET)
    mockDb({ igIds: [ACC_ID], events: [{ ...EVENTO, category_id: 'otra', title: 'Show del Flyer de Prueba' }], flyers: [FLYER] })
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 1 })
    const html = send.mock.calls[0][0].html as string
    expect(html).toContain('Show del Flyer de Prueba')
    expect(html).toContain(`/evento/${EV_ID}?o=radar`)
    expect(html).not.toContain('Flyer de @')
  })

  it('flyer sin evento: no entra y el usuario se omite (skipped)', async () => {
    mockDb({ igIds: [ACC_ID], events: [], flyers: [{ ...FLYER, ai_metadata: {} }] })
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 0, skipped: 1, errors: 0 })
    expect(send).not.toHaveBeenCalled()
  })

  it('evento de ayer o a 31 días: no se envía', async () => {
    mockDb({
      events: [
        { ...EVENTO, start_date: '2030-10-09T23:00:00.000Z' },
        { ...EVENTO, id: 'e0000000-0000-4000-8000-000000000002', start_date: '2030-11-10T21:00:00.000Z' },
      ],
    })
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 0, skipped: 1 })
    expect(send).not.toHaveBeenCalled()
  })

  it('mismo evento por categoría y flyer: una sola tarjeta', async () => {
    mockDb({ igIds: [ACC_ID], flyers: [FLYER] })
    await call()
    expect((send.mock.calls[0][0].html as string).split('Ver detalles').length - 1).toBe(1)
  })
})

const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000).toISOString()
const OTRO_UID = '55555555-5555-4555-8555-555555555555'
const conUsuario = (extra: Row): Row => ({ ...SETTINGS_SEMANAL, ...extra })

describe('cron radar-newsletter: cadencias y last_sent_at (QPS-045)', () => {
  it('envío aceptado: actualiza last_sent_at del usuario, una sola vez y con la hora actual', async () => {
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 1, skipped: 0, notDue: 0, errors: 0 })
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({ last_sent_at: AHORA.toISOString() })
    expect(updates[0].filters).toEqual([['user_id', UID]])
  })

  it('skipped (sin eventos): no actualiza last_sent_at', async () => {
    mockDb({ events: [] })
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 0, skipped: 1, errors: 0 })
    expect(updates).toHaveLength(0)
  })

  it('skipped (sin intereses): no actualiza last_sent_at', async () => {
    mockDb({ catIds: [] })
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 0, skipped: 1 })
    expect(updates).toHaveLength(0)
  })

  it('error de Resend (sendError): no actualiza last_sent_at', async () => {
    send.mockResolvedValue({ error: { message: 'rechazado de prueba' } })
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 0, errors: 1 })
    expect(updates).toHaveLength(0)
  })

  it('excepción al enviar: no actualiza last_sent_at', async () => {
    send.mockRejectedValue(new Error('red caída de prueba'))
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 0, errors: 1 })
    expect(updates).toHaveLength(0)
  })

  it('si falla guardar last_sent_at: cuenta sent, suma markFailed, 200 y la corrida queda PARTIAL', async () => {
    mockDb({ updateError: { message: 'update caído de prueba' } })
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stats).toMatchObject({ sent: 1, errors: 0, markFailed: 1 })
    // Los ids de usuario no salen en la respuesta JSON: solo en job_runs.errors.
    expect(body.stats).not.toHaveProperty('markFailedUsers')
    expect(JSON.stringify(body)).not.toContain(UID)
    expect(jobOutcomes).toHaveLength(1)
    expect(jobOutcomes[0]).toMatchObject({ status: 'PARTIAL', itemsProcessed: 1, itemsFailed: 1 })
    expect((jobOutcomes[0] as { errors?: string[] }).errors).toEqual([`radar: no se pudo guardar last_sent_at de ${UID}`])
  })

  it('sin fallas de guardado ni de envío: la corrida queda SUCCESS', async () => {
    await call()
    expect(jobOutcomes[0]).toMatchObject({ status: 'SUCCESS', itemsProcessed: 1, itemsFailed: 0 })
  })

  it('error de Resend: la corrida queda PARTIAL', async () => {
    send.mockResolvedValue({ error: { message: 'rechazado de prueba' } })
    await call()
    expect(jobOutcomes[0]).toMatchObject({ status: 'PARTIAL', itemsFailed: 1 })
  })

  it('quincenal con 12 días: no se envía y cuenta notDue; con 13 días sí', async () => {
    mockDb({ settings: [conUsuario({ email_frequency: 'biweekly', last_sent_at: dias(12) })] })
    let res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 0, skipped: 0, notDue: 1, errors: 0 })
    expect(send).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)

    mockDb({ settings: [conUsuario({ email_frequency: 'biweekly', last_sent_at: dias(13) })] })
    res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 1, notDue: 0 })
    expect(updates).toHaveLength(1)
  })

  it('mensual sin envío previo (null): se envía; con 26 días no; con 27 sí', async () => {
    mockDb({ settings: [conUsuario({ email_frequency: 'monthly', last_sent_at: null })] })
    expect((await (await call()).json()).stats).toMatchObject({ sent: 1 })

    mockDb({ settings: [conUsuario({ email_frequency: 'monthly', last_sent_at: dias(26) })] })
    expect((await (await call()).json()).stats).toMatchObject({ sent: 0, notDue: 1 })

    mockDb({ settings: [conUsuario({ email_frequency: 'monthly', last_sent_at: dias(27) })] })
    expect((await (await call()).json()).stats).toMatchObject({ sent: 1, notDue: 0 })
  })

  it('mezcla de usuarios: cuenta sent y notDue por separado y actualiza solo al que se envió', async () => {
    mockDb({
      settings: [
        conUsuario({ email_frequency: 'weekly', last_sent_at: dias(7) }),
        conUsuario({ user_id: OTRO_UID, email_frequency: 'monthly', last_sent_at: dias(10) }),
      ],
    })
    const res = await call()
    expect((await res.json()).stats).toMatchObject({ sent: 1, skipped: 0, notDue: 1, errors: 0, markFailed: 0 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(updates.map((u) => u.filters)).toEqual([[['user_id', UID]]])
  })

  it('el asunto es "Tu Radar" y no menciona un período, con cualquier cadencia (QPS-057, QPS-063)', async () => {
    for (const email_frequency of ['weekly', 'biweekly', 'monthly']) {
      send.mockClear()
      mockDb({ settings: [conUsuario({ email_frequency, last_sent_at: null })] })
      await call()
      const subject = send.mock.calls[0][0].subject as string
      expect(subject).toContain('Tu Radar')
      expect(subject).not.toContain('Mi Radar')
      expect(subject.toLowerCase()).not.toMatch(/semana|quincena|\bmes\b|mensual|semanal/)
    }
  })

  it('el texto del correo dice "seguís", "Tu Radar" y no menciona un período', async () => {
    await call()
    const html = send.mock.calls[0][0].html as string
    expect(html).toContain('seguís')
    expect(html).not.toContain('sigues')
    expect(html).toContain('Tu Radar')
    expect(html).not.toContain('Mi Radar')
    expect(html.toLowerCase()).not.toMatch(/esta semana|quincena|este mes/)
  })
})
