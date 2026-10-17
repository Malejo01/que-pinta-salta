/**
 * Tarea 40-c: la hora en el slug de alpogo (scraper del admin) y del cron
 * diario (`run-scrape-job.ts`). Sin red ni base.
 *
 * Los tests corren con `TZ=UTC`. Para alpogo, `item.fecha_funcion` es la hora
 * de pared de Salta sin zona ("2026-11-20 21:00:00"), y `slugConFechaHora` la
 * convierte con `saltaWallClockToUtcISO` (ver `tests/core/slug-fecha-hora.test.ts`).
 * Para el cron, `event.dateTime` ya es un instante (`Date`); se arma con
 * offset `-03:00` explícito para que las 16:00/21:00 sean de verdad hora de
 * Salta y no UTC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- alpogo-scraper: mismo patrón que tests/scraper/manual-venue-errors.test.ts ---

const saveEventsToSupabase = vi.fn()
vi.mock('@/lib/scraper/save-to-supabase', () => ({
  saveEventsToSupabase: (...a: unknown[]) => saveEventsToSupabase(...a),
}))

import { scrapeAlpogoSalta } from '@/lib/scraper/alpogo-scraper'

// --- cron diario: mismo patrón que tests/scraper/cron-imagenes.test.ts ---

const createAdminClient = vi.fn()
const scrapeNorteTicket = vi.fn()
const scrapeEntradaUno = vi.fn()
const scrapeAlpogo = vi.fn()
const upsertEventWithDeduplication = vi.fn()
const resolveCategoryWithAliases = vi.fn()
const archiveExpiredFlyers = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))
vi.mock('@/app/api/cron/scrape/providers', () => ({
  scrapeNorteTicket: () => scrapeNorteTicket(),
  scrapeEntradaUno: () => scrapeEntradaUno(),
  scrapeAlpogo: () => scrapeAlpogo(),
}))
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...a: unknown[]) => upsertEventWithDeduplication(...a),
}))
// `inferCategorySlug` NO se mockea: es pura y la usa alpogo-scraper.ts; solo se
// reemplaza `resolveCategoryWithAliases`, que sí pega contra Supabase.
vi.mock('@/lib/scraper/categorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scraper/categorize')>()
  return {
    ...actual,
    resolveCategoryWithAliases: (...a: unknown[]) => resolveCategoryWithAliases(...a),
  }
})
vi.mock('@/lib/instagram/process-apify-payload', () => ({
  archiveExpiredFlyers: () => archiveExpiredFlyers(),
}))

const copyExternalImage = vi.fn()
const STORAGE_PREFIX = '/storage/v1/object/public/flyers_ig/'
vi.mock('@/lib/images/external', () => ({
  copyExternalImage: (...a: unknown[]) => copyExternalImage(...a),
  isOwnStorageUrl: (url: string | null | undefined) => Boolean(url && url.includes(STORAGE_PREFIX)),
}))

import { runScrapeJob } from '@/app/api/cron/scrape/run-scrape-job'

/** Cliente falso: resuelve venue y categoría sin red, y expone `storage.from()`. */
function clienteFalso() {
  return {
    rpc: () => Promise.resolve({ data: 'venue-id-de-prueba', error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { slug: 'teatro' } }) }) }),
    }),
    storage: { from: () => ({ marca: 'storage-de-prueba' }) },
  }
}

const eventoCron = (overrides: Partial<{ title: string; dateTime: Date }> = {}) => ({
  title: 'Show de Fantasía',
  rawVenueName: 'Venue de Prueba',
  dateTime: new Date('2026-11-20T21:00:00-03:00'),
  priceFrom: 1000,
  flyerUrl: null,
  ticketLink: 'https://example.test/entradas',
  source: 'norteticket',
  ...overrides,
})

beforeEach(() => {
  for (const m of [saveEventsToSupabase, createAdminClient, scrapeNorteTicket, scrapeEntradaUno,
    scrapeAlpogo, upsertEventWithDeduplication, resolveCategoryWithAliases, archiveExpiredFlyers,
    copyExternalImage]) {
    m.mockReset()
  }
  createAdminClient.mockReturnValue(clienteFalso())
  scrapeNorteTicket.mockResolvedValue([])
  scrapeEntradaUno.mockResolvedValue([])
  scrapeAlpogo.mockResolvedValue([])
  resolveCategoryWithAliases.mockResolvedValue('cat-de-prueba')
  upsertEventWithDeduplication.mockResolvedValue({ success: true, action: 'insert', eventId: 'ev-1' })
  archiveExpiredFlyers.mockResolvedValue(0)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('alpogo-scraper: la hora de la función va en el slug', () => {
  it('dos funciones del mismo show, a distinta hora: slugs distintos terminados en -HHmm', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          nombre: 'Show de Fantasía',
          fecha_funcion: '2026-11-20 16:00:00',
          descripcion: '',
          actividad: 'Recital',
          lugar: 'Lugar Inventado QA',
          menor_precio: '1000',
          gratuito: '0',
          urlCompra: 'https://alpogo.test/comprar-tarde',
        },
        {
          nombre: 'Show de Fantasía',
          fecha_funcion: '2026-11-20 21:00:00',
          descripcion: '',
          actividad: 'Recital',
          lugar: 'Lugar Inventado QA',
          menor_precio: '1000',
          gratuito: '0',
          urlCompra: 'https://alpogo.test/comprar-noche',
        },
      ]),
    }))
    saveEventsToSupabase.mockResolvedValue({ inserted: 2, skipped: 0, errors: [], venueErrors: [] })

    await scrapeAlpogoSalta()

    expect(saveEventsToSupabase).toHaveBeenCalledTimes(1)
    const eventosGuardados = saveEventsToSupabase.mock.calls[0][0] as Array<{ slug: string }>
    expect(eventosGuardados).toHaveLength(2)
    expect(eventosGuardados[0].slug).toMatch(/-2026-11-20-1600$/)
    expect(eventosGuardados[1].slug).toMatch(/-2026-11-20-2100$/)
    expect(eventosGuardados[0].slug).not.toBe(eventosGuardados[1].slug)
  })

  it('sin hora real (00:00 de Salta): el slug termina en el día, sin hora', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{
        nombre: 'Show de Fantasía',
        fecha_funcion: '2026-11-20 00:00:00',
        descripcion: '',
        actividad: 'Recital',
        lugar: 'Lugar Inventado QA',
        menor_precio: '1000',
        gratuito: '0',
        urlCompra: 'https://alpogo.test/comprar',
      }]),
    }))
    saveEventsToSupabase.mockResolvedValue({ inserted: 1, skipped: 0, errors: [], venueErrors: [] })

    await scrapeAlpogoSalta()

    const eventosGuardados = saveEventsToSupabase.mock.calls[0][0] as Array<{ slug: string }>
    expect(eventosGuardados[0].slug).toMatch(/-2026-11-20$/)
    expect(eventosGuardados[0].slug).not.toMatch(/-2026-11-20-\d{4}$/)
  })
})

describe('cron diario (run-scrape-job): la hora del evento va en el slug', () => {
  it('dos eventos del mismo título, a distinta hora: slugs distintos terminados en -HHmm', async () => {
    scrapeNorteTicket.mockResolvedValue([
      eventoCron({ dateTime: new Date('2026-11-20T16:00:00-03:00') }),
      eventoCron({ dateTime: new Date('2026-11-20T21:00:00-03:00') }),
    ])

    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no debería fallar')

    expect(upsertEventWithDeduplication).toHaveBeenCalledTimes(2)
    const slug1 = upsertEventWithDeduplication.mock.calls[0][0].slug as string
    const slug2 = upsertEventWithDeduplication.mock.calls[1][0].slug as string
    expect(slug1).toMatch(/-2026-11-20-1600$/)
    expect(slug2).toMatch(/-2026-11-20-2100$/)
    expect(slug1).not.toBe(slug2)
  })

  it('sin hora real (00:00 de Salta): el slug queda igual que hoy, título-día sin hora', async () => {
    scrapeNorteTicket.mockResolvedValue([
      eventoCron({ dateTime: new Date('2026-11-20T00:00:00-03:00') }),
    ])

    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no debería fallar')

    const slug = upsertEventWithDeduplication.mock.calls[0][0].slug as string
    expect(slug).toMatch(/-2026-11-20$/)
    expect(slug).not.toMatch(/-2026-11-20-\d{4}$/)
    expect(slug).toBe('show-de-fantasia-2026-11-20')
  })
})
