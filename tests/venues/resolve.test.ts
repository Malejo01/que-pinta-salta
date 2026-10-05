import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveVenueId } from '@/lib/venues/resolve'

const rpc = vi.fn()
const cliente = { rpc: (...a: unknown[]) => rpc(...a) } as unknown as SupabaseClient

beforeEach(() => {
  rpc.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('resolveVenueId: onError', () => {
  it('con error de la RPC llama a onError(raw, message) y devuelve null', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function min(uuid) does not exist' } })
    const onError = vi.fn()
    const id = await resolveVenueId(cliente, 'Lugar Inventado QA', { autocreate: true, onError })
    expect(id).toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('Lugar Inventado QA', 'function min(uuid) does not exist')
  })

  it('con error y sin onError no lanza', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(resolveVenueId(cliente, 'Lugar Inventado QA')).resolves.toBeNull()
  })

  it('sin error no llama a onError y devuelve el id', async () => {
    rpc.mockResolvedValue({ data: 'id-de-prueba', error: null })
    const onError = vi.fn()
    const id = await resolveVenueId(cliente, 'Lugar Inventado QA', { onError })
    expect(id).toBe('id-de-prueba')
    expect(onError).not.toHaveBeenCalled()
  })

  it('sin match (data null, sin error) no es un error', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const onError = vi.fn()
    expect(await resolveVenueId(cliente, 'Lugar Inventado QA', { onError })).toBeNull()
    expect(onError).not.toHaveBeenCalled()
  })

  it('nombre vacío o placeholder: no llama a la RPC ni a onError', async () => {
    const onError = vi.fn()
    for (const raw of [null, '', '   ', 'A confirmar', 'Lugar no especificado']) {
      expect(await resolveVenueId(cliente, raw, { onError })).toBeNull()
    }
    expect(rpc).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('onError recibe el nombre ya saneado', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    const onError = vi.fn()
    await resolveVenueId(cliente, '  Lugar \n  Inventado QA ', { onError })
    expect(onError).toHaveBeenCalledWith('Lugar Inventado QA', 'x')
  })
})
