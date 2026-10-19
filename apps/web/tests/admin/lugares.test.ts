/**
 * `lib/admin/lugares-actions.ts` (R53, tarea 53-c): guardar o quitar una
 * ubicación a mano en /admin/lugares. Sin red ni base: `@/lib/supabase/server`
 * y `next/cache` van mockeados (mismo patrón que
 * `tests/radar/update-settings-invalida.test.ts` y
 * `tests/asistencia/guardar-voy.test.ts`).
 *
 * El chequeo de que este archivo (módulo "use server") solo exporta
 * `async function` y tipos ya lo barre `tests/lib/use-server.test.ts` sobre
 * todo `apps/web`: no se duplica acá.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
const revalidatePath = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { guardarUbicacionManual, quitarUbicacion } from '@/lib/admin/lugares-actions'

const VENUE_ID = '11111111-1111-4111-8111-111111111111'
const COORDS_OK = '-24.7883, -65.4106'

interface ConfigCliente {
  user: { id: string } | null
  profile?: { role: string } | null
  updateData?: Array<{ id: string }> | null
  updateError?: { code?: string; message: string } | null
}

/** Doble de createClient: `from('profiles')` lee el rol; `from('venues')` registra cada update. */
function construirCliente(config: ConfigCliente) {
  const updates: unknown[] = []

  const from = vi.fn((tabla: string) => {
    if (tabla === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: config.profile ?? null, error: null }),
          }),
        }),
      }
    }

    if (tabla === 'venues') {
      return {
        update: (valores: unknown) => {
          updates.push(valores)
          return {
            eq: (columna: string, valor: string) => {
              if (columna !== 'id') {
                throw new Error(`el update de venues tiene que filtrar por "id", filtró por "${columna}"`)
              }
              return {
                select: async (columnas: string) => {
                  if (columnas !== 'id') {
                    throw new Error(`select inesperado tras el update de venues: "${columnas}"`)
                  }
                  if (config.updateError) return { data: null, error: config.updateError }
                  return { data: config.updateData ?? [{ id: valor }], error: null }
                },
              }
            },
          }
        },
      }
    }

    throw new Error(`tabla inesperada en el doble de lugares-actions: "${tabla}"`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from },
    from,
    updates,
  }
}

/** Un `from()` que revienta el test si se llama: sin sesión no se toca la base en absoluto. */
function clienteSinFrom(user: { id: string } | null) {
  const from = vi.fn((tabla: string) => {
    throw new Error(`no debería llamar a from("${tabla}"): sin sesión no se toca la base`)
  })
  return { cliente: { auth: { getUser: async () => ({ data: { user }, error: null }) }, from }, from }
}

beforeEach(() => {
  createClient.mockReset()
  revalidatePath.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('guardarUbicacionManual: sin sesión', () => {
  it('error, y from() nunca se llama', async () => {
    const { cliente, from } = clienteSinFrom(null)
    createClient.mockResolvedValue(cliente)

    const resultado = await guardarUbicacionManual(VENUE_ID, COORDS_OK)

    expect(resultado).toEqual({ ok: false, error: 'No autenticado' })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('guardarUbicacionManual: con sesión que no es ADMIN', () => {
  it('error, y ninguna escritura sobre venues', async () => {
    const { cliente, updates } = construirCliente({
      user: { id: 'usuario-1' },
      profile: { role: 'USER' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await guardarUbicacionManual(VENUE_ID, COORDS_OK)

    expect(resultado).toEqual({ ok: false, error: 'No tienes permisos de administrador' })
    expect(updates).toHaveLength(0)
  })
})

describe('guardarUbicacionManual: id o texto inválidos, sin crear el cliente', () => {
  it('un venueId que no es uuid: error, createClient nunca se llama', async () => {
    const resultado = await guardarUbicacionManual('no-es-un-uuid', COORDS_OK)

    expect(resultado.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('un texto que no parsea como coordenadas: error, createClient nunca se llama', async () => {
    const resultado = await guardarUbicacionManual(VENUE_ID, 'esto no son coordenadas')

    expect(resultado.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('un texto que no es un string: error, createClient nunca se llama', async () => {
    const resultado = await guardarUbicacionManual(VENUE_ID, undefined)

    expect(resultado.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('guardarUbicacionManual: admin + texto bueno', () => {
  it('hace un solo update sobre venues, con exactamente los cuatro campos, geocode_source: "manual" y .eq("id", venueId)', async () => {
    const { cliente, updates } = construirCliente({
      user: { id: 'admin-1' },
      profile: { role: 'ADMIN' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await guardarUbicacionManual(VENUE_ID, COORDS_OK)

    expect(resultado).toEqual({ ok: true })
    expect(updates).toHaveLength(1)
    const valores = updates[0] as Record<string, unknown>
    expect(Object.keys(valores).sort()).toEqual(['geocode_source', 'geocoded_at', 'latitude', 'longitude'])
    expect(valores.geocode_source).toBe('manual')
    expect(valores.latitude).toBe(-24.7883)
    expect(valores.longitude).toBe(-65.4106)
    expect(typeof valores.geocoded_at).toBe('string')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/lugares')
  })

  it('si no actualizó ninguna fila, devuelve "No se encontró el lugar"', async () => {
    const { cliente } = construirCliente({
      user: { id: 'admin-1' },
      profile: { role: 'ADMIN' },
      updateData: [],
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await guardarUbicacionManual(VENUE_ID, COORDS_OK)

    expect(resultado).toEqual({ ok: false, error: 'No se encontró el lugar' })
  })

  it('un error de la base: mensaje genérico, nunca el message crudo del doble', async () => {
    const { cliente } = construirCliente({
      user: { id: 'admin-1' },
      profile: { role: 'ADMIN' },
      updateError: { code: '23505', message: 'detalle interno sensible de la base' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await guardarUbicacionManual(VENUE_ID, COORDS_OK)

    expect(resultado).toEqual({ ok: false, error: 'No se pudo guardar la ubicación. Intentá de nuevo' })
    expect(JSON.stringify(resultado)).not.toContain('detalle interno sensible')
  })
})

describe('quitarUbicacion: sin sesión', () => {
  it('error, y from() nunca se llama', async () => {
    const { cliente, from } = clienteSinFrom(null)
    createClient.mockResolvedValue(cliente)

    const resultado = await quitarUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: false, error: 'No autenticado' })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('quitarUbicacion: con sesión que no es ADMIN', () => {
  it('error, y ninguna escritura sobre venues', async () => {
    const { cliente, updates } = construirCliente({
      user: { id: 'usuario-1' },
      profile: { role: 'USER' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await quitarUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: false, error: 'No tienes permisos de administrador' })
    expect(updates).toHaveLength(0)
  })
})

describe('quitarUbicacion: un id que no es uuid, sin crear el cliente', () => {
  it('error, createClient nunca se llama', async () => {
    const resultado = await quitarUbicacion('no-es-un-uuid')

    expect(resultado.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('quitarUbicacion: admin', () => {
  it('pone los cuatro campos en null, en un solo update, filtrando por .eq("id", venueId)', async () => {
    const { cliente, updates } = construirCliente({
      user: { id: 'admin-1' },
      profile: { role: 'ADMIN' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await quitarUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: true })
    expect(updates).toEqual([{ latitude: null, longitude: null, geocode_source: null, geocoded_at: null }])
    expect(revalidatePath).toHaveBeenCalledWith('/admin/lugares')
  })

  it('un error de la base: mensaje genérico, nunca el message crudo del doble', async () => {
    const { cliente } = construirCliente({
      user: { id: 'admin-1' },
      profile: { role: 'ADMIN' },
      updateError: { code: '42501', message: 'detalle interno sensible de la base' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await quitarUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: false, error: 'No se pudo quitar la ubicación. Intentá de nuevo' })
    expect(JSON.stringify(resultado)).not.toContain('detalle interno sensible')
  })
})
