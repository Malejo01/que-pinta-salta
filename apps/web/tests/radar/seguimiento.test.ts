/**
 * "+ Seguir" (R47, tarea 47-b, QPS-197): `cambiarSeguimiento`,
 * `obtenerSeguimientoDeEvento` y `obtenerLoQueSeguis` de
 * `lib/actions/radar.ts`. Sin red ni base: `@/lib/supabase/server` y
 * `next/cache` van mockeados, mismo patrón que `tests/radar/update-settings-invalida.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TABLA_SEGUIMIENTO, type TipoSeguimiento } from '@qps/core/radar/seguimiento'

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { cambiarSeguimiento, obtenerSeguimientoDeEvento, obtenerLoQueSeguis } from '../../lib/actions/radar'

beforeEach(() => {
  createClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

const IDS: Record<TipoSeguimiento, string> = {
  lugar: '11111111-1111-4111-8111-111111111111',
  cuenta: '22222222-2222-4222-8222-222222222222',
  categoria: '33333333-3333-4333-8333-333333333333',
}

// ---------------------------------------------------------------------------
// Doble de Supabase para cambiarSeguimiento: registra tabla + operación +
// valores/filtros de cada escritura.
// ---------------------------------------------------------------------------
interface Llamada {
  tabla: string
  op: 'insert' | 'delete'
  valores?: Record<string, unknown>
  filtros?: Record<string, unknown>
}

function construirClienteSeguimiento(config: {
  user: { id: string } | null
  insertError?: unknown
  deleteError?: unknown
}) {
  const llamadas: Llamada[] = []

  const from = vi.fn((tabla: string) => ({
    insert: async (valores: Record<string, unknown>) => {
      llamadas.push({ tabla, op: 'insert', valores })
      return { error: config.insertError ?? null }
    },
    delete: () => ({
      eq: (col1: string, val1: unknown) => ({
        eq: async (col2: string, val2: unknown) => {
          llamadas.push({ tabla, op: 'delete', filtros: { [col1]: val1, [col2]: val2 } })
          return { error: config.deleteError ?? null }
        },
      }),
    }),
  }))

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from },
    llamadas,
    from,
  }
}

/** Un `from()` que revienta el test si se llama: para "sin sesión no se escribe nada". */
function clienteSinFrom(user: { id: string } | null) {
  const from = vi.fn((tabla: string) => {
    throw new Error(`no debería llamar a from("${tabla}")`)
  })
  return { cliente: { auth: { getUser: async () => ({ data: { user }, error: null }) }, from }, from }
}

// ---------------------------------------------------------------------------
// Seguir y dejar de seguir escriben en la tabla y columna correctas, para
// los tres tipos (el mapeo sale de TABLA_SEGUIMIENTO, de core).
// ---------------------------------------------------------------------------
describe.each((['lugar', 'cuenta', 'categoria'] as const).map((tipo) => [tipo] as const))(
  'cambiarSeguimiento: tipo "%s"',
  (tipo) => {
    const { tabla, columna } = TABLA_SEGUIMIENTO[tipo]
    const id = IDS[tipo]

    it(`seguir: insert en ${tipo === 'lugar' ? 'user_followed_venues' : tipo === 'cuenta' ? 'user_followed_instagram_accounts' : 'user_followed_categories'} con {user_id, ${columna}}`, async () => {
      const { cliente, llamadas } = construirClienteSeguimiento({ user: { id: 'usuario-1' } })
      createClient.mockResolvedValue(cliente)

      const resultado = await cambiarSeguimiento({ tipo, id, seguir: true })

      expect(resultado).toEqual({ ok: true, siguiendo: true })
      expect(llamadas).toEqual([
        { tabla, op: 'insert', valores: { user_id: 'usuario-1', [columna]: id } },
      ])
    })

    it('dejar de seguir: delete filtrado por user_id y por la columna del tipo', async () => {
      const { cliente, llamadas } = construirClienteSeguimiento({ user: { id: 'usuario-2' } })
      createClient.mockResolvedValue(cliente)

      const resultado = await cambiarSeguimiento({ tipo, id, seguir: false })

      expect(resultado).toEqual({ ok: true, siguiendo: false })
      expect(llamadas).toEqual([
        { tabla, op: 'delete', filtros: { user_id: 'usuario-2', [columna]: id } },
      ])
    })

    it('un 23505 al seguir (ya lo seguía) es éxito, no error', async () => {
      const { cliente } = construirClienteSeguimiento({
        user: { id: 'usuario-3' },
        insertError: { code: '23505', message: 'ya existe' },
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await cambiarSeguimiento({ tipo, id, seguir: true })

      expect(resultado).toEqual({ ok: true, siguiendo: true })
    })
  },
)

// ---------------------------------------------------------------------------
// Entrada inválida: INVALID sin autenticar y sin escribir.
// ---------------------------------------------------------------------------
describe('cambiarSeguimiento: entrada inválida da INVALID sin crear sesión ni tocar la base', () => {
  it('un tipo que no es de la lista', async () => {
    const resultado = await cambiarSeguimiento({ tipo: 'evento', id: IDS.lugar, seguir: true })

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('un id que no es un uuid', async () => {
    const resultado = await cambiarSeguimiento({ tipo: 'lugar', id: 'no-es-un-uuid', seguir: true })

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('"seguir" no es un booleano de verdad (string "true")', async () => {
    const resultado = await cambiarSeguimiento({ tipo: 'lugar', id: IDS.lugar, seguir: 'true' })

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('"seguir" es 1 (no un booleano)', async () => {
    const resultado = await cambiarSeguimiento({ tipo: 'lugar', id: IDS.lugar, seguir: 1 })

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('entrada no es un objeto (null)', async () => {
    const resultado = await cambiarSeguimiento(null)

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('cambiarSeguimiento: sin sesión no se escribe nada', () => {
  it('AUTH_REQUIRED, from() nunca se llama', async () => {
    const { cliente, from } = clienteSinFrom(null)
    createClient.mockResolvedValue(cliente)

    const resultado = await cambiarSeguimiento({ tipo: 'lugar', id: IDS.lugar, seguir: true })

    expect(resultado).toEqual({ ok: false, error: 'AUTH_REQUIRED' })
    expect(from).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// obtenerSeguimientoDeEvento.
// ---------------------------------------------------------------------------
interface ConfigEvento {
  user: { id: string } | null
  venue?: { id: string; name: string } | null
  flyers?: Array<{ published_at: string; account: { id: string; username: string; is_active: boolean } | null }>
  lugarSeguidoData?: { venue_id: string } | null
  cuentaSeguidaData?: { instagram_account_id: string } | null
}

function construirClienteEvento(config: ConfigEvento) {
  const tablasConsultadas: string[] = []

  const from = vi.fn((tabla: string) => {
    tablasConsultadas.push(tabla)

    if (tabla === 'events') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: config.venue ? { venue_id: config.venue.id, venue: config.venue } : null,
              error: null,
            }),
          }),
        }),
      }
    }
    if (tabla === 'instagram_flyers') {
      return {
        select: () => ({
          eq: async () => ({ data: config.flyers ?? [], error: null }),
        }),
      }
    }
    if (tabla === 'user_followed_venues') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: config.lugarSeguidoData ?? null, error: null }) }),
          }),
        }),
      }
    }
    if (tabla === 'user_followed_instagram_accounts') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: config.cuentaSeguidaData ?? null, error: null }) }),
          }),
        }),
      }
    }
    throw new Error(`tabla inesperada en el doble de obtenerSeguimientoDeEvento: ${tabla}`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from },
    tablasConsultadas,
  }
}

describe('obtenerSeguimientoDeEvento: sin sesión no consulta user_followed_*', () => {
  it('lugar y cuenta con siguiendo:false, sin tocar user_followed_venues ni user_followed_instagram_accounts', async () => {
    const venue = { id: 'venue-1', name: 'Teatro de Prueba' }
    const { cliente, tablasConsultadas } = construirClienteEvento({
      user: null,
      venue,
      flyers: [{ published_at: '2030-01-01T00:00:00Z', account: { id: 'cuenta-1', username: 'cuenta_uno', is_active: true } }],
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerSeguimientoDeEvento('evento-1')

    expect(resultado).toEqual({
      lugar: { id: 'venue-1', nombre: 'Teatro de Prueba', siguiendo: false },
      cuenta: { id: 'cuenta-1', username: 'cuenta_uno', siguiendo: false },
    })
    expect(tablasConsultadas).not.toContain('user_followed_venues')
    expect(tablasConsultadas).not.toContain('user_followed_instagram_accounts')
  })
})

describe('obtenerSeguimientoDeEvento: una cuenta con is_active:false no aparece', () => {
  it('cuenta: null (cuentaParaSeguir la descarta)', async () => {
    const { cliente } = construirClienteEvento({
      user: null,
      venue: null,
      flyers: [{ published_at: '2030-01-01T00:00:00Z', account: { id: 'cuenta-inactiva', username: 'inactiva', is_active: false } }],
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerSeguimientoDeEvento('evento-1')

    expect(resultado).toEqual({ lugar: null, cuenta: null })
  })
})

describe('obtenerSeguimientoDeEvento: con sesión, siguiendo se lee de user_followed_*', () => {
  it('lugar y cuenta ya seguidos: siguiendo:true en los dos', async () => {
    const venue = { id: 'venue-2', name: 'Salón de Prueba' }
    const { cliente } = construirClienteEvento({
      user: { id: 'usuario-1' },
      venue,
      flyers: [{ published_at: '2030-01-01T00:00:00Z', account: { id: 'cuenta-2', username: 'cuenta_dos', is_active: true } }],
      lugarSeguidoData: { venue_id: venue.id },
      cuentaSeguidaData: { instagram_account_id: 'cuenta-2' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerSeguimientoDeEvento('evento-2')

    expect(resultado).toEqual({
      lugar: { id: 'venue-2', nombre: 'Salón de Prueba', siguiendo: true },
      cuenta: { id: 'cuenta-2', username: 'cuenta_dos', siguiendo: true },
    })
  })
})

// ---------------------------------------------------------------------------
// obtenerLoQueSeguis.
// ---------------------------------------------------------------------------
interface ConfigLoQueSeguis {
  user: { id: string } | null
  lugaresData?: Array<{ venue: { id: string; name: string } | null }>
  lugaresError?: unknown
  cuentasData?: Array<{ account: { id: string; username: string } | null }>
  cuentasError?: unknown
  categoriasData?: Array<{ category: { id: string; name: string } | null }>
  categoriasError?: unknown
}

function construirClienteLoQueSeguis(config: ConfigLoQueSeguis) {
  const from = vi.fn((tabla: string) => {
    if (tabla === 'user_followed_venues') {
      return { select: () => ({ eq: async () => ({ data: config.lugaresData ?? [], error: config.lugaresError ?? null }) }) }
    }
    if (tabla === 'user_followed_instagram_accounts') {
      return { select: () => ({ eq: async () => ({ data: config.cuentasData ?? [], error: config.cuentasError ?? null }) }) }
    }
    if (tabla === 'user_followed_categories') {
      return { select: () => ({ eq: async () => ({ data: config.categoriasData ?? [], error: config.categoriasError ?? null }) }) }
    }
    throw new Error(`tabla inesperada en el doble de obtenerLoQueSeguis: ${tabla}`)
  })

  return { cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from } }
}

describe('obtenerLoQueSeguis', () => {
  it('sin sesión: null', async () => {
    const { cliente } = construirClienteLoQueSeguis({ user: null })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerLoQueSeguis()

    expect(resultado).toBeNull()
  })

  it('con sesión: las tres listas, descartando joins nulos', async () => {
    const { cliente } = construirClienteLoQueSeguis({
      user: { id: 'usuario-1' },
      lugaresData: [{ venue: { id: 'v1', name: 'Venue Uno' } }],
      cuentasData: [{ account: { id: 'c1', username: 'cuenta_uno' } }],
      categoriasData: [{ category: { id: 'cat1', name: 'Teatro' } }],
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerLoQueSeguis()

    expect(resultado).toEqual({
      lugares: [{ id: 'v1', nombre: 'Venue Uno' }],
      cuentas: [{ id: 'c1', username: 'cuenta_uno' }],
      categorias: [{ id: 'cat1', nombre: 'Teatro' }],
    })
  })

  it('un error en la lista de lugares no vacía las otras dos', async () => {
    const { cliente } = construirClienteLoQueSeguis({
      user: { id: 'usuario-2' },
      lugaresError: { code: '42501', message: 'detalle interno' },
      cuentasData: [{ account: { id: 'c2', username: 'cuenta_dos' } }],
      categoriasData: [{ category: { id: 'cat2', name: 'Música' } }],
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerLoQueSeguis()

    expect(resultado).toEqual({
      lugares: [],
      cuentas: [{ id: 'c2', username: 'cuenta_dos' }],
      categorias: [{ id: 'cat2', nombre: 'Música' }],
    })
  })
})
