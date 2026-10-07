// Sin red ni base: createClient (sesión) y createAdminClient (service role) van mockeados,
// igual que resolveVenueId. Fixtures inventados ("Venue de Prueba", "@cuenta_prueba").
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

import {
  createInstagramAccount,
  toggleInstagramAccount,
  updateInstagramAccount,
} from '@/lib/instagram/admin-actions'

type Row = Record<string, unknown>

/** Cliente de sesión falso: perfil ADMIN (o no) + instagram_accounts en memoria. */
function fakeSessionClient(role: string | null = 'ADMIN') {
  const insertCalls: Row[] = []
  const updateCalls: Row[] = []

  const client = {
    auth: { getUser: async () => ({ data: { user: role === null ? null : { id: 'admin-de-prueba' } } }) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: role !== null ? { role } : null }),
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
function fakeAdminClient(venues: Array<{ id: string; name: string }>) {
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

describe('instagram/admin-actions: la guarda de "parece una dirección" (QPS-069)', () => {
  it('createInstagramAccount con "Balcarce 980": no crea, devuelve error y la sugerencia del venue existente', async () => {
    const session = fakeSessionClient()
    createClient.mockResolvedValue(session.client)
    createAdminClient.mockReturnValue(fakeAdminClient([{ id: 'venue-1', name: 'Complejo Balcarce' }]))
    resolveVenueId.mockResolvedValue('venue-1')

    const res = await createInstagramAccount('cuenta_prueba', 'Cuenta de Prueba', undefined, 'Balcarce 980')

    expect(res).toEqual({
      error: '"Balcarce 980" parece una dirección, no el nombre de un lugar.',
      suggestion: 'Complejo Balcarce',
    })
    expect(session.insertCalls).toHaveLength(0)
    expect(resolveVenueId).toHaveBeenCalledWith(expect.anything(), 'Balcarce 980', { autocreate: false })
  })

  it('createInstagramAccount con "Av. Belgrano 1250" y sin match: error con sugerencia null', async () => {
    const session = fakeSessionClient()
    createClient.mockResolvedValue(session.client)
    createAdminClient.mockReturnValue(fakeAdminClient([]))
    resolveVenueId.mockResolvedValue(null)

    const res = await createInstagramAccount('cuenta_prueba', 'Cuenta de Prueba', undefined, 'Av. Belgrano 1250')

    expect(res).toEqual({
      error: '"Av. Belgrano 1250" parece una dirección, no el nombre de un lugar.',
      suggestion: null,
    })
    expect(session.insertCalls).toHaveLength(0)
    expect(resolveVenueId).toHaveBeenCalledWith(expect.anything(), 'Av. Belgrano 1250', { autocreate: false })
  })

  it('con confirmAddressLike === true: crea la cuenta igual y ni llama a resolveVenueId', async () => {
    const session = fakeSessionClient()
    createClient.mockResolvedValue(session.client)

    const res = await createInstagramAccount(
      'cuenta_prueba',
      'Cuenta de Prueba',
      undefined,
      'Balcarce 980',
      undefined,
      undefined,
      true,
    )

    expect(res.error).toBeNull()
    expect(session.insertCalls).toHaveLength(1)
    expect(resolveVenueId).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it.each(['true', 1, {}, []])(
    'confirmAddressLike truthy pero distinto de `true` (%j) no saltea la guarda',
    async (confirmAddressLike) => {
      const session = fakeSessionClient()
      createClient.mockResolvedValue(session.client)
      createAdminClient.mockReturnValue(fakeAdminClient([]))
      resolveVenueId.mockResolvedValue(null)

      const res = await createInstagramAccount(
        'cuenta_prueba',
        'Cuenta de Prueba',
        undefined,
        'Balcarce 980',
        undefined,
        undefined,
        confirmAddressLike as unknown as boolean,
      )

      expect(res).toEqual({
        error: '"Balcarce 980" parece una dirección, no el nombre de un lugar.',
        suggestion: null,
      })
      expect(session.insertCalls).toHaveLength(0)
    },
  )

  it.each(['Club 20 de Febrero', 'Sala 1', 'Live Fresh', 'La Vieja Estación'])(
    '"%s" no parece una dirección: crea la cuenta sin pedir confirmación ni tocar venues',
    async (venueName) => {
      const session = fakeSessionClient()
      createClient.mockResolvedValue(session.client)

      const res = await createInstagramAccount('cuenta_prueba', 'Cuenta de Prueba', undefined, venueName)

      expect(res.error).toBeNull()
      expect(session.insertCalls).toHaveLength(1)
      expect(createAdminClient).not.toHaveBeenCalled()
      expect(resolveVenueId).not.toHaveBeenCalled()
    },
  )

  it('updateInstagramAccount con default_venue_name tipo dirección: no actualiza, devuelve error', async () => {
    const session = fakeSessionClient()
    createClient.mockResolvedValue(session.client)
    createAdminClient.mockReturnValue(fakeAdminClient([]))
    resolveVenueId.mockResolvedValue(null)

    const res = await updateInstagramAccount('cuenta-de-prueba-id', { default_venue_name: 'Calle Caseros 500' })

    expect(res).toEqual({
      error: '"Calle Caseros 500" parece una dirección, no el nombre de un lugar.',
      suggestion: null,
    })
    expect(session.updateCalls).toHaveLength(0)
  })

  it('updateInstagramAccount con confirmAddressLike true: sí actualiza', async () => {
    const session = fakeSessionClient()
    createClient.mockResolvedValue(session.client)

    const res = await updateInstagramAccount(
      'cuenta-de-prueba-id',
      { default_venue_name: 'Calle Caseros 500' },
      true,
    )

    expect(res.error).toBeNull()
    expect(session.updateCalls).toHaveLength(1)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('updateInstagramAccount sin default_venue_name en el payload: no dispara la guarda', async () => {
    const session = fakeSessionClient()
    createClient.mockResolvedValue(session.client)

    const res = await updateInstagramAccount('cuenta-de-prueba-id', { display_name: 'Nuevo Nombre de Prueba' })

    expect(res.error).toBeNull()
    expect(session.updateCalls).toHaveLength(1)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('toggleInstagramAccount no dispara la guarda de dirección', async () => {
    const session = fakeSessionClient()
    createClient.mockResolvedValue(session.client)

    const res = await toggleInstagramAccount('cuenta-de-prueba-id', false)

    expect(res.error).toBeNull()
    expect(session.updateCalls).toEqual([{ is_active: false }])
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(resolveVenueId).not.toHaveBeenCalled()
  })

  it('sin permisos de administrador: ni llega a mirar si el nombre parece una dirección', async () => {
    const session = fakeSessionClient('USER')
    createClient.mockResolvedValue(session.client)

    const res = await createInstagramAccount('cuenta_prueba', 'Cuenta de Prueba', undefined, 'Balcarce 980')

    expect(res).toEqual({ error: 'Sin permisos de administrador' })
    expect(session.insertCalls).toHaveLength(0)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(resolveVenueId).not.toHaveBeenCalled()
  })
})
