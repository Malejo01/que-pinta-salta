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
