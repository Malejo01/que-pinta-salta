/**
 * "Guardar, Voy y Seguir" (R47, tarea 47-b, QPS-197): el orden de las
 * escrituras SIN transacción que hacen `marcarAsistencia`
 * (`lib/asistencia.ts`) y `toggleFavorite` (`lib/actions/favorites.ts`)
 * cuando Voy está contenido en Guardados. Sin red ni base: `@/lib/supabase/server`
 * y `next/cache` van mockeados (mismo patrón que `tests/asistencia/web.test.ts`).
 *
 * La tabla de consistencia que prueba este archivo (del encargo de la
 * tarea):
 *
 *  | Acción              | Orden de las escrituras                                          |
 *  |---------------------|-------------------------------------------------------------------|
 *  | Marcar Voy          | 1) insert user_favorites (23505 = éxito) 2) upsert event_attendance |
 *  | Sacar Voy           | 1) delete de la fila propia en event_attendance (no toca favoritos) |
 *  | Sacar ♥ con Voy     | 1) delete event_attendance (.select("kind")) 2) delete favorito    |
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
const revalidatePath = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { marcarAsistencia } from '../../lib/asistencia'
import { toggleFavorite } from '../../lib/actions/favorites'

beforeEach(() => {
  createClient.mockReset()
  revalidatePath.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Doble para marcarAsistencia: event_attendance / event_attendance_counts /
// user_favorites, registrando el ORDEN de las escrituras (insert/upsert/delete,
// nunca los select).
// ---------------------------------------------------------------------------
interface ConfigVoy {
  user: { id: string } | null
  propiaData?: { kind: string } | null
  propiaError?: unknown
  guardadoData?: { id: string } | null
  guardadoError?: unknown
  countsData?: { voy: number } | null
  countsError?: unknown
  insertError?: unknown
  upsertError?: unknown
  deleteAttendanceError?: unknown
  /**
   * El `status` que devuelve `events`.select("status").eq("id", ...).maybeSingle()
   * (QPS-195, tarea 56-a: `estadoPermiteAgregar` se consulta antes de
   * AGREGAR una marca). Por defecto 'PUBLISHED', así los escenarios de este
   * archivo (que prueban el ORDEN de las escrituras, no ese chequeo) siguen
   * escribiendo como antes.
   */
  eventsStatus?: string | null
}

function construirClienteVoy(config: ConfigVoy) {
  const orden: string[] = []
  const inserts: unknown[] = []
  const upserts: unknown[] = []

  const from = vi.fn((tabla: string) => {
    if (tabla === 'event_attendance') {
      return {
        select: (columnas: string) => {
          if (columnas !== 'kind') throw new Error(`select inesperado sobre event_attendance: "${columnas}"`)
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: config.propiaData ?? null, error: config.propiaError ?? null }),
            }),
          }
        },
        upsert: async (valores: unknown) => {
          orden.push('event_attendance.upsert')
          upserts.push(valores)
          return { error: config.upsertError ?? null }
        },
        delete: () => ({
          eq: async () => {
            orden.push('event_attendance.delete')
            return { error: config.deleteAttendanceError ?? null }
          },
        }),
      }
    }

    if (tabla === 'event_attendance_counts') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: config.countsData ?? { voy: 0 }, error: config.countsError ?? null }),
          }),
        }),
      }
    }

    if (tabla === 'user_favorites') {
      return {
        select: (columnas: string) => {
          if (columnas !== 'id') throw new Error(`select inesperado sobre user_favorites: "${columnas}"`)
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: config.guardadoData ?? null, error: config.guardadoError ?? null }),
              }),
            }),
          }
        },
        insert: async (valores: unknown) => {
          orden.push('user_favorites.insert')
          inserts.push(valores)
          return { error: config.insertError ?? null }
        },
      }
    }

    // QPS-195 (56-a): `estadoPermiteAgregar` se consulta antes del primer
    // paso que AGREGUE una marca. Por defecto 'PUBLISHED' (ver el porqué en
    // el comentario de ConfigVoy.eventsStatus).
    if (tabla === 'events') {
      return {
        select: (columnas: string) => {
          if (columnas !== 'status') throw new Error(`select inesperado sobre events: "${columnas}"`)
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: { status: config.eventsStatus ?? 'PUBLISHED' }, error: null }),
            }),
          }
        },
      }
    }

    throw new Error(`tabla inesperada en el doble de guardar-voy: ${tabla}`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from },
    orden,
    inserts,
    upserts,
  }
}

/** Un `from()` que revienta el test si se llama: para "no escribe/lee nada". */
function clienteSinFrom(user: { id: string } | null) {
  const from = vi.fn((tabla: string) => {
    throw new Error(`no debería llamar a from("${tabla}"): sin sesión no se toca la base`)
  })
  return { cliente: { auth: { getUser: async () => ({ data: { user }, error: null }) }, from }, from }
}

// ---------------------------------------------------------------------------
// Marcar Voy: user_favorites ANTES que event_attendance.
// ---------------------------------------------------------------------------
describe('marcarAsistencia("voy"): marcar Voy escribe user_favorites antes que event_attendance', () => {
  it('sin Voy ni Guardado previos: inserta el favorito y después hace upsert de la asistencia, en ese orden', async () => {
    const { cliente, orden, inserts, upserts } = construirClienteVoy({
      user: { id: 'usuario-1' },
      propiaData: null,
      guardadoData: null,
      countsData: { voy: 3 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-1', 'voy')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 3 }, propia: 'voy', guardado: true })
    expect(orden).toEqual(['user_favorites.insert', 'event_attendance.upsert'])
    expect(inserts).toEqual([{ user_id: 'usuario-1', event_id: 'evento-1' }])
    expect(upserts).toEqual([{ user_id: 'usuario-1', event_id: 'evento-1', kind: 'voy' }])
  })

  it('un 23505 al guardar el favorito (ya estaba guardado) no corta la secuencia: sigue y marca Voy igual', async () => {
    const { cliente, orden, upserts } = construirClienteVoy({
      user: { id: 'usuario-2' },
      propiaData: null,
      guardadoData: { id: 'fav-1' }, // ya estaba guardado
      insertError: { code: '23505', message: 'ya existe' },
      countsData: { voy: 4 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-1', 'voy')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 4 }, propia: 'voy', guardado: true })
    expect(orden).toEqual(['user_favorites.insert', 'event_attendance.upsert'])
    expect(upserts).toHaveLength(1)
  })
})

describe('marcarAsistencia("voy"): si falla un paso, no sigue con el que falta y el "guardado" es el correcto', () => {
  it('falla el upsert de event_attendance (marcar-voy): el resultado trae guardado:true (ya quedó guardado, no Voy)', async () => {
    const { cliente, orden } = construirClienteVoy({
      user: { id: 'usuario-3' },
      propiaData: null,
      guardadoData: null, // no estaba guardado antes
      upsertError: { code: '42501', message: 'detalle interno' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-1', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'DB_ERROR', guardado: true })
    expect(orden).toEqual(['user_favorites.insert', 'event_attendance.upsert'])
  })

  it('falla el insert del favorito (y no es 23505): el resultado trae el "guardado" de ANTES, y nunca llega a upsert', async () => {
    const { cliente, orden, upserts } = construirClienteVoy({
      user: { id: 'usuario-4' },
      propiaData: null,
      guardadoData: { id: 'fav-ya-estaba' }, // guardado de ANTES: true
      insertError: { code: '42501', message: 'detalle interno' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-1', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'DB_ERROR', guardado: true })
    expect(orden).toEqual(['user_favorites.insert'])
    expect(upserts).toHaveLength(0)
  })
})

describe('marcarAsistencia("voy"): sacar Voy no toca user_favorites en absoluto', () => {
  it('ya había Voy (y estaba guardado): solo hace delete en event_attendance, sin insert ni upsert en user_favorites', async () => {
    const { cliente, orden, inserts } = construirClienteVoy({
      user: { id: 'usuario-5' },
      propiaData: { kind: 'voy' },
      guardadoData: { id: 'fav-1' },
      countsData: { voy: 0 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-1', 'voy')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 0 }, propia: null, guardado: true })
    expect(orden).toEqual(['event_attendance.delete'])
    expect(inserts).toHaveLength(0)
  })

  it(
    'aunque no toque el favorito, SÍ revalida /favoritos: "Mis eventos" (47-d) tiene una sección Voy y otra ' +
      'Guardados, y sacar el Voy muda el evento de una a la otra — el contenido de esa página cambia igual',
    async () => {
      const { cliente } = construirClienteVoy({
        user: { id: 'usuario-5b' },
        propiaData: { kind: 'voy' },
        guardadoData: { id: 'fav-1' },
        countsData: { voy: 0 },
      })
      createClient.mockResolvedValue(cliente)

      await marcarAsistencia('evento-1', 'voy')

      expect(revalidatePath).toHaveBeenCalledWith('/favoritos')
    },
  )

  it('falla el delete al sacar Voy: DB_ERROR con el guardado de antes (true), sin tocar user_favorites', async () => {
    const { cliente, orden } = construirClienteVoy({
      user: { id: 'usuario-6' },
      propiaData: { kind: 'voy' },
      guardadoData: { id: 'fav-1' },
      deleteAttendanceError: { code: '42501', message: 'detalle interno' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-1', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'DB_ERROR', guardado: true })
    expect(orden).toEqual(['event_attendance.delete'])
  })
})

describe('marcarAsistencia: sin sesión, ninguna escritura (ni lectura) en ninguna tabla', () => {
  it('AUTH_REQUIRED, from() nunca se llama', async () => {
    const { cliente, from } = clienteSinFrom(null)
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-1', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'AUTH_REQUIRED' })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('marcarAsistencia: ningún insert/upsert lleva un user_id distinto al de getUser()', () => {
  it('con varias sesiones distintas, cada escritura usa el id de ESA sesión', async () => {
    for (const uid of ['sesion-a', 'sesion-b', 'sesion-c']) {
      const { cliente, inserts, upserts } = construirClienteVoy({
        user: { id: uid },
        propiaData: null,
        guardadoData: null,
        countsData: { voy: 0 },
      })
      createClient.mockResolvedValue(cliente)

      await marcarAsistencia('evento-x', 'voy')

      expect(inserts).toEqual([{ user_id: uid, event_id: 'evento-x' }])
      expect(upserts).toEqual([{ user_id: uid, event_id: 'evento-x', kind: 'voy' }])
    }
  })
})

// ---------------------------------------------------------------------------
// toggleFavorite: al quitar un evento con Voy, event_attendance ANTES que
// user_favorites.
// ---------------------------------------------------------------------------
interface ConfigToggle {
  user: { id: string } | null
  existingFavoritoId?: string | null
  selectFavoritoError?: unknown
  deleteAttendanceFilas?: Array<{ kind: string }>
  deleteAttendanceError?: unknown
  deleteFavoritoError?: unknown
}

function construirClienteToggle(config: ConfigToggle) {
  const orden: string[] = []

  const from = vi.fn((tabla: string) => {
    if (tabla === 'user_favorites') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: config.existingFavoritoId ? { id: config.existingFavoritoId } : null,
                error: config.selectFavoritoError ?? null,
              }),
            }),
          }),
        }),
        delete: () => ({
          eq: async () => {
            orden.push('user_favorites.delete')
            return { error: config.deleteFavoritoError ?? null }
          },
        }),
      }
    }

    if (tabla === 'event_attendance') {
      return {
        // El delete filtra por event_id Y por user_id (defensa en profundidad
        // sobre la RLS del dueño, sugerencia del revisor del #76).
        delete: () => ({
          eq: (columna1: string) => ({
            eq: (columna2: string) => ({
              select: async (columnas: string) => {
                if (columnas !== 'kind') throw new Error(`select inesperado tras delete de event_attendance: "${columnas}"`)
                if ([columna1, columna2].sort().join(',') !== 'event_id,user_id') {
                  throw new Error(`el delete de event_attendance tiene que filtrar por event_id y user_id, filtró por: ${columna1}, ${columna2}`)
                }
                orden.push('event_attendance.delete')
                return { data: config.deleteAttendanceFilas ?? [], error: config.deleteAttendanceError ?? null }
              },
            }),
          }),
        }),
      }
    }

    throw new Error(`tabla inesperada en el doble de toggleFavorite: ${tabla}`)
  })

  return { cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from }, orden }
}

describe('toggleFavorite("event"): al quitar, borra event_attendance antes que el favorito', () => {
  it('con kind "voy": borra primero la asistencia y después el favorito, voyQuitado: true', async () => {
    const { cliente, orden } = construirClienteToggle({
      user: { id: 'usuario-7' },
      existingFavoritoId: 'fav-7',
      deleteAttendanceFilas: [{ kind: 'voy' }],
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite('evento-1', 'event')

    expect(resultado).toEqual({ success: true, favorited: false, voyQuitado: true })
    expect(orden).toEqual(['event_attendance.delete', 'user_favorites.delete'])
  })

  it('con una fila "me_interesa" vieja: se borra igual, pero voyQuitado: false', async () => {
    const { cliente } = construirClienteToggle({
      user: { id: 'usuario-8' },
      existingFavoritoId: 'fav-8',
      deleteAttendanceFilas: [{ kind: 'me_interesa' }],
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite('evento-1', 'event')

    expect(resultado).toEqual({ success: true, favorited: false, voyQuitado: false })
  })

  it('sin ninguna fila de asistencia: voyQuitado: false', async () => {
    const { cliente } = construirClienteToggle({
      user: { id: 'usuario-9' },
      existingFavoritoId: 'fav-9',
      deleteAttendanceFilas: [],
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite('evento-1', 'event')

    expect(resultado).toEqual({ success: true, favorited: false, voyQuitado: false })
  })

  it('si falla el primer delete (event_attendance), no hay segundo delete (el favorito no se toca)', async () => {
    const { cliente, orden } = construirClienteToggle({
      user: { id: 'usuario-10' },
      existingFavoritoId: 'fav-10',
      deleteAttendanceError: { code: '42501', message: 'detalle interno' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite('evento-1', 'event')

    expect(resultado.success).toBe(false)
    expect(resultado.error).toBe('DB_ERROR')
    expect(orden).toEqual(['event_attendance.delete'])
  })

  it('si falla el segundo delete (el favorito): DB_ERROR con el voyQuitado ya calculado', async () => {
    const { cliente, orden } = construirClienteToggle({
      user: { id: 'usuario-11' },
      existingFavoritoId: 'fav-11',
      deleteAttendanceFilas: [{ kind: 'voy' }],
      deleteFavoritoError: { code: '42501', message: 'detalle interno' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite('evento-1', 'event')

    expect(resultado).toEqual({
      success: false,
      error: 'DB_ERROR',
      voyQuitado: true,
      message: 'Error al quitar de favoritos',
    })
    expect(orden).toEqual(['event_attendance.delete', 'user_favorites.delete'])
  })
})

describe('toggleFavorite: sin sesión, ninguna escritura', () => {
  it('AUTH_REQUIRED, from() nunca se llama', async () => {
    const { cliente, from } = clienteSinFrom(null)
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite('evento-1', 'event')

    expect(resultado).toEqual({ success: false, error: 'AUTH_REQUIRED', message: 'Debes iniciar sesión para guardar favoritos' })
    expect(from).not.toHaveBeenCalled()
  })

  it('tipo inválido: INVALID sin crear el cliente', async () => {
    const resultado = await toggleFavorite('evento-1', 'otra-cosa' as unknown as 'event')

    expect(resultado.success).toBe(false)
    expect(resultado.error).toBe('INVALID')
    expect(createClient).not.toHaveBeenCalled()
  })
})
