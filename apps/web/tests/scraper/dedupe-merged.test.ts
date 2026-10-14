import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findDuplicateMatch, upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { createFakeEventsDb, type EventRow } from '../events/fake-events-db'

/** Los fixtures usan status como string; findDuplicateMatch espera Partial<Event>. */
const matchOf = (ev: object, ...rest: Parameters<typeof findDuplicateMatch> extends [unknown, ...infer R] ? R : never) =>
  findDuplicateMatch(ev as Parameters<typeof findDuplicateMatch>[0], ...rest)

const uid = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`
const VENUE = 'cccccccc-cccc-4ccc-8ccc-000000000001'
const START = '2026-11-20T23:00:00.000Z' // 20:00 en Salta

function row(n: number, over: EventRow = {}, mergedInto?: string): EventRow {
  return {
    id: uid(n),
    title: `Banda de Prueba ${n}`,
    slug: `banda-de-prueba-${n}`,
    status: 'PUBLISHED',
    start_date: START,
    venue_id: VENUE,
    scrape_source_key: 'manual',
    ticket_url: null,
    ticket_sources: [],
    merge_audit: [],
    ai_metadata: mergedInto ? { merged_into_event_id: mergedInto } : null,
    ...over,
  }
}

/** Evento entrante de una ticketera que matchea por clave con el título "Banda de Prueba 1". */
const incoming = () => ({
  title: 'Banda de Prueba 1',
  slug: 'banda-de-prueba-1-norteticket',
  start_date: START,
  venue_id: VENUE,
  status: 'PUBLISHED',
  ticket_url: 'https://tickets.example.test/banda-de-prueba',
  price_min: 12000,
})

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('upsertEventWithDeduplication sigue merged_into_event_id', () => {
  it('el update va al destino X y el fusionado no recibe ninguno', async () => {
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT' }, uid(2)), // fusionado en X
      row(2, { title: 'Banda de Prueba Gira Completa Sede Distinta', slug: 'x-destino' }),
    ])
    const res = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)

    expect(res).toMatchObject({ success: true, action: 'update', eventId: uid(2) })
    expect(db.updates.map((u) => u.id)).toEqual([uid(2)])
    expect(db.updates.some((u) => u.id === uid(1))).toBe(false)
    expect(db.inserts).toHaveLength(0)
  })

  it('el fusionado sigue en DRAFT: el patch no lo promueve', async () => {
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT' }, uid(2)),
      row(2, { title: 'Destino Distinto de Prueba', slug: 'x-destino' }),
    ])
    await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(db.updates.every((u) => u.id !== uid(1))).toBe(true)
    expect(db.rows[0].status).toBe('DRAFT')
  })

  it('la fusión de datos se hace sobre el destino (ticket_sources y precio mínimo)', async () => {
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT' }, uid(2)),
      row(2, { title: 'Destino Distinto de Prueba', slug: 'x-destino', price_min: 15000 }),
    ])
    await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    const payload = db.updates[0].payload
    expect(payload.price_min).toBe(12000)
    expect(JSON.stringify(payload.ticket_sources)).toContain('tickets.example.test/banda-de-prueba')
  })

  it('cadena de 2 saltos: el update va al final de la cadena', async () => {
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT' }, uid(2)),
      row(2, { status: 'DRAFT', title: 'Intermedio Distinto de Prueba', slug: 'inter' }, uid(3)),
      row(3, { title: 'Final Distinto de Prueba', slug: 'final' }),
    ])
    const res = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(3) })
    expect(db.updates.map((u) => u.id)).toEqual([uid(3)])
  })

  it('ciclo: no toca los fusionados e inserta uno nuevo', async () => {
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT' }, uid(2)),
      row(2, { status: 'DRAFT', title: 'Otro Distinto de Prueba', slug: 'otro' }, uid(1)),
    ])
    const res = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(res.action).toBe('insert')
    expect(db.updates).toHaveLength(0)
    expect(db.inserts).toHaveLength(1)
  })

  it('destino inexistente: no toca el fusionado e inserta uno nuevo', async () => {
    const db = createFakeEventsDb([row(1, { status: 'DRAFT' }, uid(99))])
    const res = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(res.action).toBe('insert')
    expect(res.eventId).not.toBe(uid(1))
    expect(db.updates).toHaveLength(0)
    expect(db.inserts).toHaveLength(1)
  })

  it('tope de 5 saltos: una cadena de 6 inserta uno nuevo y no toca ninguno', async () => {
    // 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
    const chain = [2, 3, 4, 5, 6].map((n) =>
      row(n, { status: 'DRAFT', title: `Eslabon Distinto ${n}`, slug: `eslabon-${n}` }, uid(n + 1))
    )
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT' }, uid(2)),
      ...chain,
      row(7, { title: 'Final Distinto de Prueba', slug: 'final' }),
    ])
    const res = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(res.action).toBe('insert')
    expect(db.updates).toHaveLength(0)
  })

  it('por slug: si el match por slug es un fusionado, también sigue al destino', async () => {
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT', title: 'Banda de Prueba 1', start_date: '2026-12-25T23:00:00.000Z', slug: 'slug-compartido' }, uid(2)),
      row(2, { title: 'Destino Distinto de Prueba', slug: 'x-destino', start_date: '2026-12-25T23:00:00.000Z' }),
    ])
    const ev = { ...incoming(), slug: 'slug-compartido', start_date: '2026-12-26T23:00:00.000Z' }
    // Otro día: findDuplicateMatch no trae candidatos; el único match posible es el slug
    // (mismo título, score 1), que apunta al fusionado.
    const res = await upsertEventWithDeduplication(ev, 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(2) })
    expect(db.updates.map((u) => u.id)).toEqual([uid(2)])
  })

  it('no regresión: un duplicado no fusionado se actualiza a sí mismo', async () => {
    const db = createFakeEventsDb([row(1, { title: 'Banda de Prueba 1' })])
    const res = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(1) })
    expect(db.updates.map((u) => u.id)).toEqual([uid(1)])
  })

  it('no regresión: sin duplicado inserta', async () => {
    const db = createFakeEventsDb([])
    const res = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(res.action).toBe('insert')
    expect(db.inserts).toHaveLength(1)
  })
})

describe('cadena rota y excludeMerged', () => {
  it('cadena rota en dos corridas seguidas: la primera inserta, la segunda actualiza lo insertado', async () => {
    const db = createFakeEventsDb([row(1, { status: 'DRAFT' }, uid(99))])
    const first = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(first.action).toBe('insert')
    expect(db.inserts).toHaveLength(1)

    const second = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(second).toMatchObject({ action: 'update', eventId: first.eventId })
    expect(db.inserts).toHaveLength(1)
    expect(db.updates.map((u) => u.id)).toEqual([first.eventId])
    expect(db.updates.some((u) => u.id === uid(1))).toBe(false)
  })

  it('cadena rota con un no fusionado equivalente: fusiona en ese, no inserta', async () => {
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT' }, uid(99)),
      row(3, { title: 'Banda de Prueba 1', slug: 'otro-slug' }),
    ])
    const res = await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(3) })
    expect(db.inserts).toHaveLength(0)
    expect(db.updates.every((u) => u.id === uid(3))).toBe(true)
  })

  it('cadena rota: el insert no reutiliza el slug del fusionado', async () => {
    const db = createFakeEventsDb([row(1, { status: 'DRAFT', slug: 'banda-de-prueba-1-norteticket' }, uid(99))])
    await upsertEventWithDeduplication(incoming(), 'norteticket', db.client)
    expect(db.inserts[0].slug).not.toBe('banda-de-prueba-1-norteticket')
    expect(String(db.inserts[0].slug)).toMatch(/^banda-de-prueba-1-norteticket-/)
  })

  it('match por ticket_url hacia un fusionado con destino válido: update al destino', async () => {
    const url = 'https://tickets.example.test/banda-de-prueba'
    const db = createFakeEventsDb([
      row(1, { status: 'DRAFT', title: 'Titulo Totalmente Otro', slug: 'otro-1', ticket_url: url, venue_id: null }, uid(2)),
      row(2, { title: 'Destino Distinto de Prueba', slug: 'x-destino', venue_id: 'cccccccc-cccc-4ccc-8ccc-000000000009' }),
    ])
    const ev = { ...incoming(), title: 'Nombre Sin Relacion Alguna', venue_id: null }
    const res = await upsertEventWithDeduplication(ev, 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(2) })
    expect(db.updates.map((u) => u.id)).toEqual([uid(2)])
  })

  describe('findDuplicateMatch con excludeMerged', () => {
    const URL_T = 'https://tickets.example.test/banda-de-prueba'

    it('ticket_url: ignora al fusionado; sin la opción lo devuelve', async () => {
      const merged = row(1, { status: 'DRAFT', title: 'Titulo Totalmente Otro', ticket_url: URL_T, venue_id: null }, uid(2))
      const ev = { ...incoming(), title: 'Nombre Sin Relacion Alguna', venue_id: null }
      const db = createFakeEventsDb([merged])
      expect((await matchOf(ev, db.client))?.matchedBy).toBe('ticket_url')
      expect(await matchOf(ev, db.client, { excludeMerged: true })).toBeNull()
    })

    it('dedup_key: ignora al fusionado y devuelve al no fusionado equivalente', async () => {
      const db = createFakeEventsDb([
        row(1, { status: 'DRAFT', title: 'Banda de Prueba 1' }, uid(2)),
        row(3, { title: 'Banda de Prueba 1', slug: 'otro' }),
      ])
      expect((await matchOf(incoming(), db.client, { excludeMerged: true }))?.event.id).toBe(uid(3))
      const only = createFakeEventsDb([row(1, { status: 'DRAFT', title: 'Banda de Prueba 1' }, uid(2))])
      expect((await matchOf(incoming(), only.client))?.matchedBy).toBe('dedup_key')
      expect(await matchOf(incoming(), only.client, { excludeMerged: true })).toBeNull()
    })

    it('similitud por venue: ignora al fusionado', async () => {
      const merged = row(1, { status: 'DRAFT', title: 'Banda de Prueba' }, uid(2))
      const ev = { ...incoming(), title: 'Banda de Prueba Extendida', ticket_url: null }
      const db = createFakeEventsDb([merged])
      expect((await matchOf(ev, db.client))?.matchedBy).toBe('venue_similarity')
      expect(await matchOf(ev, db.client, { excludeMerged: true })).toBeNull()
    })

    it('un evento no fusionado se encuentra igual con la opción (no regresión)', async () => {
      const db = createFakeEventsDb([row(1, { title: 'Banda de Prueba 1' })])
      expect((await matchOf(incoming(), db.client, { excludeMerged: true }))?.event.id).toBe(uid(1))
    })
  })
})
