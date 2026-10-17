// Tarea 34-b (QPS-164, hallazgos 2 a 4): el filtro determinista de processFlyerWithAI se
// endurece en tres puntos, nunca se afloja.
//   1. La fecha extraída se valida contra el calendario, no solo contra la forma YYYY-MM-DD:
//      un 31/02, un mes 13, un día 0, un mes 0 o un 29/02 de un año no bisiesto son fechas
//      inválidas que mandan el evento a revisión (DRAFT) y nunca lo dejan autopublicarse. El
//      29/02 de un año bisiesto (2028) sigue siendo válido.
//   2. `tags` sale de `artists` solo si es un array de strings: string, número u objeto en
//      `artists` dan `tags: []`.
//   3. Un `title` que no es string (o que queda vacío al limpiarlo) se rechaza por validación,
//      no por una excepción que termine atrapada por el catch general de Gemini.
//
// Sin red, sin Gemini, sin base: todo mockeado, fixtures inventados (igual que
// tests/ai/process-flyer-ai.test.ts y tests/ai/process-flyer-ai-salidas-invalidas.test.ts).
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

function flyer(caption: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'flyer-de-prueba',
    caption,
    ai_status: 'PENDING',
    storage_image_url: 'https://imagenes.ejemplo.test/flyer.jpg',
    ig_post_id: 'ig-prueba',
    ig_post_url: 'https://instagram.ejemplo.test/p/prueba',
    published_at: '2030-10-01T00:00:00.000Z',
    account: { username: 'cuenta_de_prueba', default_venue_name: null, default_category: null },
    ...overrides,
  }
}

const eventPayload = () => upsertEvent.mock.calls[0][0] as Record<string, unknown>
const flyerProcessedUpdate = () =>
  db.updates.find((u) => u.table === 'instagram_flyers' && (u.payload as { ai_status?: string }).ai_status)
    ?.payload as Record<string, unknown> | undefined

// Reloj fijo (igual que process-flyer-ai-salidas-invalidas.test.ts): el control de "evento
// caducado" compara contra la fecha real del sistema, no contra published_at. Todas las fechas
// de estos fixtures son posteriores a esta.
const AHORA = new Date('2026-01-01T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('processFlyerWithAI: fecha contra el calendario (QPS-164, hallazgo 2)', () => {
  const CASOS_INVALIDOS: Array<[string, string]> = [
    ['31 de febrero', '2031-02-31'],
    ['mes 13', '2031-13-01'],
    ['día 0', '2031-01-00'],
    ['mes 0', '2031-00-15'],
    ['29 de febrero de un año no bisiesto (2031)', '2031-02-29'],
  ]

  for (const [nombre, fechaInvalida] of CASOS_INVALIDOS) {
    it(`${nombre} (${fechaInvalida}): va a revisión, nunca se autopublica y start_date sigue siendo un instante ISO válido`, async () => {
      db.flyer = flyer('Fiesta de Prueba.')
      extract.mockResolvedValue({
        title: 'Fiesta de Prueba',
        date: fechaInvalida,
        start_time: '20:00',
        venue_name: 'Venue de Prueba',
        flyer_text: 'FIESTA DE PRUEBA A LAS 20HS',
      })
      const res = await processFlyerWithAI('flyer-de-prueba')

      expect(res.success).toBe(true)
      const ev = eventPayload()
      // El test que importa: ninguna fecha de calendario inválida termina publicada.
      expect(ev.status).not.toBe('PUBLISHED')
      expect(ev.status).toBe('DRAFT')
      // start_date nunca queda roto: siempre es un instante ISO parseable (el fallback a
      // published_at, que ya lo es).
      expect(new Date(ev.start_date as string).toString()).not.toBe('Invalid Date')
      expect(ev.start_date).toBe('2030-10-01T00:00:00.000Z')
      expect((ev.ai_metadata as Record<string, unknown>).date_source).toBe('published_at')
    })
  }

  it('29 de febrero de 2028 (año bisiesto): sí es válido y puede autopublicarse con el resto de los datos confirmados', async () => {
    db.flyer = flyer('Show de Prueba 21 hs en Venue de Prueba.')
    extract.mockResolvedValue({
      title: 'Show de Prueba',
      date: '2028-02-29',
      start_time: '21:00',
      venue_name: 'Venue de Prueba',
    })
    const res = await processFlyerWithAI('flyer-de-prueba')

    expect(res.success).toBe(true)
    const ev = eventPayload()
    expect(ev.status).toBe('PUBLISHED')
    expect((ev.ai_metadata as Record<string, unknown>).date_source).toBe('flyer')
    expect(ev.start_date).toBe('2028-03-01T00:00:00.000Z') // 2028-02-29 21:00 Salta -> 00:00 UTC del día siguiente
  })
})

describe('processFlyerWithAI: tags solo sale de artists si es array de strings (QPS-164, hallazgo 3)', () => {
  it.each([
    ['string', 'Banda Suelta'],
    ['número', 42],
    ['null', null],
    // El caso que motiva la decisión de diseño del comentario de validateArtistsTags
    // (process-flyer-ai.ts): se descarta el array ENTERO si algún elemento no es string, no se
    // filtra elemento por elemento. Si se filtrara, este caso daría `tags: ['Banda X']`.
    ['array mixto', ['Banda X', 42, { raro: true }]],
  ])('artists como %s: tags queda en array vacío', async (_tipo, artistsValue) => {
    db.flyer = flyer('Caption de prueba.')
    extract.mockResolvedValue({
      title: 'Show de Prueba',
      date: '2030-10-31',
      start_time: '20:00',
      venue_name: 'Venue de Prueba',
      artists: artistsValue,
    })
    await processFlyerWithAI('flyer-de-prueba')
    expect(eventPayload().tags).toEqual([])
  })
})

describe('processFlyerWithAI: title inválido se rechaza por validación, no por excepción (QPS-164, hallazgo 4)', () => {
  it('title numérico: el flyer queda PROCESSED (camino normal de éxito), no FAILED (camino de excepción atrapada)', async () => {
    db.flyer = flyer('Caption de prueba.')
    extract.mockResolvedValue({
      title: 12345,
      date: '2030-10-31',
      start_time: '20:00',
      venue_name: 'Venue de Prueba',
    })
    const res = await processFlyerWithAI('flyer-de-prueba')

    expect(res.success).toBe(true)
    // Si el título numérico reventara en un .trim() y ese error lo atrapara el catch general,
    // el flyer quedaría FAILED (ver handleProcessingFallback). Comprobamos el camino, no solo
    // el resultado final: el flyer tiene que quedar PROCESSED.
    expect(flyerProcessedUpdate()?.ai_status).toBe('PROCESSED')
    const ev = eventPayload()
    expect(ev.title).toBe('Evento flyer @cuenta_de_prueba') // se descarta, no se usa "12345"
    expect(ev.status).toBe('DRAFT') // título inválido no califica para auto-publicación
    const meta = ev.ai_metadata as Record<string, unknown>
    expect(meta.is_fallback).toBeUndefined() // no pasó por el fallback de excepción
    expect(typeof meta.title_error).toBe('string') // mensaje claro de validación
  })

  it('title vacío después de limpiar (string de solo espacios): mismo rechazo por validación', async () => {
    db.flyer = flyer('Caption de prueba.')
    extract.mockResolvedValue({
      title: '   ',
      date: '2030-10-31',
      start_time: '20:00',
      venue_name: 'Venue de Prueba',
    })
    const res = await processFlyerWithAI('flyer-de-prueba')

    expect(res.success).toBe(true)
    expect(flyerProcessedUpdate()?.ai_status).toBe('PROCESSED')
    const ev = eventPayload()
    expect(ev.title).toBe('Evento flyer @cuenta_de_prueba')
    expect(ev.status).toBe('DRAFT')
  })
})

describe('processFlyerWithAI: los casos válidos de hoy siguen igual', () => {
  it('título, fecha, hora confirmada, lugar y artists válidos: autopublica con tags completos', async () => {
    db.flyer = flyer('Show de Prueba a las 20hs en Venue de Prueba.')
    extract.mockResolvedValue({
      title: 'Show de Prueba',
      date: '2030-10-31',
      start_time: '20:00',
      venue_name: 'Venue de Prueba',
      artists: ['Banda Uno', 'Banda Dos'],
    })
    const res = await processFlyerWithAI('flyer-de-prueba')

    expect(res.success).toBe(true)
    const ev = eventPayload()
    expect(ev.status).toBe('PUBLISHED')
    expect(ev.title).toBe('Show de Prueba')
    expect(ev.tags).toEqual(['Banda Uno', 'Banda Dos'])
    expect(ev.start_date).toBe('2030-10-31T23:00:00.000Z') // 20:00 Salta -> 23:00 UTC
  })

  it('sin artists (ausente): tags queda en array vacío, igual que antes', async () => {
    db.flyer = flyer('Caption de prueba.')
    extract.mockResolvedValue({ title: 'Show de Prueba', venue_name: 'Venue de Prueba' })
    await processFlyerWithAI('flyer-de-prueba')
    expect(eventPayload().tags).toEqual([])
  })
})
