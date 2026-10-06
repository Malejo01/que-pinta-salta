import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Todo mockeado: sin red, sin Gemini, sin base.
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

const FLYER_TEXT = 'HALLOWEEN NIGHT VENUE DE PRUEBA DAMAS FREE'

function flyer(caption: string) {
  return {
    id: 'flyer-de-prueba',
    caption,
    ai_status: 'PENDING',
    storage_image_url: 'https://imagenes.ejemplo.test/flyer.jpg',
    ig_post_id: 'ig-prueba',
    ig_post_url: 'https://instagram.ejemplo.test/p/prueba',
    published_at: '2030-10-01T00:00:00.000Z',
    account: { username: 'cuenta_de_prueba', default_venue_name: null, default_category: null },
  }
}

function modelo(extra: Record<string, unknown> = {}) {
  return {
    title: 'Noche de Halloween de Prueba',
    date: '2030-10-31',
    start_time: '20:00',
    price: 0,
    venue_name: 'Venue de Prueba',
    category_slug: 'boliches',
    artists: [],
    flyer_text: FLYER_TEXT,
    ...extra,
  }
}

const eventPayload = () => upsertEvent.mock.calls[0][0] as Record<string, unknown>
const flyerUpdate = () => db.updates.find((u) => u.table === 'instagram_flyers' && 'ai_metadata' in u.payload)!.payload

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

describe('processFlyerWithAI: controles deterministas y ai_metadata', () => {
  it('"Free hasta las 2" con precio 0 del modelo: price_min 0 pero is_free false, y sin hora cae a 00:00 de Salta', async () => {
    db.flyer = flyer('Halloween Viernes 31 de octubre. Free hasta las 2.')
    extract.mockResolvedValue(modelo())
    const res = await processFlyerWithAI('flyer-de-prueba')
    expect(res.success).toBe(true)
    const ev = eventPayload()
    expect(ev.is_free).toBe(false)
    expect(ev.start_date).toBe('2030-10-31T03:00:00.000Z')
    expect(ev.status).toBe('DRAFT') // hora no confiable: no se autopublica
  })

  it('"Entrada libre y gratuita" con 21 hs escritas: is_free true y hora respetada, autopublica', async () => {
    db.flyer = flyer('Show de Prueba 21 hs. Entrada libre y gratuita.')
    extract.mockResolvedValue(modelo({ start_time: '21:00', flyer_text: 'SHOW DE PRUEBA' }))
    await processFlyerWithAI('flyer-de-prueba')
    const ev = eventPayload()
    expect(ev.is_free).toBe(true)
    expect(ev.start_date).toBe('2030-11-01T00:00:00.000Z')
    expect(ev.status).toBe('PUBLISHED')
  })

  it('flyer_text no se guarda en ai_metadata del evento ni del flyer, ni se devuelve', async () => {
    db.flyer = flyer('Halloween Viernes 31 de octubre. Free hasta las 2.')
    extract.mockResolvedValue(modelo())
    const res = await processFlyerWithAI('flyer-de-prueba')
    const meta = eventPayload().ai_metadata as Record<string, unknown>
    expect(JSON.stringify(meta)).not.toContain('flyer_text')
    expect(JSON.stringify(meta)).not.toContain(FLYER_TEXT)
    expect(JSON.stringify(flyerUpdate())).not.toContain('flyer_text')
    expect(JSON.stringify(flyerUpdate())).not.toContain(FLYER_TEXT)
    expect(JSON.stringify(res)).not.toContain('flyer_text')
    expect(res.extractedData).not.toHaveProperty('flyer_text')
  })

  it('flyer_text sí se usa para los controles: la hora escrita solo en el flyer es confiable', async () => {
    db.flyer = flyer('Halloween Viernes 31 de octubre.')
    extract.mockResolvedValue(modelo({ start_time: '22:00', price: null, flyer_text: 'DOORS 22:00 HS' }))
    await processFlyerWithAI('flyer-de-prueba')
    expect(eventPayload().start_date).toBe('2030-11-01T01:00:00.000Z')
    expect(eventPayload().status).toBe('PUBLISHED')
  })

  it('el flyer_text también puede mostrar condicionantes de gratuidad', async () => {
    db.flyer = flyer('Fiesta de Prueba 23 hs.')
    extract.mockResolvedValue(modelo({ start_time: '23:00', flyer_text: 'ENTRADA FREE CON LISTA' }))
    await processFlyerWithAI('flyer-de-prueba')
    expect(eventPayload().is_free).toBe(false)
  })
})
