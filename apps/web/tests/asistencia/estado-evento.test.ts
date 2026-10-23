/**
 * QPS-195 (R56, tarea 56-a): antes de AGREGAR una marca (Guardar o Voy) hay
 * que chequear que el evento siga existiendo y publicado —
 * `estadoPermiteAgregar` en `lib/asistencia-lectura.ts`, llamado desde
 * `marcarAsistencia` (`lib/asistencia.ts`) y desde `toggleFavorite`
 * (`lib/actions/favorites.ts`) solo en la rama que AGREGA. Sin red ni base:
 * mismo estilo de doble que `tests/asistencia/guardar-voy.test.ts`.
 *
 * Qué prueba este archivo:
 *  - Sin fila en `events` (un borrador, oculto por la RLS) y un evento
 *    `CANCELLED`: los dos dan `INVALID`, con CERO escrituras.
 *  - `PUBLISHED`: escribe como antes, en el mismo orden de la R47 (favorito
 *    primero, asistencia después).
 *  - Sacar Voy de un evento que ya no está publicado: funciona igual, y la
 *    tabla `events` ni se consulta (`quitar-voy` no pasa por el chequeo).
 *  - Un error de la base al leer `events`: `DB_ERROR`, sin escrituras.
 *  - `toggleFavorite` al agregar un borrador: `INVALID` sin `insert`; al
 *    quitar: funciona igual (el chequeo es solo al agregar).
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
// user_favorites / events, con el ORDEN de las escrituras y las tablas
// consultadas (para afirmar "events ni se consulta" cuando corresponde).
// ---------------------------------------------------------------------------
interface ConfigMarcar {
  user: { id: string } | null
  propiaData?: { kind: string } | null
  guardadoData?: { id: string } | null
  countsData?: { voy: number } | null
  /** `undefined` por defecto: PUBLISHED. */
  eventsStatus?: string | null
  /** `false`: `events`.maybeSingle() no encuentra fila (como un id inexistente o un borrador oculto por la RLS). */
  eventsFilaExiste?: boolean
  eventsError?: unknown
}

function construirClienteMarcar(config: ConfigMarcar) {
  const orden: string[] = []
  const tablasConsultadas: string[] = []

  const from = vi.fn((tabla: string) => {
    tablasConsultadas.push(tabla)

    if (tabla === 'event_attendance') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: config.propiaData ?? null, error: null }),
          }),
        }),
        upsert: async () => {
          orden.push('event_attendance.upsert')
          return { error: null }
        },
        delete: () => ({
          eq: async () => {
            orden.push('event_attendance.delete')
            return { error: null }
          },
        }),
      }
    }

    if (tabla === 'event_attendance_counts') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: config.countsData ?? { voy: 0 }, error: null }),
          }),
        }),
      }
    }

    if (tabla === 'user_favorites') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: config.guardadoData ?? null, error: null }),
            }),
          }),
        }),
        insert: async () => {
          orden.push('user_favorites.insert')
          return { error: null }
        },
      }
    }

    if (tabla === 'events') {
      return {
        select: (columnas: string) => {
          if (columnas !== 'status') throw new Error(`select inesperado sobre events: "${columnas}"`)
          return {
            eq: () => ({
              maybeSingle: async () => {
                if (config.eventsError) return { data: null, error: config.eventsError }
                if (config.eventsFilaExiste === false) return { data: null, error: null }
                return { data: { status: config.eventsStatus ?? 'PUBLISHED' }, error: null }
              },
            }),
          }
        },
      }
    }

    throw new Error(`tabla inesperada en el doble de estado-evento (marcarAsistencia): ${tabla}`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from },
    orden,
    tablasConsultadas,
  }
}

describe('marcarAsistencia: QPS-195, el chequeo de estadoPermiteAgregar antes de AGREGAR', () => {
  it('sin fila en events (borrador oculto por la RLS): INVALID y cero escrituras', async () => {
    const { cliente, orden } = construirClienteMarcar({
      user: { id: 'usuario-1' },
      propiaData: null,
      guardadoData: null,
      eventsFilaExiste: false,
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-sin-fila', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(orden).toEqual([])
  })

  it('CANCELLED: INVALID y cero escrituras', async () => {
    const { cliente, orden } = construirClienteMarcar({
      user: { id: 'usuario-2' },
      propiaData: null,
      guardadoData: null,
      eventsStatus: 'CANCELLED',
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-cancelado', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(orden).toEqual([])
  })

  it('PUBLISHED: escribe como antes, en el orden de la R47 (favorito y después asistencia)', async () => {
    const { cliente, orden } = construirClienteMarcar({
      user: { id: 'usuario-3' },
      propiaData: null,
      guardadoData: null,
      countsData: { voy: 4 },
      eventsStatus: 'PUBLISHED',
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-publicado', 'voy')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 4 }, propia: 'voy', guardado: true })
    expect(orden).toEqual(['user_favorites.insert', 'event_attendance.upsert'])
  })

  it(
    'sacar Voy de un evento que ya no está publicado: funciona igual, y la tabla events ni se consulta ' +
      '("quitar-voy" no pasa por el chequeo: nadie puede quedar con una marca que no puede sacar)',
    async () => {
      const { cliente, orden, tablasConsultadas } = construirClienteMarcar({
        user: { id: 'usuario-4' },
        propiaData: { kind: 'voy' },
        guardadoData: { id: 'fav-1' },
        countsData: { voy: 0 },
        // Si "events" se llegara a consultar, esta config daría 'no' (y el
        // test de abajo fallaría con INVALID en vez de ok:true): es a
        // propósito, para que la aserción de "ni se consulta" sea real.
        eventsFilaExiste: false,
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await marcarAsistencia('evento-cancelado', 'voy')

      expect(resultado).toEqual({ ok: true, cantidades: { voy: 0 }, propia: null, guardado: true })
      expect(orden).toEqual(['event_attendance.delete'])
      expect(tablasConsultadas).not.toContain('events')
    },
  )

  it('estadoPermiteAgregar con error de base: DB_ERROR, sin escrituras', async () => {
    const { cliente, orden } = construirClienteMarcar({
      user: { id: 'usuario-5' },
      propiaData: null,
      guardadoData: null,
      eventsError: { code: '42501', message: 'detalle interno de postgres' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-x', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'DB_ERROR' })
    expect(JSON.stringify(resultado)).not.toContain('detalle interno de postgres')
    expect(orden).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Doble para toggleFavorite: user_favorites / event_attendance / events.
// ---------------------------------------------------------------------------
interface ConfigToggle {
  user: { id: string } | null
  existingFavoritoId?: string | null
  eventsStatus?: string | null
  eventsFilaExiste?: boolean
  deleteAttendanceFilas?: Array<{ kind: string }>
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
                error: null,
              }),
            }),
          }),
        }),
        delete: () => ({
          eq: async () => {
            orden.push('user_favorites.delete')
            return { error: null }
          },
        }),
        insert: async () => {
          orden.push('user_favorites.insert')
          return { error: null }
        },
      }
    }

    if (tabla === 'event_attendance') {
      return {
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => {
                orden.push('event_attendance.delete')
                return { data: config.deleteAttendanceFilas ?? [], error: null }
              },
            }),
          }),
        }),
      }
    }

    if (tabla === 'events') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (config.eventsFilaExiste === false) return { data: null, error: null }
              return { data: { status: config.eventsStatus ?? 'PUBLISHED' }, error: null }
            },
          }),
        }),
      }
    }

    throw new Error(`tabla inesperada en el doble de estado-evento (toggleFavorite): ${tabla}`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from },
    orden,
  }
}

describe('toggleFavorite: QPS-195, el chequeo de estadoPermiteAgregar solo al AGREGAR', () => {
  it('agregar un evento sin fila en events (borrador): INVALID, sin insert', async () => {
    const { cliente, orden } = construirClienteToggle({
      user: { id: 'usuario-6' },
      existingFavoritoId: null,
      eventsFilaExiste: false,
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite('evento-borrador', 'event')

    expect(resultado).toEqual({ success: false, error: 'INVALID', message: 'Ese evento ya no está disponible' })
    expect(orden).toEqual([])
  })

  it('quitar un favorito de un evento que ya no está publicado: funciona igual (el chequeo es solo al agregar)', async () => {
    const { cliente, orden } = construirClienteToggle({
      user: { id: 'usuario-7' },
      existingFavoritoId: 'fav-7',
      deleteAttendanceFilas: [{ kind: 'voy' }],
      // Si se llegara a consultar "events" al quitar, esto daría 'no' —
      // a propósito, para que "funciona igual" sea una aserción real.
      eventsFilaExiste: false,
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite('evento-cancelado', 'event')

    expect(resultado).toEqual({ success: true, favorited: false, voyQuitado: true })
    expect(orden).toEqual(['event_attendance.delete', 'user_favorites.delete'])
  })
})
