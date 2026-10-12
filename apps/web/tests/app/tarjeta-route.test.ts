// 23-d: GET /api/tarjeta/[id] (apps/web/app/api/tarjeta/[id]/route.tsx).
// Acá sí se mockea 'next/og' (con un ImageResponse falso que registra lo que
// recibe: el árbol de elementos y las options) y '@/lib/supabase/server' (un
// cliente de base en memoria, sin red). El caso del WebP real sin mockear
// next/og está en tests/app/tarjeta-webp-sin-mock.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PUBLIC_EVENT_ROW_SELECT } from '@/lib/events/public-select'

const SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
const EVENT_ID = '11111111-1111-1111-1111-111111111111'

interface SelectCall {
  columns: string
  eqs: Array<[string, unknown]>
}

const state = vi.hoisted(() => ({
  eventRow: null as Record<string, unknown> | null,
  venueRow: null as Record<string, unknown> | null,
  calls: {
    events: [] as SelectCall[],
    venues: [] as SelectCall[],
  },
  imageResponseCalls: [] as Array<{ element: unknown; options: unknown }>,
}))

vi.mock('next/og', () => ({
  ImageResponse: class FakeImageResponse {
    status = 200
    element: unknown
    options: unknown
    constructor(element: unknown, options: unknown) {
      this.element = element
      this.options = options
      state.imageResponseCalls.push({ element, options })
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const record: SelectCall = { columns: '', eqs: [] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {}
      builder.select = (columns: string) => {
        record.columns = columns
        return builder
      }
      builder.eq = (col: string, val: unknown) => {
        record.eqs.push([col, val])
        return builder
      }
      builder.maybeSingle = async () => {
        if (table === 'events') {
          state.calls.events.push(record)
          return { data: state.eventRow, error: null }
        }
        if (table === 'venues') {
          state.calls.venues.push(record)
          return { data: state.venueRow, error: null }
        }
        throw new Error('tabla inesperada: ' + table)
      }
      return builder
    },
  }),
}))

import { GET } from '@/app/api/tarjeta/[id]/route'

/** Busca recursivamente, en el árbol de elementos capturado, el primer `<img>` y su `src`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findImgSrc(node: any): string | null {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'img') return node.props?.src ?? null
  const children = node.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findImgSrc(child)
      if (found) return found
    }
    return null
  }
  return findImgSrc(children)
}

function eventoDePrueba(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EVENT_ID,
    title: 'Peña de Prueba',
    start_date: '2026-12-01T22:00:00Z',
    venue_id: null,
    image_url: null,
    ...overrides,
  }
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

const ENV_BACKUP = process.env.NEXT_PUBLIC_SUPABASE_URL

beforeEach(() => {
  state.eventRow = null
  state.venueRow = null
  state.calls.events = []
  state.calls.venues = []
  state.imageResponseCalls = []
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ENV_BACKUP === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ENV_BACKUP
})

describe('un id que no es uuid', () => {
  it('da 404 sin llamar a la base ni construir ninguna ImageResponse', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/no-es-un-uuid'), params('no-es-un-uuid'))

    expect(res.status).toBe(404)
    expect(state.calls.events).toHaveLength(0)
    expect(state.calls.venues).toHaveLength(0)
    expect(state.imageResponseCalls).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('un evento inexistente o en borrador', () => {
  it('da 404 (la consulta ya filtra por PUBLISHED; sin fila, no hay nada más que consultar)', async () => {
    state.eventRow = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/' + EVENT_ID), params(EVENT_ID))

    expect(res.status).toBe(404)
    expect(state.imageResponseCalls).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('el select sobre events', () => {
  it('es exactamente PUBLIC_EVENT_ROW_SELECT y filtra id y status = PUBLISHED', async () => {
    state.eventRow = eventoDePrueba()

    await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/' + EVENT_ID), params(EVENT_ID))

    expect(state.calls.events).toHaveLength(1)
    expect(state.calls.events[0].columns).toBe(PUBLIC_EVENT_ROW_SELECT)
    expect(state.calls.events[0].eqs).toContainEqual(['id', EVENT_ID])
    expect(state.calls.events[0].eqs).toContainEqual(['status', 'PUBLISHED'])
  })
})

describe('sin fetch a fuentes: solo se pide la URL del afiche, y solo si es del Storage propio', () => {
  it('sin image_url, no se llama a fetch en absoluto', async () => {
    state.eventRow = eventoDePrueba({ image_url: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/' + EVENT_ID), params(EVENT_ID))

    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(findImgSrc(state.imageResponseCalls[0].element)).toBeNull()
  })

  it('con un host de terceros, no se llama a fetch y la tarjeta sale sin afiche', async () => {
    const urlTercero = 'https://ticketera-de-prueba.com/flyers/evento.jpg'
    state.eventRow = eventoDePrueba({ image_url: urlTercero })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/' + EVENT_ID), params(EVENT_ID))

    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(findImgSrc(state.imageResponseCalls[0].element)).toBeNull()
  })

  it('con image_url del host de Supabase (el propio Storage), se llama a fetch exactamente una vez, con esa URL, y el afiche entra', async () => {
    const urlPropia = `${SUPABASE_URL}/storage/v1/object/public/flyers_ig/evento.png`
    state.eventRow = eventoDePrueba({ image_url: urlPropia })
    // Magic bytes de PNG: alcanza para que detectPosterFormat() lo reconozca
    // (no hace falta un PNG válido de punta a punta: next/og está mockeado
    // en este archivo, Satori no llega a decodificarlo).
    const pngMagicBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => pngMagicBytes.buffer.slice(pngMagicBytes.byteOffset, pngMagicBytes.byteOffset + pngMagicBytes.byteLength),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/' + EVENT_ID), params(EVENT_ID))

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(urlPropia, expect.anything())
    // Ningún otro `fetch` (ni a fonts.googleapis.com ni a ningún otro host):
    // con un solo llamado registrado, ya queda probado.
    expect(findImgSrc(state.imageResponseCalls[0].element)).toBe(`data:image/png;base64,${pngMagicBytes.toString('base64')}`)
  })
})

describe('Cache-Control', () => {
  it('es exactamente "public, s-maxage=86400, stale-while-revalidate=604800"', async () => {
    state.eventRow = eventoDePrueba()

    await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/' + EVENT_ID), params(EVENT_ID))

    const { options } = state.imageResponseCalls[0] as { options: { headers: Record<string, string> } }
    expect(options.headers).toEqual({
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    })
  })
})
