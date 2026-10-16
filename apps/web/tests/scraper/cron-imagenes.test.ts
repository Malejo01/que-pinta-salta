import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mismo patrón que tests/cron/scrape-venue-errors.test.ts.
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
vi.mock('@/lib/scraper/categorize', () => ({
  resolveCategoryWithAliases: (...a: unknown[]) => resolveCategoryWithAliases(...a),
}))
vi.mock('@/lib/instagram/process-apify-payload', () => ({
  archiveExpiredFlyers: () => archiveExpiredFlyers(),
}))

// Mismo patrón que tests/scraper/imagen-storage.test.ts: se mockea el módulo
// entero y se reimplementa `isOwnStorageUrl` igual que la real ANTES del
// arreglo de seguridad (vuelta 1, 31-a): un `includes()` de texto libre
// sobre el prefijo de la URL pública, suficiente para estos tests de
// orquestación del cron (qué URL se copia, qué URL se guarda). Es un doble a
// propósito, simplificado: NO reproduce la validación real por host/path de
// `isOwnStorageUrl` (parseo con `new URL()`, comparación de `hostname` y
// `pathname`), así que este archivo no puede probar el caso de
// falsificación de URL (`https://sitio-malo.com/storage/.../flyers_ig/x.jpg`
// dando `true` con este doble). Ese caso de seguridad está cubierto, con la
// función real, en tests/images/external.test.ts.
const copyExternalImage = vi.fn()
const STORAGE_PREFIX = '/storage/v1/object/public/flyers_ig/'
vi.mock('@/lib/images/external', () => ({
  copyExternalImage: (...a: unknown[]) => copyExternalImage(...a),
  isOwnStorageUrl: (url: string | null | undefined) => Boolean(url && url.includes(STORAGE_PREFIX)),
}))

// `isThumbnail` (de merge-events.ts) NO se mockea: es puro texto sobre la
// URL, sin red ni base, y es justo lo que este archivo necesita probar de
// verdad (que una miniatura no se copia).
import { runScrapeJob } from '@/app/api/cron/scrape/run-scrape-job'

const FAKE_STORAGE_CLIENT = { marca: 'storage-de-prueba' }
const URL_TICKETERA = 'https://entradauno.com/flyers/evento-de-prueba.jpg'
const URL_PROPIA = 'https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/externas/hash.jpg'
// Lo que EntradaUno publica de verdad como miniatura (espacios escapados en
// el medio del tamaño; ver isThumbnail en merge-events.ts).
const URL_MINIATURA = 'https://entradauno.com/flyers/150%20x%20150%20(5).jpg'

const evento = (overrides: Partial<{ flyerUrl: string; title: string }> = {}) => ({
  title: 'Evento de Prueba',
  rawVenueName: 'Venue de Prueba',
  dateTime: new Date('2026-12-01T22:00:00Z'),
  priceFrom: 1000,
  flyerUrl: URL_TICKETERA,
  ticketLink: 'https://example.test/entradas',
  source: 'norteticket',
  ...overrides,
})

/** Cliente falso: resuelve venue y categoría sin red, y expone `storage.from()`. */
function clienteFalso() {
  return {
    rpc: () => Promise.resolve({ data: 'venue-id-de-prueba', error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { slug: 'teatro' } }) }) }),
    }),
    storage: { from: () => FAKE_STORAGE_CLIENT },
  }
}

/**
 * Mismo cliente falso, pero sin `storage` (vuelta 2, 31-a): es el caso real
 * que destapó `tests/cron/scrape-venue-errors.test.ts` sin querer. Sirve
 * para probar que `supabase.storage.from(...)` lanzando no tira el evento
 * entero: el `try` de la copia ahora también cubre crear `storageClient`.
 */
function clienteFalsoSinStorage() {
  return {
    rpc: () => Promise.resolve({ data: 'venue-id-de-prueba', error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { slug: 'teatro' } }) }) }),
    }),
  }
}

beforeEach(() => {
  for (const m of [createAdminClient, scrapeNorteTicket, scrapeEntradaUno, scrapeAlpogo,
    upsertEventWithDeduplication, resolveCategoryWithAliases, archiveExpiredFlyers, copyExternalImage]) {
    m.mockReset()
  }
  createAdminClient.mockReturnValue(clienteFalso())
  scrapeNorteTicket.mockResolvedValue([])
  scrapeEntradaUno.mockResolvedValue([])
  scrapeAlpogo.mockResolvedValue([])
  resolveCategoryWithAliases.mockResolvedValue('cat-de-prueba')
  upsertEventWithDeduplication.mockResolvedValue({ success: true, action: 'insert', eventId: 'ev-1' })
  archiveExpiredFlyers.mockResolvedValue(0)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runScrapeJob: copia de imagen a Storage (QPS-144)', () => {
  it('con una imagen externa, copia a Storage y guarda la URL de Storage', async () => {
    scrapeNorteTicket.mockResolvedValue([evento({ flyerUrl: URL_TICKETERA })])
    copyExternalImage.mockResolvedValue(URL_PROPIA)

    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')

    expect(copyExternalImage).toHaveBeenCalledTimes(1)
    expect(copyExternalImage).toHaveBeenCalledWith(URL_TICKETERA, FAKE_STORAGE_CLIENT)
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_PROPIA)
    expect(r.database.inserted).toBe(1)
  })

  it('si la copia devuelve null, se guarda la URL original y el job sigue', async () => {
    scrapeNorteTicket.mockResolvedValue([evento({ flyerUrl: URL_TICKETERA })])
    copyExternalImage.mockResolvedValue(null)

    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')

    expect(copyExternalImage).toHaveBeenCalledTimes(1)
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_TICKETERA)
    expect(r.database.inserted).toBe(1)
    expect(r.database.errors).toBe(0)
  })

  it('si la copia lanza una excepción, se guarda la URL original y el job no se corta', async () => {
    scrapeNorteTicket.mockResolvedValue([evento({ flyerUrl: URL_TICKETERA })])
    copyExternalImage.mockRejectedValue(new Error('boom de red'))

    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')

    expect(copyExternalImage).toHaveBeenCalledTimes(1)
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_TICKETERA)
    expect(r.database.inserted).toBe(1)
    expect(r.database.errors).toBe(0)
    expect(r.success).toBe(true)
  })

  it('con una URL que ya es nuestra, no intenta copiar', async () => {
    scrapeNorteTicket.mockResolvedValue([evento({ flyerUrl: URL_PROPIA })])

    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')

    expect(copyExternalImage).not.toHaveBeenCalled()
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_PROPIA)
    expect(r.database.inserted).toBe(1)
  })

  it('con una miniatura externa, no la copia: queda cruda para que el merge la pueda reemplazar después', async () => {
    // Bloqueante del revisor (vuelta 1, 31-a): si se copiara, el path
    // resultante sería `externas/<sha1 hex>.<ext>` — un hash nunca puede
    // contener "150x150" ni "thumb" — y la excepción de calidad de
    // merge-events.ts (isThumbnail) nunca podría volver a detectarla, así
    // que la miniatura quedaría atascada para siempre. No copiándola, la
    // URL cruda sigue siendo detectable como miniatura en cualquier corrida
    // futura (ver tests/scraper/merge-imagen.test.ts).
    scrapeNorteTicket.mockResolvedValue([evento({ flyerUrl: URL_MINIATURA })])

    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')

    expect(copyExternalImage).not.toHaveBeenCalled()
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_MINIATURA)
    expect(r.database.inserted).toBe(1)
  })

  it('si supabase.storage no existe (storage.from lanza), se guarda igual con la URL original y no cuenta como error', async () => {
    // El `try/catch` de la copia cubre también crear `storageClient`, no
    // sólo `copyExternalImage` (vuelta 2, 31-a): antes, un
    // `supabase.storage.from(...)` que lanzara se escapaba al try/catch por
    // evento (results.errors++ y continue), perdiendo el evento entero en
    // vez de guardarlo con la URL cruda, que es la garantía que el
    // comentario del bloque ya prometía.
    createAdminClient.mockReturnValue(clienteFalsoSinStorage())
    scrapeNorteTicket.mockResolvedValue([evento({ flyerUrl: URL_TICKETERA })])

    const r = await runScrapeJob()
    if ('error' in r) throw new Error('no deberia fallar')

    expect(copyExternalImage).not.toHaveBeenCalled()
    expect(upsertEventWithDeduplication).toHaveBeenCalledTimes(1)
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_TICKETERA)
    expect(r.database.inserted).toBe(1)
    expect(r.database.errors).toBe(0)
  })
})
