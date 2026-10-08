// El Radar solo manda al email de la cuenta (verificado al registrarse). Esta
// suite prueba el lado del código: aunque el llamador fuerce otro
// `email_target` (vía `as any`), `updateRadarSettings` siempre guarda
// `user.email`. Sin red ni base: `createClient` está mockeado.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateRadarSettings } from '@/lib/actions/radar'

const UID = '11111111-1111-4111-8111-111111111111'

// Builder encadenable y "await-able" para las tablas Junction (delete/insert/eq).
function chain(result: { error: unknown } = { error: null }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'delete', 'insert']) c[m] = () => c
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return c
}

function session(user: { id: string; email?: string } | null) {
  const upsert = vi.fn(async (_payload: { email_target: string; user_id: string }) => ({ error: null }))
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: vi.fn((t: string) => {
      if (t === 'user_radar_settings') return { upsert }
      if (
        t === 'user_followed_categories' ||
        t === 'user_followed_venues' ||
        t === 'user_followed_instagram_accounts'
      ) {
        return chain({ error: null })
      }
      throw new Error('tabla inesperada: ' + t)
    }),
  })
  return { upsert }
}

beforeEach(() => {
  createClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('updateRadarSettings: el email_target siempre es el de la cuenta', () => {
  it('ignora cualquier email_target que el llamador intente pasar', async () => {
    const { upsert } = session({ id: UID, email: 'cuenta@ejemplo.test' })

    const argConUnEmailAjeno = {
      email_frequency: 'weekly',
      email_target: 'ajeno@otra-casilla.test',
      categoryIds: [],
      venueIds: [],
      instagramAccountIds: [],
    } as unknown as Parameters<typeof updateRadarSettings>[0]
    const result = await updateRadarSettings(argConUnEmailAjeno)

    expect(result.success).toBe(true)
    expect(upsert).toHaveBeenCalledTimes(1)
    const payload = upsert.mock.calls[0][0]
    expect(payload.email_target).toBe('cuenta@ejemplo.test')
    expect(payload.email_target).not.toBe('ajeno@otra-casilla.test')
    expect(payload.user_id).toBe(UID)
  })

  it('el tipo del parámetro ya no admite email_target (no hace falta as any para omitirlo)', async () => {
    const { upsert } = session({ id: UID, email: 'cuenta@ejemplo.test' })

    const result = await updateRadarSettings({
      email_frequency: 'weekly',
      categoryIds: [],
      venueIds: [],
      instagramAccountIds: [],
    })

    expect(result.success).toBe(true)
    const payload = upsert.mock.calls[0][0]
    expect(payload.email_target).toBe('cuenta@ejemplo.test')
  })

  it('sin email en la sesión: error claro y no guarda nada', async () => {
    const { upsert } = session({ id: UID, email: undefined })

    const result = await updateRadarSettings({
      email_frequency: 'weekly',
      categoryIds: [],
      venueIds: [],
      instagramAccountIds: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('NO_EMAIL')
    expect(upsert).not.toHaveBeenCalled()
  })
})
