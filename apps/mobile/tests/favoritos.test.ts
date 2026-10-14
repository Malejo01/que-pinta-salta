// Ronda 27, tarea 27-c: `lib/favoritos.ts`.
//
// Punto 1: el `user_id` que llega a cada `insert`/`delete`/`select.eq` es
// siempre el de la sesión de prueba (`USER_ID_SESION`), nunca `EVENT_ID` ni
// ningún otro id de la pantalla — por eso todos los ids de este archivo son
// distintos entre sí, para que un swap de parámetros se note.
//
// Punto 4: un `23505` (unique violation: ya estaba marcado) en el insert de
// `marcarFavorito` cuenta como éxito; y sin configuración de Supabase
// ("sin sesión" en el sentido de que no hay cliente con el que escribir) no
// se llama a ningún insert/delete.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID_SESION = 'usuario-de-sesion-1'
const EVENT_ID = 'evento-de-prueba-1'
const OTRO_EVENT_ID = 'evento-de-prueba-2'

const estado = vi.hoisted(() => ({
  favoritosFilas: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  eventosFilas: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  esFavoritoFila: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  insertResultado: { error: null as unknown } as { error: unknown },
  deleteResultado: { error: null as unknown } as { error: unknown },
  arrojarFavoritos: null as unknown,
  arrojarEventos: null as unknown,
  arrojarEsFavorito: null as unknown,
  arrojarInsert: null as unknown,
  arrojarDelete: null as unknown,
  llamadas: { favoritosSelect: 0, eventosSelect: 0, esFavoritoSelect: 0, insert: 0, delete: 0 },
  ultimoInsert: null as unknown,
  ultimoFavoritosEqs: [] as Array<[string, unknown]>,
  ultimoEsFavoritoEqs: [] as Array<[string, unknown]>,
  ultimoDeleteEqs: [] as Array<[string, unknown]>,
  ultimoEventosIn: null as unknown,
}))

// `vi.mock` se eleva por encima de los imports estáticos: `lib/favoritos` ya
// ve este doble al importar `@/lib/supabase`. Nunca el cliente real (ni red,
// ni .env, ni base).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'user_favorites') {
        let accion: 'select-not' | 'select-maybe' | 'delete' | null = null
        const eqs: Array<[string, unknown]> = []
        const builder: Record<string, unknown> = {}
        builder.select = () => {
          accion = accion ?? 'select-not'
          return builder
        }
        builder.eq = (campo: string, valor: unknown) => {
          eqs.push([campo, valor])
          return builder
        }
        builder.not = () => {
          accion = 'select-not'
          return builder
        }
        builder.maybeSingle = async () => {
          accion = 'select-maybe'
          estado.llamadas.esFavoritoSelect++
          estado.ultimoEsFavoritoEqs = eqs
          if (estado.arrojarEsFavorito) throw estado.arrojarEsFavorito
          return estado.esFavoritoFila
        }
        builder.insert = async (valores: unknown) => {
          estado.llamadas.insert++
          estado.ultimoInsert = valores
          if (estado.arrojarInsert) throw estado.arrojarInsert
          return estado.insertResultado
        }
        builder.delete = () => {
          accion = 'delete'
          return builder
        }
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (accion === 'delete') {
            estado.llamadas.delete++
            estado.ultimoDeleteEqs = eqs
            if (estado.arrojarDelete) return Promise.reject(estado.arrojarDelete).catch(reject)
            return Promise.resolve(estado.deleteResultado).then(resolve, reject)
          }
          // select(...).eq(...).not(...) de obtenerFavoritos
          estado.llamadas.favoritosSelect++
          estado.ultimoFavoritosEqs = eqs
          if (estado.arrojarFavoritos) return Promise.reject(estado.arrojarFavoritos).catch(reject)
          return Promise.resolve(estado.favoritosFilas).then(resolve, reject)
        }
        return builder
      }
      if (tabla === 'events') {
        const builder: Record<string, unknown> = {}
        builder.select = () => builder
        builder.in = (_campo: string, ids: unknown) => {
          estado.ultimoEventosIn = ids
          return builder
        }
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadas.eventosSelect++
          if (estado.arrojarEventos) return Promise.reject(estado.arrojarEventos).catch(reject)
          return Promise.resolve(estado.eventosFilas).then(resolve, reject)
        }
        return builder
      }
      throw new Error(`tabla inesperada en el doble de favoritos: ${tabla}`)
    },
  },
}))

import {
  MENSAJE_ERROR_GUARDAR,
  MENSAJE_ERROR_RED,
  MENSAJE_SIN_CONFIGURACION,
  desmarcarFavorito,
  marcarFavorito,
  obtenerEsFavorito,
  obtenerFavoritos,
} from '../lib/favoritos'

function filaDeEventoVigente(id: string) {
  return {
    id,
    slug: `evento-${id}`,
    title: `Evento ${id}`,
    description: null,
    short_description: null,
    // Muy en el futuro: `obtenerFavoritos` llama a `isVigente` con la fecha
    // real del reloj (no es inyectable), así que la fixture tiene que seguir
    // vigente sin importar cuándo corra este test.
    start_date: '2099-01-01T18:00:00-03:00',
    end_date: null,
    price_min: 0,
    is_free: true,
    image_url: null,
    ticket_url: null,
    age_restriction: 0,
    is_featured: false,
    category: { slug: 'teatro', name: 'Teatro' },
    venue: { name: 'Teatro de Prueba', address: 'Calle de Prueba 123' },
  }
}

beforeEach(() => {
  estado.favoritosFilas = { data: [], error: null }
  estado.eventosFilas = { data: [], error: null }
  estado.esFavoritoFila = { data: null, error: null }
  estado.insertResultado = { error: null }
  estado.deleteResultado = { error: null }
  estado.arrojarFavoritos = null
  estado.arrojarEventos = null
  estado.arrojarEsFavorito = null
  estado.arrojarInsert = null
  estado.arrojarDelete = null
  estado.llamadas = { favoritosSelect: 0, eventosSelect: 0, esFavoritoSelect: 0, insert: 0, delete: 0 }
  estado.ultimoInsert = null
  estado.ultimoFavoritosEqs = []
  estado.ultimoEsFavoritoEqs = []
  estado.ultimoDeleteEqs = []
  estado.ultimoEventosIn = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Punto 1: el user_id de cada operación es siempre el de la sesión.
// ---------------------------------------------------------------------------
describe('user_id: siempre el de la sesión, aunque la función reciba otros ids', () => {
  it('obtenerFavoritos: filtra user_favorites por el user_id de la sesión', async () => {
    await obtenerFavoritos(USER_ID_SESION)
    expect(estado.ultimoFavoritosEqs).toEqual([['user_id', USER_ID_SESION]])
  })

  it('obtenerEsFavorito: filtra por user_id de la sesión y por el event_id recibido, en ese orden', async () => {
    await obtenerEsFavorito(EVENT_ID, USER_ID_SESION)
    expect(estado.ultimoEsFavoritoEqs).toEqual([
      ['user_id', USER_ID_SESION],
      ['event_id', EVENT_ID],
    ])
  })

  it('marcarFavorito: el insert lleva exactamente user_id de la sesión y event_id del evento, nada más', async () => {
    await marcarFavorito(EVENT_ID, USER_ID_SESION)
    expect(estado.ultimoInsert).toEqual({ user_id: USER_ID_SESION, event_id: EVENT_ID })
  })

  it('marcarFavorito: con otro eventId, el user_id del insert sigue siendo el de la sesión', async () => {
    await marcarFavorito(OTRO_EVENT_ID, USER_ID_SESION)
    expect(estado.ultimoInsert).toEqual({ user_id: USER_ID_SESION, event_id: OTRO_EVENT_ID })
  })

  it('desmarcarFavorito: el delete filtra por user_id de la sesión y por event_id, en ese orden', async () => {
    await desmarcarFavorito(EVENT_ID, USER_ID_SESION)
    expect(estado.ultimoDeleteEqs).toEqual([
      ['user_id', USER_ID_SESION],
      ['event_id', EVENT_ID],
    ])
  })
})

// ---------------------------------------------------------------------------
// obtenerFavoritos: camino feliz
// ---------------------------------------------------------------------------
describe('obtenerFavoritos: camino feliz', () => {
  it('sin favoritos: eventos [] sin consultar events', async () => {
    estado.favoritosFilas = { data: [], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado).toEqual({ ok: true, eventos: [] })
    expect(estado.llamadas.eventosSelect).toBe(0)
  })

  it('con favoritos: pide a events solo esos ids, acotado a PUBLISHED y vigente', async () => {
    estado.favoritosFilas = { data: [{ event_id: EVENT_ID }, { event_id: OTRO_EVENT_ID }], error: null }
    estado.eventosFilas = { data: [filaDeEventoVigente(EVENT_ID)], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos.map((e) => e.id)).toEqual([EVENT_ID])
    expect(estado.ultimoEventosIn).toEqual([EVENT_ID, OTRO_EVENT_ID])
  })

  it('descarta filas de favoritos con event_id no-string (dato corrupto, no explota)', async () => {
    estado.favoritosFilas = { data: [{ event_id: null }, { event_id: 123 }], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado).toEqual({ ok: true, eventos: [] })
    expect(estado.llamadas.eventosSelect).toBe(0)
  })
})

describe('obtenerFavoritos: errores (nunca el mensaje crudo)', () => {
  const SECRETO = 'detalle interno de postgres, nunca debería salir a pantalla'

  it('error en la consulta de user_favorites: MENSAJE_ERROR_RED', async () => {
    estado.favoritosFilas = { data: null, error: { message: SECRETO } }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })

  it('error en la consulta de events: MENSAJE_ERROR_RED', async () => {
    estado.favoritosFilas = { data: [{ event_id: EVENT_ID }], error: null }
    estado.eventosFilas = { data: null, error: { message: SECRETO } }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })

  it('excepción de red: MENSAJE_ERROR_RED, no explota', async () => {
    estado.arrojarFavoritos = new Error(SECRETO)

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })
})

// ---------------------------------------------------------------------------
// obtenerEsFavorito
// ---------------------------------------------------------------------------
describe('obtenerEsFavorito', () => {
  it('hay fila: marcado = true', async () => {
    estado.esFavoritoFila = { data: { event_id: EVENT_ID }, error: null }
    const resultado = await obtenerEsFavorito(EVENT_ID, USER_ID_SESION)
    expect(resultado).toEqual({ ok: true, marcado: true })
  })

  it('no hay fila: marcado = false', async () => {
    estado.esFavoritoFila = { data: null, error: null }
    const resultado = await obtenerEsFavorito(EVENT_ID, USER_ID_SESION)
    expect(resultado).toEqual({ ok: true, marcado: false })
  })

  it('error en la consulta: MENSAJE_ERROR_RED', async () => {
    estado.esFavoritoFila = { data: null, error: { message: 'boom' } }
    const resultado = await obtenerEsFavorito(EVENT_ID, USER_ID_SESION)
    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })
})

// ---------------------------------------------------------------------------
// Punto 4: 23505 cuenta como éxito.
// ---------------------------------------------------------------------------
describe('marcarFavorito: 23505 (unique violation) cuenta como éxito', () => {
  it('insert con error 23505: ok = true de todos modos', async () => {
    estado.insertResultado = { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }

    const resultado = await marcarFavorito(EVENT_ID, USER_ID_SESION)

    expect(resultado).toEqual({ ok: true })
  })

  it('insert con cualquier otro código de error: MENSAJE_ERROR_GUARDAR', async () => {
    estado.insertResultado = { error: { code: '42501', message: 'permission denied' } }

    const resultado = await marcarFavorito(EVENT_ID, USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })

  it('el insert tira una excepción: MENSAJE_ERROR_GUARDAR, no explota', async () => {
    estado.arrojarInsert = new Error('network request failed')

    const resultado = await marcarFavorito(EVENT_ID, USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })
})

describe('desmarcarFavorito: errores', () => {
  it('delete con error: MENSAJE_ERROR_GUARDAR', async () => {
    estado.deleteResultado = { error: { message: 'boom' } }
    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID_SESION)
    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })

  it('el delete tira una excepción: MENSAJE_ERROR_GUARDAR, no explota', async () => {
    estado.arrojarDelete = new Error('network request failed')
    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID_SESION)
    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })
})

// ---------------------------------------------------------------------------
// Sin configuración de Supabase ("sin sesión" en el sentido de que no hay
// cliente con el que escribir): no se llama a ningún insert/delete/select.
// ---------------------------------------------------------------------------
describe('sin configuración de Supabase: no se escribe nada', () => {
  it('obtenerFavoritos no llega ni a construir la consulta', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerFavoritos: obtenerSinConfig } = await import('../lib/favoritos')

    const resultado = await obtenerSinConfig(USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.favoritosSelect).toBe(0)
  })

  it('marcarFavorito no hace ningún insert', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { marcarFavorito: marcarSinConfig } = await import('../lib/favoritos')

    const resultado = await marcarSinConfig(EVENT_ID, USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.insert).toBe(0)
  })

  it('desmarcarFavorito no hace ningún delete', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { desmarcarFavorito: desmarcarSinConfig } = await import('../lib/favoritos')

    const resultado = await desmarcarSinConfig(EVENT_ID, USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.delete).toBe(0)
  })

  it('obtenerEsFavorito no hace ningún select', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerEsFavorito: obtenerSinConfig } = await import('../lib/favoritos')

    const resultado = await obtenerSinConfig(EVENT_ID, USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.esFavoritoSelect).toBe(0)
  })
})
