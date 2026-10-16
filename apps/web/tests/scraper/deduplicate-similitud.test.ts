// Tarea 32-q (QA): caracterización de lib/scraper/deduplicate.ts que no cubren
// tests/scraper/dedupe-merged.test.ts (fusionados a mano) ni
// tests/events/duplicate-candidates.test.ts (candidatos de fusión manual en el admin):
//   - normalizeTitle y calculateSimilarity en el umbral 0.65 (casos exactos 0.64/0.65/0.66).
//   - findDuplicateMatch: respaldo difuso con el umbral, conflicto de venue sin link en común,
//     y el caso de "dos funciones el mismo día" por clave (16:00 y 21:00).
// Sin red ni base: fixtures inventados.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateSimilarity, findDuplicateMatch, normalizeTitle, upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { createFakeEventsDb, type EventRow } from '../events/fake-events-db'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

const uid = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`
const VENUE = 'cccccccc-cccc-4ccc-8ccc-000000000001'
const START = '2026-11-20T23:00:00.000Z' // 20:00 Salta

function row(n: number, over: EventRow = {}): EventRow {
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
    ...over,
  }
}

describe('normalizeTitle', () => {
  it('saca stop words y colapsa "Show de Rock" y "Rock" al mismo string', () => {
    expect(normalizeTitle('Show de Rock')).toBe(normalizeTitle('Rock'))
    expect(normalizeTitle('Rock')).toBe('rock')
  })

  it('minúsculas, sin tildes ni signos de puntuación', () => {
    expect(normalizeTitle('¡BANDÁ de PRUEBA!')).toBe('banda prueba')
  })

  it('vacío o solo stop words: cadena vacía', () => {
    expect(normalizeTitle('')).toBe('')
    expect(normalizeTitle(null as unknown as string)).toBe('')
    expect(normalizeTitle('de la en con')).toBe('')
  })

  it('palabras de una sola letra se descartan', () => {
    expect(normalizeTitle('Banda a y Prueba')).toBe('banda prueba')
  })
})

describe('calculateSimilarity: en el umbral 0.65 (>=)', () => {
  // Construye dos títulos con una proporción exacta de palabras compartidas (índice Jaccard
  // sobre palabras, tal como lo calcula calculateSimilarity). `shared` palabras están en los
  // dos títulos; el segundo título además tiene (`total` - `shared`) palabras propias. El orden
  // del segundo título se invierte a propósito para que el string de uno no quede contenido
  // literalmente en el otro (si no, calculateSimilarity daría 0.9 por el atajo de substring en
  // vez de aplicar la fórmula de Jaccard).
  function buildPair(shared: number, total: number) {
    const extra = total - shared
    const sharedWords = Array.from({ length: shared }, (_, i) => `palabracompartida${i + 1}`)
    const extraWords = Array.from({ length: extra }, (_, i) => `palabrapropia${i + 1}`)
    const title1 = sharedWords.join(' ')
    const title2 = [...extraWords, ...[...sharedWords].reverse()].join(' ')
    return { title1, title2 }
  }

  it('0.64 exacto: por debajo del umbral, NO matchea', () => {
    const { title1, title2 } = buildPair(16, 25)
    expect(calculateSimilarity(title1, title2)).toBeCloseTo(0.64, 5)
  })

  it('0.65 exacto: en el umbral, SÍ matchea (>=, no >)', () => {
    const { title1, title2 } = buildPair(13, 20)
    expect(calculateSimilarity(title1, title2)).toBeCloseTo(0.65, 5)
  })

  it('0.66 exacto: por encima del umbral, matchea', () => {
    const { title1, title2 } = buildPair(33, 50)
    expect(calculateSimilarity(title1, title2)).toBeCloseTo(0.66, 5)
  })

  it('findDuplicateMatch (respaldo difuso, mismo venue): 0.64 no matchea, 0.65 sí', async () => {
    const { title1: baseTitle, title2: similar64 } = buildPair(16, 25)
    const existing = row(1, { title: baseTitle })
    const db64 = createFakeEventsDb([existing])
    const miss = await findDuplicateMatch({ title: similar64, start_date: START, venue_id: VENUE }, db64.client)
    expect(miss).toBeNull()

    const { title1: baseTitle2, title2: similar65 } = buildPair(13, 20)
    const existingRow = row(2, { title: baseTitle2 })
    const db65 = createFakeEventsDb([existingRow])
    const hit = await findDuplicateMatch({ title: similar65, start_date: START, venue_id: VENUE }, db65.client)
    expect(hit).toMatchObject({ matchedBy: 'venue_similarity' })
    expect(hit?.score).toBeCloseTo(0.65, 5)
  })

  it('substring largo (>5) de uno dentro del otro: score fijo 0.9, no la fórmula de Jaccard', () => {
    expect(calculateSimilarity('Airbag', 'Airbag Gira El Rey Del Mundo')).toBe(0.9)
  })

  it('títulos vacíos o sin palabras en común: 0', () => {
    expect(calculateSimilarity('', 'Banda de Prueba')).toBe(0)
    expect(calculateSimilarity('Banda de Prueba', '')).toBe(0)
    expect(calculateSimilarity('Alfa Beta', 'Gamma Delta')).toBe(0)
  })

  it('títulos idénticos (tras normalizar): 1', () => {
    expect(calculateSimilarity('Show de Rock', 'Rock')).toBe(1)
  })
})

describe('findDuplicateMatch: conflicto de venue (misma clave, venues distintos)', () => {
  it('sin link de compra en común: no matchea aunque el título y el día sean idénticos', async () => {
    const existing = row(1, { title: 'Fiesta de Fin de Semana', venue_id: 'ffffffff-ffff-4fff-8fff-000000000009' })
    const db = createFakeEventsDb([existing])
    const incoming = { title: 'Fiesta de Fin de Semana', start_date: START, venue_id: VENUE }
    expect(await findDuplicateMatch(incoming, db.client)).toBeNull()
  })

  it('sin venue_id en el entrante: la clave exacta matchea igual (no exige venue)', async () => {
    const existing = row(1, { title: 'Fiesta de Fin de Semana' })
    const db = createFakeEventsDb([existing])
    const incoming = { title: 'Fiesta de Fin de Semana', start_date: START, venue_id: null }
    expect(await findDuplicateMatch(incoming, db.client)).toMatchObject({ matchedBy: 'dedup_key' })
  })
})

describe('findDuplicateMatch: dos funciones el mismo día (16:00 y 21:00)', () => {
  const FUNCION_16 = '2026-11-20T19:00:00.000Z' // 16:00 Salta
  const FUNCION_21 = START // 20:00 Salta (usamos START existente, ya "real")

  it('con ambas funciones ya en la base y el mismo título: el entrante a las 21 se encuentra a sí mismo (hora igual), no a la de las 16', async () => {
    const TITULO = 'Show Doble Funcion De Prueba'
    const show16 = row(1, { title: TITULO, start_date: FUNCION_16 })
    const show21 = row(2, { title: TITULO, start_date: FUNCION_21 })
    const db = createFakeEventsDb([show16, show21])
    const incoming = { title: TITULO, start_date: FUNCION_21, venue_id: VENUE }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match?.event.id).toBe(uid(2)) // la de las 21, no la de las 16
  })

  it('HALLAZGO: si sólo existe la función de las 16 y llega una nueva función a las 21 (mismo título, sin ticket_url compartido), se fusionan en una sola fila', async () => {
    // La clave de dedup es título+día, sin hora: no hay ninguna señal que distinga "es una
    // función nueva" de "es un reintento/actualización de la misma función". El resultado hoy
    // es que la función de las 21 pisa el start_date de la de las 16 en el mismo registro: la
    // base termina con una sola fila para dos funciones reales.
    const show16 = row(1, { start_date: FUNCION_16, scrape_source_key: 'manual' })
    const db = createFakeEventsDb([show16])
    const incoming = {
      title: show16.title as string,
      start_date: FUNCION_21,
      venue_id: VENUE,
      status: 'PUBLISHED',
    }
    const res = await upsertEventWithDeduplication(incoming, 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(1) })
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].payload.start_date).toBe(FUNCION_21) // la de las 16 desapareció
  })

  it('con ticket_url propio por función (cada función con su link): igual se fusionan por clave (el link distinto no las separa)', async () => {
    // sameTicketEvent (paso 0) exige MISMO link; con links distintos no aporta señal y el
    // match sigue cayendo en el paso 1 (clave exacta), que no mira la hora para decidir si
    // fusiona, sólo para elegir CUÁL candidato usar cuando hay más de uno con la misma clave.
    const show16 = row(1, { start_date: FUNCION_16, ticket_url: 'https://tickets.example.test/funcion-16' })
    const db = createFakeEventsDb([show16])
    const incoming = {
      title: show16.title as string,
      start_date: FUNCION_21,
      venue_id: VENUE,
      status: 'PUBLISHED',
      ticket_url: 'https://tickets.example.test/funcion-21',
    }
    const res = await upsertEventWithDeduplication(incoming, 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(1) })
    const payload = db.updates[0].payload
    expect(payload.start_date).toBe(FUNCION_21)
    // Los dos links quedan en ticket_sources (eso sí se preserva), pero como UN solo evento.
    const urls = (payload.ticket_sources as Array<{ url: string }>).map((s) => s.url).sort()
    expect(urls).toEqual(['https://tickets.example.test/funcion-16', 'https://tickets.example.test/funcion-21'])
  })
})
