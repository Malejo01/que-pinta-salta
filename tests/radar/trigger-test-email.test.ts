import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const EVENTO = {
  id: 'ev-1',
  title: 'Evento de Prueba',
  start_date: '2030-01-01T21:00:00Z',
  is_free: true,
  price_min: 0,
  venue: { name: 'Venue de Prueba' },
  category: { name: 'Música' },
}

// Builder encadenable y "await-able": cualquier método devuelve el mismo objeto.
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'in', 'or', 'limit']) c[m] = () => c
  c.maybeSingle = async () => result
  c.single = async () => result
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return c
}

function adminWithEvent() {
  const tables: Record<string, { data: unknown; error: unknown }> = {
    profiles: { data: { role: 'ADMIN' }, error: null },
    user_radar_settings: { data: { email_frequency: 'weekly', email_target: 'usuario@ejemplo.test' }, error: null },
    user_followed_categories: { data: [{ category_id: 'cat-1' }], error: null },
    user_followed_venues: { data: [], error: null },
    user_followed_instagram_accounts: { data: [], error: null },
    events: { data: [EVENTO], error: null },
  }
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: UID, email: 'usuario@ejemplo.test' } }, error: null }) },
    from: (t: string) => {
      if (!(t in tables)) throw new Error('tabla inesperada: ' + t)
      return chain(tables[t])
    },
  })
}

describe('triggerTestRadarEmail: baja en el correo de prueba', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_BRANCH_URL', 'rama-prueba.vercel.test')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abcdef1234567890')
    send.mockResolvedValue({ error: null })
    adminWithEvent()
  })
  afterEach(() => {
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
