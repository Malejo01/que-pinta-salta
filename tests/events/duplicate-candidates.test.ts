import { describe, expect, it } from 'vitest'
import {
  findDuplicateCandidates,
  getDuplicateCandidates,
  type DuplicateCandidateEvent,
} from '@/lib/events/duplicate-candidates'
import { createFakeSupabase } from '../radar/fake-supabase'

const HORA = 60 * 60 * 1000

const VENUE_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const VENUE_B = 'bbbbbbbb-0000-0000-0000-000000000002'
const MERGE_TARGET = 'cccccccc-0000-4000-8000-000000000003'

function ev(
  id: string,
  startIso: string,
  venueId: string | null,
  extra: Partial<DuplicateCandidateEvent> = {}
): DuplicateCandidateEvent {
  return {
    id,
    title: 'Evento de Prueba',
    start_date: startIso,
    status: 'PUBLISHED',
    venue_id: venueId,
    ...extra,
  }
}

describe('findDuplicateCandidates', () => {
  it('mismo lugar a 23 h de diferencia: par', () => {
    const a = ev('a', '2026-12-01T20:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-02T19:00:00Z', VENUE_A) // +23h
    const pares = findDuplicateCandidates([a, b])
    expect(pares).toHaveLength(1)
    expect(pares[0].hoursApart).toBeCloseTo(23)
    expect([pares[0].a.id, pares[0].b.id].sort()).toEqual(['a', 'b'])
  })

  it('mismo lugar a 25 h de diferencia: no es par', () => {
    const a = ev('a', '2026-12-01T20:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-02T21:00:00Z', VENUE_A) // +25h
    expect(findDuplicateCandidates([a, b])).toEqual([])
  })

  it('distinto lugar: no es par aunque sea la misma hora', () => {
    const a = ev('a', '2026-12-01T20:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-01T20:00:00Z', VENUE_B)
    expect(findDuplicateCandidates([a, b])).toEqual([])
  })

  it('sin lugar (venue_id null): no participa', () => {
    const a = ev('a', '2026-12-01T20:00:00Z', null)
    const b = ev('b', '2026-12-01T20:30:00Z', null)
    expect(findDuplicateCandidates([a, b])).toEqual([])
  })

  it('evento fusionado a mano (ai_metadata.merged_into_event_id): no participa', () => {
    const a = ev('a', '2026-12-01T20:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-01T20:30:00Z', VENUE_A, {
      ai_metadata: { merged_into_event_id: MERGE_TARGET },
    })
    expect(findDuplicateCandidates([a, b])).toEqual([])
  })

  it('evento CANCELLED: no participa', () => {
    const a = ev('a', '2026-12-01T20:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-01T20:30:00Z', VENUE_A, { status: 'CANCELLED' })
    expect(findDuplicateCandidates([a, b])).toEqual([])
  })

  it('tres eventos en el mismo lugar dentro de la ventana: tres pares', () => {
    const a = ev('a', '2026-12-01T16:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-01T21:00:00Z', VENUE_A) // +5h de a
    const c = ev('c', '2026-12-02T00:00:00Z', VENUE_A) // +3h de b, +8h de a
    const pares = findDuplicateCandidates([a, b, c])
    expect(pares).toHaveLength(3)
    const idsDePares = pares.map((p) => [p.a.id, p.b.id].sort().join('-')).sort()
    expect(idsDePares).toEqual(['a-b', 'a-c', 'b-c'])
  })

  it('el par más cercano en el tiempo va primero', () => {
    const a = ev('a', '2026-12-01T16:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-01T21:00:00Z', VENUE_A) // +5h de a
    const c = ev('c', '2026-12-02T00:00:00Z', VENUE_A) // +3h de b (el más cercano)
    const pares = findDuplicateCandidates([a, b, c])
    expect(pares[0].hoursApart).toBeCloseTo(3)
    expect([pares[0].a.id, pares[0].b.id].sort()).toEqual(['b', 'c'])
    expect(pares[pares.length - 1].hoursApart).toBeGreaterThanOrEqual(pares[0].hoursApart)
  })

  it('respeta un windowHours distinto al default', () => {
    const a = ev('a', '2026-12-01T20:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-02T01:00:00Z', VENUE_A) // +5h
    expect(findDuplicateCandidates([a, b], { windowHours: 4 })).toEqual([])
    expect(findDuplicateCandidates([a, b], { windowHours: 6 })).toHaveLength(1)
  })

  it('lista vacía o con un solo evento: sin pares', () => {
    expect(findDuplicateCandidates([])).toEqual([])
    expect(findDuplicateCandidates([ev('a', '2026-12-01T20:00:00Z', VENUE_A)])).toEqual([])
  })

  it('diferencia exacta de 24 h con la ventana default: no es par (límite exclusivo)', () => {
    const a = ev('a', '2026-12-01T20:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-02T20:00:00Z', VENUE_A) // +24h exactas
    expect(findDuplicateCandidates([a, b])).toEqual([])
  })
})

describe('getDuplicateCandidates', () => {
  const now = new Date('2026-12-01T15:00:00Z')

  it('trae PUBLISHED/DRAFT en la ventana, normaliza venue (array -> objeto) y aplica findDuplicateCandidates', async () => {
    const { client, callsOf, args } = createFakeSupabase({
      events: {
        rows: [
          {
            id: 'a',
            title: 'Show A',
            start_date: '2026-12-01T20:00:00Z',
            status: 'PUBLISHED',
            venue_id: VENUE_A,
            venue: [{ name: 'Venue de Prueba' }],
          },
          {
            id: 'b',
            title: 'Show B',
            start_date: '2026-12-01T21:00:00Z',
            status: 'DRAFT',
            venue_id: VENUE_A,
            venue: [{ name: 'Venue de Prueba' }],
          },
        ],
      },
    })

    const pares = await getDuplicateCandidates(client as never, now)
    expect(pares).toHaveLength(1)
    expect(pares[0].a.venue).toEqual({ name: 'Venue de Prueba' })

    const [q] = callsOf('events')
    expect(args(q, 'in')).toEqual([['status', ['PUBLISHED', 'DRAFT']]])
  })

  it('venue ya como objeto (no array) se conserva igual', async () => {
    const { client } = createFakeSupabase({
      events: {
        rows: [
          {
            id: 'a',
            title: 'Show A',
            start_date: '2026-12-01T20:00:00Z',
            status: 'PUBLISHED',
            venue_id: VENUE_A,
            venue: { name: 'Venue de Prueba' },
          },
          {
            id: 'b',
            title: 'Show B',
            start_date: '2026-12-01T20:30:00Z',
            status: 'PUBLISHED',
            venue_id: VENUE_A,
            venue: { name: 'Venue de Prueba' },
          },
        ],
      },
    })
    const pares = await getDuplicateCandidates(client as never, now)
    expect(pares).toHaveLength(1)
    expect(pares[0].a.venue).toEqual({ name: 'Venue de Prueba' })
  })

  it('sin venue en la fila: queda null', async () => {
    const { client } = createFakeSupabase({
      events: {
        rows: [
          { id: 'a', title: 'A', start_date: '2026-12-01T20:00:00Z', status: 'PUBLISHED', venue_id: VENUE_A },
          { id: 'b', title: 'B', start_date: '2026-12-01T20:30:00Z', status: 'PUBLISHED', venue_id: VENUE_A },
        ],
      },
    })
    const pares = await getDuplicateCandidates(client as never, now)
    expect(pares).toHaveLength(1)
    expect(pares[0].a.venue).toBeNull()
    expect(pares[0].b.venue).toBeNull()
  })

  it('error de la consulta: devuelve lista vacía sin lanzar', async () => {
    const { client } = createFakeSupabase({
      events: { rows: [], error: { message: 'boom' } },
    })
    await expect(getDuplicateCandidates(client as never, now)).resolves.toEqual([])
  })
})
