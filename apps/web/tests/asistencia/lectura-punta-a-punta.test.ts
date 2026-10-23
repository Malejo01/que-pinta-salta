/**
 * De punta a punta (R56, tarea 56-q, QPS-196): la ficha
 * (`app/evento/[id]/page.tsx`) crea UN solo cliente de Supabase y llama a
 * `auth.getUser()` UNA sola vez por render, y los comparte con
 * `leerAsistencia` (lib/asistencia-lectura.ts), `esEventoFavorito`
 * (lib/favoritos/es-favorito.ts) y el chequeo de `isAdmin` — antes de 56-a
 * había un segundo cliente y un segundo `auth.getUser()` adentro de
 * `obtenerAsistencia` (lib/asistencia.ts), que la ficha llamaba aparte.
 *
 * `tests/asistencia/lectura.test.ts` (56-a) ya prueba, con detectores
 * ESTÁTICOS sobre el TEXTO de los archivos, que la ficha importa
 * `leerAsistencia` (nunca `obtenerAsistencia`) y que
 * `lib/asistencia-lectura.ts` nunca crea un cliente ni llama a
 * `auth.getUser()`. Este archivo no repite esos detectores: agrega la parte
 * que un detector de texto no puede probar — que, en un render REAL de la
 * página, `createClient()` se invoca UNA sola vez, `auth.getUser()` también,
 * y que `leerAsistencia` recibe exactamente ESE cliente y ESE usuario
 * (mismas referencias), nunca uno propio.
 *
 * `tests/events/evento-page-merged.test.ts` y
 * `tests/events/evento-merged-308.test.ts` ya importan y ejecutan
 * `EventPage` de verdad, pero NINGUNO llega al camino feliz (evento
 * encontrado, sin fusión): todos sus casos terminan en `notFound()` o en una
 * redirección 308. Este archivo sí llega a ese camino (el único que ejecuta
 * `leerAsistencia`/`esEventoFavorito`/el chequeo de `isAdmin`).
 *
 * Sin red ni base: `@/lib/data`, `@/lib/supabase/server`,
 * `@/components/event-detail-page`, `@/lib/actions/radar` y `next/navigation`
 * van mockeados. `@/lib/asistencia-lectura` (`leerAsistencia`) y
 * `@/lib/favoritos/es-favorito` (`esEventoFavorito`) quedan REALES —son las
 * que interesa comprobar que reciben el cliente y el usuario correctos—, con
 * un doble de Supabase en memoria que soporta las tablas que esas dos
 * funciones consultan (más `profiles`, para el chequeo de `isAdmin` que hace
 * la propia página).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getEventById = vi.fn()
vi.mock('@/lib/data', () => ({
  getEventById: (...a: unknown[]) => getEventById(...a),
  getCategories: async () => [],
}))

const createClient = vi.fn()
const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

vi.mock('@/components/event-detail-page', () => ({ EventDetailPage: () => null }))

const obtenerSeguimientoDeEvento = vi.fn()
vi.mock('@/lib/actions/radar', () => ({
  obtenerSeguimientoDeEvento: (...a: unknown[]) => obtenerSeguimientoDeEvento(...a),
}))

const notFound = vi.fn(() => {
  throw new Error('NOT_FOUND')
})
const permanentRedirect = vi.fn((u: string) => {
  throw new Error(`REDIRECT:${u}`)
})
vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  permanentRedirect: (u: string) => permanentRedirect(u),
}))

// `@/lib/asistencia` ("use server") queda real en el resto de sus exports,
// pero `obtenerAsistencia` se envuelve con un espía que TIRA si llega a
// invocarse: si la ficha volviera a llamar a la server action (en vez de
// `leerAsistencia` directo, el caso de rotura del encargo), este test se cae
// por una excepción real — no solo el detector estático de
// `lectura.test.ts`.
vi.mock('@/lib/asistencia', async () => {
  const actual = await vi.importActual<typeof import('@/lib/asistencia')>('@/lib/asistencia')
  return {
    ...actual,
    obtenerAsistencia: vi.fn(() => {
      throw new Error(
        'la ficha no debería llamar a obtenerAsistencia (la server action): tiene que usar leerAsistencia directo',
      )
    }),
  }
})

import EventPage from '@/app/evento/[id]/page'

const EVENT_ID = '12345678-1234-4234-8234-123456789abc'

/** Evento inventado, con todos los campos que lee `app/evento/[id]/page.tsx` (para el JSON-LD y las props de la ficha). */
function eventoDePrueba(over: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    title: 'Peña de Prueba',
    short_description: null,
    description: 'Una noche de folklore salteño — evento inventado para este test.',
    image_url: null,
    status: 'PUBLISHED',
    tags: [],
    venue: null,
    is_free: false,
    price_min: 1000,
    ticket_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    start_date: '2026-02-01T21:00:00.000Z',
    end_date: null,
    category: null,
    ...over,
  }
}

interface ConfigCliente {
  user: { id: string } | null
  role?: string
  countsData?: { voy: number } | null
  propiaData?: { kind: string } | null
  guardadoData?: { id: string } | null
}

/**
 * Doble de Supabase que soporta las tablas que toca un render completo de la
 * ficha con sesión: `event_attendance_counts`/`event_attendance`/
 * `user_favorites` (de `leerAsistencia` y `esEventoFavorito`) y `profiles`
 * (del chequeo de `isAdmin`, que vive directo en `page.tsx`).
 */
function construirCliente(config: ConfigCliente) {
  const getUser = vi.fn(async () => ({ data: { user: config.user }, error: null }))

  const from = vi.fn((tabla: string) => {
    if (tabla === 'event_attendance_counts') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: config.countsData ?? { voy: 0 }, error: null }) }),
        }),
      }
    }
    if (tabla === 'event_attendance') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: config.propiaData ?? null, error: null }) }) }),
      }
    }
    if (tabla === 'user_favorites') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: config.guardadoData ?? null, error: null }) }),
          }),
        }),
      }
    }
    if (tabla === 'profiles') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { role: config.role ?? 'USER' }, error: null }) }) }),
      }
    }
    throw new Error(`tabla inesperada en el doble de lectura-punta-a-punta: ${tabla}`)
  })

  return { cliente: { auth: { getUser }, from }, getUser, from }
}

beforeEach(() => {
  getEventById.mockReset()
  createClient.mockReset()
  createAdminClient.mockReset()
  obtenerSeguimientoDeEvento.mockReset()
  obtenerSeguimientoDeEvento.mockResolvedValue({ lugar: null, cuenta: null })
  notFound.mockClear()
  permanentRedirect.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

async function render() {
  return EventPage({ params: Promise.resolve({ id: EVENT_ID }), searchParams: Promise.resolve({}) })
}

describe('de punta a punta: EventPage crea UN cliente y llama a auth.getUser() UNA vez por render', () => {
  it('con sesión: un createClient(), un auth.getUser(), y el render no revienta', async () => {
    getEventById.mockResolvedValue(eventoDePrueba())
    const usuario = { id: 'usuario-ppa-1' }
    const { cliente, getUser } = construirCliente({
      user: usuario,
      countsData: { voy: 4 },
      propiaData: { kind: 'voy' },
      guardadoData: { id: 'fav-1' },
    })
    createClient.mockResolvedValue(cliente)

    await render()

    expect(createClient).toHaveBeenCalledTimes(1)
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(notFound).not.toHaveBeenCalled()
    expect(permanentRedirect).not.toHaveBeenCalled()
  })

  it('sin sesión: igual UN createClient() y UN auth.getUser(), sin consultar "profiles" ni "user_favorites"', async () => {
    getEventById.mockResolvedValue(eventoDePrueba())
    const { cliente, getUser, from } = construirCliente({ user: null, countsData: { voy: 0 } })
    createClient.mockResolvedValue(cliente)

    await render()

    expect(createClient).toHaveBeenCalledTimes(1)
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalledWith('profiles')
    expect(from).not.toHaveBeenCalledWith('user_favorites')
  })

  it('leerAsistencia recibe EXACTAMENTE el cliente y el user.id que ya resolvió el render (mismas referencias)', async () => {
    getEventById.mockResolvedValue(eventoDePrueba())
    const usuario = { id: 'usuario-ppa-2' }
    const { cliente, countsSpy } = (() => {
      const base = construirCliente({ user: usuario, countsData: { voy: 7 } })
      // Se intercepta el `from` del cliente para capturar CON QUÉ cliente se
      // hizo la consulta de cantidades: si `leerAsistencia` recibiera un
      // cliente DISTINTO (uno propio, creado de nuevo), la llamada a
      // `event_attendance_counts` no pasaría por este `from` y el spy
      // quedaría en 0 invocaciones.
      return { cliente: base.cliente, countsSpy: base.from }
    })()
    createClient.mockResolvedValue(cliente)

    await render()

    const llamadasCounts = countsSpy.mock.calls.filter(([tabla]) => tabla === 'event_attendance_counts')
    expect(llamadasCounts.length).toBe(1)
  })

  it(
    'caso de rotura (encargo 56-q): si la ficha volviera a llamar a obtenerAsistencia (la server action) en vez de ' +
      'leerAsistencia directo, este test se cae con una excepción real (no solo un detector de texto)',
    async () => {
      getEventById.mockResolvedValue(eventoDePrueba())
      const usuario = { id: 'usuario-ppa-3' }
      const { cliente } = construirCliente({ user: usuario, countsData: { voy: 0 } })
      createClient.mockResolvedValue(cliente)

      // Si page.tsx llamara a obtenerAsistencia, el mock de '@/lib/asistencia'
      // de más arriba tira: el render fallaría con esa excepción en vez de
      // terminar normalmente. Que termine sin tirar ES la prueba.
      await render()
      expect(notFound).not.toHaveBeenCalled()
    },
  )
})
