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
//
// R47, tarea 47-e (QPS-197): `obtenerFavoritos` ahora separa `voy` (✓,
// social) de `eventos` (♥ Guardados) — se agrega el doble de la tabla
// `event_attendance` (el `select` de ids con Voy que usa `obtenerFavoritos`,
// y el `delete().select('kind')` que ahora hace `desmarcarFavorito` antes
// de borrar el favorito).
//
// R56, tarea 56-b (QPS-195): `marcarFavorito` ahora consulta
// `estadoPermiteAgregar` (lib/estado-evento.ts, un `maybeSingle()` más sobre
// la misma `builder` de `events` que ya arma `obtenerFavoritos`) antes del
// `insert`; `desmarcarFavorito` NO lo consulta. `estado.eventoFila` queda en
// PUBLISHED por default: ese chequeo en sí tiene su propio archivo
// (tests/estado-evento.test.ts), acá solo hace falta que no estorbe.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID_SESION = 'usuario-de-sesion-1'
const EVENT_ID = 'evento-de-prueba-1'
const OTRO_EVENT_ID = 'evento-de-prueba-2'

const estado = vi.hoisted(() => ({
  favoritosFilas: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  eventosFilas: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  // 29-a (F13, paridad con la web): además de eventos, Favoritos trae flyers
  // de Instagram (ACTIVE) y películas en cartel, más las categorías (para el
  // `categoryName` de los flyers) — las cuatro consultas de `armarFavoritos`.
  flyersFilas: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  moviesFilas: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  categoriasFilas: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  esFavoritoFila: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  // 56-b (QPS-195): `marcarFavorito` ahora consulta `estadoPermiteAgregar`
  // (lib/estado-evento.ts, `select('status').eq('id', ...).maybeSingle()`)
  // antes del `insert`. PUBLISHED por default: ese chequeo tiene su propio
  // archivo (tests/estado-evento.test.ts), acá solo hace falta que no
  // estorbe al resto de los tests de este archivo.
  eventoFila: { data: { status: 'PUBLISHED' } as unknown, error: null as unknown } as { data: unknown; error: unknown },
  insertResultado: { error: null as unknown } as { error: unknown },
  deleteResultado: { error: null as unknown } as { error: unknown },
  // R47: ids con Voy (lectura de event_attendance que hace obtenerFavoritos)
  // y el resultado del delete+select('kind') que hace desmarcarFavorito.
  voyFilas: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  asistenciaDeleteResultado: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown },
  arrojarFavoritos: null as unknown,
  arrojarEventos: null as unknown,
  arrojarEsFavorito: null as unknown,
  arrojarInsert: null as unknown,
  arrojarDelete: null as unknown,
  arrojarVoy: null as unknown,
  arrojarAsistenciaDelete: null as unknown,
  llamadas: {
    favoritosSelect: 0,
    eventosSelect: 0,
    flyersSelect: 0,
    moviesSelect: 0,
    categoriasSelect: 0,
    esFavoritoSelect: 0,
    insert: 0,
    delete: 0,
    voySelect: 0,
    asistenciaDelete: 0,
    eventoSelect: 0,
  },
  ultimoInsert: null as unknown,
  ultimoFavoritosEqs: [] as Array<[string, unknown]>,
  ultimoEsFavoritoEqs: [] as Array<[string, unknown]>,
  ultimoDeleteEqs: [] as Array<[string, unknown]>,
  ultimoAsistenciaDeleteEqs: [] as Array<[string, unknown]>,
  ultimoEventosIn: null as unknown,
  ultimoFlyersIn: null as unknown,
  ultimoMoviesIn: null as unknown,
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
        // `applyVigenciaPrefilter` (@qps/core/events/vigencia) agrega un
        // `.or(...)` a la consulta: el doble solo necesita devolver `builder`
        // para seguir encadenando, el filtro exacto lo hace `isVigente` en
        // código (y eso sí lo prueban las fixtures).
        builder.or = () => builder
        // 56-b (QPS-195): `estadoPermiteAgregar` (lib/estado-evento.ts) hace
        // `select('status').eq('id', ...).maybeSingle()` sobre esta misma
        // tabla — misma `builder`, un método más. `estado.eventoFila` queda
        // en PUBLISHED por default (ver más arriba).
        builder.maybeSingle = async () => {
          estado.llamadas.eventoSelect++
          return estado.eventoFila
        }
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadas.eventosSelect++
          if (estado.arrojarEventos) return Promise.reject(estado.arrojarEventos).catch(reject)
          return Promise.resolve(estado.eventosFilas).then(resolve, reject)
        }
        return builder
      }
      if (tabla === 'instagram_flyers') {
        const builder: Record<string, unknown> = {}
        builder.select = () => builder
        builder.in = (_campo: string, ids: unknown) => {
          estado.ultimoFlyersIn = ids
          return builder
        }
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadas.flyersSelect++
          return Promise.resolve(estado.flyersFilas).then(resolve, reject)
        }
        return builder
      }
      if (tabla === 'cinema_movies') {
        const builder: Record<string, unknown> = {}
        builder.select = () => builder
        builder.in = (_campo: string, ids: unknown) => {
          estado.ultimoMoviesIn = ids
          return builder
        }
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadas.moviesSelect++
          return Promise.resolve(estado.moviesFilas).then(resolve, reject)
        }
        return builder
      }
      if (tabla === 'categories') {
        const builder: Record<string, unknown> = {}
        builder.select = () => builder
        builder.order = () => builder
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          estado.llamadas.categoriasSelect++
          return Promise.resolve(estado.categoriasFilas).then(resolve, reject)
        }
        return builder
      }
      if (tabla === 'event_attendance') {
        // Dos usos distintos de la misma tabla (R47):
        //  - obtenerFavoritos: .select('event_id, kind').eq('kind', 'voy')
        //  - desmarcarFavorito: .delete().eq('event_id', id).select('kind')
        let accion: 'select-voy' | 'delete' | null = null
        const eqs: Array<[string, unknown]> = []
        const builder: Record<string, unknown> = {}
        builder.select = () => {
          if (accion !== 'delete') accion = 'select-voy'
          return builder
        }
        builder.eq = (campo: string, valor: unknown) => {
          eqs.push([campo, valor])
          return builder
        }
        builder.delete = () => {
          accion = 'delete'
          return builder
        }
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (accion === 'delete') {
            estado.llamadas.asistenciaDelete++
            estado.ultimoAsistenciaDeleteEqs = eqs
            if (estado.arrojarAsistenciaDelete) return Promise.reject(estado.arrojarAsistenciaDelete).catch(reject)
            return Promise.resolve(estado.asistenciaDeleteResultado).then(resolve, reject)
          }
          estado.llamadas.voySelect++
          if (estado.arrojarVoy) return Promise.reject(estado.arrojarVoy).catch(reject)
          return Promise.resolve(estado.voyFilas).then(resolve, reject)
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
import { rutaDeEvento } from '../lib/rutas'

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
    // `armarFavoritos` (29-a) filtra `status === 'PUBLISHED'` él mismo (antes
    // la app confiaba en el filtro de la consulta): la fixture lo necesita.
    status: 'PUBLISHED',
    category: { slug: 'teatro', name: 'Teatro' },
    venue: { name: 'Teatro de Prueba', address: 'Calle de Prueba 123' },
  }
}

beforeEach(() => {
  estado.favoritosFilas = { data: [], error: null }
  estado.eventosFilas = { data: [], error: null }
  estado.flyersFilas = { data: [], error: null }
  estado.moviesFilas = { data: [], error: null }
  estado.categoriasFilas = { data: [], error: null }
  estado.esFavoritoFila = { data: null, error: null }
  estado.eventoFila = { data: { status: 'PUBLISHED' }, error: null }
  estado.insertResultado = { error: null }
  estado.deleteResultado = { error: null }
  estado.voyFilas = { data: [], error: null }
  estado.asistenciaDeleteResultado = { data: [], error: null }
  estado.arrojarFavoritos = null
  estado.arrojarEventos = null
  estado.arrojarEsFavorito = null
  estado.arrojarInsert = null
  estado.arrojarDelete = null
  estado.arrojarVoy = null
  estado.arrojarAsistenciaDelete = null
  estado.llamadas = {
    favoritosSelect: 0,
    eventosSelect: 0,
    flyersSelect: 0,
    moviesSelect: 0,
    categoriasSelect: 0,
    esFavoritoSelect: 0,
    insert: 0,
    delete: 0,
    voySelect: 0,
    asistenciaDelete: 0,
    eventoSelect: 0,
  }
  estado.ultimoInsert = null
  estado.ultimoFavoritosEqs = []
  estado.ultimoEsFavoritoEqs = []
  estado.ultimoDeleteEqs = []
  estado.ultimoAsistenciaDeleteEqs = []
  estado.ultimoEventosIn = null
  estado.ultimoFlyersIn = null
  estado.ultimoMoviesIn = null
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
    await obtenerEsFavorito(EVENT_ID, USER_ID_SESION, 'event')
    expect(estado.ultimoEsFavoritoEqs).toEqual([
      ['user_id', USER_ID_SESION],
      ['event_id', EVENT_ID],
    ])
  })

  it('marcarFavorito: el insert lleva exactamente user_id de la sesión y event_id del evento, nada más', async () => {
    await marcarFavorito(EVENT_ID, USER_ID_SESION, 'event')
    expect(estado.ultimoInsert).toEqual({ user_id: USER_ID_SESION, event_id: EVENT_ID })
  })

  it('marcarFavorito: con otro eventId, el user_id del insert sigue siendo el de la sesión', async () => {
    await marcarFavorito(OTRO_EVENT_ID, USER_ID_SESION, 'event')
    expect(estado.ultimoInsert).toEqual({ user_id: USER_ID_SESION, event_id: OTRO_EVENT_ID })
  })

  it('desmarcarFavorito: el delete filtra por user_id de la sesión y por event_id, en ese orden', async () => {
    await desmarcarFavorito(EVENT_ID, USER_ID_SESION, 'event')
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

    expect(resultado).toEqual({ ok: true, voy: [], eventos: [] })
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

    expect(resultado).toEqual({ ok: true, voy: [], eventos: [] })
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
    const resultado = await obtenerEsFavorito(EVENT_ID, USER_ID_SESION, 'event')
    expect(resultado).toEqual({ ok: true, marcado: true })
  })

  it('no hay fila: marcado = false', async () => {
    estado.esFavoritoFila = { data: null, error: null }
    const resultado = await obtenerEsFavorito(EVENT_ID, USER_ID_SESION, 'event')
    expect(resultado).toEqual({ ok: true, marcado: false })
  })

  it('error en la consulta: MENSAJE_ERROR_RED', async () => {
    estado.esFavoritoFila = { data: null, error: { message: 'boom' } }
    const resultado = await obtenerEsFavorito(EVENT_ID, USER_ID_SESION, 'event')
    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
  })
})

// ---------------------------------------------------------------------------
// Punto 4: 23505 cuenta como éxito.
// ---------------------------------------------------------------------------
describe('marcarFavorito: 23505 (unique violation) cuenta como éxito', () => {
  it('insert con error 23505: ok = true de todos modos', async () => {
    estado.insertResultado = { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }

    const resultado = await marcarFavorito(EVENT_ID, USER_ID_SESION, 'event')

    expect(resultado).toEqual({ ok: true })
  })

  it('insert con cualquier otro código de error: MENSAJE_ERROR_GUARDAR', async () => {
    estado.insertResultado = { error: { code: '42501', message: 'permission denied' } }

    const resultado = await marcarFavorito(EVENT_ID, USER_ID_SESION, 'event')

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })

  it('el insert tira una excepción: MENSAJE_ERROR_GUARDAR, no explota', async () => {
    estado.arrojarInsert = new Error('network request failed')

    const resultado = await marcarFavorito(EVENT_ID, USER_ID_SESION, 'event')

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })
})

describe('desmarcarFavorito: errores', () => {
  it('delete con error: MENSAJE_ERROR_GUARDAR', async () => {
    estado.deleteResultado = { error: { message: 'boom' } }
    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID_SESION, 'event')
    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })

  it('el delete tira una excepción: MENSAJE_ERROR_GUARDAR, no explota', async () => {
    estado.arrojarDelete = new Error('network request failed')
    const resultado = await desmarcarFavorito(EVENT_ID, USER_ID_SESION, 'event')
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

    const resultado = await marcarSinConfig(EVENT_ID, USER_ID_SESION, 'event')

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.insert).toBe(0)
  })

  it('desmarcarFavorito no hace ningún delete', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { desmarcarFavorito: desmarcarSinConfig } = await import('../lib/favoritos')

    const resultado = await desmarcarSinConfig(EVENT_ID, USER_ID_SESION, 'event')

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.delete).toBe(0)
  })

  it('obtenerEsFavorito no hace ningún select', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerEsFavorito: obtenerSinConfig } = await import('../lib/favoritos')

    const resultado = await obtenerSinConfig(EVENT_ID, USER_ID_SESION, 'event')

    expect(resultado).toEqual({ ok: false, error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.esFavoritoSelect).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 29-a (F13, paridad con la web): Favoritos también trae flyers de Instagram
// y películas, pasados por `armarFavoritos` (@qps/core/favoritos/armar).
// ---------------------------------------------------------------------------
function filaDeFlyerActivo(id: string) {
  return {
    id,
    account_id: `cuenta-de-${id}`,
    ig_post_url: `https://instagram.com/p/${id}`,
    ig_post_type: 'IMAGE',
    caption: 'Caption de prueba',
    published_at: '2030-10-01T21:00:00-03:00',
    original_image_url: null,
    storage_image_path: null,
    storage_image_url: null,
    status: 'ACTIVE',
    fetched_at: '2030-10-01T21:05:00Z',
    archived_at: null,
    created_at: '2030-10-01T21:05:00Z',
    venue_name: null,
    maps_url: null,
    category: 'boliches',
    price_min: 0,
    is_free: false,
    account: {
      id: `cuenta-de-${id}`,
      username: `cuenta_${id}`,
      display_name: `Cuenta de ${id}`,
      profile_pic_url: null,
      instagram_url: `https://instagram.com/cuenta_${id}`,
      is_active: true,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      default_venue_name: null,
      default_maps_url: null,
      default_category: 'boliches',
    },
  }
}

function filaDePeliculaEnCartel(id: string) {
  return {
    id,
    slug: `pelicula-${id}`,
    title: `Película ${id}`,
    poster_url: null,
    is_currently_showing: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    showings: { 'cine-de-prueba': { name: 'Cine de Prueba', booking_url: 'https://cine-de-prueba.test', formats: [] } },
  }
}

describe('obtenerFavoritos: flyers de Instagram y películas (F13)', () => {
  const FLYER_ID = 'flyer-de-prueba-1'
  const MOVIE_ID = 'pelicula-de-prueba-1'

  it('un flyer ACTIVE entra a "flexibles" (ids_de_favoritos pide instagram_flyers)', async () => {
    estado.favoritosFilas = { data: [{ instagram_flyer_id: FLYER_ID }], error: null }
    estado.flyersFilas = { data: [filaDeFlyerActivo(FLYER_ID)], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos.map((e) => e.id)).toEqual([`ig-${FLYER_ID}`])
    expect(estado.ultimoFlyersIn).toEqual([FLYER_ID])
    expect(estado.llamadas.eventosSelect).toBe(0)
  })

  it('una película en cartel entra a "flexibles" (pide cinema_movies)', async () => {
    estado.favoritosFilas = { data: [{ cinema_movie_id: MOVIE_ID }], error: null }
    estado.moviesFilas = { data: [filaDePeliculaEnCartel(MOVIE_ID)], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos.map((e) => e.id)).toEqual([`movie-${MOVIE_ID}`])
    expect(estado.ultimoMoviesIn).toEqual([MOVIE_ID])
  })

  it('evento, flyer y película juntos: los tres aparecen (nada se descarta por no tener categoría)', async () => {
    estado.favoritosFilas = {
      data: [{ event_id: EVENT_ID }, { instagram_flyer_id: FLYER_ID }, { cinema_movie_id: MOVIE_ID }],
      error: null,
    }
    estado.eventosFilas = { data: [filaDeEventoVigente(EVENT_ID)], error: null }
    estado.flyersFilas = { data: [filaDeFlyerActivo(FLYER_ID)], error: null }
    estado.moviesFilas = { data: [filaDePeliculaEnCartel(MOVIE_ID)], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(new Set(resultado.eventos.map((e) => e.id))).toEqual(new Set([EVENT_ID, `ig-${FLYER_ID}`, `movie-${MOVIE_ID}`]))
  })

  it('un evento sin categoría no se descarta: aparece como "Sin categorizar" (antes la app lo tiraba — causa de F13)', async () => {
    const sinCategoria = { ...filaDeEventoVigente(EVENT_ID), category: null }
    estado.favoritosFilas = { data: [{ event_id: EVENT_ID }], error: null }
    estado.eventosFilas = { data: [sinCategoria], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos).toHaveLength(1)
    expect(resultado.eventos[0].categoryName).toBe('Sin categorizar')
  })

  it('un flyer ARCHIVED (no ACTIVE) no aparece', async () => {
    estado.favoritosFilas = { data: [{ instagram_flyer_id: FLYER_ID }], error: null }
    estado.flyersFilas = { data: [{ ...filaDeFlyerActivo(FLYER_ID), status: 'ARCHIVED' }], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado).toEqual({ ok: true, voy: [], eventos: [] })
  })
})

// ---------------------------------------------------------------------------
// R47, tarea 47-e (QPS-197): Voy (✓, social) separado de Guardados (♥),
// contenido en Guardados (un evento con Voy también está entre los
// favoritos "de verdad"), y un Voy sin favorito (un Voy viejo, de antes del
// backfill) tiene que aparecer igual.
// ---------------------------------------------------------------------------
describe('obtenerFavoritos: Voy (R47)', () => {
  it('un evento con Voy Y favorito aparece primero en "voy", y no se duplica en "eventos" (Guardados)', async () => {
    estado.favoritosFilas = { data: [{ event_id: EVENT_ID }, { event_id: OTRO_EVENT_ID }], error: null }
    estado.eventosFilas = { data: [filaDeEventoVigente(EVENT_ID), filaDeEventoVigente(OTRO_EVENT_ID)], error: null }
    estado.voyFilas = { data: [{ event_id: EVENT_ID, kind: 'voy' }], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.voy.map((e) => e.id)).toEqual([EVENT_ID])
    // EVENT_ID tiene Voy: está en "voy", y NO se repite en "eventos" (Guardados).
    expect(resultado.eventos.map((e) => e.id)).toEqual([OTRO_EVENT_ID])
  })

  it('un Voy sin favorito (Voy viejo, de antes del backfill) aparece en "voy" igual', async () => {
    estado.favoritosFilas = { data: [], error: null }
    estado.eventosFilas = { data: [filaDeEventoVigente(EVENT_ID)], error: null }
    estado.voyFilas = { data: [{ event_id: EVENT_ID, kind: 'voy' }], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.voy.map((e) => e.id)).toEqual([EVENT_ID])
    expect(resultado.eventos).toEqual([])
    // El id con Voy se unió a eventIds, aunque no hubiera fila de favoritos.
    expect(estado.ultimoEventosIn).toEqual([EVENT_ID])
  })

  it('si falla la lectura de event_attendance (Voy), Guardados sigue andando: ok:true, voy:[], eventos con lo que sí hay', async () => {
    estado.favoritosFilas = { data: [{ event_id: EVENT_ID }], error: null }
    estado.eventosFilas = { data: [filaDeEventoVigente(EVENT_ID)], error: null }
    estado.arrojarVoy = { message: 'boom' }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado).toEqual({ ok: true, voy: [], eventos: expect.any(Array) })
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.eventos.map((e) => e.id)).toEqual([EVENT_ID])
  })

  it('"eventos" sigue siendo un arreglo plano (no un objeto con flexibles/porDia)', async () => {
    estado.favoritosFilas = { data: [{ event_id: EVENT_ID }], error: null }
    estado.eventosFilas = { data: [filaDeEventoVigente(EVENT_ID)], error: null }

    const resultado = await obtenerFavoritos(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(Array.isArray(resultado.eventos)).toBe(true)
    expect(Array.isArray(resultado.voy)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// rutaDeEvento (antes rutaDeFavorito, R67 67-a): a dónde navega cada item (F13).
// ---------------------------------------------------------------------------
type ItemFavorito = Parameters<typeof rutaDeEvento>[0]

describe('rutaDeEvento', () => {
  it('un evento abre /evento/<id>', () => {
    const evento = { id: 'evento-1', isCinemaMovie: false, isInstagramFlyer: false } as unknown as ItemFavorito
    expect(rutaDeEvento(evento)).toBe('/evento/evento-1')
  })

  it('una película abre /pelicula/<id-sin-el-prefijo-"movie-">', () => {
    const pelicula = { id: 'movie-pelicula-1', isCinemaMovie: true } as unknown as ItemFavorito
    expect(rutaDeEvento(pelicula)).toBe('/pelicula/pelicula-1')
  })

  it('un flyer abre /flyer/<flyerId> (no el id con el prefijo "ig-")', () => {
    const flyer = { id: 'ig-flyer-1', isInstagramFlyer: true, flyerId: 'flyer-1' } as unknown as ItemFavorito
    expect(rutaDeEvento(flyer)).toBe('/flyer/flyer-1')
  })
})

// ---------------------------------------------------------------------------
// El ciclo guardar → listar, con un doble en memoria propio (no el de arriba,
// que es sin estado): marcar un evento como favorito y después listarlo
// tiene que traerlo, sin pasar por ninguna base real.
// ---------------------------------------------------------------------------
describe('ciclo guardar → listar (doble en memoria)', () => {
  it('marcarFavorito y después obtenerFavoritos: el evento recién marcado aparece', async () => {
    const EVENTO_CICLO = 'evento-de-ciclo-1'
    const USUARIO_CICLO = 'usuario-de-ciclo-1'
    const filasFavoritos: { user_id: string; event_id: string }[] = []
    const eventoFila = filaDeEventoVigente(EVENTO_CICLO)

    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({
      supabase: {
        from: (tabla: string) => {
          if (tabla === 'user_favorites') {
            const eqs: Array<[string, unknown]> = []
            const builder: Record<string, unknown> = {}
            builder.select = () => builder
            builder.eq = (campo: string, valor: unknown) => {
              eqs.push([campo, valor])
              return builder
            }
            builder.insert = async (valores: { user_id: string; event_id: string }) => {
              filasFavoritos.push(valores)
              return { error: null }
            }
            builder.then = (resolve: (v: unknown) => unknown) => {
              const userId = eqs.find(([campo]) => campo === 'user_id')?.[1]
              const filas = filasFavoritos
                .filter((f) => f.user_id === userId)
                .map((f) => ({ event_id: f.event_id, instagram_flyer_id: null, cinema_movie_id: null }))
              return Promise.resolve({ data: filas, error: null }).then(resolve)
            }
            return builder
          }
          if (tabla === 'events') {
            const builder: Record<string, unknown> = {}
            builder.select = () => builder
            builder.in = () => builder
            builder.eq = () => builder
            builder.or = () => builder
            // 56-b (QPS-195): `estadoPermiteAgregar` hace su propio
            // `select('status').eq('id', ...).maybeSingle()` antes del
            // `insert` de `marcarFavorito` — PUBLISHED, para que este ciclo
            // completo siga marcando el favorito como antes.
            builder.maybeSingle = async () => ({ data: { status: 'PUBLISHED' }, error: null })
            builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [eventoFila], error: null }).then(resolve)
            return builder
          }
          if (tabla === 'categories') {
            const builder: Record<string, unknown> = {}
            builder.select = () => builder
            builder.order = () => builder
            builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
            return builder
          }
          if (tabla === 'event_attendance') {
            // Ningún Voy en este doble: solo se ejercita el ciclo de Guardados.
            const builder: Record<string, unknown> = {}
            builder.select = () => builder
            builder.eq = () => builder
            builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
            return builder
          }
          throw new Error(`tabla inesperada en el doble del ciclo guardar → listar: ${tabla}`)
        },
      },
    }))

    const { marcarFavorito: marcarCiclo, obtenerFavoritos: obtenerCiclo } = await import('../lib/favoritos')

    expect(await marcarCiclo(EVENTO_CICLO, USUARIO_CICLO, 'event')).toEqual({ ok: true })

    const listado = await obtenerCiclo(USUARIO_CICLO)
    expect(listado.ok).toBe(true)
    if (!listado.ok) throw new Error('no debería fallar')
    expect(listado.eventos.map((e) => e.id)).toEqual([EVENTO_CICLO])

    // Otro usuario no ve el favorito recién guardado (el doble también
    // respeta el filtro por user_id, no solo la función).
    const listadoOtro = await obtenerCiclo('otro-usuario-de-ciclo')
    expect(listadoOtro).toEqual({ ok: true, voy: [], eventos: [] })
  })
})
