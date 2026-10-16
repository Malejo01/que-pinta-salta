/**
 * 31-q — cruce entre 31-a (QPS-144, cron copia afiches externos a Storage) y
 * lo que ya hacían los botones del admin (`lib/scraper/save-to-supabase.ts`).
 *
 * Dos cosas:
 *
 * 1. Detector sobre el CÓDIGO FUENTE de las dos rutas de ingesta: las dos
 *    tienen que importar `copyExternalImage` e `isOwnStorageUrl` del mismo
 *    módulo compartido (`lib/images/external`) y ninguna puede reimplementar
 *    la detección a mano (la señal es el literal
 *    `/storage/v1/object/public/`, que es el prefijo que `isOwnStorageUrl`
 *    ya conoce).
 *
 * 2. Punta a punta con dobles: la copia del cron (31-a) más la guarda nueva
 *    de `merge-events.ts` (también 31-a) trabajando juntas para que un
 *    evento que ya tenía su afiche en nuestro Storage no lo pierda.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// apps/web/tests/scraper -> apps/web/tests -> apps/web
const RUN_SCRAPE_JOB_PATH = fileURLToPath(
  new URL('../../app/api/cron/scrape/run-scrape-job.ts', import.meta.url)
)
const SAVE_TO_SUPABASE_PATH = fileURLToPath(
  new URL('../../lib/scraper/save-to-supabase.ts', import.meta.url)
)

function readSource(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    // Fallo ruidoso a propósito (lección R29/R30): si el archivo se movió o
    // se renombró, el detector tiene que romper, no dar verde en silencio.
    throw new Error(`No se pudo leer "${path}" para el detector de ingesta-imagenes-rutas: ${reason}`)
  }
}

// El import puede venir con alias ("@/lib/images/external") o relativo
// ("../images/external"), pero siempre tiene que terminar exactamente en
// "images/external" y traer las dos funciones compartidas.
const SHARED_IMPORT_RE = /import\s*\{\s*([^}]*)\}\s*from\s*(['"])([^'"]*images\/external)\2/

function assertImportsSharedModule(path: string, content: string): void {
  const match = SHARED_IMPORT_RE.exec(content)
  if (!match) {
    throw new Error(
      `No se encontró "import { copyExternalImage, isOwnStorageUrl } from '.../images/external'" en ${path}. ` +
        'El archivo cambió de forma de importar (o de nombre) y el detector no lo puede seguir: hay que revisar a mano.'
    )
  }

  const names = match[1].split(',').map((n) => n.trim())
  if (!names.includes('copyExternalImage')) {
    throw new Error(`${path}: el import de images/external no trae copyExternalImage.`)
  }
  if (!names.includes('isOwnStorageUrl')) {
    throw new Error(`${path}: el import de images/external no trae isOwnStorageUrl.`)
  }
}

const ROUTES = [
  ['run-scrape-job.ts (cron, 31-a/QPS-144)', RUN_SCRAPE_JOB_PATH],
  ['save-to-supabase.ts (botones del admin)', SAVE_TO_SUPABASE_PATH],
] as const

describe('las dos rutas de ingesta usan el mismo módulo de imágenes externas', () => {
  it.each(ROUTES)('%s importa copyExternalImage e isOwnStorageUrl del módulo compartido', (_label, path) => {
    const content = readSource(path)
    assertImportsSharedModule(path, content)
  })

  it.each(ROUTES)(
    '%s no reimplementa la detección de "es una URL de nuestro Storage" (sin el literal del prefijo público)',
    (_label, path) => {
      const content = readSource(path)
      // isOwnStorageUrl ya conoce este prefijo (lib/images/external.ts). Que
      // aparezca de nuevo, suelto, en una de estas dos rutas es la señal de
      // una copia a mano de la detección en vez de importar la función real.
      expect(content).not.toContain('/storage/v1/object/public/')
    }
  )
})

// ---------------------------------------------------------------------------
// 2. Punta a punta con dobles: la copia del cron + la guarda del merge.
// ---------------------------------------------------------------------------

// Mismo patrón de mocks que tests/scraper/cron-imagenes.test.ts (no se
// duplica más de lo necesario: se reusa exactamente ese set porque
// run-scrape-job.ts necesita todos esos módulos para correr sin red ni base).
const createAdminClient = vi.fn()
const scrapeNorteTicket = vi.fn()
const scrapeEntradaUno = vi.fn()
const scrapeAlpogo = vi.fn()
const upsertEventWithDeduplication = vi.fn()
const resolveCategoryWithAliases = vi.fn()
const archiveExpiredFlyers = vi.fn()
const copyExternalImage = vi.fn()
const STORAGE_PREFIX = '/storage/v1/object/public/flyers_ig/'

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
// Reimplementación fiel de isOwnStorageUrl (mismo prefijo que la real): no
// solo la usa run-scrape-job.ts (vía '@/lib/images/external'), también la
// usa mergeEvents por dentro (vía '../images/external', mismo módulo
// resuelto) — este mock tiene que ser consistente para las dos llamadas.
vi.mock('@/lib/images/external', () => ({
  copyExternalImage: (...a: unknown[]) => copyExternalImage(...a),
  isOwnStorageUrl: (url: string | null | undefined) => Boolean(url && url.includes(STORAGE_PREFIX)),
}))

import { runScrapeJob } from '@/app/api/cron/scrape/run-scrape-job'
import { mergeEvents } from '@/lib/scraper/merge-events'

const URL_TICKETERA = 'https://entradauno.com/flyers/evento-de-prueba-nuevo.jpg'
const URL_STORAGE_VIEJA = 'https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/externas/hash-vieja.jpg'

const evento = (overrides: Partial<{ flyerUrl: string; title: string; source: string }> = {}) => ({
  title: 'Evento de Prueba',
  rawVenueName: 'Venue de Prueba',
  dateTime: new Date('2026-12-01T22:00:00Z'),
  priceFrom: 1000,
  flyerUrl: URL_TICKETERA,
  ticketLink: 'https://example.test/entradas',
  source: 'norteticket',
  ...overrides,
})

const FAKE_STORAGE_CLIENT = { marca: 'storage-de-prueba' }

function clienteFalso() {
  return {
    rpc: () => Promise.resolve({ data: 'venue-id-de-prueba', error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { slug: 'teatro' } }) }) }),
    }),
    storage: { from: () => FAKE_STORAGE_CLIENT },
  }
}

beforeEach(() => {
  for (const m of [
    createAdminClient,
    scrapeNorteTicket,
    scrapeEntradaUno,
    scrapeAlpogo,
    upsertEventWithDeduplication,
    resolveCategoryWithAliases,
    archiveExpiredFlyers,
    copyExternalImage,
  ]) {
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

describe('cron + merge, encadenados con dobles: un evento con imagen ya en Storage no la pierde', () => {
  // Por qué en dos pasos encadenados, y no en una sola llamada: el cron real
  // (runScrapeJob) guarda con upsertEventWithDeduplication, que acá está
  // mockeado (como en cron-imagenes.test.ts) porque la deduplicación de
  // verdad pega contra Supabase. Para no reimplementar ese mock enorme, el
  // paso 1 corre el cron de verdad y capturamos el `eventData` que el cron
  // le pasaría a upsertEventWithDeduplication; el paso 2 toma ese mismo
  // objeto y lo corre contra la función de merge real (sin mockear), que es
  // el código que de verdad decide qué image_url queda. Así se prueban las
  // dos piezas de 31-a (la copia del cron y la guarda del merge) atadas,
  // sin duplicar el mock de Supabase/dedup.
  it('si la copia del cron falla, la guarda del merge evita que la URL cruda pise la imagen ya copiada', async () => {
    // Paso 1: el cron scrapea un evento de una ticketera con un afiche nuevo,
    // pero la copia a Storage falla (devuelve null, como una descarga que da
    // timeout) — eventData.image_url queda con la URL cruda de la ticketera.
    scrapeNorteTicket.mockResolvedValue([evento({ flyerUrl: URL_TICKETERA, source: 'norteticket' })])
    copyExternalImage.mockResolvedValue(null)

    const resultado = await runScrapeJob()
    if ('error' in resultado) throw new Error('no debería fallar')

    expect(copyExternalImage).toHaveBeenCalledTimes(1)
    const eventDataDelCron = upsertEventWithDeduplication.mock.calls[0][0]
    expect(eventDataDelCron.image_url).toBe(URL_TICKETERA) // la copia falló: queda la cruda

    // Paso 2: ese mismo eventData entra como "incoming" al merge real contra
    // un registro existente que YA tenía el afiche copiado a Storage en una
    // corrida anterior. norteticket (ticketera, prioridad 400) le ganaría a
    // vamos (portal, 300) por prioridad de fuente — si no fuera por la
    // guarda nueva, la URL cruda pisaría la copia de Storage.
    const base = {
      id: 'eeeeeeee-eeee-4eee-8eee-000000000002',
      title: 'Evento de Prueba',
      status: 'PUBLISHED',
      start_date: '2026-12-01T22:00:00.000Z',
      scrape_source_key: 'vamos',
      image_url: URL_STORAGE_VIEJA,
    }

    const { patch, conflicts } = mergeEvents(base, eventDataDelCron, {
      incomingSource: 'norteticket',
      dedupKey: 'evento de prueba|2026-12-01',
      context: 'ingest',
    })

    // La imagen sigue siendo la de Storage: el merge no la pisa con la cruda.
    expect('image_url' in patch).toBe(false)
    const conflictoImagen = conflicts.find((c) => c.field === 'image_url')
    expect(conflictoImagen?.kept).toBe(URL_STORAGE_VIEJA)
    expect(conflictoImagen?.discarded).toBe(URL_TICKETERA)
    expect(conflictoImagen?.rule).toBe('storage-propio-sobre-externa')
  })

  it('si la copia del cron funciona, el resultado final sigue siendo una URL de Storage (la nueva, por prioridad)', async () => {
    // Mismo encadenado, pero con la copia exitosa: acá no hace falta la
    // guarda (las dos URLs en juego ya son de Storage), así que decide la
    // prioridad de siempre — se verifica que el merge no necesite la guarda
    // para este caso, y que el resultado nunca sea una URL cruda.
    const URL_STORAGE_NUEVA = 'https://proyecto-de-prueba.supabase.co/storage/v1/object/public/flyers_ig/externas/hash-nueva.jpg'
    scrapeNorteTicket.mockResolvedValue([evento({ flyerUrl: URL_TICKETERA, source: 'norteticket' })])
    copyExternalImage.mockResolvedValue(URL_STORAGE_NUEVA)

    const resultado = await runScrapeJob()
    if ('error' in resultado) throw new Error('no debería fallar')

    const eventDataDelCron = upsertEventWithDeduplication.mock.calls[0][0]
    expect(eventDataDelCron.image_url).toBe(URL_STORAGE_NUEVA) // la copia funcionó

    const base = {
      id: 'eeeeeeee-eeee-4eee-8eee-000000000003',
      title: 'Evento de Prueba',
      status: 'PUBLISHED',
      start_date: '2026-12-01T22:00:00.000Z',
      scrape_source_key: 'vamos',
      image_url: URL_STORAGE_VIEJA,
    }

    const { patch } = mergeEvents(base, eventDataDelCron, {
      incomingSource: 'norteticket',
      dedupKey: 'evento de prueba|2026-12-01',
      context: 'ingest',
    })

    // Gana por prioridad (ticketera > portal), y lo que gana también es
    // Storage: nunca vuelve a aparecer una URL cruda.
    expect(patch.image_url).toBe(URL_STORAGE_NUEVA)
  })
})
