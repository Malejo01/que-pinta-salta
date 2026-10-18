// Tarea 40-b (QPS-164, hallazgo 1): tolerancia de TOLERANCIA_HORA_DEDUP_MIN (120 minutos, ver
// packages/core/src/scraper/dedup-key.ts) en los dos caminos de deduplicate.ts que fusionan por
// similitud de título, no por link o clave exacta: el paso 2 (respaldo difuso) de
// findDuplicateMatch, y la colisión de slug único de upsertEventWithDeduplication. Decisión de
// Mauro (17/10, 11:45): si la hora de los dos eventos está a más de 120 minutos, no se fusionan;
// si a uno de los dos le falta la hora, se mantiene lo de hoy (se fusiona). Cierra el límite
// conocido que dejaban tests/scraper/dedup-hora.test.ts y
// tests/scraper/deduplicate-similitud.test.ts (R34), ya actualizados para reflejar este cambio.
//
// Sin red ni base: fixtures inventados. Los `start_date` se escriben como instantes con zona
// explícita ("...Z" o "-03:00"): los tests corren con TZ=UTC (vitest.config.ts), así que un string
// de hora de pared sin zona estaría probando otra cosa.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findDuplicateMatch, upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { createFakeEventsDb, type EventRow } from '../events/fake-events-db'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

const VENUE = 'ffffffff-ffff-4fff-8fff-000000000099'

describe('findDuplicateMatch: paso 2 (respaldo difuso) con tolerancia de hora (QPS-164, hallazgo 1)', () => {
  const uid = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`
  const TITULO = 'Show Tolerancia Paso Dos'

  const FUNCION_16 = '2026-11-20T19:00:00.000Z' // 16:00 Salta
  const FUNCION_19 = '2026-11-20T22:00:00.000Z' // 19:00 Salta
  const FUNCION_20 = '2026-11-20T23:00:00.000Z' // 20:00 Salta
  const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta (sigue siendo el 20 en Salta)
  const FUNCION_21_15 = '2026-11-21T00:15:00.000Z' // 21:15 Salta
  const FUNCION_21_30 = '2026-11-21T00:30:00.000Z' // 21:30 Salta
  const SIN_HORA = '2026-11-20T03:00:00.000Z' // 00:00 Salta: el placeholder de "sin hora"

  function row(n: number, over: EventRow = {}): EventRow {
    return {
      id: uid(n),
      title: TITULO,
      slug: `show-tolerancia-paso-dos-${n}`,
      status: 'PUBLISHED',
      start_date: FUNCION_16,
      venue_id: VENUE,
      scrape_source_key: 'manual',
      ticket_url: null,
      ticket_sources: [],
      merge_audit: [],
      ...over,
    }
  }

  it('16:00 y 21:00 del mismo show, el mismo día, título idéntico: no matchea, quedan dos filas', async () => {
    const existing = row(1, { start_date: FUNCION_16 })
    const db = createFakeEventsDb([existing])
    const incoming = { title: TITULO, start_date: FUNCION_21, venue_id: VENUE }
    expect(await findDuplicateMatch(incoming, db.client)).toBeNull()

    const res = await upsertEventWithDeduplication(
      { ...incoming, status: 'PUBLISHED', slug: 'show-tolerancia-paso-dos-nueva-funcion' },
      'alpogo',
      db.client
    )
    expect(res).toMatchObject({ action: 'insert' })
    expect(db.rows).toHaveLength(2)
  })

  it('21:00 de una fuente contra 21:30 de otra, "Airbag" contra "Airbag: Gira El Rey del Mundo": se fusionan en una fila con los dos links', async () => {
    const existing = row(1, {
      title: 'Airbag',
      slug: 'airbag-fuente-a',
      start_date: FUNCION_21,
      ticket_url: 'https://tickets.example.test/airbag-fuente-a',
    })
    const db = createFakeEventsDb([existing])
    const incoming = {
      title: 'Airbag: Gira El Rey del Mundo',
      start_date: FUNCION_21_30,
      venue_id: VENUE,
      ticket_url: 'https://tickets.example.test/airbag-fuente-b',
    }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(1) } })

    const res = await upsertEventWithDeduplication({ ...incoming, status: 'PUBLISHED' }, 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(1) })
    expect(db.rows).toHaveLength(1)
    const urls = (db.updates[0].payload.ticket_sources as Array<{ url: string }>).map((s) => s.url).sort()
    expect(urls).toEqual([
      'https://tickets.example.test/airbag-fuente-a',
      'https://tickets.example.test/airbag-fuente-b',
    ])
  })

  it('borde: exactamente 120 minutos de diferencia se fusionan (inclusivo)', async () => {
    const existing = row(1, { start_date: FUNCION_16 })
    const db = createFakeEventsDb([existing])
    const incoming = {
      title: TITULO,
      start_date: '2026-11-20T21:00:00.000Z', // 18:00 Salta: 120 minutos después de las 16:00
      venue_id: VENUE,
    }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(1) } })
  })

  it('borde: 121 minutos de diferencia NO se fusionan', async () => {
    const existing = row(1, { start_date: FUNCION_16 })
    const db = createFakeEventsDb([existing])
    const incoming = {
      title: TITULO,
      start_date: '2026-11-20T21:01:00.000Z', // 18:01 Salta: 121 minutos después de las 16:00
      venue_id: VENUE,
    }
    expect(await findDuplicateMatch(incoming, db.client)).toBeNull()
  })

  // Títulos distintos (uno más largo que el otro, "contiene" al corto) a propósito: con el mismo
  // título, la clave del paso 1 (título + día) coincidiría y el bypass de "falta hora real" de
  // sameStartTimeForKey capturaría el match ahí, sin pasar por acá. Con títulos distintos la
  // clave del paso 1 no matchea (dedupKeyOf difiere) y el caso queda aislado en el paso 2.
  const TITULO_CORTO = 'Ciclo De Cine Documental'
  const TITULO_LARGO = 'Ciclo De Cine Documental Especial'

  it('sin hora (00:00 Salta) la que ya está, 21:00 la entrante: se fusiona como hoy', async () => {
    const existing = row(1, { title: TITULO_CORTO, start_date: SIN_HORA })
    const db = createFakeEventsDb([existing])
    const incoming = { title: TITULO_LARGO, start_date: FUNCION_21, venue_id: VENUE }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(1) } })
  })

  it('simétrico: sin hora la entrante, 21:00 la que ya está: también se fusiona', async () => {
    const existing = row(1, { title: TITULO_CORTO, start_date: FUNCION_21 })
    const db = createFakeEventsDb([existing])
    const incoming = { title: TITULO_LARGO, start_date: SIN_HORA, venue_id: VENUE }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(1) } })
  })

  // Independencia del orden: la consulta de candidatos (deduplicate.ts, `.gte/.lte` sin
  // `.order()`) no garantiza el orden del array `candidates`, así que el resultado no puede
  // depender de cuál vino primero.
  it('candidatos a las 16:00 y a las 21:00, entrante a las 21:30: elige el de las 21:00 (16:00 queda afuera por la tolerancia)', async () => {
    const show16 = row(1, { start_date: FUNCION_16 })
    const show21 = row(2, { start_date: FUNCION_21 })
    const dbA = createFakeEventsDb([show16, show21])
    const incoming = { title: TITULO, start_date: FUNCION_21_30, venue_id: VENUE }
    const matchA = await findDuplicateMatch(incoming, dbA.client)
    expect(matchA).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(2) } })

    const dbB = createFakeEventsDb([show21, show16]) // orden inverso
    const matchB = await findDuplicateMatch(incoming, dbB.client)
    expect(matchB).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(2) } })
  })

  it('un candidato sin hora y otro a las 21:00, entrante a las 21:15, mismo puntaje: elige el de las 21:00', async () => {
    const sinHora = row(1, { title: TITULO_CORTO, start_date: SIN_HORA })
    const conHora = row(2, { title: TITULO_CORTO, start_date: FUNCION_21 })
    const incoming = { title: TITULO_LARGO, start_date: FUNCION_21_15, venue_id: VENUE }

    const dbA = createFakeEventsDb([sinHora, conHora])
    const matchA = await findDuplicateMatch(incoming, dbA.client)
    expect(matchA).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(2) } })

    const dbB = createFakeEventsDb([conHora, sinHora]) // orden inverso
    const matchB = await findDuplicateMatch(incoming, dbB.client)
    expect(matchB).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(2) } })
  })

  // Empate exacto de score Y de diferencia en minutos (los dos candidatos a 60 minutos del
  // entrante): sin el tercer criterio de desempate (menor `id`), este caso lo decidía el orden
  // del array, que la consulta de candidatos no garantiza.
  it('candidatos a las 19:00 y a las 21:00, entrante a las 20:00, mismo puntaje y misma distancia: elige el de menor id', async () => {
    const show19 = row(1, { start_date: FUNCION_19 })
    const show21 = row(2, { start_date: FUNCION_21 })
    const incoming = { title: TITULO, start_date: FUNCION_20, venue_id: VENUE }

    const dbA = createFakeEventsDb([show19, show21])
    const matchA = await findDuplicateMatch(incoming, dbA.client)
    expect(matchA).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(1) } })

    const dbB = createFakeEventsDb([show21, show19]) // orden inverso
    const matchB = await findDuplicateMatch(incoming, dbB.client)
    expect(matchB).toMatchObject({ matchedBy: 'venue_similarity', event: { id: uid(1) } })
  })
})

describe('upsertEventWithDeduplication: colisión de slug único, con tolerancia de hora (QPS-164, hallazgo 1)', () => {
  // venue_id: null en todos los casos para aislar el camino del paso 2 (respaldo difuso), que
  // exige venue_id y no participaría de todos modos en estos escenarios.
  const uid = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(500 + n).padStart(12, '0')}`
  const TITULO = 'Show Colision De Slug Con Tolerancia'
  const SLUG = 'show-colision-de-slug-con-tolerancia'

  const FUNCION_16 = '2026-11-20T19:00:00.000Z' // 16:00 Salta
  const FUNCION_19 = '2026-11-20T22:00:00.000Z' // 19:00 Salta
  const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta (sigue siendo el 20 en Salta)
  const FUNCION_21_30 = '2026-11-21T00:30:00.000Z' // 21:30 Salta
  const FUNCION_22 = '2026-11-21T01:00:00.000Z' // 22:00 Salta
  const SIN_HORA = '2026-11-20T03:00:00.000Z' // 00:00 Salta: el placeholder de "sin hora"

  function row(n: number, over: EventRow = {}): EventRow {
    return {
      id: uid(n),
      title: TITULO,
      slug: SLUG,
      status: 'PUBLISHED',
      start_date: FUNCION_16,
      venue_id: null,
      scrape_source_key: 'manual',
      ticket_url: null,
      ticket_sources: [],
      merge_audit: [],
      ...over,
    }
  }

  it('mismo slug, 16:00 contra 21:00: inserta, y el slug nuevo termina en "-2026-11-20-2100"', async () => {
    const existing = row(1, { start_date: FUNCION_16 })
    const db = createFakeEventsDb([existing])
    const incoming = { title: TITULO, start_date: FUNCION_21, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res = await upsertEventWithDeduplication(incoming, 'alpogo', db.client)
    expect(res).toMatchObject({ action: 'insert' })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0].slug).toBe(`${SLUG}-2026-11-20-2100`)
    expect(db.rows).toHaveLength(2)
  })

  it('tres funciones (16:00, 19:00 y 22:00) con el mismo slug: tres filas, con slugs distintos entre sí', async () => {
    const existing = row(1, { start_date: FUNCION_16 })
    const db = createFakeEventsDb([existing])

    const incoming19 = { title: TITULO, start_date: FUNCION_19, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res19 = await upsertEventWithDeduplication(incoming19, 'alpogo', db.client)
    expect(res19).toMatchObject({ action: 'insert' })

    // La colisión de slug siempre consulta `.eq('slug', eventData.slug)` con el slug BASE (SLUG):
    // la fila de las 19 ya salió con un sufijo distinto, así que la de las 22 vuelve a chocar con
    // la de las 16 (la única que sigue con el slug base), no con la de las 19. Con un sufijo de
    // sólo día las dos chocarían con el mismo "SLUG-2026-11-20" y el segundo insert violaría el
    // índice único de `slug`.
    const incoming22 = { title: TITULO, start_date: FUNCION_22, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res22 = await upsertEventWithDeduplication(incoming22, 'alpogo', db.client)
    expect(res22).toMatchObject({ action: 'insert' })

    expect(db.rows).toHaveLength(3)
    const slugs = db.rows.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(3)
  })

  it('mismo slug, 21:00 contra 21:30: se fusiona en una fila', async () => {
    const existing = row(1, { start_date: FUNCION_21 })
    const db = createFakeEventsDb([existing])
    const incoming = { title: TITULO, start_date: FUNCION_21_30, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res = await upsertEventWithDeduplication(incoming, 'alpogo', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(1) })
    expect(db.rows).toHaveLength(1)
  })

  // Títulos distintos a propósito (igual que en el describe de arriba): con el mismo título, el
  // bypass de "falta hora real" del paso 1 (sameStartTimeForKey) capturaría el match antes de
  // llegar acá. Con títulos distintos (uno contiene al otro) el paso 1 no matchea por clave y el
  // caso queda aislado en la colisión de slug, forzando el mismo slug a mano.
  it('mismo slug, uno sin hora: se fusiona como hoy', async () => {
    const existing = row(1, { title: 'Obra Teatral Sin Horario Definido', start_date: SIN_HORA })
    const db = createFakeEventsDb([existing])
    const incoming = {
      title: 'Exhibicion Especial Obra Teatral Sin Horario Definido',
      start_date: FUNCION_21,
      slug: SLUG,
      venue_id: null,
      status: 'PUBLISHED',
    }
    const res = await upsertEventWithDeduplication(incoming, 'alpogo', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(1) })
    expect(db.rows).toHaveLength(1)
  })
})
