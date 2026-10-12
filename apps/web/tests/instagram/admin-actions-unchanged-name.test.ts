// Ronda 14 / tarea 14-b (QPS-075): updateInstagramAccount no repite la guarda de "parece una
// dirección" (QPS-069) si default_venue_name no cambió respecto al valor ya guardado en la
// cuenta. createInstagramAccount (alta) no tiene "valor anterior": siempre corre la guarda si el
// nombre parece una dirección. Sin red ni base: createClient (sesión) y createAdminClient
// (service role) van mockeados, igual que resolveVenueId. Fixtures inventados
// ("Venue de Prueba", "@cuenta_prueba", direcciones de fantasía).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
const createAdminClient = vi.fn()
const resolveVenueId = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))
vi.mock('@/lib/venues/resolve', () => ({
  resolveVenueId: (...a: unknown[]) => resolveVenueId(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createInstagramAccount, updateInstagramAccount } from '@/lib/instagram/admin-actions'

type Row = Record<string, unknown>

/**
 * Cliente de sesión falso: perfil ADMIN + una única cuenta de instagram_accounts en memoria,
 * con `existingVenueName` como el `default_venue_name` que ya tiene guardado (lo que devuelve
 * el `.select(...).eq(...).maybeSingle()` que hace updateInstagramAccount antes de actualizar).
 */
function fakeSessionClient(existingVenueName: string | null) {
  const insertCalls: Row[] = []
  const updateCalls: Row[] = []

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-de-prueba' } } }) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { role: 'ADMIN' } }),
            }),
          }),
        }
      }
      if (table === 'instagram_accounts') {
        const c: Record<string, unknown> = {}
        let payload: Row = {}
        c.insert = (p: Row) => {
          payload = p
          insertCalls.push(p)
          return c
        }
        c.update = (p: Row) => {
          payload = p
          updateCalls.push(p)
          return c
        }
        c.eq = () => c
        c.select = () => c
        c.single = async () => ({ data: { id: 'cuenta-de-prueba-id', ...payload }, error: null })
        c.maybeSingle = async () => ({ data: { default_venue_name: existingVenueName }, error: null })
        c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(res, rej)
        return c
      }
      throw new Error('tabla inesperada: ' + table)
    },
  }
  return { client, insertCalls, updateCalls }
}

/** Cliente de service role falso: solo lectura de `venues` (nunca insert). */
function fakeAdminClient(venues: Array<{ id: string; name: string }> = []) {
  return {
    from: (table: string) => {
      if (table !== 'venues') throw new Error('tabla inesperada: ' + table)
      let filterId: string | undefined
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = (_col: string, val: string) => {
        filterId = val
        return c
      }
      c.single = async () => ({ data: venues.find((v) => v.id === filterId) ?? null, error: null })
      c.insert = () => {
        throw new Error('no debería insertar un venue: checkAddressLikeVenue nunca autocrea')
      }
      return c
    },
  }
}

beforeEach(() => {
  createClient.mockReset()
  createAdminClient.mockReset()
  resolveVenueId.mockReset()
})
afterEach(() => vi.restoreAllMocks())

const DIRECCION = 'Balcarce 980'
const OTRA_DIRECCION = 'Av. Belgrano 1250'

describe('instagram/admin-actions: QPS-075, no repetir la guarda de dirección si el nombre no cambió', () => {
  it('updateInstagramAccount con el mismo nombre "Balcarce 980" ya guardado: no pide confirmación y actualiza', async () => {
    const session = fakeSessionClient(DIRECCION)
    createClient.mockResolvedValue(session.client)

    const res = await updateInstagramAccount('cuenta-de-prueba-id', { default_venue_name: DIRECCION })

    expect(res.error).toBeNull()
    expect(session.updateCalls).toHaveLength(1)
    expect(session.updateCalls[0].default_venue_name).toBe(DIRECCION)
    // Sin pasar por checkAddressLikeVenue: ni el cliente de service role ni resolveVenueId.
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(resolveVenueId).not.toHaveBeenCalled()
  })

  it('updateInstagramAccount cambiando "Balcarce 980" por otra dirección: sí pide confirmación', async () => {
    const session = fakeSessionClient(DIRECCION)
    createClient.mockResolvedValue(session.client)
    createAdminClient.mockReturnValue(fakeAdminClient())
    resolveVenueId.mockResolvedValue(null)

    const res = await updateInstagramAccount('cuenta-de-prueba-id', { default_venue_name: OTRA_DIRECCION })

    expect(res).toEqual({
      error: `"${OTRA_DIRECCION}" parece una dirección, no el nombre de un lugar.`,
      suggestion: null,
    })
    expect(session.updateCalls).toHaveLength(0)
    expect(resolveVenueId).toHaveBeenCalledWith(expect.anything(), OTRA_DIRECCION, { autocreate: false })
  })

  it('updateInstagramAccount con confirmAddressLike true, aun cambiando a otra dirección: saltea la guarda igual que antes de QPS-075', async () => {
    const session = fakeSessionClient(DIRECCION)
    createClient.mockResolvedValue(session.client)

    const res = await updateInstagramAccount(
      'cuenta-de-prueba-id',
      { default_venue_name: OTRA_DIRECCION },
      true,
    )

    expect(res.error).toBeNull()
    expect(session.updateCalls).toHaveLength(1)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(resolveVenueId).not.toHaveBeenCalled()
  })

  it('updateInstagramAccount de un valor no-dirección a otro distinto no-dirección: no dispara la guarda (nunca la disparó)', async () => {
    const session = fakeSessionClient('Live Fresh')
    createClient.mockResolvedValue(session.client)

    const res = await updateInstagramAccount('cuenta-de-prueba-id', { default_venue_name: 'La Vieja Estación' })

    expect(res.error).toBeNull()
    expect(session.updateCalls).toHaveLength(1)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(resolveVenueId).not.toHaveBeenCalled()
  })

  it('createInstagramAccount (alta) con "Balcarce 980": siempre pide confirmación, no hay valor anterior que comparar', async () => {
    const session = fakeSessionClient(null)
    createClient.mockResolvedValue(session.client)
    createAdminClient.mockReturnValue(fakeAdminClient())
    resolveVenueId.mockResolvedValue(null)

    const res = await createInstagramAccount('cuenta_prueba', 'Cuenta de Prueba', undefined, DIRECCION)

    expect(res).toEqual({
      error: `"${DIRECCION}" parece una dirección, no el nombre de un lugar.`,
      suggestion: null,
    })
    expect(session.insertCalls).toHaveLength(0)
    expect(resolveVenueId).toHaveBeenCalledWith(expect.anything(), DIRECCION, { autocreate: false })
  })
})
