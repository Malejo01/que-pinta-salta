// Ronda 14 / tarea 14-b (QPS-073): de dónde sale la fecha de un borrador nacido de un flyer de
// Instagram. "El modelo extrae, el código decide": acá se prueba que processFlyerWithAI deje
// escrito `ai_metadata.date_source` ('flyer' | 'published_at') tanto en el evento como en el
// flyer, y que esa marca no cambie en nada la lógica de auto-publicación, que sigue dependiendo
// de los mismos campos de siempre (título, fecha, hora confiable, lugar).
// Sin red, sin Gemini, sin base: todo mockeado. Fixtures inventados ("Venue de Prueba", etc.).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

/** published_at fantasía: instante UTC "real" tal como lo entrega Apify, sin convertir. */
const PUBLISHED_AT = '2030-09-15T02:00:00.000Z'

function flyer(caption: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'flyer-de-prueba',
    caption,
    ai_status: 'PENDING',
    storage_image_url: 'https://imagenes.ejemplo.test/flyer.jpg',
    ig_post_id: 'ig-prueba',
    ig_post_url: 'https://instagram.ejemplo.test/p/prueba',
    published_at: PUBLISHED_AT,
    account: { username: 'cuenta_de_prueba', default_venue_name: null, default_category: null },
    ...overrides,
  }
}

function modelo(extra: Record<string, unknown> = {}) {
  return {
    title: 'Fiesta de Prueba',
    date: '2030-10-31',
    start_time: '20:00',
    price: 0,
    venue_name: 'Venue de Prueba',
    category_slug: 'boliches',
    artists: [],
    flyer_text: 'FIESTA DE PRUEBA VENUE DE PRUEBA 20HS',
    ...extra,
  }
}

const eventPayload = () => upsertEvent.mock.calls[0][0] as Record<string, unknown>
const eventMeta = () => eventPayload().ai_metadata as Record<string, unknown>
const flyerUpdate = () => db.updates.find((u) => u.table === 'instagram_flyers' && 'ai_metadata' in u.payload)!.payload
const flyerMeta = () => flyerUpdate().ai_metadata as Record<string, unknown>

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

describe('processFlyerWithAI: ai_metadata.date_source (QPS-073)', () => {
  it('sin fecha extraída: date_source "published_at" en el evento y en el flyer, y la fecha queda en published_at sin convertir', async () => {
    db.flyer = flyer('Fiesta de Prueba en Venue de Prueba.')
    extract.mockResolvedValue(modelo({ date: null }))

    const res = await processFlyerWithAI('flyer-de-prueba')

    expect(res.success).toBe(true)
    expect(eventPayload().start_date).toBe(PUBLISHED_AT)
    expect(eventMeta().date_source).toBe('published_at')
    expect(flyerMeta().date_source).toBe('published_at')
  })

  it('con fecha extraída válida: date_source "flyer" en el evento y en el flyer', async () => {
    db.flyer = flyer('Fiesta de Prueba en Venue de Prueba. Viernes 31 de octubre a las 20hs.')
    extract.mockResolvedValue(modelo())

    const res = await processFlyerWithAI('flyer-de-prueba')

    expect(res.success).toBe(true)
    expect(eventMeta().date_source).toBe('flyer')
    expect(flyerMeta().date_source).toBe('flyer')
    // La fecha extraída sí se convierte de hora de pared de Salta a UTC (a diferencia del
    // camino sin fecha, que usa published_at tal cual).
    expect(eventPayload().start_date).toBe('2030-10-31T23:00:00.000Z')
  })

  it('camino de falla (Gemini lanza una excepción): date_source "published_at" e is_fallback true, en el evento y en el flyer', async () => {
    db.flyer = flyer('Fiesta de Prueba en Venue de Prueba.')
    extract.mockRejectedValue(new Error('fallo de prueba de Gemini'))

    const res = await processFlyerWithAI('flyer-de-prueba')

    expect(res.success).toBe(false)
    const ev = eventPayload()
    expect((ev.ai_metadata as Record<string, unknown>).date_source).toBe('published_at')
    expect((ev.ai_metadata as Record<string, unknown>).is_fallback).toBe(true)
    expect(ev.start_date).toBe(PUBLISHED_AT)
    const flyerUpd = db.updates.find((u) => u.table === 'instagram_flyers' && 'ai_status' in u.payload)!.payload
    const meta = flyerUpd.ai_metadata as Record<string, unknown>
    expect(meta.date_source).toBe('published_at')
    expect(meta.is_fallback).toBe(true)
    expect(flyerUpd.ai_status).toBe('FAILED')
  })

  it('la autopublicación no depende de date_source: sin fecha, no autopublica aunque el título, la hora y el lugar sean confiables', async () => {
    db.flyer = flyer('Fiesta de Prueba en Venue de Prueba a las 21hs.')
    extract.mockResolvedValue(modelo({ date: null, start_time: '21:00', flyer_text: 'FIESTA DE PRUEBA 21HS' }))

    await processFlyerWithAI('flyer-de-prueba')

    const ev = eventPayload()
    expect(ev.status).toBe('DRAFT')
    expect((ev.ai_metadata as Record<string, unknown>).auto_published).toBe(false)
    expect((ev.ai_metadata as Record<string, unknown>).date_source).toBe('published_at')
    // La hora sí era confiable: lo que bloquea la autopublicación es la fecha, no date_source.
    expect((ev.ai_metadata as Record<string, unknown>).time_reliable).toBe(true)
  })

  it('la autopublicación no depende de date_source: con fecha y el resto completo, autopublica igual que antes de QPS-073', async () => {
    db.flyer = flyer('Fiesta de Prueba en Venue de Prueba. Viernes 31 de octubre a las 20hs.')
    extract.mockResolvedValue(modelo())

    await processFlyerWithAI('flyer-de-prueba')

    const ev = eventPayload()
    expect(ev.status).toBe('PUBLISHED')
    expect((ev.ai_metadata as Record<string, unknown>).auto_published).toBe(true)
    expect((ev.ai_metadata as Record<string, unknown>).date_source).toBe('flyer')
  })
})
