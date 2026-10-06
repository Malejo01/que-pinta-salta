import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type Row } from './fake-supabase'

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const send = vi.fn()
const ResendCtor = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
    constructor(key: string) {
      ResendCtor(key)
    }
  },
}))

import { triggerTestRadarEmail } from '@/lib/actions/radar'

const originalKey = process.env.RESEND_API_KEY
let profilesSelect: ReturnType<typeof vi.fn>

function session(user: { id: string; email: string } | null, role: string | null) {
  const single = vi.fn(async () => ({ data: role !== null ? { role } : null }))
  profilesSelect = vi.fn(() => ({ eq: () => ({ single }) }))
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: vi.fn((t: string) => {
      if (t === 'profiles') return { select: profilesSelect }
      throw new Error('tabla inesperada: ' + t)
    }),
  })
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'clave-falsa'
  createClient.mockReset()
  send.mockReset()
  ResendCtor.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalKey
  vi.restoreAllMocks()
})

describe('triggerTestRadarEmail', () => {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'usuario@ejemplo.test' }

  it('sin sesión: error y no llama a Resend', async () => {
    session(null, null)
    const r = await triggerTestRadarEmail()
    expect(r.success).toBe(false)
    expect(ResendCtor).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
  it.each(['USER', 'user', 'EDITOR', 'admin', ''])('rol %j: rechaza y no llama a Resend', async (role) => {
    session(user, role)
    const r = await triggerTestRadarEmail()
    expect(r).toEqual({ success: false, message: 'Solo administradores.' })
    expect(ResendCtor).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
  it('sin perfil: rechaza y no llama a Resend', async () => {
    session(user, null)
    const r = await triggerTestRadarEmail()
    expect(r).toEqual({ success: false, message: 'Solo administradores.' })
    expect(ResendCtor).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
  it('ADMIN pasa la verificación (llega al chequeo de RESEND_API_KEY)', async () => {
    session(user, 'ADMIN')
    delete process.env.RESEND_API_KEY
    const r = await triggerTestRadarEmail()
    expect(r.message).toMatch(/RESEND_API_KEY/)
    expect(profilesSelect).toHaveBeenCalledWith('role')
    expect(send).not.toHaveBeenCalled()
  })
})

// ---- Camino de prueba con link y cabeceras de baja ----

const UID = '22222222-2222-4222-8222-222222222222'
const SECRET = 'secreto-de-prueba-no-real'
const CAT_ID = 'c0000000-0000-4000-8000-000000000001'
const ACC_ID = 'a0000000-0000-4000-8000-000000000001'
const EV_ID = 'e0000000-0000-4000-8000-000000000001'
const EV_ID_PASADO = 'e0000000-0000-4000-8000-000000000002'
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

// Builder encadenable y "await-able" para las tablas de usuario (no filtra).
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'in', 'or', 'limit']) c[m] = () => c
  c.maybeSingle = async () => result
  c.single = async () => result
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return c
}

function adminWith(opts: { events?: Row[]; flyers?: Row[]; igIds?: string[] } = {}) {
  const userTables: Record<string, { data: unknown; error: unknown }> = {
    profiles: { data: { role: 'ADMIN' }, error: null },
    user_radar_settings: { data: { email_frequency: 'weekly', email_target: 'usuario@ejemplo.test' }, error: null },
    user_followed_categories: { data: [{ category_id: CAT_ID }], error: null },
    user_followed_venues: { data: [], error: null },
    user_followed_instagram_accounts: { data: (opts.igIds ?? []).map((id) => ({ instagram_account_id: id })), error: null },
  }
  const fake = createFakeSupabase({
    events: { rows: opts.events ?? [EVENTO] },
    instagram_flyers: { rows: opts.flyers ?? [] },
  })
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: UID, email: 'usuario@ejemplo.test' } }, error: null }) },
    from: (t: string) => {
      if (t === 'events' || t === 'instagram_flyers') return fake.client.from(t)
      if (!(t in userTables)) throw new Error('tabla inesperada: ' + t)
      return chain(userTables[t])
    },
  })
}
const adminWithEvent = () => adminWith()

describe('triggerTestRadarEmail: contenido de la lista', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
    send.mockResolvedValue({ error: null })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('evento futuro: entra con su título, hora, precio y link /evento/<uuid>', async () => {
    adminWith()
    const r = await triggerTestRadarEmail()
    expect(r.success).toBe(true)
    expect(r.count).toBe(1)
    const html = send.mock.calls[0][0].html as string
    expect(html).toContain('Evento de Prueba')
    expect(html).toContain('a las 21:30hs')
    expect(html).toContain('$35.000')
    expect(html).toContain(`https://quepintasalta.com.ar/evento/${EV_ID}?o=radar`)
    expect(html).not.toContain('fin de semana')
  })

  it('flyer con evento futuro: entra con el título del evento y link /evento/<uuid>; sin "Flyer de @"', async () => {
    adminWith({
      igIds: [ACC_ID],
      events: [{ ...EVENTO, category_id: 'otra', title: 'Show del Flyer de Prueba' }],
      flyers: [
        { status: 'ACTIVE', ai_status: 'PROCESSED', account_id: ACC_ID, published_at: '2030-10-01T00:00:00Z', ai_metadata: { event_id: EV_ID }, caption: 'texto crudo' },
      ],
    })
    // Solo sigue una cuenta: sin categoría que coincida, el evento llega solo por el flyer.
    const r = await triggerTestRadarEmail()
    expect(r.success).toBe(true)
    const html = send.mock.calls[0][0].html as string
    expect(html).toContain('Show del Flyer de Prueba')
    expect(html).toContain(`/evento/${EV_ID}?o=radar`)
    expect(html).not.toContain('Flyer de @')
    expect(html).not.toContain('texto crudo')
  })

  it('mismo evento por categoría y por flyer: una sola tarjeta', async () => {
    adminWith({
      igIds: [ACC_ID],
      flyers: [{ status: 'ACTIVE', ai_status: 'PROCESSED', account_id: ACC_ID, published_at: '2030-10-01T00:00:00Z', ai_metadata: { event_id: EV_ID } }],
    })
    const r = await triggerTestRadarEmail()
    expect(r.count).toBe(1)
    expect((send.mock.calls[0][0].html as string).split('Ver detalles').length - 1).toBe(1)
  })

  it('flyer sin evento: no entra y no se envía nada', async () => {
    adminWith({
      igIds: [ACC_ID],
      events: [],
      flyers: [{ status: 'ACTIVE', ai_status: 'PROCESSED', account_id: ACC_ID, published_at: '2030-10-01T00:00:00Z', ai_metadata: {}, caption: 'solo imagen' }],
    })
    const r = await triggerTestRadarEmail()
    expect(r.success).toBe(false)
    expect(r.message).toMatch(/No hay eventos/)
    expect(send).not.toHaveBeenCalled()
  })

  it('flyer cuyo evento ya pasó: no entra', async () => {
    adminWith({
      igIds: [ACC_ID],
      events: [{ ...EVENTO, id: EV_ID_PASADO, category_id: 'otra', start_date: '2030-10-09T23:00:00.000Z' }],
      flyers: [{ status: 'ACTIVE', ai_status: 'PROCESSED', account_id: ACC_ID, published_at: '2030-10-01T00:00:00Z', ai_metadata: { event_id: EV_ID_PASADO } }],
    })
    const r = await triggerTestRadarEmail()
    expect(r.success).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('evento pasado o a más de 30 días: no se envía', async () => {
    adminWith({
      events: [
        { ...EVENTO, start_date: '2030-10-09T23:00:00.000Z' },
        { ...EVENTO, id: EV_ID_PASADO, start_date: '2030-11-10T21:00:00.000Z' },
      ],
    })
    const r = await triggerTestRadarEmail()
    expect(r.success).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('el asunto de la prueba no cambia', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    adminWith()
    await triggerTestRadarEmail()
    expect(send.mock.calls[0][0].subject).toBe('📡 [Prueba · production] ¡Tu Radar Salteño está activo!')
    vi.unstubAllEnvs()
  })
})

describe('triggerTestRadarEmail: baja en el correo de prueba', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_BRANCH_URL', 'rama-prueba.vercel.test')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abcdef1234567890')
    send.mockResolvedValue({ error: null })
    adminWithEvent()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  // En preview, el camino de PRUEBA (solo admins) usa el host de la preview (previewBase: true).
  it('con secreto en preview: cabeceras, link (host de la preview), asunto de prueba y mensaje', async () => {
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', SECRET)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await triggerTestRadarEmail()
    expect(r.success).toBe(true)
    expect(r.message).toContain('con link y cabeceras de baja')
    expect(warn).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg.subject).toBe('📡 [Prueba · preview abcdef1] ¡Tu Radar Salteño está activo!')
    expect(msg.subject).toContain('[Prueba · ')
    expect(msg.to).toBe('usuario@ejemplo.test')
    expect(msg.headers['List-Unsubscribe']).toMatch(
      new RegExp(`^<https://rama-prueba\\.vercel\\.test/api/radar/baja\\?u=${UID}&t=[\\w-]+>$`),
    )
    expect(msg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(msg.html).toContain('Darme de baja')
    expect(msg.html).toContain(`href="https://rama-prueba.vercel.test/radar/baja?u=${UID}&t=`)
  })

  it('sin secreto: sin headers, sin link, console.warn y mensaje SIN link', async () => {
    vi.stubEnv('RADAR_UNSUBSCRIBE_SECRET', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await triggerTestRadarEmail()
    expect(r.success).toBe(true)
    expect(r.message).toContain('SIN link de baja')
    expect(r.message).toContain('RADAR_UNSUBSCRIBE_SECRET')
    expect(warn).toHaveBeenCalled()
    const msg = send.mock.calls[0][0]
    expect(msg.headers).toBeUndefined()
    expect(msg.html).not.toContain('Darme de baja')
  })
})
