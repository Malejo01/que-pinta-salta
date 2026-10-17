import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ronda 40 (tarea 40-d): entradauno y vamos mandan un ítem por espectáculo
// (start_date es la primera función, end_date la última), así que el slug
// lleva la fecha/hora de la primera función (`slugConFechaHora`, de
// `@qps/core/scraper/slug-fecha-hora`, tarea 40-a). Mismo patrón que
// tests/scraper/manual-venue-errors.test.ts: `saveEventsToSupabase` mockeado
// y `fetch` stubeado con payloads inventados, sin red ni base.

const saveEventsToSupabase = vi.fn()
vi.mock('@/lib/scraper/save-to-supabase', () => ({
  saveEventsToSupabase: (...a: unknown[]) => saveEventsToSupabase(...a),
}))

import { scrapeEntradaUno } from '@/lib/scraper/entradauno-scraper'
import { scrapeVamosGobAr } from '@/lib/scraper/vamos-scraper'

beforeEach(() => {
  saveEventsToSupabase.mockReset()
  saveEventsToSupabase.mockResolvedValue({ inserted: 1, skipped: 0, errors: [], venueErrors: [] })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('entradauno-scraper: el slug lleva la fecha/hora de la primera función', () => {
  it('oFuncionLista con dos funciones desordenadas: el slug usa la primera (20/11), no la del array', async () => {
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
              // Desordenada a propósito: la del 22 llega primero en el array.
              oFuncionLista: [
                { dFuncion: '2026-11-22T21:00:00' },
                { dFuncion: '2026-11-20T21:00:00' },
              ],
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

    await scrapeEntradaUno()

    expect(saveEventsToSupabase).toHaveBeenCalledTimes(1)
    const [events] = saveEventsToSupabase.mock.calls[0]
    expect(events).toHaveLength(1)
    expect(events[0].slug).toBe('show-de-fantasia-2026-11-20-2100')
  })

  it('solo oFuncionMenor, con dFuncion sin hora ("2026-11-20"): el slug no lleva hora', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        oData: {
          oCartelera: {
            listaEspectaculoCartel: [{
              cNombre: 'Show Sin Funciones',
              cSeo: 'show-sin-funciones',
              cHashValidacion: 'hash-de-prueba',
              cDescripcion: '',
              listaIdEstablecimiento: [1],
              oFuncionMenor: { oFuncionFecha: { dFuncion: '2026-11-20' } },
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

    await scrapeEntradaUno()

    expect(saveEventsToSupabase).toHaveBeenCalledTimes(1)
    const [events] = saveEventsToSupabase.mock.calls[0]
    expect(events).toHaveLength(1)
    expect(events[0].slug).toBe('show-sin-funciones-2026-11-20')
  })
})

describe('vamos-scraper: el slug lleva la fecha/hora de la primera función', () => {
  it('primera función a las 11:00: el slug termina en -2026-11-20-1100', async () => {
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
              oFuncionLista: [{ dFuncion: '2026-11-20T11:00:00' }],
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

    await scrapeVamosGobAr()

    expect(saveEventsToSupabase).toHaveBeenCalledTimes(1)
    const [events] = saveEventsToSupabase.mock.calls[0]
    expect(events).toHaveLength(1)
    expect(events[0].slug).toBe('show-de-fantasia-2026-11-20-1100')
  })
})
