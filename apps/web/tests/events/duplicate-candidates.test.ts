import { describe, expect, it } from 'vitest'
import {
  canMerge,
  defaultKeeper,
  findDuplicateCandidates,
  getDuplicateCandidates,
  pairKey,
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

describe('findDuplicateCandidates con dismissed', () => {
  it('el par descartado no aparece en ningún orden (a|b ni b|a); los otros pares del mismo venue sí', () => {
    const a = ev('a', '2026-12-01T16:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-01T17:00:00Z', VENUE_A)
    const c = ev('c', '2026-12-01T18:00:00Z', VENUE_A)
    // pairKey se construye con el orden invertido (b, a) a propósito: tiene que dar
    // la misma clave que (a, b), porque orderPair/pairKey normalizan por valor, no por
    // el orden en que llegan los argumentos.
    const dismissed = new Set([pairKey(b.id, a.id)])
    const pares = findDuplicateCandidates([a, b, c], { dismissed })
    const claves = pares.map((p) => [p.a.id, p.b.id].sort().join('-')).sort()
    expect(claves).toEqual(['a-c', 'b-c'])
  })

  it('sin dismissed: el mismo trío da los tres pares (control)', () => {
    const a = ev('a', '2026-12-01T16:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-01T17:00:00Z', VENUE_A)
    const c = ev('c', '2026-12-01T18:00:00Z', VENUE_A)
    expect(findDuplicateCandidates([a, b, c])).toHaveLength(3)
  })

  it('dismissed con un par que no aparece en la lista: no afecta a los demás', () => {
    const a = ev('a', '2026-12-01T16:00:00Z', VENUE_A)
    const b = ev('b', '2026-12-01T17:00:00Z', VENUE_A)
    const dismissed = new Set([pairKey('x', 'y')])
    const pares = findDuplicateCandidates([a, b], { dismissed })
    expect(pares).toHaveLength(1)
  })
})

describe('defaultKeeper', () => {
  type KeeperFixture = Parameters<typeof defaultKeeper>[0]

  function keeperEv(id: string, overrides: Partial<KeeperFixture> = {}): KeeperFixture {
    return {
      id,
      status: 'DRAFT',
      venue_id: null,
      start_date: '2026-12-01T18:00:00.000Z', // 15:00 en Salta: hora real, no es el placeholder 00:00
      image_url: null,
      ticket_url: null,
      ticket_sources: null,
      description: null,
      price_min: null,
      created_at: null,
      ...overrides,
    }
  }

  it('publicado contra borrador: gana el publicado, aunque el borrador tenga más datos', () => {
    const publicado = keeperEv('a', { status: 'PUBLISHED' })
    const borrador = keeperEv('b', {
      image_url: 'https://cdn.example.test/flyer.jpg',
      ticket_url: 'https://entradas.example.test/show',
      description: 'Descripción de prueba',
      price_min: 1000,
      venue_id: VENUE_A,
    })
    expect(defaultKeeper(publicado, borrador)).toBe('a')
    expect(defaultKeeper(borrador, publicado)).toBe('a')
  })

  it('dos borradores: gana el de más datos', () => {
    const pobre = keeperEv('a')
    const rico = keeperEv('b', {
      image_url: 'https://cdn.example.test/flyer.jpg',
      ticket_url: 'https://entradas.example.test/show',
      description: 'Descripción de prueba',
      price_min: 1000,
      venue_id: VENUE_A,
    })
    expect(defaultKeeper(pobre, rico)).toBe('b')
    expect(defaultKeeper(rico, pobre)).toBe('b')
  })

  it('empate en datos: gana el created_at más viejo, no el de menor id', () => {
    // Ids a propósito al revés de lo esperado: si el empate se resolviera por id
    // en vez de por created_at, este test lo detecta.
    const viejoConIdMayor = keeperEv('zzzz-id-mas-viejo', { created_at: '2026-01-01T00:00:00.000Z' })
    const nuevoConIdMenor = keeperEv('aaaa-id-mas-nuevo', { created_at: '2026-01-02T00:00:00.000Z' })
    expect(defaultKeeper(viejoConIdMayor, nuevoConIdMenor)).toBe('zzzz-id-mas-viejo')
    expect(defaultKeeper(nuevoConIdMenor, viejoConIdMayor)).toBe('zzzz-id-mas-viejo')
  })

  it('empate en datos y en created_at (o sin created_at): gana el id menor', () => {
    const mismaFecha = '2026-01-01T00:00:00.000Z'
    const b = keeperEv('b-id', { created_at: mismaFecha })
    const a = keeperEv('a-id', { created_at: mismaFecha })
    expect(defaultKeeper(b, a)).toBe('a-id')
    expect(defaultKeeper(a, b)).toBe('a-id')

    const bSinFecha = keeperEv('b-id')
    const aSinFecha = keeperEv('a-id')
    expect(defaultKeeper(bSinFecha, aSinFecha)).toBe('a-id')
  })

  it('hora 00:00 en Salta no cuenta como dato: gana el que tiene hora real aunque su id sea mayor', () => {
    const sinHora = keeperEv('aaa-sin-hora', { start_date: '2026-12-01T03:00:00.000Z' }) // 00:00 Salta
    const conHora = keeperEv('bbb-con-hora', { start_date: '2026-12-01T18:00:00.000Z' }) // 15:00 Salta
    expect(defaultKeeper(sinHora, conHora)).toBe('bbb-con-hora')
    expect(defaultKeeper(conHora, sinHora)).toBe('bbb-con-hora')
  })
})

describe('canMerge', () => {
  const uid = (n: number) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`
  const A_ID = uid(1)
  const B_ID = uid(2)
  const OTHER_ID = uid(3)

  type MergeFixture = Parameters<typeof canMerge>[0]
  function mergeEv(id: string, overrides: Partial<MergeFixture> = {}): MergeFixture {
    return { id, status: 'PUBLISHED', ai_metadata: null, ...overrides }
  }

  it('el mismo evento consigo mismo: rechazado', () => {
    const e = mergeEv(A_ID)
    expect(canMerge(e, e)).toEqual({ ok: false, reason: 'No se puede fusionar un evento consigo mismo' })
  })

  it('ciclo (el que queda ya está fusionado hacia el que se descarta): rechazado', () => {
    const keep = mergeEv(A_ID, { ai_metadata: { merged_into_event_id: B_ID } })
    const drop = mergeEv(B_ID)
    expect(canMerge(keep, drop)).toEqual({
      ok: false,
      reason: 'El evento que queda ya está fusionado hacia el que se quiere descartar',
    })
  })

  it('el que queda ya fue fusionado hacia otro evento: rechazado', () => {
    const keep = mergeEv(A_ID, { ai_metadata: { merged_into_event_id: OTHER_ID } })
    const drop = mergeEv(B_ID)
    expect(canMerge(keep, drop)).toEqual({ ok: false, reason: 'El evento que queda ya fue fusionado hacia otro evento' })
  })

  it('el que se descarta ya fue fusionado hacia otro evento: rechazado', () => {
    const keep = mergeEv(A_ID)
    const drop = mergeEv(B_ID, { ai_metadata: { merged_into_event_id: OTHER_ID } })
    expect(canMerge(keep, drop)).toEqual({
      ok: false,
      reason: 'El evento que se descarta ya fue fusionado hacia otro evento',
    })
  })

  it('cualquiera de los dos CANCELLED: rechazado, y es simétrico', () => {
    const cancelado = mergeEv(A_ID, { status: 'CANCELLED' })
    const normal = mergeEv(B_ID)
    const esperado = { ok: false, reason: 'No se puede fusionar un evento cancelado' }
    expect(canMerge(cancelado, normal)).toEqual(esperado)
    expect(canMerge(normal, cancelado)).toEqual(esperado)
  })

  it('el que se descarta publicado y el que queda no: rechazado (no es simétrico: con los roles al revés es válido)', () => {
    const keep = mergeEv(A_ID, { status: 'DRAFT' })
    const drop = mergeEv(B_ID, { status: 'PUBLISHED' })
    expect(canMerge(keep, drop)).toEqual({
      ok: false,
      reason: 'El evento que se descarta está publicado y el que queda no: publicá primero el que queda',
    })
    expect(canMerge(drop, keep)).toEqual({ ok: true })
  })

  it('caso válido: ok', () => {
    expect(canMerge(mergeEv(A_ID), mergeEv(B_ID))).toEqual({ ok: true })
  })
})
