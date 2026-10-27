// R72, 72-q (QPS-361): la guarda `parametrosInvalidos` de `lib/favoritos.ts`.
// Sin red ni base: `@/lib/supabase` y `@/lib/estado-evento` van con `vi.mock`.
// El doble cuenta CUALQUIER contacto con supabase (`from`, y cada método de
// la cadena): una guarda que deje pasar un id malo tiene que verse acá.
//
// Cómo se pone en rojo (rotura en producción -> qué test cae):
//   - sacar `&& !esUuid(id)` de `parametrosInvalidos`        -> "id no uuid ... sin llamadas"
//   - cambiar `hasOwnProperty.call` por `tipo in COLUMNA_POR_TIPO`
//     (o por `COLUMNA_POR_TIPO[tipo] === undefined`)          -> "tipo desconocido" con 'toString' / '__proto__' / 'constructor'
//   - sacar la línea `if (parametrosInvalidos(...))` de una función -> el caso de esa función
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '99999999-9999-4999-8999-999999999999'
const UUID_PELICULA = '11111111-1111-4111-8111-111111111111'
const UUID_FLYER = '22222222-2222-4222-8222-222222222222'
const UUID_EVENTO = '33333333-3333-4333-8333-333333333333'

const estado = vi.hoisted(() => ({
  contactos: [] as string[],
  estadoEvento: 'ok' as 'ok' | 'no' | 'error',
}))

vi.mock('@/lib/estado-evento', () => ({
  estadoPermiteAgregar: async (id: string) => {
    estado.contactos.push(`estado:${id}`)
    return estado.estadoEvento
  },
}))

vi.mock('@/lib/supabase', () => {
  const metodos = ['select', 'eq', 'delete', 'insert', 'maybeSingle'] as const
  return {
    supabase: {
      from: (tabla: string) => {
        estado.contactos.push(`from:${tabla}`)
        const builder: Record<string, unknown> = {}
        for (const m of metodos) {
          builder[m] = (...args: unknown[]) => {
            estado.contactos.push(`${m}:${args.map(String).join(',')}`)
            return builder
          }
        }
        builder.maybeSingle = async () => {
          estado.contactos.push('maybeSingle')
          return { data: null, error: null }
        }
        builder.insert = async (valores: unknown) => {
          estado.contactos.push(`insert:${JSON.stringify(valores)}`)
          return { error: null }
        }
        builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject)
        return builder
      },
    },
  }
})

import {
  desmarcarFavorito,
  MENSAJE_ERROR_GUARDAR,
  MENSAJE_ERROR_RED,
  marcarFavorito,
  obtenerEsFavorito,
} from '../lib/favoritos'
import type { TipoFavorito } from '../lib/rutas'

beforeEach(() => {
  estado.contactos = []
  estado.estadoEvento = 'ok'
})

const COLUMNA = { cinema: 'cinema_movie_id', flyer: 'instagram_flyer_id' } as const
const UUID_DE = { cinema: UUID_PELICULA, flyer: UUID_FLYER } as const

const IDS_MALOS: Array<[string, string]> = [
  ['vacío', ''],
  ['con prefijo movie-', `movie-${UUID_PELICULA}`],
  ['con prefijo ig-', `ig-${UUID_FLYER}`],
  ['uuid con espacios', ` ${UUID_PELICULA} `],
  ['uuid con salto de línea', `${UUID_PELICULA}\n`],
  ['uuid truncado', UUID_PELICULA.slice(0, -1)],
  ['uuid con algo más', `${UUID_PELICULA}x`],
  ['texto cualquiera', 'no-es-uuid'],
]

describe.each<'cinema' | 'flyer'>(['cinema', 'flyer'])('tipo %s: id que no es uuid', (tipo) => {
  it.each(IDS_MALOS)('obtenerEsFavorito, id %s: MENSAJE_ERROR_RED y ninguna llamada', async (_nombre, id) => {
    const r = await obtenerEsFavorito(id, USER_ID, tipo)
    expect(r).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
    expect(estado.contactos).toEqual([])
  })

  it.each(IDS_MALOS)('marcarFavorito, id %s: MENSAJE_ERROR_GUARDAR y ninguna llamada', async (_nombre, id) => {
    const r = await marcarFavorito(id, USER_ID, tipo)
    expect(r).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(estado.contactos).toEqual([])
  })

  it.each(IDS_MALOS)('desmarcarFavorito, id %s: MENSAJE_ERROR_GUARDAR y ninguna llamada', async (_nombre, id) => {
    const r = await desmarcarFavorito(id, USER_ID, tipo)
    expect(r).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(estado.contactos).toEqual([])
  })
})

describe.each<'cinema' | 'flyer'>(['cinema', 'flyer'])('tipo %s: uuid válido', (tipo) => {
  const id = UUID_DE[tipo]
  const columna = COLUMNA[tipo]

  it('obtenerEsFavorito consulta user_favorites con la columna del tipo', async () => {
    expect(await obtenerEsFavorito(id, USER_ID, tipo)).toEqual({ ok: true, marcado: false })
    expect(estado.contactos[0]).toBe('from:user_favorites')
    expect(estado.contactos).toContain(`eq:${columna},${id}`)
  })

  it('marcarFavorito inserta con la columna del tipo', async () => {
    expect(await marcarFavorito(id, USER_ID, tipo)).toEqual({ ok: true })
    expect(estado.contactos).toContain(`insert:${JSON.stringify({ user_id: USER_ID, [columna]: id })}`)
  })

  it('desmarcarFavorito borra por la columna del tipo', async () => {
    expect(await desmarcarFavorito(id, USER_ID, tipo)).toEqual({ ok: true, voyQuitado: false })
    expect(estado.contactos).toContain('delete:')
    expect(estado.contactos).toContain(`eq:${columna},${id}`)
  })

  it('un uuid en mayúsculas también pasa la guarda', async () => {
    expect(await marcarFavorito(id.toUpperCase(), USER_ID, tipo)).toEqual({ ok: true })
  })
})

describe('tipo desconocido en runtime: error sin red', () => {
  const TIPOS = ['toString', '__proto__', 'constructor', 'hasOwnProperty', 'valueOf', 'movie', '', 'EVENT'] as const

  it.each(TIPOS)('tipo %j en las tres funciones, con un uuid válido', async (tipo) => {
    const t = tipo as never as TipoFavorito
    expect(await obtenerEsFavorito(UUID_EVENTO, USER_ID, t)).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
    expect(await marcarFavorito(UUID_EVENTO, USER_ID, t)).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(await desmarcarFavorito(UUID_EVENTO, USER_ID, t)).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(estado.contactos).toEqual([])
  })

  it('tipo undefined (llamada vieja sin tipo) tampoco arma consulta', async () => {
    const t = undefined as never as TipoFavorito
    expect(await obtenerEsFavorito(UUID_EVENTO, USER_ID, t)).toEqual({ ok: false, error: MENSAJE_ERROR_RED })
    expect(await marcarFavorito(UUID_EVENTO, USER_ID, t)).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(await desmarcarFavorito(UUID_EVENTO, USER_ID, t)).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(estado.contactos).toEqual([])
  })
})

describe("tipo 'event': el camino de siempre", () => {
  it('marcarFavorito consulta el estado ANTES del insert, con el id tal cual', async () => {
    expect(await marcarFavorito(UUID_EVENTO, USER_ID, 'event')).toEqual({ ok: true })
    const iEstado = estado.contactos.indexOf(`estado:${UUID_EVENTO}`)
    const iInsert = estado.contactos.findIndex((c) => c.startsWith('insert:'))
    expect(iEstado).toBeGreaterThanOrEqual(0)
    expect(iInsert).toBeGreaterThan(iEstado)
    expect(estado.contactos[iInsert]).toBe(`insert:${JSON.stringify({ user_id: USER_ID, event_id: UUID_EVENTO })}`)
  })

  it('un id cualquiera (no uuid) NO lo corta la guarda: lo decide estadoPermiteAgregar', async () => {
    estado.estadoEvento = 'no'
    const r = await marcarFavorito('id-cualquiera', USER_ID, 'event')
    expect(r.ok).toBe(false)
    expect(estado.contactos).toEqual(['estado:id-cualquiera'])
  })

  it('obtenerEsFavorito y desmarcarFavorito con id cualquiera siguen yendo a la base', async () => {
    expect(await obtenerEsFavorito('id-cualquiera', USER_ID, 'event')).toEqual({ ok: true, marcado: false })
    expect(estado.contactos).toContain('eq:event_id,id-cualquiera')
    estado.contactos = []
    expect((await desmarcarFavorito('id-cualquiera', USER_ID, 'event')).ok).toBe(true)
    expect(estado.contactos).toContain('from:event_attendance')
    expect(estado.contactos).toContain('from:user_favorites')
  })
})
