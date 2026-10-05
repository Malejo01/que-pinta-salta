import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
const withJobRun = vi.fn()

const scrapeNorteTicket = vi.fn()
const scrapeEntradaUno = vi.fn()
const scrapeAlpogo = vi.fn()
const upsertEventWithDeduplication = vi.fn()
const resolveCategoryWithAliases = vi.fn()
const archiveExpiredFlyers = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))
vi.mock('@/lib/job-runs', () => ({
  withJobRun: (...a: unknown[]) => withJobRun(...a),
  jobTriggerFrom: () => 'test',
}))
vi.mock('@/app/api/cron/scrape/providers', () => ({
  scrapeNorteTicket: () => scrapeNorteTicket(),
  scrapeEntradaUno: () => scrapeEntradaUno(),
  scrapeAlpogo: () => scrapeAlpogo(),
}))
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...a: unknown[]) => upsertEventWithDeduplication(...a),
}))
vi.mock('@/lib/scraper/categorize', () => ({
  resolveCategoryWithAliases: (...a: unknown[]) => resolveCategoryWithAliases(...a),
}))
vi.mock('@/lib/instagram/process-apify-payload', () => ({
  archiveExpiredFlyers: () => archiveExpiredFlyers(),
}))

import { GET } from '@/app/api/cron/scrape/route'
import { runScrapeJob } from '@/app/api/cron/scrape/run-scrape-job'

const SECRETO = 'secreto-falso-de-prueba'
const entorno = process.env.CRON_SECRET

const evento = (rawVenueName: string) => ({
  title: 'Evento de Prueba',
  rawVenueName,
  dateTime: new Date('2026-12-01T22:00:00Z'),
  priceFrom: 1000,
  flyerUrl: 'https://example.test/flyer.jpg',
  ticketLink: 'https://example.test/entradas',
  source: 'norteticket',
})

beforeEach(() => {
  for (const m of [createAdminClient, withJobRun, scrapeNorteTicket, scrapeEntradaUno, scrapeAlpogo,
    upsertEventWithDeduplication, resolveCategoryWithAliases, archiveExpiredFlyers]) m.mockReset()
  process.env.CRON_SECRET = SECRETO
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  scrapeEntradaUno.mockResolvedValue([])
  scrapeAlpogo.mockResolvedValue([])
  resolveCategoryWithAliases.mockResolvedValue('cat-de-prueba')
  upsertEventWithDeduplication.mockResolvedValue({ success: true, action: 'insert', eventId: 'ev-1' })
  archiveExpiredFlyers.mockResolvedValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
  if (entorno === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entorno
})

/** Cliente falso: la RPC responde lo que diga `rpc`; categories devuelve un slug. */
function clienteFalso(rpc: () => unknown) {
  return {
    rpc: () => Promise.resolve(rpc()),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { slug: 'teatro' } }) }) }),
    }),
  }
}

describe('runScrapeJob: errores de venue', () => {
  it('una falla de resolve_venue_id queda en venueErrors y el evento se crea sin lugar', async () => {
    scrapeNorteTicket.mockResolvedValue([evento('Lugar Inventado QA')])
    createAdminClient.mockReturnValue(
      clienteFalso(() => ({ data: null, error: { message: 'function min(uuid) does not exist' } }))
    )
    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')
    expect(r.venueErrors).toEqual(['venue: Lugar Inventado QA: function min(uuid) does not exist'])
    expect(upsertEventWithDeduplication).toHaveBeenCalledTimes(1)
    expect(upsertEventWithDeduplication.mock.calls[0][0].venue_id).toBeNull()
    expect(r.database.inserted).toBe(1)
  })

  it('sin fallas, venueErrors queda vacio y el evento lleva el venue_id', async () => {
    scrapeNorteTicket.mockResolvedValue([evento('Lugar Inventado QA')])
    createAdminClient.mockReturnValue(clienteFalso(() => ({ data: 'venue-id-de-prueba', error: null })))
    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')
    expect(r.venueErrors).toEqual([])
    expect(upsertEventWithDeduplication.mock.calls[0][0].venue_id).toBe('venue-id-de-prueba')
  })

  it('mensajes muy largos se recortan a 200 caracteres', async () => {
    scrapeNorteTicket.mockResolvedValue([evento('Lugar Inventado QA')])
    createAdminClient.mockReturnValue(clienteFalso(() => ({ data: null, error: { message: 'x'.repeat(1000) } })))
    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')
    expect(r.venueErrors[0].length).toBeLessThanOrEqual(200)
    expect(r.venueErrors[0].startsWith('venue: Lugar Inventado QA: ')).toBe(true)
  })
})

describe('GET /api/cron/scrape: estado de la corrida', () => {
  /** Ejecuta la ruta con un resultado falso de runScrapeJob y devuelve el JobOutcome calculado. */
  async function outcomeDe(resultado: Record<string, unknown>) {
    let outcome: Record<string, unknown> | undefined
    withJobRun.mockImplementation(
      async (_k: string, _t: string, _work: unknown, toOutcome: (r: unknown) => Record<string, unknown>) => {
        outcome = toOutcome(resultado)
        return resultado
      }
    )
    await GET(new Request('http://localhost.test/api/cron/scrape', {
      headers: { authorization: `Bearer ${SECRETO}` },
    }))
    return outcome!
  }

  const base = {
    success: true,
    scraped: { norteticket: 1, total: 1 },
    sourceErrors: {},
    database: { inserted: 1, updated: 0, skipped: 0, errors: 0 },
    venueErrors: [] as string[],
    instagramCleanup: { archivedFlyers: 0 },
  }

  it('sin errores: SUCCESS', async () => {
    const o = await outcomeDe(base)
    expect(o.status).toBe('SUCCESS')
    expect(o.errors).toEqual([])
  })

  it('con error de venue: PARTIAL y el error va en errors', async () => {
    const o = await outcomeDe({ ...base, venueErrors: ['venue: Lugar Inventado QA: boom'] })
    expect(o.status).toBe('PARTIAL')
    expect(o.errors).toEqual(['venue: Lugar Inventado QA: boom'])
  })

  it('error de fuente y de venue juntos: PARTIAL con ambos', async () => {
    const o = await outcomeDe({
      ...base,
      sourceErrors: { alpogo: 'timeout' },
      venueErrors: ['venue: Lugar Inventado QA: boom'],
    })
    expect(o.status).toBe('PARTIAL')
    expect(o.errors).toEqual(['alpogo: timeout', 'venue: Lugar Inventado QA: boom'])
  })

  it('solo error de fuente: sigue PARTIAL', async () => {
    const o = await outcomeDe({ ...base, sourceErrors: { alpogo: 'timeout' } })
    expect(o.status).toBe('PARTIAL')
  })
})
