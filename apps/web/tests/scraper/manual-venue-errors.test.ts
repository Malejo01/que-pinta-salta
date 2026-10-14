import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ronda 13 (tarea 13-b): la propagación de `venueErrors` desde `saveEventsToSupabase`
// (ya cubierto por tests/scraper/save-events-venue-errors.test.ts) hasta el resultado
// que vuelve al navegador. Sin red ni base: `saveEventsToSupabase` se mockea entero en
// los tres scrapers legacy (alpogo/entradauno/vamos) y `fetch` se stubea con payloads
// mínimos inventados para que cada scraper llegue a construir al menos un evento.

const saveEventsToSupabase = vi.fn()
vi.mock('@/lib/scraper/save-to-supabase', () => ({
  saveEventsToSupabase: (...a: unknown[]) => saveEventsToSupabase(...a),
}))

const scrapeNorteticketSalta = vi.fn()
vi.mock('@/lib/scraper/norteticket-scraper', () => ({
  scrapeNorteticketSalta: (...a: unknown[]) => scrapeNorteticketSalta(...a),
}))

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const runScrapeJob = vi.fn()
vi.mock('@/app/api/cron/scrape/run-scrape-job', () => ({
  runScrapeJob: (...a: unknown[]) => runScrapeJob(...a),
}))

import { scrapeAlpogoSalta } from '@/lib/scraper/alpogo-scraper'
import { scrapeEntradaUno } from '@/lib/scraper/entradauno-scraper'
import { scrapeVamosGobAr } from '@/lib/scraper/vamos-scraper'
import { triggerScrape, runScrapeJobNow } from '@/lib/scraper-actions'

/** Sesión falsa para `ensureAdmin()`: solo responde la tabla `profiles`; cualquier
 * otra tabla tira para que ensureSourceRow/startRun la atrapen en su catch y
 * sigan con null (así no hace falta mockear scrape_sources/scrape_runs). */
function fakeAdminSession(user: { id: string } | null, role: string | null) {
  const single = vi.fn(async () => ({ data: role !== null ? { role } : null }))
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (t: string) => {
      if (t === 'profiles') return { select: () => ({ eq: () => ({ single }) }) }
      throw new Error('tabla no mockeada en este test: ' + t)
    },
  })
}

const ADMIN = { id: 'admin-de-prueba' }

beforeEach(() => {
  for (const m of [saveEventsToSupabase, scrapeNorteticketSalta, createClient, runScrapeJob]) m.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('scrapers legacy: venueErrors de saveEventsToSupabase llega al resultado acumulado', () => {
  it('alpogo-scraper', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{
        nombre: 'Show de Fantasía',
        fecha_funcion: '2026-12-01 22:00:00',
        descripcion: 'Un show de prueba',
        actividad: 'Recital',
        lugar: 'Lugar Inventado QA',
        menor_precio: '1000',
        gratuito: '0',
        urlCompra: 'https://alpogo.test/comprar',
      }]),
    }))
    saveEventsToSupabase.mockResolvedValue({
      inserted: 1, skipped: 0, errors: [],
      venueErrors: ['venue: Lugar Inventado QA: boom'],
    })

    const r = await scrapeAlpogoSalta()

    expect(saveEventsToSupabase).toHaveBeenCalledTimes(1)
    expect(r.venueErrors).toEqual(['venue: Lugar Inventado QA: boom'])
    expect(r.inserted).toBe(1)
  })

  it('entradauno-scraper', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        oData: {
          oCartelera: {
            listaEspectaculoCartel: [{
              cNombre: 'Show de Fantasía',
              cSeo: 'show-de-fantasia',
              cHashValidacion: 'hash-de-prueba',
              cDescripcion: '',
              listaIdEstablecimiento: [1],
              oFuncionLista: [{ dFuncion: '2026-12-01T22:00:00' }],
              fPrecioDesde: 1000,
              listaImagen: [],
            }],
            listaEstablecimiento: [{
              idEstablecimiento: 1,
              cNombre: 'Lugar Inventado QA',
              cZona: 'Salta',
              idProvincia: 16,
              cDomicilio: 'Calle Falsa 123',
              cGoogleMapTag: null,
            }],
          },
        },
      }),
    }))
    saveEventsToSupabase.mockResolvedValue({
      inserted: 1, skipped: 0, errors: [],
      venueErrors: ['venue: Lugar Inventado QA: boom'],
    })

    const r = await scrapeEntradaUno()

    expect(saveEventsToSupabase).toHaveBeenCalledTimes(1)
    expect(saveEventsToSupabase.mock.calls[0][1]).toBe('entradauno')
    expect(r.venueErrors).toEqual(['venue: Lugar Inventado QA: boom'])
    expect(r.inserted).toBe(1)
  })

  it('vamos-scraper', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        nCode: 200,
        oData: {
          oCartelera: {
            listaEspectaculoCartel: [{
              idEspectaculoCartel: 1,
              cNombre: 'Show de Fantasía',
              cDescripcion: '',
              cDescripcion_l172: '',
              cSeo: 'show-de-fantasia',
              cHashValidacion: 'hash-de-prueba',
              fPrecioDesde: 1000,
              listaIdEstablecimiento: [1],
              oFuncionLista: [{ dFuncion: '2026-12-01T22:00:00' }],
              oFuncionMenor: null,
              listaImagen: [],
            }],
            listaEstablecimiento: [{
              idEstablecimiento: 1,
              cNombre: 'Lugar Inventado QA',
              cDomicilio: 'Calle Falsa 123',
              cSeo: 'lugar-inventado-qa',
              cGoogleMapTag: null,
            }],
          },
        },
      }),
    }))
    saveEventsToSupabase.mockResolvedValue({
      inserted: 1, skipped: 0, errors: [],
      venueErrors: ['venue: Lugar Inventado QA: boom'],
    })

    const r = await scrapeVamosGobAr()

    expect(saveEventsToSupabase).toHaveBeenCalledTimes(1)
    expect(saveEventsToSupabase.mock.calls[0][1]).toBe('vamos')
    expect(r.venueErrors).toEqual(['venue: Lugar Inventado QA: boom'])
    expect(r.inserted).toBe(1)
  })
})

describe('executeSourceScrape (norteticket): propaga venueErrors al ScrapeResult', () => {
  it('triggerScrape() -> norteticket devuelve el venueErrors de saveEventsToSupabase', async () => {
    fakeAdminSession(ADMIN, 'ADMIN')
    // El contenido de los eventos no importa: saveEventsToSupabase está mockeado entero.
    scrapeNorteticketSalta.mockResolvedValue([{ title: 'Evento de Prueba' }])
    saveEventsToSupabase.mockResolvedValue({
      inserted: 1, skipped: 0, errors: [],
      venueErrors: ['venue: Lugar Inventado QA: boom'],
    })

    const r = await triggerScrape()

    expect(r.sourceKey).toBe('norteticket')
    expect(r.venueErrors).toEqual(['venue: Lugar Inventado QA: boom'])
    expect(r.inserted).toBe(1)
  })

  it('sin fallas de venue: venueErrors queda vacío', async () => {
    fakeAdminSession(ADMIN, 'ADMIN')
    scrapeNorteticketSalta.mockResolvedValue([{ title: 'Evento de Prueba' }])
    saveEventsToSupabase.mockResolvedValue({ inserted: 1, skipped: 0, errors: [], venueErrors: [] })

    const r = await triggerScrape()

    expect(r.venueErrors).toEqual([])
  })
})

describe('runScrapeJobNow', () => {
  const resultadoBase = {
    success: true,
    scraped: { norteticket: 1, total: 1 },
    sourceErrors: {},
    database: { inserted: 1, updated: 0, skipped: 0, errors: 0 },
    instagramCleanup: { archivedFlyers: 0 },
    timestamp: '2026-12-01T00:00:00.000Z',
  }

  it('con 50 mensajes de lugar: devuelve el resumen de summarizeVenueErrors, acotado, no los 50', async () => {
    fakeAdminSession(ADMIN, 'ADMIN')
    const venueErrors = Array.from({ length: 50 }, (_, i) => `venue: Lugar ${i}: boom`)
    runScrapeJob.mockResolvedValue({ ...resultadoBase, venueErrors })

    const r = await runScrapeJobNow()

    if ('error' in r) throw new Error('no debería fallar')
    // summarizeVenueErrors: hasta 5 mensajes distintos + 1 línea de resumen con el total.
    expect(r.venueErrors).toHaveLength(6)
    expect(r.venueErrors).toEqual([
      ...venueErrors.slice(0, 5),
      'venue: 50 mensajes de lugar sin resolver en total',
    ])
    expect(r.venueErrors).not.toEqual(venueErrors)
  })

  it('no autenticado: recibe error y no corre runScrapeJob', async () => {
    fakeAdminSession(null, null)

    const r = await runScrapeJobNow()

    expect(r).toEqual({ success: false, error: 'No autenticado' })
    expect(runScrapeJob).not.toHaveBeenCalled()
  })

  it('autenticado pero sin rol ADMIN: recibe error y no corre runScrapeJob', async () => {
    fakeAdminSession(ADMIN, 'USER')

    const r = await runScrapeJobNow()

    expect(r).toEqual({ success: false, error: 'Sin permisos de administrador' })
    expect(runScrapeJob).not.toHaveBeenCalled()
  })
})
