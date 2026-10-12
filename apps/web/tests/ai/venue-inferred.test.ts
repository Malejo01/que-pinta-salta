// Sin red ni base. La primera parte testea validateVenue, pura (QPS-070). La segunda
// (describe aparte) testea que venue_inferred solo "marca": no cambia qualifiesForAutoPublish
// en processFlyerWithAI (decisión de Mauro: esta noche solo se marca).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateVenue } from '@/lib/ai/validate-extraction'

describe('validateVenue: lugar inferido o confirmado en el texto (QPS-070)', () => {
  it('nombre extraído aparece literal en el caption: inferred false, source flyer', () => {
    const res = validateVenue('Flow', null, 'Fiesta en Flow el sábado', null)
    expect(res).toEqual({ name: 'Flow', inferred: false, source: 'flyer' })
  })

  it('nombre extraído aparece literal solo en el texto del flyer: inferred false', () => {
    const res = validateVenue('Flow', null, 'texto del caption sin el lugar', 'ENTRADA FLOW VIP')
    expect(res).toEqual({ name: 'Flow', inferred: false, source: 'flyer' })
  })

  it('sin nombre extraído: usa el default de la cuenta, inferred true', () => {
    const res = validateVenue(null, 'Venue de Prueba', 'texto sin mención del lugar', null)
    expect(res).toEqual({ name: 'Venue de Prueba', inferred: true, source: 'account_default' })
  })

  it('sin nombre extraído y sin default de cuenta: "Lugar no especificado", inferred true, source none', () => {
    const res = validateVenue(null, null, 'texto sin mención del lugar', null)
    expect(res).toEqual({ name: 'Lugar no especificado', inferred: true, source: 'none' })
  })

  it('nombre extraído igual al default de la cuenta pero ausente del texto: inferred true', () => {
    const res = validateVenue('Venue de Prueba', 'Venue de Prueba', 'Sin mención del lugar en el texto', null)
    expect(res).toEqual({ name: 'Venue de Prueba', inferred: true, source: 'account_default' })
  })

  it('con tildes y artículo distintos, igual matchea literal: inferred false', () => {
    const res = validateVenue('El Peñón', null, 'Estamos en Penon toda la noche', null)
    expect(res).toEqual({ name: 'El Peñón', inferred: false, source: 'flyer' })
  })

  it('"Flow" no matchea por substring dentro de "Flower": inferred true, no false', () => {
    const res = validateVenue('Flow', null, 'Nos vemos en el Flower Garden', null)
    expect(res.inferred).toBe(true)
    expect(res.name).toBe('Flow')
  })

  it('nombre con metacaracteres de regex ("Bar (El Patio)") no rompe el matching', () => {
    const res = validateVenue('Bar (El Patio)', null, 'Te esperamos en bar (el patio) este viernes', null)
    expect(res).toEqual({ name: 'Bar (El Patio)', inferred: false, source: 'flyer' })
  })

  it('nombre con metacaracteres y SIN match en el texto: no rompe, solo queda inferred true', () => {
    const res = validateVenue('Bar (El Patio) ++', null, 'texto sin ninguna mención del lugar', null)
    expect(res.inferred).toBe(true)
    expect(res.name).toBe('Bar (El Patio) ++')
  })

  it('nombre de varias palabras que aparece completo y en orden: inferred false', () => {
    const res = validateVenue('La Vieja Estación', null, 'La fiesta es en la vieja estacion de trenes', null)
    expect(res).toEqual({ name: 'La Vieja Estación', inferred: false, source: 'flyer' })
  })

  it('nombre de varias palabras que NO aparece completo (falta una palabra): inferred true', () => {
    const res = validateVenue('La Vieja Estación', null, 'La fiesta es en la estacion de trenes', null)
    expect(res.inferred).toBe(true)
  })

  it('nombre extraído distinto del default de la cuenta y ausente del texto: igual se usa, inferred true', () => {
    const res = validateVenue('Otro Lugar De Prueba', 'Venue de Prueba', 'texto sin mención del lugar', null)
    expect(res.name).toBe('Otro Lugar De Prueba')
    expect(res.inferred).toBe(true)
  })
})

// --- processFlyerWithAI: venue_inferred no cambia la autopublicación -------------------------
const db = vi.hoisted(() => ({
  flyer: null as Record<string, unknown> | null,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}))
const extract = vi.hoisted(() => vi.fn())
const upsertEvent = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = () => c
      c.single = async () => ({ data: db.flyer, error: null })
      c.update = (payload: Record<string, unknown>) => {
        db.updates.push({ table, payload })
        return c
      }
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(res, rej)
      return c
    },
  }),
}))
vi.mock('@/lib/ai/gemini', () => ({ extractEventFromFlyer: extract }))
vi.mock('@/lib/scraper/save-to-supabase', () => ({
  upsertVenue: async () => 'venue-de-prueba-id',
  resolveCategoryId: async () => 'categoria-de-prueba-id',
}))
vi.mock('@/lib/scraper/deduplicate', () => ({ upsertEventWithDeduplication: upsertEvent }))

import { processFlyerWithAI } from '@/lib/ai/process-flyer-ai'

function flyer(caption: string, accountOverrides: Record<string, unknown> = {}) {
  return {
    id: 'flyer-de-prueba',
    caption,
    ai_status: 'PENDING',
    storage_image_url: 'https://imagenes.ejemplo.test/flyer.jpg',
    ig_post_id: 'ig-prueba',
    ig_post_url: 'https://instagram.ejemplo.test/p/prueba',
    published_at: '2030-10-01T00:00:00.000Z',
    account: {
      username: 'cuenta_de_prueba',
      default_venue_name: null,
      default_category: null,
      ...accountOverrides,
    },
  }
}

function modelo(extra: Record<string, unknown> = {}) {
  return {
    title: 'Show de Prueba',
    date: '2031-05-20',
    start_time: '21:00',
    price: 500,
    venue_name: null,
    category_slug: 'boliches',
    artists: [],
    flyer_text: 'SHOW DE PRUEBA 21:00',
    ...extra,
  }
}

const eventPayload = () => upsertEvent.mock.calls[0][0] as Record<string, unknown>

beforeEach(() => {
  db.updates.length = 0
  upsertEvent.mockReset()
  upsertEvent.mockResolvedValue({ eventId: 'evento-de-prueba-id', action: 'insert' })
  extract.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('processFlyerWithAI: venue_inferred solo marca, no cambia la autopublicación (QPS-070)', () => {
  it('sin venue_name extraído (usa el default de la cuenta): igual autopublica si el resto es confiable', async () => {
    db.flyer = flyer('Show de Prueba 21 hs en el boliche.', { default_venue_name: 'Boliche De Prueba' })
    extract.mockResolvedValue(modelo())
    const res = await processFlyerWithAI('flyer-de-prueba')
    expect(res.success).toBe(true)
    const ev = eventPayload()
    expect(ev.status).toBe('PUBLISHED')
    const meta = ev.ai_metadata as Record<string, unknown>
    expect(meta.venue_inferred).toBe(true)
    expect(meta.venue_source).toBe('account_default')
  })

  it('venue_name extraído confirmado literal en el caption: inferred false, también autopublica', async () => {
    db.flyer = flyer('Show de Prueba 21 hs en Boliche De Prueba.', { default_venue_name: null })
    extract.mockResolvedValue(modelo({ venue_name: 'Boliche De Prueba' }))
    const res = await processFlyerWithAI('flyer-de-prueba')
    expect(res.success).toBe(true)
    const ev = eventPayload()
    expect(ev.status).toBe('PUBLISHED')
    const meta = ev.ai_metadata as Record<string, unknown>
    expect(meta.venue_inferred).toBe(false)
    expect(meta.venue_source).toBe('flyer')
  })
})
