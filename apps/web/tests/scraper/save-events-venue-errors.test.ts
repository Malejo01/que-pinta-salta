import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cliente falso de @supabase/supabase-js: la RPC resuelve lo que diga `rpc`, categorías y
// alias responden vacío/benigno (no son el foco de este test). Sin red ni base.
const rpc = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    from: (table: string) => {
      if (table === 'categories') {
        const single = () => Promise.resolve({ data: { id: 'cat-id-de-prueba' } })
        return { select: () => ({ eq: () => ({ single }), order: () => ({ limit: () => ({ single }) }) }) }
      }
      if (table === 'aliases') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }
      }
      throw new Error('tabla inesperada: ' + table)
    },
  }),
}))

const upsertEventWithDeduplication = vi.fn()
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...a: unknown[]) => upsertEventWithDeduplication(...a),
}))

import { saveEventsToSupabase } from '@/lib/scraper/save-to-supabase'

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY_ENV = process.env.SUPABASE_SERVICE_ROLE_KEY

const evento = (venue: string, titulo = 'Evento de Prueba') => ({
  title: titulo,
  slug: `evento-de-prueba-${venue.toLowerCase().replace(/\s+/g, '-')}`,
  venue,
  start_date: '2026-12-01T22:00:00Z',
  price_min: 0,
  is_free: false,
})

beforeEach(() => {
  rpc.mockReset()
  upsertEventWithDeduplication.mockReset()
  upsertEventWithDeduplication.mockResolvedValue({ success: true, action: 'insert', eventId: 'ev-de-prueba' })
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (URL_ENV === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = URL_ENV
  if (KEY_ENV === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_ENV
})

describe('saveEventsToSupabase: venueErrors', () => {
  it('sin fallas de venue: venueErrors queda vacío y el evento lleva venue_id', async () => {
    rpc.mockResolvedValue({ data: 'venue-id-de-prueba', error: null })
    const r = await saveEventsToSupabase([evento('Venue de Prueba')], 'test-source')
    expect(r.venueErrors).toEqual([])
    expect(r.inserted).toBe(1)
    expect(upsertEventWithDeduplication.mock.calls[0][0].venue_id).toBe('venue-id-de-prueba')
  })

  it('una falla de resolve_venue_id queda formateada en venueErrors y el evento se guarda sin lugar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function min(uuid) does not exist' } })
    const r = await saveEventsToSupabase([evento('Lugar Inventado QA')], 'test-source')
    expect(r.venueErrors).toEqual(['venue: Lugar Inventado QA: function min(uuid) does not exist'])
    expect(r.inserted).toBe(1)
    expect(upsertEventWithDeduplication.mock.calls[0][0].venue_id).toBeNull()
    expect(r.errors).toEqual([]) // la falla de venue no es un error de guardado
  })

  it('junta los mensajes de varios eventos en orden, sin deduplicar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eventos = [evento('Venue A'), evento('Venue A', 'Otro evento'), evento('Venue B')]
    const r = await saveEventsToSupabase(eventos, 'test-source')
    expect(r.venueErrors).toEqual(['venue: Venue A: boom', 'venue: Venue A: boom', 'venue: Venue B: boom'])
    expect(r.inserted).toBe(3)
  })

  it('mezcla de eventos con y sin falla de venue: solo los fallidos van a venueErrors', async () => {
    rpc.mockImplementation((_fn: string, params: { p_raw: string }) =>
      Promise.resolve(
        params.p_raw === 'Venue Roto'
          ? { data: null, error: { message: 'boom' } }
          : { data: 'venue-id-de-prueba', error: null }
      )
    )
    const eventos = [evento('Venue Roto'), evento('Venue de Prueba')]
    const r = await saveEventsToSupabase(eventos, 'test-source')
    expect(r.venueErrors).toEqual(['venue: Venue Roto: boom'])
    expect(upsertEventWithDeduplication.mock.calls[0][0].venue_id).toBeNull()
    expect(upsertEventWithDeduplication.mock.calls[1][0].venue_id).toBe('venue-id-de-prueba')
  })

  it('mensajes largos quedan recortados a 200 caracteres dentro de venueErrors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x'.repeat(1000) } })
    const r = await saveEventsToSupabase([evento('Lugar Inventado QA')], 'test-source')
    // `venueErrors` es opcional en SaveResult (lo dejan sin llenar tres scrapers legacy que
    // construyen el resultado a mano); saveEventsToSupabase() siempre lo completa, así que
    // acá se afirma explícitamente antes de indexar, sin ensanchar el tipo con `!` ni `any`.
    expect(r.venueErrors).toBeDefined();
    const venueErrors = r.venueErrors ?? [];
    expect(venueErrors[0].length).toBeLessThanOrEqual(200)
    expect(venueErrors[0].startsWith('venue: Lugar Inventado QA: ')).toBe(true)
  })
})
