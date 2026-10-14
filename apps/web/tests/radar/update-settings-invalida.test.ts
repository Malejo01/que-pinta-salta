// `updateRadarSettings` (R27, tarea 27-a) llama a `normalizarPreferenciasRadar`
// antes de escribir nada. Esta suite prueba que una frecuencia inválida se
// rechaza SIN tocar la base: ni siquiera se llama a `supabase.from(...)`.
// Mismo patrón que `radar-email-target.test.ts` (createClient mockeado, sin
// red ni base).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateRadarSettings } from '@/lib/actions/radar'

const UID = '33333333-3333-4333-8333-333333333333'

function session(user: { id: string; email?: string } | null) {
  // `from` registra si se llamó: si `updateRadarSettings` escribe algo antes
  // de validar, esto revienta el test con un mensaje claro.
  const from = vi.fn((tabla: string) => {
    throw new Error(`no debería llamar a from("${tabla}") con una frecuencia inválida, sin escribir nada`)
  })
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from,
  })
  return { from }
}

beforeEach(() => {
  createClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('updateRadarSettings: una frecuencia inválida no escribe nada', () => {
  it('rechaza "daily" (no está en FRECUENCIAS_RADAR) con error INVALID, sin llamar a from()', async () => {
    const { from } = session({ id: UID, email: 'cuenta@ejemplo.test' })

    const result = await updateRadarSettings({
      email_frequency: 'daily' as unknown as Parameters<typeof updateRadarSettings>[0]['email_frequency'],
      categoryIds: [],
      venueIds: [],
      instagramAccountIds: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID')
    expect(result.message).toMatch(/frecuencia/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('rechaza una frecuencia vacía, también sin escribir nada', async () => {
    const { from } = session({ id: UID, email: 'cuenta@ejemplo.test' })

    const result = await updateRadarSettings({
      email_frequency: '' as unknown as Parameters<typeof updateRadarSettings>[0]['email_frequency'],
      categoryIds: [],
      venueIds: [],
      instagramAccountIds: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID')
    expect(from).not.toHaveBeenCalled()
  })
})
