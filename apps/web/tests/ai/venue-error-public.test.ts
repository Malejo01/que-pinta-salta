import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
const extractEventFromFlyer = vi.fn()
const upsertVenue = vi.fn()
const resolveCategoryId = vi.fn()
const upsertEventWithDeduplication = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))
vi.mock('@/lib/ai/gemini', () => ({
  extractEventFromFlyer: (...a: unknown[]) => extractEventFromFlyer(...a),
}))
vi.mock('@/lib/scraper/save-to-supabase', () => ({
  upsertVenue: (...a: unknown[]) => upsertVenue(...a),
  resolveCategoryId: (...a: unknown[]) => resolveCategoryId(...a),
}))
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...a: unknown[]) => upsertEventWithDeduplication(...a),
}))

import { processFlyerWithAI } from '@/lib/ai/process-flyer-ai'

const MENSAJE_DE_BASE = 'function min(uuid) does not exist (detalle interno de prueba)'
const PUBLICO = 'no se pudo resolver el lugar'

type Update = Record<string, unknown>
let updates: Update[]

function clienteFalso(flyer: Record<string, unknown>) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: flyer, error: null }) }) }),
      update: (payload: Update) => {
        updates.push(payload)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  }
}

const flyerBase = {
  id: 'flyer-1',
  ig_post_id: 'post-1',
  ig_post_url: 'https://example.test/p/1',
  ai_status: 'PENDING',
  storage_image_url: 'https://example.test/flyer.jpg',
  caption: 'Flyer de prueba',
  published_at: '2026-12-01T12:00:00Z',
  account: { username: 'cuenta_de_prueba', default_venue_name: null, default_category: null },
}

beforeEach(() => {
  updates = []
  for (const m of [createAdminClient, extractEventFromFlyer, upsertVenue, resolveCategoryId,
    upsertEventWithDeduplication]) m.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  // Sin red: fetch es un doble local.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }))
  resolveCategoryId.mockResolvedValue('cat-de-prueba')
  upsertEventWithDeduplication.mockResolvedValue({ success: true, action: 'insert', eventId: 'ev-1' })
  // upsertVenue falla: avisa por onError y devuelve null, como resolveVenueId.
  upsertVenue.mockImplementation(async (_n: string, _s: string, onError?: (r: string, m: string) => void) => {
    onError?.('Lugar Inventado QA', MENSAJE_DE_BASE)
    return null
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('processFlyerWithAI: venue_error publico', () => {
  it('camino normal: ai_metadata del evento y del flyer llevan el texto fijo, nunca el mensaje de la base', async () => {
    createAdminClient.mockReturnValue(clienteFalso(flyerBase))
    extractEventFromFlyer.mockResolvedValue({
      title: 'Evento de Prueba', date: '2999-01-01', start_time: '21:00', price: 1000,
      venue_name: 'Lugar Inventado QA', category_slug: 'teatro', artists: [],
    })
    const r = await processFlyerWithAI('flyer-1')

    const eventData = upsertEventWithDeduplication.mock.calls[0][0]
    expect(eventData.ai_metadata.venue_error).toBe(PUBLICO)
    const flyerUpdate = updates.find((u) => u.ai_status === 'PROCESSED') as { ai_metadata: Record<string, unknown> }
    expect(flyerUpdate.ai_metadata.venue_error).toBe(PUBLICO)

    expect(JSON.stringify([eventData.ai_metadata, updates])).not.toContain('min(uuid)')
    // El detalle completo va solo al resultado (job_runs).
    expect(r.venueError).toContain(MENSAJE_DE_BASE)
    expect(r.venueError).toContain('Lugar Inventado QA')
  })

  it('camino fallback (Gemini falla): mismo texto fijo', async () => {
    createAdminClient.mockReturnValue(clienteFalso(flyerBase))
    extractEventFromFlyer.mockRejectedValue(new Error('gemini caido (prueba)'))
    const r = await processFlyerWithAI('flyer-1')

    const eventData = upsertEventWithDeduplication.mock.calls[0][0]
    expect(eventData.ai_metadata.venue_error).toBe(PUBLICO)
    const flyerUpdate = updates.find((u) => u.ai_metadata) as { ai_metadata: Record<string, unknown> }
    expect(flyerUpdate.ai_metadata.venue_error).toBe(PUBLICO)
    expect(JSON.stringify([eventData.ai_metadata, updates])).not.toContain('min(uuid)')
    expect(r.venueError).toContain(MENSAJE_DE_BASE)
  })

  it('sin falla de venue: no hay venue_error', async () => {
    upsertVenue.mockResolvedValue('venue-id-de-prueba')
    createAdminClient.mockReturnValue(clienteFalso(flyerBase))
    extractEventFromFlyer.mockResolvedValue({
      title: 'Evento de Prueba', date: '2999-01-01', start_time: '21:00', price: 1000,
      venue_name: 'Lugar Inventado QA', category_slug: 'teatro', artists: [],
    })
    const r = await processFlyerWithAI('flyer-1')
    expect(upsertEventWithDeduplication.mock.calls[0][0].ai_metadata).not.toHaveProperty('venue_error')
    expect(r.venueError).toBeUndefined()
  })
})
