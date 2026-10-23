/**
 * De punta a punta (R47, tarea 47-q, QPS-197): un usuario sin nada marca
 * ✓ Voy, queda ♥ Guardado y ✓ Voy, saca el ♥ y no le queda nada — y los
 * caminos cuando algo falla a mitad de camino. Encadena `marcarAsistencia`
 * (`lib/asistencia.ts`) y `toggleFavorite` (`lib/actions/favorites.ts`), las
 * dos escrituras SIN transacción que hace esta ronda, con el MISMO doble de
 * Supabase que ya usa `tests/asistencia/guardar-voy.test.ts` (47-b): no se
 * inventa un cuarto doble distinto, se reusa su forma (`construirClienteVoy`
 * / `construirClienteToggle`), cambiando solo la CONFIGURACIÓN entre pasos
 * para simular el estado real que va quedando en la base.
 *
 * Sin red ni base: `@/lib/supabase/server` y `next/cache` van mockeados.
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

const USUARIO = 'usuario-punta-a-punta'
const EVENTO = 'evento-punta-a-punta'

// ---------------------------------------------------------------------------
// Dobles (mismos que tests/asistencia/guardar-voy.test.ts, 47-b): uno para
// marcarAsistencia('voy') y otro para toggleFavorite('event').
// ---------------------------------------------------------------------------
interface ConfigVoy {
  propiaData?: { kind: string } | null
  guardadoData?: { id: string } | null
  countsData?: { voy: number } | null
  insertError?: unknown
  upsertError?: unknown
}

function construirClienteVoy(config: ConfigVoy) {
  const orden: string[] = []

  const from = vi.fn((tabla: string) => {
    if (tabla === 'event_attendance') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: config.propiaData ?? null, error: null }),
          }),
        }),
        upsert: async () => {
          orden.push('event_attendance.upsert')
          return { error: config.upsertError ?? null }
        },
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
          return { error: config.insertError ?? null }
        },
      }
    }
    // QPS-195 (R56, tarea 56-a): `estadoPermiteAgregar` se consulta antes
    // del primer paso que AGREGUE una marca. Siempre PUBLISHED acá: esta
    // secuencia de punta a punta no prueba ESE chequeo (lo hace
    // `tests/asistencia/estado-evento.test.ts`), solo el orden de las
    // escrituras de Guardar/Voy.
    if (tabla === 'events') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { status: 'PUBLISHED' }, error: null }),
          }),
        }),
      }
    }
    throw new Error(`tabla inesperada en el doble de marcarAsistencia: ${tabla}`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) }, from },
    orden,
  }
}

interface ConfigToggle {
  existingFavoritoId?: string | null
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
                error: null,
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
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => {
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

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) }, from },
    orden,
  }
}

// ---------------------------------------------------------------------------
// Camino feliz completo: sin nada → marca Voy → Guardado y Voy → saca el
// ♥ → no queda nada.
// ---------------------------------------------------------------------------
describe('de punta a punta: sin nada → marca Voy → Guardado y Voy → saca el ♥ → no queda nada', () => {
  it('la secuencia completa', async () => {
    // Paso 1: nada marcado, nada guardado.
    const { cliente: cliente1 } = construirClienteVoy({
      propiaData: null,
      guardadoData: null,
      countsData: { voy: 5 },
    })
    createClient.mockResolvedValue(cliente1)

    const resultadoVoy = await marcarAsistencia(EVENTO, 'voy')
    expect(resultadoVoy).toEqual({ ok: true, cantidades: { voy: 5 }, propia: 'voy', guardado: true })
    // Queda: Guardado y Voy.

    // Paso 2: ahora hay favorito y hay un Voy marcado — sacar el ♥.
    const { cliente: cliente2, orden } = construirClienteToggle({
      existingFavoritoId: 'fav-ppa',
      deleteAttendanceFilas: [{ kind: 'voy' }],
    })
    createClient.mockResolvedValue(cliente2)

    const resultadoToggle = await toggleFavorite(EVENTO, 'event')
    expect(resultadoToggle).toEqual({ success: true, favorited: false, voyQuitado: true })
    // No queda nada: ni Guardado (favorited: false) ni Voy (voyQuitado: true).
    expect(orden).toEqual(['event_attendance.delete', 'user_favorites.delete'])
  })
})

// ---------------------------------------------------------------------------
// La falla del SEGUNDO paso en cada camino: en los dos casos, el estado que
// queda cumple el invariante voy ⇒ guardado.
// ---------------------------------------------------------------------------
describe('de punta a punta: falla el segundo paso — el estado que queda cumple voy ⇒ guardado', () => {
  it('camino "marcar Voy": falla el upsert de event_attendance (2º paso) — queda guardado:true, voy:false (voy ⇒ guardado se cumple porque voy es false)', async () => {
    const { cliente, orden } = construirClienteVoy({
      propiaData: null,
      guardadoData: null, // sin nada previo
      upsertError: { code: '42501', message: 'boom' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia(EVENTO, 'voy')

    expect(resultado).toEqual({ ok: false, error: 'DB_ERROR', guardado: true })
    expect(orden).toEqual(['user_favorites.insert', 'event_attendance.upsert'])
    // guardado:true, voy:false (nunca se llegó a "marcar-voy"): el
    // invariante se cumple trivialmente.
  })

  it('camino "sacar el ♥" (después de un Voy marcado con éxito): falla el delete del favorito (2º paso) — queda guardado:true (el delete falló, el favorito sigue), voy:false (el 1º paso sí borró la asistencia)', async () => {
    // Paso previo (fuera de la aserción): marcar Voy salió bien.
    const { cliente: clientePrevio } = construirClienteVoy({ propiaData: null, guardadoData: null, countsData: { voy: 0 } })
    createClient.mockResolvedValue(clientePrevio)
    const previo = await marcarAsistencia(EVENTO, 'voy')
    expect(previo).toEqual({ ok: true, cantidades: { voy: 0 }, propia: 'voy', guardado: true })

    // Ahora falla el 2º paso de sacar el ♥: el favorito no se llega a borrar.
    const { cliente, orden } = construirClienteToggle({
      existingFavoritoId: 'fav-ppa-2',
      deleteAttendanceFilas: [{ kind: 'voy' }],
      deleteFavoritoError: { code: '42501', message: 'boom' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite(EVENTO, 'event')

    expect(resultado).toEqual({
      success: false,
      error: 'DB_ERROR',
      voyQuitado: true,
      message: 'Error al quitar de favoritos',
    })
    expect(orden).toEqual(['event_attendance.delete', 'user_favorites.delete'])
    // El real en la base: event_attendance SÍ se borró (voy:false), pero el
    // delete de user_favorites falló (el favorito sigue existiendo:
    // guardado:true). voy ⇒ guardado se cumple (voy es false).
  })
})

// ---------------------------------------------------------------------------
// La falla del PRIMER paso en cada camino: no se escribió nada, y el estado
// que informa la función es el de antes.
// ---------------------------------------------------------------------------
describe('de punta a punta: falla el primer paso — no se escribió nada, el estado informado es el de antes', () => {
  it('camino "marcar Voy": falla el insert del favorito (1º paso), sin Voy ni Guardado previos — guardado:false (el de antes), nunca llega al upsert', async () => {
    const { cliente, orden } = construirClienteVoy({
      propiaData: null,
      guardadoData: null, // antes: guardado = false
      insertError: { code: '42501', message: 'boom' }, // no es 23505: falla de verdad
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia(EVENTO, 'voy')

    expect(resultado).toEqual({ ok: false, error: 'DB_ERROR', guardado: false })
    expect(orden).toEqual(['user_favorites.insert'])
  })

  it('camino "sacar el ♥" (después de un Voy marcado con éxito): falla el delete de event_attendance (1º paso) — el favorito ni se toca', async () => {
    const { cliente: clientePrevio } = construirClienteVoy({ propiaData: null, guardadoData: null, countsData: { voy: 0 } })
    createClient.mockResolvedValue(clientePrevio)
    await marcarAsistencia(EVENTO, 'voy')

    const { cliente, orden } = construirClienteToggle({
      existingFavoritoId: 'fav-ppa-3',
      deleteAttendanceError: { code: '42501', message: 'boom' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await toggleFavorite(EVENTO, 'event')

    // Nada informado sobre voyQuitado (no se llegó a calcular ni a tocar el
    // favorito): el estado real que queda es el de antes de este paso
    // (Guardado y Voy, igual que dejó el paso previo).
    expect(resultado).toEqual({ success: false, error: 'DB_ERROR', message: 'Error al quitar de favoritos' })
    expect(orden).toEqual(['event_attendance.delete'])
  })
})
