// R47, tarea 47-e (QPS-197): "+ Seguir" en `lib/radar.ts`
// (`cambiarSeguimiento`, `obtenerSeguimientoDeEvento`, `obtenerLoQueSeguis`).
// Doble de `@/lib/supabase` genérico (mismo patrón que `tests/radar.test.ts`):
// soporta `select().eq()...maybeSingle()`, `select().eq()` (resuelto por
// `.then()`), `insert(valores)` y `delete().eq()...eq()` (resuelto por
// `.then()`, para cualquier cantidad de `.eq()` encadenados). Nunca el
// cliente real (ni red, ni .env, ni base).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = 'usuario-de-prueba-seguimiento'
const ID_VALIDO = '11111111-1111-1111-1111-111111111111'
const VENUE_ID = '22222222-2222-2222-2222-222222222222'
const CUENTA_ID = '33333333-3333-3333-3333-333333333333'
const EVENT_ID = 'evento-de-prueba-seguimiento'

type Escritura = { tabla: string; accion: 'insert' | 'delete'; valores: unknown }

const estado = vi.hoisted(() => ({
  lecturas: {} as Record<string, { data: unknown; error: unknown }>,
  resultadosEscritura: {} as Record<string, { error: unknown }>,
  escrituras: [] as Escritura[],
  llamadasLectura: {} as Record<string, number>,
}))

function construirTabla(tabla: string) {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.maybeSingle = async () => {
    estado.llamadasLectura[tabla] = (estado.llamadasLectura[tabla] ?? 0) + 1
    return estado.lecturas[tabla] ?? { data: null, error: null }
  }
  builder.insert = async (valores: unknown) => {
    estado.escrituras.push({ tabla, accion: 'insert', valores })
    return estado.resultadosEscritura[`${tabla}:insert`] ?? { error: null }
  }
  builder.delete = () => {
    const eqs: Array<[string, unknown]> = []
    const deleteBuilder: Record<string, unknown> = {}
    deleteBuilder.eq = (campo: string, valor: unknown) => {
      eqs.push([campo, valor])
      return deleteBuilder
    }
    deleteBuilder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      estado.escrituras.push({ tabla, accion: 'delete', valores: Object.fromEntries(eqs) })
      return Promise.resolve(estado.resultadosEscritura[`${tabla}:delete`] ?? { error: null }).then(resolve, reject)
    }
    return deleteBuilder
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    estado.llamadasLectura[tabla] = (estado.llamadasLectura[tabla] ?? 0) + 1
    return Promise.resolve(estado.lecturas[tabla] ?? { data: [], error: null }).then(resolve, reject)
  }
  return builder
}

// `vi.mock` se eleva por encima de los imports estáticos: `lib/radar` ya ve
// este doble al importar `@/lib/supabase`. Nunca el cliente real.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (tabla: string) => construirTabla(tabla) },
}))

import { cambiarSeguimiento, obtenerLoQueSeguis, obtenerSeguimientoDeEvento } from '../lib/radar'

beforeEach(() => {
  estado.lecturas = {}
  estado.resultadosEscritura = {}
  estado.escrituras = []
  estado.llamadasLectura = {}
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// La tabla y la columna de cada tipo (TABLA_SEGUIMIENTO, de core).
// ---------------------------------------------------------------------------
describe.each([
  ['lugar', 'user_followed_venues', 'venue_id'],
  ['cuenta', 'user_followed_instagram_accounts', 'instagram_account_id'],
  ['categoria', 'user_followed_categories', 'category_id'],
] as const)('cambiarSeguimiento: tipo "%s" -> tabla "%s", columna "%s"', (tipo, tabla, columna) => {
  it('seguir:true inserta exactamente {user_id, [columna]: id} en esa tabla', async () => {
    const resultado = await cambiarSeguimiento(USER_ID, { tipo, id: ID_VALIDO, seguir: true })

    expect(resultado).toEqual({ ok: true, siguiendo: true })
    const insert = estado.escrituras.find((e) => e.tabla === tabla && e.accion === 'insert')
    expect(insert?.valores).toEqual({ user_id: USER_ID, [columna]: ID_VALIDO })
  })

  it('seguir:false borra de esa tabla, filtrando por user_id y por la columna correspondiente', async () => {
    const resultado = await cambiarSeguimiento(USER_ID, { tipo, id: ID_VALIDO, seguir: false })

    expect(resultado).toEqual({ ok: true, siguiendo: false })
    const del = estado.escrituras.find((e) => e.tabla === tabla && e.accion === 'delete')
    expect(del?.valores).toEqual({ user_id: USER_ID, [columna]: ID_VALIDO })
  })
})

// ---------------------------------------------------------------------------
// Un 23505 (ya lo seguía) cuenta como éxito.
// ---------------------------------------------------------------------------
describe('cambiarSeguimiento: 23505 (unique violation) cuenta como éxito', () => {
  it('insert con error 23505: ok:true de todos modos', async () => {
    estado.resultadosEscritura['user_followed_venues:insert'] = {
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }

    const resultado = await cambiarSeguimiento(USER_ID, { tipo: 'lugar', id: ID_VALIDO, seguir: true })

    expect(resultado).toEqual({ ok: true, siguiendo: true })
  })

  it('insert con cualquier otro código: error, no se tapa', async () => {
    estado.resultadosEscritura['user_followed_venues:insert'] = { error: { code: '42501', message: 'boom' } }

    const resultado = await cambiarSeguimiento(USER_ID, { tipo: 'lugar', id: ID_VALIDO, seguir: true })

    expect(resultado.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Un id inválido no escribe nada (validarSeguimiento, de core, corre ANTES
// de tocar la base).
// ---------------------------------------------------------------------------
describe('cambiarSeguimiento: entrada inválida no escribe nada', () => {
  it('un id que no es uuid: error, cero escrituras', async () => {
    const resultado = await cambiarSeguimiento(USER_ID, { tipo: 'lugar', id: 'no-es-un-uuid', seguir: true })

    expect(resultado.ok).toBe(false)
    expect(estado.escrituras).toHaveLength(0)
  })

  it('un tipo desconocido: error, cero escrituras', async () => {
    const resultado = await cambiarSeguimiento(USER_ID, { tipo: 'otra-cosa', id: ID_VALIDO, seguir: true })

    expect(resultado.ok).toBe(false)
    expect(estado.escrituras).toHaveLength(0)
  })

  it('"seguir" no booleano (string "true"): error, cero escrituras', async () => {
    const resultado = await cambiarSeguimiento(USER_ID, { tipo: 'lugar', id: ID_VALIDO, seguir: 'true' })

    expect(resultado.ok).toBe(false)
    expect(estado.escrituras).toHaveLength(0)
  })

  it('entrada que no es un objeto (null): error, cero escrituras', async () => {
    const resultado = await cambiarSeguimiento(USER_ID, null)

    expect(resultado.ok).toBe(false)
    expect(estado.escrituras).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// obtenerSeguimientoDeEvento: sin sesión, "siguiendo" es siempre false y
// nunca se consulta ninguna tabla user_followed_*.
// ---------------------------------------------------------------------------
describe('obtenerSeguimientoDeEvento: sin sesión', () => {
  it('siguiendo = false para lugar y cuenta, y nunca consulta user_followed_venues / user_followed_instagram_accounts', async () => {
    estado.lecturas['events'] = {
      data: { venue_id: VENUE_ID, venue: { id: VENUE_ID, name: 'Lugar de prueba' } },
      error: null,
    }
    estado.lecturas['instagram_flyers'] = {
      data: [
        {
          published_at: '2030-01-01T00:00:00Z',
          account: { id: CUENTA_ID, username: 'cuenta_prueba', is_active: true },
        },
      ],
      error: null,
    }

    const resultado = await obtenerSeguimientoDeEvento(EVENT_ID, null)

    expect(resultado.lugar).toEqual({ id: VENUE_ID, nombre: 'Lugar de prueba', siguiendo: false })
    expect(resultado.cuenta).toEqual({ id: CUENTA_ID, username: 'cuenta_prueba', siguiendo: false })
    expect(estado.llamadasLectura['user_followed_venues']).toBeUndefined()
    expect(estado.llamadasLectura['user_followed_instagram_accounts']).toBeUndefined()
  })

  it('sin venue y sin cuenta candidata: { lugar: null, cuenta: null }', async () => {
    estado.lecturas['events'] = { data: { venue_id: null, venue: null }, error: null }
    estado.lecturas['instagram_flyers'] = { data: [], error: null }

    const resultado = await obtenerSeguimientoDeEvento(EVENT_ID, null)

    expect(resultado).toEqual({ lugar: null, cuenta: null })
  })
})

// ---------------------------------------------------------------------------
// Una cuenta con is_active:false no aparece (cuentaParaSeguir, de core, la
// descarta).
// ---------------------------------------------------------------------------
describe('obtenerSeguimientoDeEvento: una cuenta inactiva no aparece', () => {
  it('la única cuenta candidata tiene is_active:false: cuenta = null', async () => {
    estado.lecturas['events'] = { data: { venue_id: null, venue: null }, error: null }
    estado.lecturas['instagram_flyers'] = {
      data: [
        {
          published_at: '2030-01-01T00:00:00Z',
          account: { id: CUENTA_ID, username: 'cuenta_inactiva', is_active: false },
        },
      ],
      error: null,
    }

    const resultado = await obtenerSeguimientoDeEvento(EVENT_ID, null)

    expect(resultado.cuenta).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// obtenerLoQueSeguis: smoke test (mapea las tres listas con su nombre).
// ---------------------------------------------------------------------------
describe('obtenerLoQueSeguis', () => {
  it('mapea lugares, cuentas y categorías a {id, nombre/username}', async () => {
    estado.lecturas['user_followed_venues'] = { data: [{ venue: { id: VENUE_ID, name: 'Lugar X' } }], error: null }
    estado.lecturas['user_followed_instagram_accounts'] = {
      data: [{ account: { id: CUENTA_ID, username: 'cuenta_x' } }],
      error: null,
    }
    estado.lecturas['user_followed_categories'] = {
      data: [{ category: { id: ID_VALIDO, name: 'Categoría X' } }],
      error: null,
    }

    const resultado = await obtenerLoQueSeguis(USER_ID)

    expect(resultado.lugares).toEqual([{ id: VENUE_ID, nombre: 'Lugar X' }])
    expect(resultado.cuentas).toEqual([{ id: CUENTA_ID, username: 'cuenta_x' }])
    expect(resultado.categorias).toEqual([{ id: ID_VALIDO, nombre: 'Categoría X' }])
  })

  it('si falla una lista, esa queda vacía y las otras dos siguen', async () => {
    estado.lecturas['user_followed_venues'] = { data: null, error: { message: 'boom' } }
    estado.lecturas['user_followed_instagram_accounts'] = {
      data: [{ account: { id: CUENTA_ID, username: 'cuenta_x' } }],
      error: null,
    }

    const resultado = await obtenerLoQueSeguis(USER_ID)

    expect(resultado.lugares).toEqual([])
    expect(resultado.cuentas).toEqual([{ id: CUENTA_ID, username: 'cuenta_x' }])
  })
})
