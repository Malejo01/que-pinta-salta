/**
 * "Mis eventos" (R47, tarea 47-d, QPS-197): `/favoritos` separa en ✓ Voy
 * (social) y ♥ Guardados (privado) con `separarMisEventos`/`idsDeEventosVoy`
 * de `@qps/core/favoritos/mis-eventos`.
 *
 * Dos partes:
 *   - `app/favoritos/page.tsx` con un doble de Supabase (mismo patrón que
 *     `tests/events/consultas-con-sesion.test.ts`): no se renderiza nada, se
 *     llama a la página como función y se inspeccionan las props que le
 *     pasa al elemento `<FavoritosList>` sin montarlo.
 *   - `app/favoritos/favoritos-list.tsx`, con `renderToStaticMarkup` (sin
 *     DOM, igual que `tests/components/password-input.test.ts`): el orden
 *     real del HTML y que un grupo vacío no dibuje su encabezado. Desde la
 *     R61 hay tests con DOM real en `tests/dom/`, pero para el HTML estático
 *     `renderToStaticMarkup` sigue siendo más barato.
 *
 * El botón de "Compartir agenda" usa `window.location.origin`, que no
 * existe en Node puro (mismo límite que documenta
 * `tests/core/favoritos-whatsapp-applink.test.ts`): en vez de clickearlo, se
 * prueba `unirSinRepetir` directamente, la función que arma la lista de la
 * que sale el mensaje (así que si no repite ahí, el mensaje tampoco repite).
 */
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DisplayEvent } from '@qps/core/home/types'

type FilaFavorito = { event_id: string | null; instagram_flyer_id: string | null; cinema_movie_id: string | null }
type FilaAsistencia = { event_id: string | null; kind: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fila cruda de `events` (fixture de test, forma libre)
type FilaEvento = Record<string, any>

const state = vi.hoisted(() => ({
  userFavoritesRows: [] as FilaFavorito[],
  attendanceRows: [] as FilaAsistencia[],
  attendanceError: null as { message: string } | null,
  eventRows: [] as FilaEvento[],
  selects: [] as Array<{ table: string; columns: string }>,
  eqCalls: [] as Array<{ table: string; col: string; val: unknown }>,
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect: ' + url)
  },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'usuario-de-prueba' } }, error: null }) },
    from: (table: string) => {
      const inCalls: Array<[string, unknown[]]> = []
      const b: Record<string, unknown> = {}
      b.select = (columns: string) => {
        state.selects.push({ table, columns })
        return b
      }
      b.eq = (col: string, val: unknown) => {
        state.eqCalls.push({ table, col, val })
        return b
      }
      b.in = (col: string, vals: unknown[]) => {
        inCalls.push([col, vals])
        return b
      }
      b.or = () => b
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        let resultado: { data: unknown; error: unknown }
        if (table === 'user_favorites') {
          resultado = { data: state.userFavoritesRows, error: null }
        } else if (table === 'event_attendance') {
          resultado = state.attendanceError
            ? { data: null, error: state.attendanceError }
            : { data: state.attendanceRows, error: null }
        } else if (table === 'events') {
          const idsCall = inCalls.find(([col]) => col === 'id')
          const ids = (idsCall ? idsCall[1] : []) as string[]
          resultado = { data: state.eventRows.filter((fila) => ids.includes(fila.id)), error: null }
        } else {
          resultado = { data: [], error: null }
        }
        return Promise.resolve(resultado).then(resolve, reject)
      }
      return b
    },
  }),
}))
vi.mock('@/lib/data', () => ({ getCategories: async () => [] }))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))
vi.mock('@/components/event-card', () => ({
  EventCard: ({ event }: { event: DisplayEvent }) =>
    React.createElement('div', { 'data-testid': 'evento' }, event.title),
}))
vi.mock('@/components/movie-modal', () => ({ MovieModal: () => null }))
vi.mock('@/components/donation-context', () => ({ useDonation: () => ({ openDonationModal: () => {} }) }))

import FavoritosPage from '@/app/favoritos/page'
import { FavoritosList, unirSinRepetir } from '@/app/favoritos/favoritos-list'

type ReactElementLike = { type: unknown; props: { children?: unknown } }

/** Busca en el árbol de elementos (sin montarlo) el primero cuyo `type` sea `tipo`. */
function buscarPorTipo(nodo: unknown, tipo: unknown): ReactElementLike | null {
  if (nodo === null || typeof nodo !== 'object') return null
  const el = nodo as ReactElementLike
  if (el.type === tipo) return el
  const hijos = el.props?.children
  if (Array.isArray(hijos)) {
    for (const hijo of hijos) {
      const encontrado = buscarPorTipo(hijo, tipo)
      if (encontrado) return encontrado
    }
    return null
  }
  return buscarPorTipo(hijos, tipo)
}

function fakeEventRow(overrides: FilaEvento = {}): FilaEvento {
  return {
    id: 'evt-1',
    slug: 'evt-1',
    title: 'Evento de prueba',
    start_date: '2030-01-01T20:00:00.000Z',
    end_date: null,
    status: 'PUBLISHED',
    is_free: false,
    price_min: 500,
    image_url: null,
    description: null,
    short_description: null,
    age_restriction: null,
    is_featured: false,
    ticket_url: null,
    category: null,
    venue: { name: 'Lugar de prueba', address: 'Calle 123' },
    ...overrides,
  }
}

function fakeDisplayEvent(overrides: Partial<DisplayEvent> & { id: string }): DisplayEvent {
  return {
    slug: overrides.id,
    title: `Evento ${overrides.id}`,
    venue: 'Venue de prueba',
    date: '2030-01-01',
    time: '20:00',
    category: 'teatro',
    categoryName: 'Teatro',
    price: 'confirmar',
    image: '',
    description: '',
    address: '',
    startDateTime: '2030-01-01T20:00:00-03:00',
    isFeatured: false,
    ...overrides,
  } as DisplayEvent
}

beforeEach(() => {
  state.userFavoritesRows = []
  state.attendanceRows = []
  state.attendanceError = null
  state.eventRows = []
  state.selects.length = 0
  state.eqCalls.length = 0
})

describe('/favoritos ("Mis eventos"): la página', () => {
  it('pide event_attendance SOLO con event_id, kind — nunca user_id (ni en el select ni en un .eq)', async () => {
    await FavoritosPage()

    const select = state.selects.find((s) => s.table === 'event_attendance')
    expect(select).toBeTruthy()
    expect(select!.columns.replace(/\s+/g, ' ').trim()).toBe('event_id, kind')
    expect(select!.columns).not.toContain('user_id')
    expect(state.eqCalls.some((c) => c.table === 'event_attendance' && c.col === 'user_id')).toBe(false)
  })

  it('un evento con Voy Y favorito aparece una sola vez, en Voy (no en Guardados)', async () => {
    state.userFavoritesRows = [{ event_id: 'evt-1', instagram_flyer_id: null, cinema_movie_id: null }]
    state.attendanceRows = [{ event_id: 'evt-1', kind: 'voy' }]
    state.eventRows = [fakeEventRow({ id: 'evt-1' })]

    const el = await FavoritosPage()
    const lista = buscarPorTipo(el, FavoritosList)
    expect(lista).toBeTruthy()
    const props = lista!.props as unknown as { voy: DisplayEvent[]; flexibles: DisplayEvent[]; porDia: { items: DisplayEvent[] }[] }

    expect(props.voy.map((e) => e.id)).toEqual(['evt-1'])
    expect(props.flexibles).toEqual([])
    expect(props.porDia).toEqual([])
  })

  it('un Voy SIN favorito (datos de antes del backfill) igual aparece en Voy', async () => {
    state.userFavoritesRows = []
    state.attendanceRows = [{ event_id: 'evt-2', kind: 'voy' }]
    state.eventRows = [fakeEventRow({ id: 'evt-2' })]

    const el = await FavoritosPage()
    const props = buscarPorTipo(el, FavoritosList)!.props as unknown as { voy: DisplayEvent[] }

    expect(props.voy.map((e) => e.id)).toEqual(['evt-2'])
  })

  it('si falla SOLO la lectura de event_attendance, Guardados sigue andando (idsVoy vacío)', async () => {
    state.userFavoritesRows = [{ event_id: 'evt-3', instagram_flyer_id: null, cinema_movie_id: null }]
    state.attendanceError = { message: 'boom' }
    state.eventRows = [fakeEventRow({ id: 'evt-3' })]

    const el = await FavoritosPage()
    const props = buscarPorTipo(el, FavoritosList)!.props as unknown as {
      voy: DisplayEvent[]
      flexibles: DisplayEvent[]
      porDia: { items: DisplayEvent[] }[]
    }

    expect(props.voy).toEqual([])
    const idsGuardados = [...props.flexibles, ...props.porDia.flatMap((g) => g.items)].map((e) => e.id)
    expect(idsGuardados).toEqual(['evt-3'])
  })
})

describe('FavoritosList: el HTML real (renderToStaticMarkup)', () => {
  it('"Voy" aparece antes que "Guardados" (posición en el HTML) y el h1 dice "Mis eventos"', () => {
    const voy = [fakeDisplayEvent({ id: 'evt-voy' })]
    const porDia = [{ dia: '2030-01-02', items: [fakeDisplayEvent({ id: 'evt-guardado', date: '2030-01-02' })] }]

    const html = renderToStaticMarkup(React.createElement(FavoritosList, { voy, flexibles: [], porDia }))

    expect(html).toContain('Mis eventos')
    const iVoy = html.indexOf('Voy')
    const iGuardados = html.indexOf('Guardados')
    expect(iVoy).toBeGreaterThanOrEqual(0)
    expect(iGuardados).toBeGreaterThan(iVoy)
  })

  it('sin eventos con Voy, no se dibuja el encabezado "Voy" (Guardados sigue mostrándose)', () => {
    const porDia = [{ dia: '2030-01-02', items: [fakeDisplayEvent({ id: 'evt-guardado', date: '2030-01-02' })] }]

    const html = renderToStaticMarkup(React.createElement(FavoritosList, { voy: [], flexibles: [], porDia }))

    expect(html).not.toMatch(/>Voy[\s(]/)
    expect(html).toContain('Guardados')
  })

  it('sin Guardados (solo Voy), no se dibuja el encabezado "Guardados"', () => {
    const voy = [fakeDisplayEvent({ id: 'evt-voy' })]

    const html = renderToStaticMarkup(React.createElement(FavoritosList, { voy, flexibles: [], porDia: [] }))

    expect(html).not.toContain('Guardados')
    expect(html).toMatch(/>Voy/)
  })

  it('sin nada (ni Voy ni Guardados), el vacío usa el texto de "Mis eventos"', () => {
    const html = renderToStaticMarkup(React.createElement(FavoritosList, { voy: [], flexibles: [], porDia: [] }))

    expect(html).toContain('Mis eventos')
    expect(html).not.toContain('Mis Favoritos')
  })
})

describe('unirSinRepetir: la unión de Voy + Guardados para "Compartir agenda" no repite ids', () => {
  it('un evento presente en las dos listas aparece una sola vez (con los datos de la primera)', () => {
    const compartidoEnVoy = fakeDisplayEvent({ id: 'evt-compartido', title: 'Como aparece en Voy' })
    const compartidoEnGuardados = fakeDisplayEvent({ id: 'evt-compartido', title: 'No debería verse' })
    const soloVoy = fakeDisplayEvent({ id: 'evt-solo-voy' })
    const soloGuardado = fakeDisplayEvent({ id: 'evt-solo-guardado' })

    const resultado = unirSinRepetir([compartidoEnVoy, soloVoy], [compartidoEnGuardados, soloGuardado])

    expect(resultado.filter((e) => e.id === 'evt-compartido')).toHaveLength(1)
    expect(resultado.find((e) => e.id === 'evt-compartido')?.title).toBe('Como aparece en Voy')
    expect(resultado.map((e) => e.id).sort()).toEqual(['evt-compartido', 'evt-solo-guardado', 'evt-solo-voy'].sort())
  })

  it('sin repetidos, devuelve las dos listas tal cual (mismo orden: primero Voy, después Guardados)', () => {
    const a = [fakeDisplayEvent({ id: 'evt-a' })]
    const b = [fakeDisplayEvent({ id: 'evt-b' })]

    expect(unirSinRepetir(a, b).map((e) => e.id)).toEqual(['evt-a', 'evt-b'])
  })
})
