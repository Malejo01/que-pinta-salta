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
// R40 (QPS-164, hallazgo 1, decisión de Mauro del 17/10): la colisión de slug único de
// upsertEventWithDeduplication ahora SÍ mira la hora, con la tolerancia TOLERANCIA_HORA_DEDUP_MIN
// (dedup-key.ts, 120 minutos) en vez de la hora exacta que probó y revirtió la vuelta 1 de la
// tarea 34-a. El describe 'upsertEventWithDeduplication: colisión de slug único' de más abajo ya
// no documenta un límite conocido: dos funciones reales del mismo show, a más de la tolerancia,
// quedan en filas separadas (con el slug nuevo llevando fecha y hora, no sólo el día, para que una
// tercera función no vuelva a chocar). Los casos de bordes, orden del array y el paso 2 (respaldo
// difuso) con tolerancia están en tests/scraper/dedup-tolerancia.test.ts (tarea 40-b).
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

  // Independencia del orden (QPS-164, hallazgo del revisor en la vuelta 1 de 34-a): la consulta
  // de candidatos (deduplicate.ts, `.gte/.lte` sin `.order()`) no garantiza el orden del array,
  // así que con DOS candidatos que comparten clave y venue compatible —uno sin hora real y otro
  // con la hora exacta del entrante— el resultado no puede depender de cuál vino primero. Por
  // eso van los dos sentidos: el sin-hora-real primero y el de-hora-exacta primero. Si alguien
  // "simplificara" las dos pasadas del paso 1 (exactTimeMatch / match, deduplicate.ts) a un solo
  // `.find()` que devuelva el primer candidato que cumpla "misma hora O falta hora real", el caso
  // con el sin-hora-real primero rompería: matchearía esa fila en vez de la de hora exacta.
  it('dos candidatos en la base, uno sin hora real primero y el de hora exacta después: matchea el de hora exacta', async () => {
    const sinHora = row(1, { start_date: SIN_HORA })
    const conHoraExacta = row(2, { start_date: FUNCION_21 })
    const db = createFakeEventsDb([sinHora, conHoraExacta])
    const incoming = { title: TITULO, start_date: FUNCION_21 }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'dedup_key', event: { id: uid(2) } })
  })

  it('mismos dos candidatos, orden inverso (el de hora exacta primero): matchea el mismo, el de hora exacta', async () => {
    const conHoraExacta = row(2, { start_date: FUNCION_21 })
    const sinHora = row(1, { start_date: SIN_HORA })
    const db = createFakeEventsDb([conHoraExacta, sinHora])
    const incoming = { title: TITULO, start_date: FUNCION_21 }
    const match = await findDuplicateMatch(incoming, db.client)
    expect(match).toMatchObject({ matchedBy: 'dedup_key', event: { id: uid(2) } })
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

describe('upsertEventWithDeduplication: colisión de slug único (QPS-164, hallazgo 1)', () => {
  // Reproduce el slug como lo generan alpogo-scraper.ts (línea ~117), entradauno-scraper.ts
  // (línea ~248) y vamos-scraper.ts (línea ~41): `slugify(título)`, sin fecha ni hora. Procesan
  // un ítem por función, así que dos funciones reales del mismo show el mismo día llegan con el
  // MISMO slug. norteticket (parsers.ts) es la única fuente inmune porque mete el start_date en
  // el slug.
  const SLUG = 'show-doble-funcion-de-prueba'

  it('dos funciones reales, mismo slug (alpogo/entradauno/vamos), horas a más de la tolerancia: quedan en filas separadas', async () => {
    // La colisión de slug único es una rama distinta de findDuplicateMatch, con su propia
    // condición: `if (matchesByTitle && horasCompatibles(...))` (deduplicate.ts). `matchesByTitle`
    // (sameKey o score >= SIMILARITY_THRESHOLD) sigue sin mirar la hora — acá el slug YA es
    // idéntico, así que da verdadero igual que antes de la tarea 34-a — pero ahora el `&&` con
    // horasCompatibles() (tolerancia TOLERANCIA_HORA_DEDUP_MIN, dedup-key.ts) corta la fusión
    // cuando las horas están a más de 120 minutos, como acá (16:00 y 21:00, 300 minutos). El slug
    // nuevo lleva fecha y hora (slugConFechaHora), no sólo el día, para que una tercera función no
    // vuelva a chocar (ver el test de abajo).
    const show16 = row(1, { start_date: FUNCION_16, slug: SLUG, venue_id: null })
    const db = createFakeEventsDb([show16])
    const incoming = { title: TITULO, start_date: FUNCION_21, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res = await upsertEventWithDeduplication(incoming, 'alpogo', db.client)
    expect(res).toMatchObject({ action: 'insert' })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0].slug).toBe(`${SLUG}-2026-11-20-2100`)
    expect(db.rows).toHaveLength(2) // QPS-164 hallazgo 1: quedan dos funciones separadas
  })

  it('con una tercera función el mismo día, las tres quedan en filas separadas con slugs distintos entre sí', async () => {
    const show16 = row(1, { start_date: FUNCION_16, slug: SLUG, venue_id: null })
    const db = createFakeEventsDb([show16])

    const incoming21 = { title: TITULO, start_date: FUNCION_21, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res21 = await upsertEventWithDeduplication(incoming21, 'alpogo', db.client)
    expect(res21).toMatchObject({ action: 'insert' })

    // La colisión de slug siempre consulta `.eq('slug', eventData.slug)` con el slug BASE
    // (`SLUG`), así que la tercera función choca otra vez con la fila de las 16 (la única que
    // sigue teniendo el slug base: la de las 21 ya se renombró arriba), no con la de las 21. Con
    // un sufijo de sólo día, la segunda y la tercera función saldrían las dos con `SLUG-2026-11-20`
    // y el segundo insert violaría el índice único de `slug` — por eso el sufijo lleva la hora.
    const FUNCION_23 = '2026-11-21T02:00:00.000Z' // 23:00 Salta, sigue siendo el 20 en Salta
    const incoming23 = { title: TITULO, start_date: FUNCION_23, slug: SLUG, venue_id: null, status: 'PUBLISHED' }
    const res23 = await upsertEventWithDeduplication(incoming23, 'alpogo', db.client)
    expect(res23).toMatchObject({ action: 'insert' })

    expect(db.rows).toHaveLength(3) // las tres funciones reales quedan en tres filas
    const slugs = db.rows.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(3) // slugs distintos entre sí
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
