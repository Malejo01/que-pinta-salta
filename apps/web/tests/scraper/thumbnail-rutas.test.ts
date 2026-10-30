/**
 * Tarea 34-c (QPS-160) — las otras tres rutas que copian a Storage
 * (lib/scraper/save-to-supabase.ts, lib/scraper/cinema-scraper.ts y
 * lib/recurrentes/generar.ts) tienen que mirar `isThumbnail` ANTES de copiar
 * la imagen externa, exactamente como ya hace el cron (app/api/cron/scrape/
 * run-scrape-job.ts, 31-a).
 *
 * Por qué el orden importa: `copyExternalImage` siempre nombra el archivo
 * `externas/<sha1 hex>.<ext>`, y un digest hexadecimal sólo tiene [0-9a-f] —
 * nunca puede contener "150x150" ni "thumb". Si la miniatura se copia
 * primero y se detecta después sobre la URL de Storage, `isThumbnail` da
 * `false` para siempre y la miniatura queda atascada sin que ninguna corrida
 * futura con la imagen grande la pueda reemplazar (ver el comentario de
 * `isThumbnail` en lib/scraper/merge-events.ts).
 *
 * Dos partes:
 *   1. Un detector sobre el CÓDIGO FUENTE de las cuatro rutas que llaman a
 *      `copyExternalImage` (las tres de esta tarea + el cron de 31-a): cada
 *      llamada tiene que estar guardada por `!isThumbnail(...)` en el `if`
 *      que la encierra.
 *   2. Comportamiento con dobles (sin red ni base): con una URL de miniatura
 *      no se copia y queda la original; con una URL normal, se copia como
 *      hoy.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quitarComentarios as stripComments } from '@qps/core/tests/convencion-entorno'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Mocks compartidos por todo el archivo (hoisted por Vitest). Mismo patrón
// que tests/scraper/imagen-storage.test.ts, tests/recurrentes/generar.test.ts
// y tests/scraper/ingesta-imagenes-rutas.test.ts: se mockea el módulo entero
// y se reimplementa `isOwnStorageUrl` con el mismo prefijo de URL pública,
// sin red. `isThumbnail` (de merge-events.ts) NO se mockea: es puro texto
// sobre la URL, y es justamente lo que esta tarea prueba.
// ---------------------------------------------------------------------------
const copyExternalImage = vi.fn()
const STORAGE_PREFIX = '/storage/v1/object/public/flyers_ig/'
vi.mock('@/lib/images/external', () => ({
  copyExternalImage: (...a: unknown[]) => copyExternalImage(...a),
  isOwnStorageUrl: (url: string | null | undefined) => Boolean(url && url.includes(STORAGE_PREFIX)),
}))

const upsertEventWithDeduplication = vi.fn()
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...a: unknown[]) => upsertEventWithDeduplication(...a),
}))

// Sólo lo usa save-to-supabase.ts (getAdminClient): resuelve venue vía
// rpc('resolve_venue_id', ...) real (resolveVenueId no se mockea) y responde
// benigno para 'categories'/'aliases' (no es el foco del test).
const rpcSaveToSupabase = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...a: unknown[]) => rpcSaveToSupabase(...a),
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
    storage: { from: () => FAKE_STORAGE_CLIENT },
  }),
}))

// Sólo lo usa cinema-scraper.ts.
const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { saveEventsToSupabase } from '@/lib/scraper/save-to-supabase'
import { runCinemaScrapeAndSync } from '@/lib/scraper/cinema-scraper'
import { generarRecurrentes } from '@/lib/recurrentes/generar'
import { PENAS, MUSEOS } from '@/lib/recurrentes/config'

// Objeto marcador cualquiera: lo único que importa es que llegue tal cual
// como segundo argumento a `copyExternalImage` (mockeado arriba).
const FAKE_STORAGE_CLIENT = { marca: 'storage-de-prueba' }

const URL_STORAGE_RESULTADO = `https://proyecto-de-prueba.supabase.co${STORAGE_PREFIX}externas/hash-de-prueba.jpg`

// saveEventsToSupabase (save-to-supabase.ts) crea su propio cliente admin con
// createClient(url, key) leyendo el entorno directo (no por parámetro, a
// diferencia de generarRecurrentes). Mismo patrón que
// tests/scraper/imagen-storage.test.ts: se pisan y se restauran a mano.
const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY_ENV = process.env.SUPABASE_SERVICE_ROLE_KEY

beforeEach(() => {
  copyExternalImage.mockReset()
  copyExternalImage.mockResolvedValue(URL_STORAGE_RESULTADO)
  upsertEventWithDeduplication.mockReset()
  upsertEventWithDeduplication.mockResolvedValue({ success: true, action: 'insert', eventId: 'ev-de-prueba' })
  rpcSaveToSupabase.mockReset()
  rpcSaveToSupabase.mockResolvedValue({ data: 'venue-id-de-prueba', error: null })
  createAdminClient.mockReset()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (URL_ENV === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = URL_ENV
  if (KEY_ENV === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_ENV
})

// ===========================================================================
// 1. Detector sobre el código fuente de las cuatro rutas.
// ===========================================================================

// apps/web/tests/scraper -> apps/web/tests -> apps/web
const CRON_PATH = fileURLToPath(new URL('../../app/api/cron/scrape/run-scrape-job.ts', import.meta.url))
const SAVE_TO_SUPABASE_PATH = fileURLToPath(new URL('../../lib/scraper/save-to-supabase.ts', import.meta.url))
const CINEMA_SCRAPER_PATH = fileURLToPath(new URL('../../lib/scraper/cinema-scraper.ts', import.meta.url))
const GENERAR_PATH = fileURLToPath(new URL('../../lib/recurrentes/generar.ts', import.meta.url))

const ROUTES = [
  ['run-scrape-job.ts (cron, 31-a)', CRON_PATH],
  ['save-to-supabase.ts (botones del admin)', SAVE_TO_SUPABASE_PATH],
  ['cinema-scraper.ts (cines)', CINEMA_SCRAPER_PATH],
  ['generar.ts (recurrentes: peñas y museos)', GENERAR_PATH],
] as const


function readSource(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`No se pudo leer "${path}" para el detector de thumbnail-rutas: ${reason}`)
  }
}

const ISTHUMBNAIL_IMPORT_RE = /import\s*\{\s*([^}]*)\}\s*from\s*(['"])([^'"]*merge-events)\2/

function assertImportsIsThumbnail(path: string, content: string): void {
  const match = ISTHUMBNAIL_IMPORT_RE.exec(stripComments(content))
  if (!match) {
    throw new Error(
      `No se encontró "import { isThumbnail } from '.../merge-events'" en ${path}. ` +
        'El archivo cambió de forma de importar (o de nombre) y el detector no lo puede seguir: hay que revisar a mano.'
    )
  }
  const names = match[1].split(',').map((n) => n.trim())
  if (!names.includes('isThumbnail')) {
    throw new Error(`${path}: el import de merge-events no trae isThumbnail.`)
  }
}

/**
 * Para cada llamada a `copyExternalImage(`, busca el `if (` más cercano hacia
 * atrás (dentro de una ventana razonable) y exige que:
 *   (a) exista ese `if (` sin cerrar todavía (no hay un "}" entre el if y la
 *       llamada: si hubiera uno, el if encontrado ya se cerró antes y no es
 *       la guarda real de esta copia), y
 *   (b) ese `if (` contenga `isThumbnail(`.
 * Corre sobre `content` YA sin comentarios (ver stripComments): así una
 * guarda comentada al lado de una real rota no cuenta como protección.
 */
const WINDOW = 400

function assertEachCopyGuardedByIsThumbnail(path: string, rawContent: string): void {
  const content = stripComments(rawContent)
  const calls = [...content.matchAll(/copyExternalImage\(/g)]
  if (calls.length === 0) {
    throw new Error(`${path}: no se encontró ninguna llamada a copyExternalImage (el archivo cambió de forma).`)
  }
  calls.forEach((call, i) => {
    const idx = call.index ?? 0
    const start = Math.max(0, idx - WINDOW)
    const windowText = content.slice(start, idx)
    const lastOpenIf = windowText.lastIndexOf('if (')
    if (lastOpenIf === -1) {
      throw new Error(
        `${path}: la llamada #${i + 1} a copyExternalImage no tiene ningún "if (" dentro de los ` +
          `${WINDOW} caracteres previos (¿se movió la guarda muy lejos, o se sacó del if?).`
      )
    }
    const guard = windowText.slice(lastOpenIf)
    if (guard.includes('}')) {
      throw new Error(
        `${path}: la llamada #${i + 1} a copyExternalImage queda fuera del "if (" más cercano ` +
          '(hay un "}" entre el if y la llamada): la guarda que se encontró no es la que protege esta copia.'
      )
    }
    if (!guard.includes('isThumbnail(')) {
      throw new Error(
        `${path}: la llamada #${i + 1} a copyExternalImage no está guardada por "!isThumbnail(...)" en su "if (".`
      )
    }
  })
}

describe('detector: lista exacta de rutas cubiertas (QPS-160)', () => {
  it('son exactamente las cuatro rutas que llaman a copyExternalImage, ni una menos', () => {
    // Pinneado a mano: si alguien borra una fila de ROUTES (por accidente, al
    // "simplificar"), este assert se pone rojo aunque el it.each de más abajo
    // siga iterando y pasando en verde sobre las que queden.
    expect(ROUTES.map(([label]) => label)).toEqual([
      'run-scrape-job.ts (cron, 31-a)',
      'save-to-supabase.ts (botones del admin)',
      'cinema-scraper.ts (cines)',
      'generar.ts (recurrentes: peñas y museos)',
    ])
  })
})

describe('stripComments / assertEachCopyGuardedByIsThumbnail (fixtures en memoria)', () => {
  it('acepta una guarda real: if (... && !isThumbnail(url)) antes de la llamada', () => {
    const src = `if (url && !isOwnStorageUrl(url) && !isThumbnail(url)) {\n  const r = await copyExternalImage(url, client)\n}`
    expect(() => assertEachCopyGuardedByIsThumbnail('fixture.ts', src)).not.toThrow()
  })

  it('[rotura] detecta que falta isThumbnail en la guarda', () => {
    const src = `if (url && !isOwnStorageUrl(url)) {\n  const r = await copyExternalImage(url, client)\n}`
    expect(() => assertEachCopyGuardedByIsThumbnail('fixture.ts', src)).toThrow(/no está guardada/)
  })

  it('[rotura] no se evade dejando la guarda buena COMENTADA al lado de la rota', () => {
    // La línea "buena" existe en el archivo, pero sólo dentro de un
    // comentario: sin pelar comentarios, un detector ingenuo la encontraría
    // de todos modos con un simple content.includes('isThumbnail(').
    const src =
      `// if (url && !isOwnStorageUrl(url) && !isThumbnail(url)) {\n` +
      `if (url && !isOwnStorageUrl(url)) {\n` +
      `  const r = await copyExternalImage(url, client)\n` +
      `}`
    expect(() => assertEachCopyGuardedByIsThumbnail('fixture.ts', src)).toThrow(/no está guardada/)
  })

  it('[rotura] detecta un if que ya se cerró antes de la llamada (la guarda real es otra, más lejana, sin isThumbnail)', () => {
    const src =
      `if (otraCosa && !isThumbnail(otraCosa)) {\n` +
      `  hacerOtraCosa()\n` +
      `}\n` +
      `if (url && !isOwnStorageUrl(url)) {\n` +
      `  const r = await copyExternalImage(url, client)\n` +
      `}`
    expect(() => assertEachCopyGuardedByIsThumbnail('fixture.ts', src)).toThrow(/no está guardada/)
  })

  it('[rotura] rompe ruidosamente si no hay ninguna llamada a copyExternalImage', () => {
    expect(() => assertEachCopyGuardedByIsThumbnail('fixture.ts', 'const x = 1;')).toThrow(/no se encontró ninguna llamada/)
  })
})

describe('las cuatro rutas, código real: importan isThumbnail y cada copia está guardada', () => {
  it.each(ROUTES)('%s importa isThumbnail de merge-events', (_label, path) => {
    assertImportsIsThumbnail(path, readSource(path))
  })

  it.each(ROUTES)('%s: cada llamada a copyExternalImage está guardada por !isThumbnail(...)', (_label, path) => {
    assertEachCopyGuardedByIsThumbnail(path, readSource(path))
  })
})

// ===========================================================================
// 2. Comportamiento con dobles: miniatura no se copia, normal sí.
// ===========================================================================

describe('saveEventsToSupabase (botones del admin): no copia miniaturas', () => {
  const URL_TICKETERA = 'https://entradauno.com/flyers/evento-de-prueba.jpg'
  const URL_MINIATURA_150 = 'https://entradauno.com/flyers/evento-de-prueba-150x150.jpg'

  const evento = (overrides: Partial<{ image_url: string; venue: string; title: string }> = {}) => ({
    title: 'Evento de Prueba',
    slug: 'evento-de-prueba',
    venue: 'Venue de Prueba',
    start_date: '2026-12-01T22:00:00Z',
    price_min: 0,
    is_free: false,
    image_url: URL_TICKETERA,
    ...overrides,
  })

  it('con una URL de miniatura (150x150), no copia y guarda la original', async () => {
    const r = await saveEventsToSupabase([evento({ image_url: URL_MINIATURA_150 })], 'entradauno')

    expect(copyExternalImage).not.toHaveBeenCalled()
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_MINIATURA_150)
    expect(r.errors).toEqual([])
  })

  it('con una URL normal, copia como hoy', async () => {
    const r = await saveEventsToSupabase([evento({ image_url: URL_TICKETERA })], 'entradauno')

    expect(copyExternalImage).toHaveBeenCalledTimes(1)
    expect(copyExternalImage).toHaveBeenCalledWith(URL_TICKETERA, FAKE_STORAGE_CLIENT)
    expect(upsertEventWithDeduplication.mock.calls[0][0].image_url).toBe(URL_STORAGE_RESULTADO)
    expect(r.errors).toEqual([])
  })
})

describe('runCinemaScrapeAndSync (cines): no copia miniaturas', () => {
  const URL_POSTER = 'https://cineopera.example.com/poster-pelicula.jpg'
  const URL_MINIATURA_THUMB = 'https://cineopera.example.com/thumb-poster-pelicula.jpg'

  // Mismo cálculo que runCinemaScrapeAndSync (lib/scraper/cinema-scraper.ts)
  // para el día de hoy en Salta: sólo se usa para construir el fixture, no
  // para probar la fórmula (eso no es el foco de esta tarea).
  function todayStrSalta(): string {
    const now = new Date()
    const saltaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Salta' }))
    return (
      saltaTime.getFullYear() +
      '-' +
      String(saltaTime.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(saltaTime.getDate()).padStart(2, '0')
    )
  }

  function fetchMockCinema(posterUrl: string) {
    const today = todayStrSalta()
    return vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'HEAD') {
        return { ok: true } as Response
      }
      if (typeof url === 'string' && url.includes('cinemark.com.ar')) {
        // Sin JSON-LD de MovieTheater: el scraper de Cinemark loguea un warn
        // y no suma películas, pero no lanza (así el test queda chico).
        return { ok: true, text: async () => '<html></html>' } as unknown as Response
      }
      if (url === 'https://apiv2.gaf.adro.studio/nowPlaying/84') {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            data: [{ pref: 'p1', nombre: 'Película De Prueba', poster: { path: posterUrl } }],
          }),
        } as unknown as Response
      }
      if (url === 'https://apiv2.gaf.adro.studio/movie/84/p1') {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            data: { showtimes: [{ fechaHora: { date: `${today} 20:00:00` }, lenguaje: 'ESP', formato: '2D' }] },
          }),
        } as unknown as Response
      }
      throw new Error('fetch inesperado en el test: ' + url)
    })
  }

  function fakeCinemaSupabase() {
    // Los mocks sólo necesitan aceptar un argumento (para que mock.calls[0][0]
    // tipe bien): no se usa dentro de la función, de ahí el eslint-disable.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const insert = vi.fn((_payload: Record<string, unknown>) => Promise.resolve({ error: null }))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const update = vi.fn((_payload: Record<string, unknown>) => ({
      eq: () => Promise.resolve({ error: null }),
      in: () => Promise.resolve({ error: null }),
    }))
    const client = {
      storage: { from: () => FAKE_STORAGE_CLIENT },
      from: (table: string) => {
        if (table !== 'cinema_movies') throw new Error('tabla inesperada: ' + table)
        return {
          select: () => ({
            eq: (col: string) => {
              if (col === 'slug') return { maybeSingle: () => Promise.resolve({ data: null, error: null }) }
              if (col === 'is_currently_showing') return Promise.resolve({ data: [], error: null })
              throw new Error('eq inesperado: ' + col)
            },
          }),
          insert,
          update,
        }
      },
    }
    return { client, insert }
  }

  it('con un afiche miniatura, no lo copia y guarda la URL original', async () => {
    const { client, insert } = fakeCinemaSupabase()
    createAdminClient.mockReturnValue(client)
    vi.stubGlobal('fetch', fetchMockCinema(URL_MINIATURA_THUMB))

    const r = await runCinemaScrapeAndSync()

    expect(copyExternalImage).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toMatchObject({ poster_url: URL_MINIATURA_THUMB })
    expect(r.success).toBe(true)
  })

  it('con un afiche normal, lo copia a Storage', async () => {
    const { client, insert } = fakeCinemaSupabase()
    createAdminClient.mockReturnValue(client)
    vi.stubGlobal('fetch', fetchMockCinema(URL_POSTER))

    const r = await runCinemaScrapeAndSync()

    expect(copyExternalImage).toHaveBeenCalledTimes(1)
    expect(copyExternalImage).toHaveBeenCalledWith(URL_POSTER, FAKE_STORAGE_CLIENT)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toMatchObject({ poster_url: URL_STORAGE_RESULTADO })
    expect(r.success).toBe(true)
  })
})

describe('generarRecurrentes (peñas y museos): no copia miniaturas', () => {
  const AHORA = new Date('2026-11-09T12:00:00Z')
  const PENA = PENAS[0] // Balderrama
  const MUSEO = MUSEOS[0]
  const PENA_VENUE_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
  const MUSEO_VENUE_ID = `${MUSEO.venueIdPrefijo}-0000-0000-0000-000000000000`

  type Row = Record<string, unknown>
  type Resultado = { data: Row | Row[] | null; error: null }

  /**
   * Cliente mínimo: `rpc` resuelve el venue objetivo (y null para cualquier
   * otra peña/museo de la config real, que así se saltea con error antes de
   * tocar `events`). `.from('events')` devuelve un único objeto encadenable:
   * `.maybeSingle()` resuelve `row` (la imagen/plantilla); sin `maybeSingle`,
   * resuelve `[]` (sin días ya cargados), para no interferir con el cálculo
   * de fechas pendientes.
   */
  function fakeSupabaseGenerar(row: Row, targetVenue: string, targetVenueId: string) {
    return {
      rpc: (_fn: string, params: { p_raw: string }) =>
        Promise.resolve({ data: params.p_raw === targetVenue ? targetVenueId : null, error: null }),
      from: (table: string) => {
        if (table !== 'events') throw new Error('tabla inesperada: ' + table)
        let single = false
        const chain = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () => {
            single = true
            return chain
          },
          then<R1 = Resultado, R2 = never>(
            ok?: ((v: Resultado) => R1 | PromiseLike<R1>) | null,
            ko?: ((e: unknown) => R2 | PromiseLike<R2>) | null
          ): Promise<R1 | R2> {
            const data = single ? row : []
            return Promise.resolve({ data, error: null } as Resultado).then(ok, ko)
          },
        }
        return chain
      },
      storage: { from: () => FAKE_STORAGE_CLIENT },
    } as unknown as SupabaseClient
  }

  const porTitulo = (res: Awaited<ReturnType<typeof generarRecurrentes>>, titulo: string) =>
    res.items.find((i) => i.titulo === titulo)!

  it('peña con imagen miniatura (150x150): no copia, las filas nuevas llevan la URL original', async () => {
    const URL_MINIATURA_150 = 'https://ejemplo.com/pena-150x150.jpg'
    const row: Row = { image_url: URL_MINIATURA_150, start_date: '2020-01-01T00:00:00.000Z', status: 'PUBLISHED' }
    const supabase = fakeSupabaseGenerar(row, PENA.venue, PENA_VENUE_ID)

    const res = await generarRecurrentes(supabase, { ahora: AHORA })

    expect(copyExternalImage).not.toHaveBeenCalled()
    const item = porTitulo(res, PENA.titulo)
    expect(item.error).toBeUndefined()
    expect(item.insertadas).toBeGreaterThan(0)
    const filasConImagen = upsertEventWithDeduplication.mock.calls
      .map((c) => c[0] as Row)
      .filter((f) => f.title === PENA.titulo)
    expect(filasConImagen.length).toBeGreaterThan(0)
    for (const fila of filasConImagen) expect(fila.image_url).toBe(URL_MINIATURA_150)
  })

  it('peña con imagen normal: copia y las filas nuevas llevan la URL de Storage', async () => {
    const URL_EXTERNA = 'https://ejemplo.com/pena-flyer.jpg'
    const row: Row = { image_url: URL_EXTERNA, start_date: '2020-01-01T00:00:00.000Z', status: 'PUBLISHED' }
    const supabase = fakeSupabaseGenerar(row, PENA.venue, PENA_VENUE_ID)

    const res = await generarRecurrentes(supabase, { ahora: AHORA })

    expect(copyExternalImage).toHaveBeenCalledWith(URL_EXTERNA, FAKE_STORAGE_CLIENT)
    const item = porTitulo(res, PENA.titulo)
    expect(item.error).toBeUndefined()
    expect(item.insertadas).toBeGreaterThan(0)
    const filasConImagen = upsertEventWithDeduplication.mock.calls
      .map((c) => c[0] as Row)
      .filter((f) => f.title === PENA.titulo)
    expect(filasConImagen.length).toBeGreaterThan(0)
    for (const fila of filasConImagen) expect(fila.image_url).toBe(URL_STORAGE_RESULTADO)
  })

  it('museo con imagen miniatura ("thumb"): no copia, las filas nuevas llevan la URL original', async () => {
    const URL_MINIATURA_THUMB = 'https://ejemplo.com/thumb-museo.jpg'
    const row: Row = {
      image_url: URL_MINIATURA_THUMB,
      description: 'Descripción de prueba',
      short_description: 'Resumen de prueba',
      price_min: 0,
      price_max: null,
      is_free: true,
      ticket_url: null,
      classification_source: null,
      tags: [],
      gallery_urls: [],
      ticket_sources: [],
      is_commercial: true,
      start_date: '2020-01-01T00:00:00.000Z',
      status: 'PUBLISHED',
    }
    const supabase = fakeSupabaseGenerar(row, MUSEO.venue, MUSEO_VENUE_ID)

    const res = await generarRecurrentes(supabase, { ahora: AHORA })

    expect(copyExternalImage).not.toHaveBeenCalled()
    const item = porTitulo(res, MUSEO.titulo)
    expect(item.error).toBeUndefined()
    expect(item.insertadas).toBeGreaterThan(0)
    const filasConImagen = upsertEventWithDeduplication.mock.calls
      .map((c) => c[0] as Row)
      .filter((f) => f.title === MUSEO.titulo)
    expect(filasConImagen.length).toBeGreaterThan(0)
    for (const fila of filasConImagen) expect(fila.image_url).toBe(URL_MINIATURA_THUMB)
  })

  it('museo con imagen normal: copia y las filas nuevas llevan la URL de Storage', async () => {
    const URL_EXTERNA = 'https://ejemplo.com/museo-flyer.jpg'
    const row: Row = {
      image_url: URL_EXTERNA,
      description: 'Descripción de prueba',
      short_description: 'Resumen de prueba',
      price_min: 0,
      price_max: null,
      is_free: true,
      ticket_url: null,
      classification_source: null,
      tags: [],
      gallery_urls: [],
      ticket_sources: [],
      is_commercial: true,
      start_date: '2020-01-01T00:00:00.000Z',
      status: 'PUBLISHED',
    }
    const supabase = fakeSupabaseGenerar(row, MUSEO.venue, MUSEO_VENUE_ID)

    const res = await generarRecurrentes(supabase, { ahora: AHORA })

    expect(copyExternalImage).toHaveBeenCalledWith(URL_EXTERNA, FAKE_STORAGE_CLIENT)
    const item = porTitulo(res, MUSEO.titulo)
    expect(item.error).toBeUndefined()
    expect(item.insertadas).toBeGreaterThan(0)
    const filasConImagen = upsertEventWithDeduplication.mock.calls
      .map((c) => c[0] as Row)
      .filter((f) => f.title === MUSEO.titulo)
    expect(filasConImagen.length).toBeGreaterThan(0)
    for (const fila of filasConImagen) expect(fila.image_url).toBe(URL_STORAGE_RESULTADO)
  })
})
