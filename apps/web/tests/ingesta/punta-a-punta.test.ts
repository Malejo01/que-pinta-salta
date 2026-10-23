// Tarea 34-q (QA): tests de punta a punta que cruzan lo que cambió en la Ronda 34
// ("ingesta-dedup"), con dobles (fakes, sin red ni base real):
//
//   1. Dos funciones del mismo show a distinta hora llegan por el cron (dos corridas
//      separadas de upsertEventWithDeduplication, como haría app/api/cron/scrape/route.ts al
//      procesar dos horarios del mismo espectáculo) y quedan como dos eventos. Es el paso 1
//      de findDuplicateMatch (lib/scraper/deduplicate.ts) que desde la tarea 34-a (QPS-164,
//      hallazgo 1) exige también la misma hora de inicio (sameClock), no sólo título+día.
//
//      Sin venue_id en ninguno de los dos lados, a propósito: así se aísla el camino que el
//      paso 1 está diseñado para cubrir sin depender de venue_id (ver su propio docstring en
//      lib/scraper/deduplicate.ts: "no necesita venue_id"), sin que el resultado dependa además
//      de qué hace el paso 2 con el venue.
//
//      [Actualizado en R40, QPS-164 hallazgo 1, decisión de Mauro del 17/10] Cuando se escribió
//      este test (R34), el paso 2 (respaldo difuso, mismo venue_id + similitud de título >= 0.65)
//      NO miraba la hora, así que si estas dos funciones hubieran compartido venue_id Y título
//      idéntico, se habrían vuelto a fusionar por ese camino — de ahí que el venue se dejara sin
//      definir. Desde la tarea 40-b el paso 2 también exige horasCompatibles() (tolerancia
//      TOLERANCIA_HORA_DEDUP_MIN, 120 minutos, packages/core/src/scraper/dedup-key.ts): 16:00 y
//      21:00 están a 300 minutos de diferencia, por encima de la tolerancia, así que esa fusión
//      por el paso 2 ya NO pasaría aunque las dos funciones de este test compartieran venue_id.
//      La limitación que SÍ persiste (el paso 1 sigue exigiendo la hora exacta, y sin venue en
//      común entre los dos no hay ningún camino que los junte) queda documentada y probada en
//      tests/ingesta/punta-a-punta-tolerancia.test.ts (tarea 40-q, casos "LÍMITE CONOCIDO"). Ver
//      también tests/scraper/deduplicate-similitud.test.ts, describe "dos funciones el mismo
//      día", y tests/scraper/dedup-hora.test.ts.
//
//   2. La misma función anunciada por dos ticketeras (mismo título, día y hora, cada una con
//      su propio link y precio) queda como un solo evento: la encuentra por clave exacta
//      (paso 1, mismo reloj) y fusiona los ticket_sources, quedándose con el precio mínimo real
//      (mergeTicketSources / resolvePriceMin en lib/scraper/merge-events.ts).
//
//   3. Un flyer de Instagram con una fecha imposible (31 de febrero, mes 13) nunca llega a
//      status PUBLISHED. A diferencia de tests/ai/process-flyer-ai-salidas-invalidas.test.ts
//      (que mockea upsertEventWithDeduplication y revisa el payload que se le pasa), acá NO se
//      mockea lib/scraper/deduplicate.ts: se usa la implementación real contra el mismo doble
//      de base de los casos 1 y 2, para comprobar la fila que de verdad queda en la base, no
//      sólo la llamada a una función. No se duplican sus casos de validación campo por campo.
//
// Reusa tests/events/fake-events-db.ts (no se escribe otro doble de la base).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { createFakeEventsDb } from '../events/fake-events-db'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('punta a punta: cron con dos funciones del mismo show a distinta hora (16:00 y 21:00)', () => {
  const TITULO = 'Festival Cruzado De Prueba'
  const FUNCION_16 = '2026-11-20T19:00:00.000Z' // 16:00 Salta
  const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta (sigue siendo el 20 en Salta)

  it('las dos corridas del cron insertan dos filas: ninguna pisa a la otra', async () => {
    const db = createFakeEventsDb([])

    const res16 = await upsertEventWithDeduplication(
      { title: TITULO, start_date: FUNCION_16, status: 'PUBLISHED' },
      'norteticket',
      db.client
    )
    const res21 = await upsertEventWithDeduplication(
      { title: TITULO, start_date: FUNCION_21, status: 'PUBLISHED' },
      'norteticket',
      db.client
    )

    expect(res16.action).toBe('insert')
    expect(res21.action).toBe('insert')
    expect(res21.eventId).not.toBe(res16.eventId)
    expect(db.rows).toHaveLength(2)
    expect(db.updates).toHaveLength(0) // ninguna de las dos se fusionó con la otra
    const starts = db.rows.map((r) => r.start_date).sort()
    expect(starts).toEqual([FUNCION_16, FUNCION_21].sort())
  })
})

describe('punta a punta: la misma función por dos ticketeras queda como un solo evento', () => {
  const TITULO = 'Show Multi Fuente De Prueba'
  const START = '2026-11-21T23:00:00.000Z' // 20:00 Salta, hora real (no el placeholder 00:00)

  it('la segunda fuente se fusiona en la fila de la primera: un evento, dos links, el precio mínimo', async () => {
    const db = createFakeEventsDb([])

    const first = await upsertEventWithDeduplication(
      {
        title: TITULO,
        start_date: START,
        status: 'PUBLISHED',
        ticket_url: 'https://norteticket.example.test/show-multi-fuente',
        price_min: 15000,
      },
      'norteticket',
      db.client
    )
    expect(first.action).toBe('insert')
    expect(db.rows).toHaveLength(1)

    const second = await upsertEventWithDeduplication(
      {
        title: TITULO,
        start_date: START,
        status: 'PUBLISHED',
        ticket_url: 'https://eventbrite.example.test/show-multi-fuente',
        price_min: 12000,
      },
      'eventbrite',
      db.client
    )

    expect(second.action).toBe('update')
    expect(second.eventId).toBe(first.eventId)
    expect(db.rows).toHaveLength(1) // sigue siendo un solo evento, no se insertó otro

    expect(db.updates).toHaveLength(1)
    const payload = db.updates[0].payload
    expect(payload.price_min).toBe(12000) // el mínimo real, no el de la fuente que ganó el empate de prioridad
    const urls = (payload.ticket_sources as Array<{ url: string }>).map((s) => s.url).sort()
    expect(urls).toEqual([
      'https://eventbrite.example.test/show-multi-fuente',
      'https://norteticket.example.test/show-multi-fuente',
    ])
  })
})

// --- Caso 3: flyer con fecha imposible, punta a punta con lib/scraper/deduplicate.ts real -----

const flyerState = vi.hoisted(() => ({
  flyer: null as Record<string, unknown> | null,
  updates: [] as Array<Record<string, unknown>>,
  eventsFrom: null as ((table: string) => unknown) | null,
}))
const extract = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // Las filas de `events` las maneja el doble real de tests/events/fake-events-db.ts
      // (asignado en eventsFrom por cada test): así lib/scraper/deduplicate.ts, SIN mockear,
      // corre de verdad contra ese doble. `instagram_flyers` es un cliente mínimo aparte,
      // igual al que ya usa tests/ai/process-flyer-ai-salidas-invalidas.test.ts.
      if (table === 'events') return flyerState.eventsFrom!(table)
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = () => c
      c.single = async () => ({ data: flyerState.flyer, error: null })
      c.update = (payload: Record<string, unknown>) => {
        flyerState.updates.push(payload)
        return c
      }
      c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve, reject)
      return c
    },
  }),
}))
vi.mock('@/lib/ai/gemini', () => ({ extractEventFromFlyer: extract }))
vi.mock('@/lib/scraper/save-to-supabase', () => ({
  upsertVenue: async () => 'venue-de-prueba-id',
  resolveCategoryId: async () => 'categoria-de-prueba-id',
}))
// Ojo: a propósito NO se mockea '@/lib/scraper/deduplicate' acá. processFlyerWithAI lo importa
// tal cual (el mismo módulo real que usan los casos 1 y 2 de arriba) y escribe en el doble de
// base vía flyerState.eventsFrom.

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

describe('punta a punta: flyer con fecha imposible nunca llega a status PUBLISHED', () => {
  let db: ReturnType<typeof createFakeEventsDb>

  beforeEach(() => {
    db = createFakeEventsDb([])
    flyerState.eventsFrom = db.client.from
    flyerState.updates = []
    extract.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }))
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ['31 de febrero', '2030-02-31'],
    ['mes 13', '2030-13-01'],
  ])('fecha imposible (%s): el evento queda DRAFT en la base, nunca PUBLISHED', async (_label, fechaImposible) => {
    flyerState.flyer = flyer('Fiesta de Prueba Punta a Punta.')
    // El resto de los campos (título, hora y lugar) sería suficiente para auto-publicar si la
    // fecha fuera válida: así se prueba que la fecha imposible por sí sola bloquea la
    // publicación, no que falte algún otro campo requerido.
    extract.mockResolvedValue({
      title: 'Fiesta de Prueba Punta a Punta',
      date: fechaImposible,
      start_time: '20:00',
      venue_name: 'Venue de Prueba',
      flyer_text: `FIESTA DE PRUEBA A LAS 20HS (${fechaImposible})`,
    })

    const res = await processFlyerWithAI('flyer-de-prueba')

    expect(res.success).toBe(true)
    expect(db.rows).toHaveLength(1)
    expect(db.rows[0].status).toBe('DRAFT')
    expect(db.rows[0].status).not.toBe('PUBLISHED')
    // El pipeline terminó por el camino normal (no por la rama de fallback de excepción): el
    // flyer queda PROCESSED, no FAILED, aunque el evento no se haya autopublicado.
    const processedUpdate = flyerState.updates.find((u) => (u as { ai_status?: string }).ai_status === 'PROCESSED')
    expect(processedUpdate).toBeDefined()
    const failedUpdate = flyerState.updates.find((u) => (u as { ai_status?: string }).ai_status === 'FAILED')
    expect(failedUpdate).toBeUndefined()
  })
})
