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

describe('resolveVenueId: la RPC lanza (no solo devuelve { error })', () => {
  it('promesa rechazada: no propaga, llama a onError y devuelve null', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'))
    const onError = vi.fn()
    const id = await resolveVenueId(cliente, 'Lugar Inventado QA', { autocreate: true, onError })
    expect(id).toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('Lugar Inventado QA', 'fetch failed')
  })

  it('la llamada misma lanza de forma sincrónica (no devuelve una promesa): no propaga', async () => {
    rpc.mockImplementation(() => {
      throw new Error('boom sincrónico')
    })
    const onError = vi.fn()
    await expect(resolveVenueId(cliente, 'Lugar Inventado QA', { onError })).resolves.toBeNull()
    expect(onError).toHaveBeenCalledWith('Lugar Inventado QA', 'boom sincrónico')
  })

  it('rechazo con algo que no es un Error: usa String(err) como mensaje', async () => {
    rpc.mockRejectedValue('string de error')
    const onError = vi.fn()
    await resolveVenueId(cliente, 'Lugar Inventado QA', { onError })
    expect(onError).toHaveBeenCalledWith('Lugar Inventado QA', 'string de error')
  })

  it('sin onError no lanza igual (solo pierde la notificación)', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'))
    await expect(resolveVenueId(cliente, 'Lugar Inventado QA')).resolves.toBeNull()
  })

  it('onError recibe el nombre ya saneado, no el crudo', async () => {
    rpc.mockRejectedValue(new Error('x'))
    const onError = vi.fn()
    await resolveVenueId(cliente, '  Lugar \n  Inventado QA ', { onError })
    expect(onError).toHaveBeenCalledWith('Lugar Inventado QA', 'x')
  })

  it('nombre placeholder: no llama a la RPC (aunque esté rota) ni a onError', async () => {
    rpc.mockImplementation(() => {
      throw new Error('no debería llamarse')
    })
    const onError = vi.fn()
    expect(await resolveVenueId(cliente, 'a confirmar', { onError })).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
