// 23-d: con la ruta real de /api/tarjeta/[id] (sin mockear 'next/og'),
// mockeando solo la base ('@/lib/supabase/server') y `fetch`, un afiche WebP
// real (generado con `sharp`) del Storage propio tiene que dar una tarjeta
// sin afiche y sin error (200) — porque 'webp' no está en POSTER_FORMATS
// (ver tests/app/tarjeta-satori-webp.test.ts para el porqué). Un PNG real sí
// se dibuja.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co'
const EVENT_ID = '22222222-2222-2222-2222-222222222222'

const state = vi.hoisted(() => ({
  eventRow: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.maybeSingle = async () => {
        if (table === 'events') return { data: state.eventRow, error: null }
        if (table === 'venues') return { data: null, error: null }
        throw new Error('tabla inesperada: ' + table)
      }
      return builder
    },
  }),
}))

import { GET } from '@/app/api/tarjeta/[id]/route'

function eventoDePrueba(imageUrl: string) {
  return {
    id: EVENT_ID,
    title: 'Peña de Prueba',
    start_date: '2026-12-01T22:00:00Z',
    venue_id: null,
    image_url: imageUrl,
  }
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function makeBuffer(format: 'webp' | 'png'): Promise<Buffer> {
  const image = sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 10, g: 150, b: 10 } },
  })
  return format === 'webp' ? image.webp().toBuffer() : image.png().toBuffer()
}

// `next/og` (Satori/resvg) real carga su propio binario WASM con un `fetch`
// interno a un recurso local del propio paquete (no es "red" en el sentido
// de la regla del equipo: es un archivo que ya está en node_modules, igual
// que cuando este mismo `next/og` real corre en tests/app/tarjeta-satori-webp.test.ts
// sin ningún fetch mockeado). Si el mock de `fetch` de este archivo
// respondiera con el buffer del afiche para CUALQUIER URL, se lo daría
// también a ese `fetch` interno de next/og en vez del binario WASM real, y
// `next/og` fallaría al compilar el WASM ("found 52 49 46 46", las primeras
// 4 bytes de un WebP) por una razón ajena a lo que este test quiere probar.
// Por eso el mock solo responde a la URL exacta del afiche; cualquier otra
// URL se deja pasar al `fetch` real (capturado ANTES de mockear el global).
const realFetch = globalThis.fetch

function fakeFetchFor(url: string, buffer: Buffer) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (requestUrl === url) {
      return {
        ok: true,
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      } as unknown as Response
    }
    return realFetch(input, init)
  })
}

const ENV_BACKUP = process.env.NEXT_PUBLIC_SUPABASE_URL

beforeEach(() => {
  state.eventRow = null
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ENV_BACKUP === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ENV_BACKUP
})

describe('un afiche WebP real del Storage propio', () => {
  it('la tarjeta sale sin afiche y sin error: 200, con cuerpo (next/og real, sin mockear)', async () => {
    const urlPropia = `${SUPABASE_URL}/storage/v1/object/public/flyers_ig/evento.webp`
    state.eventRow = eventoDePrueba(urlPropia)
    const webpBuffer = await makeBuffer('webp')
    vi.stubGlobal('fetch', fakeFetchFor(urlPropia, webpBuffer))

    const res = await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/' + EVENT_ID), params(EVENT_ID))

    expect(res.status).toBe(200)
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBeGreaterThan(0)
  })
})

describe('un afiche PNG real del Storage propio (control)', () => {
  it('se dibuja: 200, con cuerpo', async () => {
    const urlPropia = `${SUPABASE_URL}/storage/v1/object/public/flyers_ig/evento.png`
    state.eventRow = eventoDePrueba(urlPropia)
    const pngBuffer = await makeBuffer('png')
    vi.stubGlobal('fetch', fakeFetchFor(urlPropia, pngBuffer))

    const res = await GET(new Request('https://quepintasalta.com.ar/api/tarjeta/' + EVENT_ID), params(EVENT_ID))

    expect(res.status).toBe(200)
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBeGreaterThan(0)
  })
})
