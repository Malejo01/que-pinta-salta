// R69, 69-q (QPS-353): favoritos por tipo. Cubre `marcarFavorito`,
// `desmarcarFavorito` y `obtenerEsFavorito` de `lib/favoritos.ts` con los tres
// tipos (event / cinema / flyer) y `objetivoDeFavorito` de `lib/rutas.ts`.
// Sin red ni base: `@/lib/supabase` y `@/lib/estado-evento` van con `vi.mock`,
// y el doble registra TODAS las operaciones (tabla, acción, filtros, valores)
// en un solo arreglo ordenado, para poder afirmar también lo que NO se toca y
// el orden entre escrituras.
//
// Cómo se pone en rojo cada grupo (la rotura en producción -> qué test cae):
//   - COLUMNA_POR_TIPO con cinema/flyer cruzados        -> "usa la columna X" (insert, delete, select)
//   - sacar el `if (tipo === 'event')` de marcarFavorito -> "no consulta estadoPermiteAgregar"
//   - sacar el `if (tipo !== 'event')` de desmarcar      -> "no toca event_attendance"
//   - voyQuitado: true en película/flyer                 -> "voyQuitado es false"
//   - quitar el `!== '23505'`                            -> "23505 cuenta como éxito"
//   - invertir el orden de los deletes de un evento      -> "evento: event_attendance antes que user_favorites"
//   - quitar el chequeo de estado de un evento           -> "evento: el estado se consulta antes del insert"
//   - objetivoDeFavorito sin sacar el prefijo            -> los `toEqual` del uuid pelado y "nunca un id con prefijo"
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '99999999-9999-4999-8999-999999999999'
const UUID_PELICULA = '11111111-1111-4111-8111-111111111111'
const UUID_FLYER = '22222222-2222-4222-8222-222222222222'
const UUID_EVENTO = '33333333-3333-4333-8333-333333333333'

interface Operacion {
  tabla: string
  accion: string
  eqs: Array<[string, unknown]>
  valores?: unknown
  columnas?: string
}

const estado = vi.hoisted(() => ({
  log: [] as Operacion[],
  insertError: null as unknown,
  deleteError: null as unknown,
  asistenciaError: null as unknown,
  asistenciaFilas: [] as unknown[],
  maybeSingleData: null as unknown,
  estadoEvento: 'ok' as 'ok' | 'no' | 'error',
}))

vi.mock('@/lib/estado-evento', () => ({
  estadoPermiteAgregar: async (id: string) => {
    estado.log.push({ tabla: '(estado-evento)', accion: 'estadoPermiteAgregar', eqs: [['id', id]] })
    return estado.estadoEvento
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      const op: Operacion = { tabla, accion: 'select', eqs: [] }
      const builder: Record<string, unknown> = {}
      const registrar = () => {
        if (!estado.log.includes(op)) estado.log.push(op)
      }
      builder.select = (columnas?: string) => {
        // `delete().select('kind')` conserva la acción 'delete'.
        if (op.accion !== 'delete') op.accion = 'select'
        op.columnas = columnas
        return builder
      }
      builder.eq = (campo: string, valor: unknown) => {
        op.eqs.push([campo, valor])
        return builder
      }
      builder.delete = () => {
        op.accion = 'delete'
        return builder
      }
      builder.insert = async (valores: unknown) => {
        op.accion = 'insert'
        op.valores = valores
        registrar()
        return { error: estado.insertError }
      }
      builder.maybeSingle = async () => {
        op.accion = 'select'
        registrar()
        return { data: estado.maybeSingleData, error: null }
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        registrar()
        if (tabla === 'event_attendance') {
          return Promise.resolve({ data: estado.asistenciaFilas, error: estado.asistenciaError }).then(resolve, reject)
        }
        return Promise.resolve({ error: estado.deleteError }).then(resolve, reject)
      }
      return builder
    },
  },
}))

import { desmarcarFavorito, MENSAJE_ERROR_GUARDAR, marcarFavorito, obtenerEsFavorito } from '../lib/favoritos'
import { objetivoDeFavorito, rutaDeEvento, type TipoFavorito } from '../lib/rutas'

beforeEach(() => {
  estado.log = []
  estado.insertError = null
  estado.deleteError = null
  estado.asistenciaError = null
  estado.asistenciaFilas = []
  estado.maybeSingleData = null
  estado.estadoEvento = 'ok'
})

const COLUMNA: Record<TipoFavorito, string> = { event: 'event_id', cinema: 'cinema_movie_id', flyer: 'instagram_flyer_id' }
const OTRAS_COLUMNAS = (tipo: TipoFavorito) => Object.values(COLUMNA).filter((c) => c !== COLUMNA[tipo])
const UUID_DE: Record<TipoFavorito, string> = { event: UUID_EVENTO, cinema: UUID_PELICULA, flyer: UUID_FLYER }

/** Todos los strings que viajaron a la base (filtros y valores de insert). */
function valoresEnviados(): string[] {
  const salida: string[] = []
  for (const op of estado.log) {
    for (const [, v] of op.eqs) if (typeof v === 'string') salida.push(v)
    if (op.valores && typeof op.valores === 'object') {
      for (const v of Object.values(op.valores as Record<string, unknown>)) if (typeof v === 'string') salida.push(v)
    }
  }
  return salida
}

describe.each<TipoFavorito>(['cinema', 'flyer'])('%s: película y flyer', (tipo) => {
  const id = UUID_DE[tipo]
  const columna = COLUMNA[tipo]

  it(`marcarFavorito: insert en user_favorites con user_id y ${columna}, nada más`, async () => {
    const r = await marcarFavorito(id, USER_ID, tipo)
    expect(r).toEqual({ ok: true })
    expect(estado.log).toHaveLength(1)
    expect(estado.log[0]).toMatchObject({ tabla: 'user_favorites', accion: 'insert', valores: { user_id: USER_ID, [columna]: id } })
    expect(Object.keys(estado.log[0].valores as object).sort()).toEqual(['user_id', columna].sort())
  })

  it('marcarFavorito: no consulta estadoPermiteAgregar ni toca events', async () => {
    estado.estadoEvento = 'no' // si se consultara, devolvería error
    const r = await marcarFavorito(id, USER_ID, tipo)
    expect(r).toEqual({ ok: true })
    expect(estado.log.some((op) => op.tabla === '(estado-evento)' || op.tabla === 'events')).toBe(false)
  })

  it('marcarFavorito: 23505 (ya estaba) cuenta como éxito', async () => {
    estado.insertError = { code: '23505', message: 'duplicate key' }
    expect(await marcarFavorito(id, USER_ID, tipo)).toEqual({ ok: true })
  })

  it('marcarFavorito: otro error -> MENSAJE_ERROR_GUARDAR', async () => {
    estado.insertError = { code: '42501', message: 'permission denied' }
    expect(await marcarFavorito(id, USER_ID, tipo)).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })

  it(`desmarcarFavorito: un solo delete de user_favorites filtrado por user_id y ${columna}`, async () => {
    const r = await desmarcarFavorito(id, USER_ID, tipo)
    expect(r).toEqual({ ok: true, voyQuitado: false })
    expect(estado.log).toHaveLength(1)
    expect(estado.log[0]).toMatchObject({
      tabla: 'user_favorites',
      accion: 'delete',
      eqs: [
        ['user_id', USER_ID],
        [columna, id],
      ],
    })
  })

  it('desmarcarFavorito: no toca event_attendance y voyQuitado es false aunque haya filas de Voy', async () => {
    estado.asistenciaFilas = [{ kind: 'voy' }]
    const r = await desmarcarFavorito(id, USER_ID, tipo)
    expect(estado.log.some((op) => op.tabla === 'event_attendance')).toBe(false)
    expect(r).toEqual({ ok: true, voyQuitado: false })
  })

  it('desmarcarFavorito: error del delete -> MENSAJE_ERROR_GUARDAR', async () => {
    estado.deleteError = { message: 'boom' }
    expect(await desmarcarFavorito(id, USER_ID, tipo)).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })

  it(`obtenerEsFavorito: select de ${columna} filtrado por user_id y ${columna}`, async () => {
    estado.maybeSingleData = { [columna]: id }
    const r = await obtenerEsFavorito(id, USER_ID, tipo)
    expect(r).toEqual({ ok: true, marcado: true })
    expect(estado.log[0]).toMatchObject({
      tabla: 'user_favorites',
      accion: 'select',
      columnas: columna,
      eqs: [
        ['user_id', USER_ID],
        [columna, id],
      ],
    })
  })

  it('obtenerEsFavorito: sin fila -> marcado false', async () => {
    expect(await obtenerEsFavorito(id, USER_ID, tipo)).toEqual({ ok: true, marcado: false })
  })

  it('ninguna de las tres funciones usa otra columna de user_favorites', async () => {
    await marcarFavorito(id, USER_ID, tipo)
    await desmarcarFavorito(id, USER_ID, tipo)
    await obtenerEsFavorito(id, USER_ID, tipo)
    const texto = JSON.stringify(estado.log)
    for (const otra of OTRAS_COLUMNAS(tipo)) expect(texto).not.toContain(otra)
  })
})

// R72, 72-a (QPS-361): el tipo ya es obligatorio; 'event' se pasa explícito.
describe('event explícito: todo como antes', () => {
  it("marcarFavorito 'event': estado antes del insert, y el insert lleva event_id", async () => {
    const r = await marcarFavorito(UUID_EVENTO, USER_ID, 'event')
    expect(r).toEqual({ ok: true })
    expect(estado.log.map((op) => `${op.tabla}:${op.accion}`)).toEqual(['(estado-evento):estadoPermiteAgregar', 'user_favorites:insert'])
    expect(estado.log[1].valores).toEqual({ user_id: USER_ID, event_id: UUID_EVENTO })
  })

  it("marcarFavorito 'event': no toca las columnas de película ni de flyer", async () => {
    await marcarFavorito(UUID_EVENTO, USER_ID, 'event')
    const texto = JSON.stringify(estado.log[1].valores)
    expect(texto).not.toContain('cinema_movie_id')
    expect(texto).not.toContain('instagram_flyer_id')
  })

  it("estado 'no': error sin insert; estado 'error': MENSAJE_ERROR_GUARDAR sin insert", async () => {
    estado.estadoEvento = 'no'
    const no = await marcarFavorito(UUID_EVENTO, USER_ID, 'event')
    expect(no.ok).toBe(false)
    estado.estadoEvento = 'error'
    expect(await marcarFavorito(UUID_EVENTO, USER_ID, 'event')).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(estado.log.some((op) => op.accion === 'insert')).toBe(false)
  })

  it('desmarcarFavorito: event_attendance antes que user_favorites, y voyQuitado según kind', async () => {
    estado.asistenciaFilas = [{ kind: 'voy' }]
    const r = await desmarcarFavorito(UUID_EVENTO, USER_ID, 'event')
    expect(r).toEqual({ ok: true, voyQuitado: true })
    expect(estado.log.map((op) => `${op.tabla}:${op.accion}`)).toEqual(['event_attendance:delete', 'user_favorites:delete'])
    expect(estado.log[0].eqs).toEqual([['event_id', UUID_EVENTO]])
    expect(estado.log[1].eqs).toEqual([
      ['user_id', USER_ID],
      ['event_id', UUID_EVENTO],
    ])
  })

  it('desmarcarFavorito: me_interesa no cuenta como voyQuitado', async () => {
    estado.asistenciaFilas = [{ kind: 'me_interesa' }]
    expect(await desmarcarFavorito(UUID_EVENTO, USER_ID, 'event')).toEqual({ ok: true, voyQuitado: false })
  })

  it('desmarcarFavorito: si falla event_attendance no se intenta el delete del favorito', async () => {
    estado.asistenciaError = { message: 'boom' }
    expect(await desmarcarFavorito(UUID_EVENTO, USER_ID, 'event')).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(estado.log.some((op) => op.tabla === 'user_favorites')).toBe(false)
  })

  it("obtenerEsFavorito 'event' filtra por event_id", async () => {
    await obtenerEsFavorito(UUID_EVENTO, USER_ID, 'event')
    expect(estado.log[0]).toMatchObject({ columnas: 'event_id', eqs: [['user_id', USER_ID], ['event_id', UUID_EVENTO]] })
  })
})

// ---------------------------------------------------------------------------
// objetivoDeFavorito
// ---------------------------------------------------------------------------
describe('objetivoDeFavorito', () => {
  it('película: cinema con el uuid sin "movie-"', () => {
    expect(objetivoDeFavorito({ id: `movie-${UUID_PELICULA}`, isCinemaMovie: true })).toEqual({ tipo: 'cinema', id: UUID_PELICULA })
  })

  it('flyer con flyerId: flyer con ese flyerId (no el id con "ig-")', () => {
    expect(objetivoDeFavorito({ id: 'ig-otra-cosa', isInstagramFlyer: true, flyerId: UUID_FLYER })).toEqual({ tipo: 'flyer', id: UUID_FLYER })
  })

  it('flyer sin flyerId: flyer con el id sin "ig-"', () => {
    expect(objetivoDeFavorito({ id: `ig-${UUID_FLYER}`, isInstagramFlyer: true })).toEqual({ tipo: 'flyer', id: UUID_FLYER })
  })

  it('flyer con flyerId que no es uuid -> null (no cae al id del item)', () => {
    expect(objetivoDeFavorito({ id: `ig-${UUID_FLYER}`, isInstagramFlyer: true, flyerId: 'no-es-uuid' })).toBeNull()
  })

  it.each([
    ['película con resto que no es uuid', { id: 'movie-abc', isCinemaMovie: true }],
    ['película con id vacío tras el prefijo', { id: 'movie-', isCinemaMovie: true }],
    ['película con un pedazo de ruta', { id: 'movie-../cuenta', isCinemaMovie: true }],
    ['película con uuid y algo más', { id: `movie-${UUID_PELICULA}/x`, isCinemaMovie: true }],
    ['película con doble prefijo', { id: `movie-movie-${UUID_PELICULA}`, isCinemaMovie: true }],
    ['flyer con resto que no es uuid', { id: 'ig-abc', isInstagramFlyer: true }],
    ['flyer con id vacío tras el prefijo', { id: 'ig-', isInstagramFlyer: true }],
  ])('%s -> null', (_nombre, item) => {
    expect(objetivoDeFavorito(item)).toBeNull()
  })

  it('evento: el id tal cual', () => {
    expect(objetivoDeFavorito({ id: UUID_EVENTO })).toEqual({ tipo: 'event', id: UUID_EVENTO })
    expect(objetivoDeFavorito({ id: UUID_EVENTO, isCinemaMovie: false, isInstagramFlyer: false })).toEqual({ tipo: 'event', id: UUID_EVENTO })
  })

  it('el id del objetivo coincide con el de la ruta de rutaDeEvento (película, flyer, evento)', () => {
    const items = [
      { id: `movie-${UUID_PELICULA}`, isCinemaMovie: true },
      { id: `ig-${UUID_FLYER}`, isInstagramFlyer: true },
      { id: 'ig-x', isInstagramFlyer: true, flyerId: UUID_FLYER },
      { id: UUID_EVENTO },
    ]
    for (const item of items) {
      const objetivo = objetivoDeFavorito(item)
      expect(objetivo).not.toBeNull()
      expect(rutaDeEvento(item).endsWith(`/${objetivo!.id}`)).toBe(true)
    }
  })

  it('de punta a punta: nunca un id con "movie-" ni "ig-" llega a la base', async () => {
    const items = [
      { id: `movie-${UUID_PELICULA}`, isCinemaMovie: true },
      { id: `ig-${UUID_FLYER}`, isInstagramFlyer: true },
      { id: 'ig-x', isInstagramFlyer: true, flyerId: UUID_FLYER },
    ]
    for (const item of items) {
      const objetivo = objetivoDeFavorito(item)!
      await marcarFavorito(objetivo.id, USER_ID, objetivo.tipo)
      await desmarcarFavorito(objetivo.id, USER_ID, objetivo.tipo)
      await obtenerEsFavorito(objetivo.id, USER_ID, objetivo.tipo)
    }
    const enviados = valoresEnviados()
    expect(enviados.length).toBeGreaterThan(0)
    for (const v of enviados) {
      expect(v.startsWith('movie-')).toBe(false)
      expect(v.startsWith('ig-')).toBe(false)
    }
  })
})
