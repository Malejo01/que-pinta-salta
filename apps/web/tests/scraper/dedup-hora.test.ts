// Tarea 34-a (QPS-164, hallazgo 1): el paso de clave exacta (paso 1 de findDuplicateMatch, en
// lib/scraper/deduplicate.ts) ahora exige también la misma hora de inicio (sameClock).
// Antes, dos funciones reales del mismo show el mismo día (16:00 y 21:00) caían en una sola
// fila porque la clave sólo mira título normalizado + día. Decisión de Mauro (16/10), opción 1:
// si a alguna de las dos filas le falta hora real (00:00 de Salta, el placeholder de "sin
// hora"), se mantiene exactamente lo de hoy (se juntan). Sin red ni base: fixtures inventados.
//
// Los casos de abajo dejan venue_id sin definir en los dos lados, a propósito: el paso 1 está
// diseñado para funcionar sin venue_id (ver su docstring en deduplicate.ts, "no necesita
// venue_id"), y así se aísla el chequeo de hora del paso 2 (respaldo difuso). El paso 2 NO mira
// la hora, y si además del título idéntico comparten venue_id, vuelve a fusionar sin importar
// este arreglo — es una limitación conocida de "opción 1", fuera de alcance de esta tarea
// (comentada en deduplicate-similitud.test.ts, describe 'dos funciones el mismo día').
//
// Vuelta 1 (bloqueante del revisor, QPS-164 hallazgo 1): se probó agregar el mismo criterio de
// hora a `sameKey` en la colisión de slug único de upsertEventWithDeduplication, pero se revirtió
// en la vuelta 2 porque no cambiaba nada observable (ver el comentario "LÍMITE CONOCIDO" en
// deduplicate.ts, justo antes de `if (sameKey || score >= SIMILARITY_THRESHOLD)`): esa misma
// condición también fusiona por `score` (similitud de título), que no mira la hora y que, por
// cómo normalizeTitleForKey() recorta el título, coincide siempre que `sameKey` coincide. Ver el
// describe 'upsertEventWithDeduplication: colisión de slug único' más abajo para el límite
// documentado (no resuelto esta tarea, pendiente de decisión de Mauro).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findDuplicateMatch, upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { createFakeEventsDb, type EventRow } from '../events/fake-events-db'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

const uid = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, '0')}`
const TITULO = 'Show Doble Funcion De Prueba'

const FUNCION_16 = '2026-11-20T19:00:00.000Z' // 16:00 Salta
const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta (sigue siendo el 20 en Salta)
const SIN_HORA = '2026-11-20T03:00:00.000Z' // 00:00 Salta: el placeholder de "sin hora"
const OTRO_DIA_16 = '2026-11-21T19:00:00.000Z' // 16:00 Salta, pero un día después

function row(n: number, over: EventRow = {}): EventRow {
  return {
    id: uid(n),
    title: TITULO,
    slug: `show-doble-funcion-de-prueba-${n}`,
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

describe('findDuplicateMatch: clave exacta + misma hora (QPS-164, hallazgo 1)', () => {
  it('16:00 y 21:00 del mismo show el mismo día: NO matchea (dos filas)', async () => {
    const show16 = row(1, { start_date: FUNCION_16 })
    const db = createFakeEventsDb([show16])
    const incoming = { title: TITULO, start_date: FUNCION_21 }
    expect(await findDuplicateMatch(incoming, db.client)).toBeNull()
  })

  it('upsertEventWithDeduplication: la función de las 21 se inserta como fila nueva, no pisa la de las 16', async () => {
    const show16 = row(1, { start_date: FUNCION_16 })
    const db = createFakeEventsDb([show16])
    const incoming = { title: TITULO, start_date: FUNCION_21, status: 'PUBLISHED' }
    const res = await upsertEventWithDeduplication(incoming, 'norteticket', db.client)
    expect(res).toMatchObject({ action: 'insert' })
    expect(res.eventId).not.toBe(uid(1))
    expect(db.updates).toHaveLength(0) // la de las 16 no se tocó
    expect(db.rows).toHaveLength(2) // quedan las dos funciones
  })

  it('misma hora de inicio: sigue fusionando en una sola fila', async () => {
    const show21 = row(1, { start_date: FUNCION_21 })
    const db = createFakeEventsDb([show21])
    const incoming = { title: TITULO, start_date: FUNCION_21 }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'dedup_key', event: { id: uid(1) } })
  })

  it('la que ya está no tiene hora real (00:00 Salta) y la entrante sí: se mantiene lo de hoy, fusiona', async () => {
    const sinHora = row(1, { start_date: SIN_HORA })
    const db = createFakeEventsDb([sinHora])
    const incoming = { title: TITULO, start_date: FUNCION_21 }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'dedup_key', event: { id: uid(1) } })
  })

  it('simétrico: la entrante no tiene hora real y la que ya está sí: también fusiona', async () => {
    const conHora = row(1, { start_date: FUNCION_21 })
    const db = createFakeEventsDb([conHora])
    const incoming = { title: TITULO, start_date: SIN_HORA }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'dedup_key', event: { id: uid(1) } })
  })

  it('distinto día (misma hora del reloj, 16:00): NO matchea, como hoy', async () => {
    const show16 = row(1, { start_date: FUNCION_16 })
    const db = createFakeEventsDb([show16])
    const incoming = { title: TITULO, start_date: OTRO_DIA_16 }
    expect(await findDuplicateMatch(incoming, db.client)).toBeNull()
  })

  // El caso "fácil de romper sin que nadie lo note": que la condición de hora se salte si el
  // start_date viene en un formato de string distinto para el mismo instante. sameClock
  // (deduplicate.ts) compara con new Date(...).getUTCHours()/getUTCMinutes(), no el texto crudo,
  // así que estas variantes tienen que seguir matcheando igual que FUNCION_21 contra sí misma.
  it('mismo instante que FUNCION_21 pero sin milisegundos en el string: igual fusiona', async () => {
    const show21 = row(1, { start_date: FUNCION_21 }) // '2026-11-21T00:00:00.000Z'
    const db = createFakeEventsDb([show21])
    const incoming = { title: TITULO, start_date: '2026-11-21T00:00Z' } // mismo instante, sin ".000" ni segundos
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'dedup_key', event: { id: uid(1) } })
  })

  it('mismo instante que FUNCION_21 pero escrito con el offset de Salta en vez de "Z": igual fusiona', async () => {
    const show21 = row(1, { start_date: FUNCION_21 }) // '2026-11-21T00:00:00.000Z', 21:00 Salta
    const db = createFakeEventsDb([show21])
    // Mismo instante, offset -03:00 explícito: un comparador que buscara la subcadena "21:00"
    // en el texto crudo no la encontraría en ninguno de los dos strings y fallaría al revés (no
    // fusionaría una función real con sí misma).
    const incoming = { title: TITULO, start_date: '2026-11-20T21:00:00-03:00' }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'dedup_key', event: { id: uid(1) } })
  })
})

describe('upsertEventWithDeduplication: colisión de slug único (QPS-164, hallazgo 1 — límite conocido)', () => {
  // Reproduce el slug como lo generan alpogo-scraper.ts (línea ~117), entradauno-scraper.ts
  // (línea ~248) y vamos-scraper.ts (línea ~41): `slugify(título)`, sin fecha ni hora. Procesan
  // un ítem por función, así que dos funciones reales del mismo show el mismo día llegan con el
  // MISMO slug. norteticket (parsers.ts) es la única fuente inmune porque mete el start_date en
  // el slug.
  const SLUG = 'show-doble-funcion-de-prueba'

  it('LÍMITE CONOCIDO: dos funciones reales, mismo slug (alpogo/entradauno/vamos), horas distintas, se fusionan en una sola fila por este camino', async () => {
    // El paso 1 de findDuplicateMatch (la clave exacta) ya exige la misma hora de inicio
    // (sameStartTimeForKey, en deduplicate.ts), pero la colisión de slug único es una rama
    // DISTINTA, con su propia condición: `if (sameKey || score >= SIMILARITY_THRESHOLD)`. Ni
    // `sameKey` (clave exacta, sin hora) ni `score` (similitud de título, sin hora) miran la
    // hora acá, así que esta rama se comporta igual que antes de la tarea 34-a.
    //
    // No alcanza con gatear sólo `sameKey` por hora (se probó en la vuelta 1 de esta tarea y se
    // revirtió, ver el comentario en deduplicate.ts): es estructural. `dedupKeyOf()`
    // (buildDedupKey + normalizeTitleForKey) sólo puede coincidir entre dos títulos de texto
    // distinto si la ÚNICA diferencia es un sufijo de ciudad (CITY_SUFFIX_RE, dedup-key.ts) — y
    // en ese caso el título más corto queda como substring literal del más largo tras
    // normalizeTitle(), lo que dispara el atajo de 0.9 de calculateSimilarity (deduplicate.ts,
    // "si uno contiene al otro"), por encima del umbral 0.65 igual. Con título IDÉNTICO entre
    // funciones (el caso real de estos tres scrapers) da 1.0. Es decir: siempre que
    // `dedupKeyOf()` coincide, `score` también coincide, tenga o no la misma hora — así que
    // gatear `sameKey` por hora sin gatear también `score` no cambia el resultado final de esta
    // rama: el `||` sigue entrando por `score`.
    //
    // Arreglarlo de verdad exige sumar el mismo chequeo de hora (sameStartTimeForKey) también a
    // `score >= SIMILARITY_THRESHOLD` en deduplicate.ts (ver el comentario ahí, justo antes de
    // esa condición) — y eso es la misma decisión de producto que el paso 2 (respaldo difuso):
    // si el criterio de "misma hora" se extiende a los caminos por similitud, y con qué
    // tolerancia de minutos (dos fuentes distintas suelen escribir la hora de un mismo evento
    // real con algunos minutos de diferencia; sin tolerancia, esos duplicados reales dejarían
    // de juntarse). Pendiente de Mauro: ops/loop/preguntas/01-r34-difuso-hora.md.
    const show16 = row(1, { start_date: FUNCION_16, slug: SLUG, venue_id: null })
    const db = createFakeEventsDb([show16])
    const incoming = { title: TITULO, start_date: FUNCION_21, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res = await upsertEventWithDeduplication(incoming, 'alpogo', db.client)
    expect(res).toMatchObject({ action: 'update', eventId: uid(1) })
    expect(db.rows).toHaveLength(1) // sigue siendo una sola fila: QPS-164 hallazgo 1 persiste por este camino
  })

  it('LÍMITE CONOCIDO: con una tercera función el mismo día, las tres siguen fusionándose en una sola fila (mismo motivo: el score, no el chequeo de hora)', async () => {
    const show16 = row(1, { start_date: FUNCION_16, slug: SLUG, venue_id: null })
    const db = createFakeEventsDb([show16])

    const incoming21 = { title: TITULO, start_date: FUNCION_21, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res21 = await upsertEventWithDeduplication(incoming21, 'alpogo', db.client)
    expect(res21).toMatchObject({ action: 'update', eventId: uid(1) })

    const FUNCION_23 = '2026-11-21T02:00:00.000Z' // 23:00 Salta, sigue siendo el 20 en Salta
    const incoming23 = { title: TITULO, start_date: FUNCION_23, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res23 = await upsertEventWithDeduplication(incoming23, 'alpogo', db.client)
    expect(res23).toMatchObject({ action: 'update', eventId: uid(1) })

    expect(db.rows).toHaveLength(1) // las tres funciones reales siguen siendo una sola fila
  })

  it('colisión de slug entre dos eventos SIN relación (clave y score distintos): se sigue sufijando sólo con el día, sin cambios por esta tarea', async () => {
    const sinRelacion = row(1, {
      title: 'Exposicion Fotografica Municipal',
      start_date: FUNCION_16,
      slug: SLUG,
      venue_id: null,
    })
    const db = createFakeEventsDb([sinRelacion])
    const incoming = { title: TITULO, start_date: FUNCION_21, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res = await upsertEventWithDeduplication(incoming, 'alpogo', db.client)
    expect(res).toMatchObject({ action: 'insert' })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0].slug).toBe(`${SLUG}-2026-11-20`) // sufijo de día, igual que antes de esta tarea
    expect(db.rows).toHaveLength(2)
  })
})
