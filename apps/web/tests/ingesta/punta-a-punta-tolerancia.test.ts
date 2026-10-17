// Tarea 40-q (QA, cierre de la Ronda 40 — QPS-164, hallazgo 1): tests de punta a punta con
// upsertEventWithDeduplication REAL y createFakeEventsDb (tests/events/fake-events-db.ts), sin
// red ni base, que cruzan lo que tocaron 40-a/40-b/40-c:
//
//   1. Dos funciones reales del mismo show (16:00 y 21:00, mismo venue, fuente alpogo) quedan en
//      dos filas, y una segunda corrida idéntica es idempotente: no inserta nada nuevo y cada
//      función se actualiza en SU propia fila (no se mezclan). Los slugs se arman con
//      slugConFechaHora de verdad (40-a/40-c), no a mano.
//   2. La misma función anunciada por dos ticketeras ("Airbag" / "Airbag en Salta", a 30 minutos
//      de diferencia, dentro de la tolerancia) queda en una sola fila, con los dos links en
//      ticket_sources y el precio mínimo real.
//   3. Un evento ya guardado (slug viejo, sólo de título) conserva su slug cuando la nueva
//      corrida llega con el slug nuevo (con fecha y hora, 40-c): se actualiza sin insert, y el
//      slug nuevo queda en merge_audit como conflicto 'slug-inmutable-url-publicada'
//      (merge-events.ts:465-467).
//   4. Dos límites conocidos, fuera de esta ronda a propósito (ver ops/rondas/40-dedup-tolerancia/
//      plan.md, "Para decidir antes de lanzar", puntos 2 y 3): el paso 1 sigue con la hora exacta
//      y no junta sin venue en común; y la limpieza de duplicados (dedup-cleanup.ts) no mira la
//      hora, así que agrupa de nuevo lo que la ingesta separa.
//   5. Detector de solo lectura: alpogo-scraper.ts y run-scrape-job.ts arman el slug con
//      slugConFechaHora.
//
// Zona horaria: los tests corren con TZ=UTC (vitest.config.ts). Todos los `start_date` de abajo
// son instantes con zona explícita ("...Z"): un string de hora de pared sin zona estaría probando
// otra cosa (y las 21:00 de Salta aparecerían como las 18:00).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import slugify from 'slugify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findDuplicateMatch, upsertEventWithDeduplication } from '@/lib/scraper/deduplicate'
import { buildDuplicateGroups } from '@/lib/scraper/dedup-cleanup'
import { slugConFechaHora } from '@qps/core/scraper/slug-fecha-hora'
import { createFakeEventsDb } from '../events/fake-events-db'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

// --- Caso 1: dos funciones reales del mismo show, slugs armados con slugConFechaHora de verdad --

describe('punta a punta (R40): dos funciones del mismo show, 16:00 y 21:00, mismo venue, fuente alpogo', () => {
  const TITULO = 'Festival Dos Funciones De Prueba'
  const VENUE = '10101010-1010-4101-8101-000000000001'
  const FUNCION_16 = '2026-11-20T19:00:00.000Z' // 16:00 Salta
  const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta (sigue siendo el 20 en Salta)

  // Slug base como lo arma alpogo-scraper.ts (slugify(item.nombre, { lower: true, strict: true })),
  // y el sufijo de fecha/hora con la función REAL (no escrito a mano): con esto el slug de cada
  // función ya sale distinto (sufijo de hora distinto), así que el caso queda aislado en el paso 1
  // de findDuplicateMatch / la idempotencia del upsert, sin tocar la rama de colisión de slug
  // (esa rama, con tolerancia de hora, la cubre tests/scraper/dedup-hora.test.ts y
  // tests/scraper/dedup-tolerancia.test.ts).
  const BASE_SLUG = slugify(TITULO, { lower: true, strict: true })
  const SLUG_16 = slugConFechaHora(BASE_SLUG, FUNCION_16)
  const SLUG_21 = slugConFechaHora(BASE_SLUG, FUNCION_21)

  function funcion16() {
    return { title: TITULO, start_date: FUNCION_16, venue_id: VENUE, slug: SLUG_16, status: 'PUBLISHED' as const }
  }
  function funcion21() {
    return { title: TITULO, start_date: FUNCION_21, venue_id: VENUE, slug: SLUG_21, status: 'PUBLISHED' as const }
  }

  it('los slugs armados con slugConFechaHora difieren entre sí (sufijo de hora, no sólo de día)', () => {
    expect(SLUG_16).not.toBe(SLUG_21)
    expect(SLUG_16.endsWith('-1600')).toBe(true)
    expect(SLUG_21.endsWith('-2100')).toBe(true)
  })

  it('la primera corrida del cron inserta dos filas, una por función', async () => {
    const db = createFakeEventsDb([])
    const res16 = await upsertEventWithDeduplication(funcion16(), 'alpogo', db.client)
    const res21 = await upsertEventWithDeduplication(funcion21(), 'alpogo', db.client)

    expect(res16.action).toBe('insert')
    expect(res21.action).toBe('insert')
    expect(res21.eventId).not.toBe(res16.eventId)
    expect(db.rows).toHaveLength(2)
    expect(db.updates).toHaveLength(0)
  })

  it('una segunda corrida idéntica no inserta nada y actualiza cada función en su propia fila (no las mezcla)', async () => {
    const db = createFakeEventsDb([])
    const primera16 = await upsertEventWithDeduplication(funcion16(), 'alpogo', db.client)
    const primera21 = await upsertEventWithDeduplication(funcion21(), 'alpogo', db.client)
    expect(db.rows).toHaveLength(2)

    // Mismo payload, misma corrida del cron repetida (idempotencia): el paso 1 de
    // findDuplicateMatch exige la hora EXACTA (sameStartTimeForKey), así que cada función sólo
    // puede encontrarse a sí misma, nunca a la otra, aunque comparta título, día y venue_id.
    const segunda16 = await upsertEventWithDeduplication(funcion16(), 'alpogo', db.client)
    const segunda21 = await upsertEventWithDeduplication(funcion21(), 'alpogo', db.client)

    expect(segunda16.action).toBe('update')
    expect(segunda16.eventId).toBe(primera16.eventId)
    expect(segunda21.action).toBe('update')
    expect(segunda21.eventId).toBe(primera21.eventId)

    // Nada nuevo insertado, y las dos filas originales siguen siendo las únicas que existen.
    expect(db.inserts).toHaveLength(2)
    expect(db.rows).toHaveLength(2)

    // Las dos actualizaciones apuntan cada una a su propia fila: ninguna "pisó" la de la otra
    // función (si el paso 1 o 2 hubiera mezclado las funciones, una de las dos actualizaciones
    // apuntaría al eventId equivocado).
    const idsActualizados = db.updates.map((u) => u.id).sort()
    expect(idsActualizados).toEqual([primera16.eventId, primera21.eventId].sort())
  })
})

// --- Caso 2: la misma función por dos ticketeras, dentro de la tolerancia (21:00 y 21:30) -------

describe('punta a punta (R40): la misma función por dos fuentes queda en una sola fila', () => {
  const VENUE = '20202020-2020-4202-8202-000000000002'
  const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta
  const FUNCION_21_30 = '2026-11-21T00:30:00.000Z' // 21:30 Salta: 30 min, dentro de la tolerancia de 120

  it('norteticket a las 21:00 ("Airbag") y alpogo a las 21:30 ("Airbag en Salta"): una fila, dos links, el precio mínimo', async () => {
    const db = createFakeEventsDb([])

    const primera = await upsertEventWithDeduplication(
      {
        title: 'Airbag',
        start_date: FUNCION_21,
        venue_id: VENUE,
        slug: 'airbag-norteticket',
        status: 'PUBLISHED',
        ticket_url: 'https://norteticket.example.test/airbag',
        price_min: 20000,
      },
      'norteticket',
      db.client
    )
    expect(primera.action).toBe('insert')
    expect(db.rows).toHaveLength(1)

    // Título con el sufijo de ciudad ("en Salta") a propósito: así se prueba el mismo caso con el
    // que conviven de verdad las ticketeras (una manda "Airbag", otra "Airbag en Salta"), no dos
    // títulos idénticos. El paso 1 (clave exacta) exige además la hora EXACTA
    // (sameStartTimeForKey) y acá hay 30 minutos de diferencia, así que el match no sale por ahí
    // aunque la clave título+día coincida (normalizeTitleForKey saca el sufijo de ciudad): sale
    // por el paso 2 (respaldo difuso, mismo venue_id + similitud >= 0,65 + horasCompatibles).
    const match = await findDuplicateMatch(
      { title: 'Airbag en Salta', start_date: FUNCION_21_30, venue_id: VENUE },
      db.client
    )
    expect(match).toMatchObject({ matchedBy: 'venue_similarity', event: { id: primera.eventId } })

    const segunda = await upsertEventWithDeduplication(
      {
        title: 'Airbag en Salta',
        start_date: FUNCION_21_30,
        venue_id: VENUE,
        slug: 'airbag-en-salta-alpogo',
        status: 'PUBLISHED',
        ticket_url: 'https://alpogo.example.test/airbag-en-salta',
        price_min: 18000,
      },
      'alpogo',
      db.client
    )

    expect(segunda.action).toBe('update')
    expect(segunda.eventId).toBe(primera.eventId)
    expect(db.rows).toHaveLength(1) // sigue siendo un solo evento

    expect(db.updates).toHaveLength(1)
    const payload = db.updates[0].payload
    const urls = (payload.ticket_sources as Array<{ url: string }>).map((s) => s.url).sort()
    expect(urls).toEqual([
      'https://alpogo.example.test/airbag-en-salta',
      'https://norteticket.example.test/airbag',
    ])
    expect(payload.price_min).toBe(18000) // el mínimo real entre las dos fuentes
  })
})

// --- Caso 3: un evento ya guardado conserva su slug ----------------------------------------------

describe('punta a punta (R40): un evento ya guardado conserva su slug frente al slug nuevo con fecha y hora', () => {
  const EXISTENTE_ID = '40404040-4040-4404-8404-000000000004'
  const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta, el 20/11 en Salta
  const SLUG_VIEJO = 'show-de-prueba' // sólo de título, como salía ANTES de 40-c

  it('llega con el slug nuevo (slugConFechaHora): se actualiza sin insert, la fila conserva "show-de-prueba", y el slug nuevo queda en merge_audit como slug-inmutable-url-publicada', async () => {
    const existente = {
      id: EXISTENTE_ID,
      title: 'Show De Prueba',
      slug: SLUG_VIEJO,
      status: 'PUBLISHED',
      start_date: FUNCION_21,
      venue_id: null,
      scrape_source_key: 'manual',
      ticket_url: null,
      ticket_sources: [],
      merge_audit: [],
    }
    const db = createFakeEventsDb([existente])

    // El slug nuevo sale de la MISMA función real (mismo título, mismo instante): con
    // slugConFechaHora de verdad, no escrito a mano, para no desacoplarse de 40-c si el formato
    // del sufijo cambiara.
    const slugNuevo = slugConFechaHora(SLUG_VIEJO, FUNCION_21)
    expect(slugNuevo).toBe('show-de-prueba-2026-11-20-2100') // lo que pide el encargo, para que quede explícito

    const entrante = {
      title: 'Show De Prueba',
      start_date: FUNCION_21,
      venue_id: null,
      slug: slugNuevo,
      status: 'PUBLISHED' as const,
    }

    // El camino por el que se encuentra la fila vieja tiene que ser uno de los tres de
    // findDuplicateMatch (acá, el paso 1 por clave exacta: mismo título normalizado, mismo día de
    // Salta, misma hora EXACTA, venue compatible porque los dos son null) y NO la colisión de
    // slug: el slug entrante (con fecha y hora) es distinto del guardado (sólo título), así que si
    // el match saliera por ahí sería el bug que este test busca detectar, no el camino esperado.
    const match = await findDuplicateMatch(entrante, db.client)
    expect(match).toMatchObject({ matchedBy: 'dedup_key', event: { id: EXISTENTE_ID } })

    const res = await upsertEventWithDeduplication(entrante, 'alpogo', db.client)

    expect(res).toMatchObject({ action: 'update', eventId: EXISTENTE_ID })
    expect(db.inserts).toHaveLength(0) // sin insert: no se duplicó
    expect(db.rows).toHaveLength(1)

    expect(db.updates).toHaveLength(1)
    const payload = db.updates[0].payload
    // `slug` está fuera de PRIORITY_FIELDS (merge-events.ts): el patch de update nunca incluye esa
    // clave, así que la fila real en la base nunca recibe el slug nuevo.
    expect(payload).not.toHaveProperty('slug')

    const auditHistorial = payload.merge_audit as Array<{ discarded: Array<Record<string, unknown>> }>
    expect(auditHistorial).toHaveLength(1)
    const conflictoSlug = auditHistorial[0].discarded.find((d) => d.field === 'slug')
    expect(conflictoSlug).toMatchObject({
      field: 'slug',
      kept: SLUG_VIEJO,
      discarded: slugNuevo,
      rule: 'slug-inmutable-url-publicada', // merge-events.ts:465-467
    })
  })
})

// --- Caso 4: límites conocidos, fuera de la R40 a propósito ---------------------------------------
// Plan de la ronda: ops/rondas/40-dedup-tolerancia/plan.md, "Para decidir antes de lanzar", puntos 2 y 3.

describe('punta a punta (R40): límites conocidos, fuera de alcance a propósito', () => {
  it('LÍMITE CONOCIDO (plan.md, punto 2): el paso 1 sigue con la hora exacta y, sin venue en común, no hay quien junte 21:00 contra 21:30', async () => {
    const TITULO = 'Show Limite Paso Uno De Prueba'
    const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta
    const FUNCION_21_30 = '2026-11-21T00:30:00.000Z' // 21:30 Salta: 30 min, DENTRO de la tolerancia de hora

    // A uno de los dos le falta el venue_id (acá, el que ya está en la base) y no hay link de
    // compra en común: con eso, ni el paso 0 (mismo link) ni el paso 1 (clave exacta: exige
    // sameStartTimeForKey, y 21:00 != 21:30 no la cumple) encuentran un match, y el paso 2
    // (respaldo difuso) exige venue_id IGUAL en los dos lados (no "compatible": `candidate.venue_id
    // !== event.venue_id`), así que con uno de los dos en null tampoco entra ahí. La diferencia de
    // hora (30 min) está DENTRO de la tolerancia de 120 minutos a propósito: este caso no es sobre
    // la tolerancia, es sobre que sin venue en común no hay ningún camino que los junte. Viene de
    // la R34 y Mauro lo confirmó el 17/10 (ops/loop/respuestas/01-r40-entradauno-vamos.md): juntar
    // por tolerancia sin venue_id podría fusionar dos funciones reales del mismo día.
    const existente = {
      id: '30303030-3030-4303-8303-000000000003',
      title: TITULO,
      slug: 'show-limite-paso-uno-de-prueba-1',
      status: 'PUBLISHED',
      start_date: FUNCION_21,
      venue_id: null, // falta el venue
      scrape_source_key: 'manual',
      ticket_url: null,
      ticket_sources: [],
      merge_audit: [],
    }
    const db = createFakeEventsDb([existente])

    const entrante = {
      title: TITULO,
      start_date: FUNCION_21_30,
      venue_id: '31313131-3131-4313-8313-000000000031', // acá sí hay venue, pero no coincide (el otro no tiene)
      slug: 'show-limite-paso-uno-de-prueba-2', // slug distinto a propósito: no se prueba la rama de colisión de slug
      status: 'PUBLISHED' as const,
    }

    expect(await findDuplicateMatch(entrante, db.client)).toBeNull()

    const res = await upsertEventWithDeduplication(entrante, 'alpogo', db.client)
    expect(res).toMatchObject({ action: 'insert' })
    expect(db.rows).toHaveLength(2) // quedan dos fichas de la misma función real
  })

  it('LÍMITE CONOCIDO (plan.md, punto 3): buildDuplicateGroups (dedup-cleanup.ts) agrupa por título|día sin mirar la hora, y vuelve a juntar lo que la ingesta ahora separa', () => {
    const TITULO = 'Show Limite Limpieza De Prueba'
    const VENUE = '50505050-5050-4505-8505-000000000005'
    const FUNCION_16 = '2026-11-20T19:00:00.000Z' // 16:00 Salta
    const FUNCION_21 = '2026-11-21T00:00:00.000Z' // 21:00 Salta (sigue siendo el 20 en Salta)

    // Mismo venue en las dos filas (a propósito): es el escenario más favorable para la ingesta
    // (40-b las separa igual, por la tolerancia de hora) y, pese a eso, buildDuplicateGroups las
    // junta: no es un problema de venue, es que groupByDedupKey (dedup-cleanup.ts) agrupa por
    // dedupKeyOf (título + día) sin comparar ninguna hora, y splitByVenue sólo separa por venues
    // DISTINTOS, no por horarios distintos dentro del mismo venue.
    const show16 = {
      id: 'show-limite-limpieza-1',
      title: TITULO,
      start_date: FUNCION_16,
      venue_id: VENUE,
      ticket_sources: [],
    }
    const show21 = {
      id: 'show-limite-limpieza-2',
      title: TITULO,
      start_date: FUNCION_21,
      venue_id: VENUE,
      ticket_sources: [],
    }

    const { groups } = buildDuplicateGroups([show16, show21])

    // Es de solo lectura: no se toca dedup-cleanup.ts. Si esta aserción alguna vez cambiara sola
    // (diera 2 grupos), sería porque alguien agregó la hora a buildDuplicateGroups — lo cual
    // cerraría este límite, no lo rompería; hasta entonces, el PR de la ronda avisa "no aplicar
    // la limpieza de duplicados del admin sobre días con dos funciones".
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(2)
  })
})

// --- Caso 5: detector de solo lectura -------------------------------------------------------------

describe('detector (R40): el slug de alpogo y del cron diario pasa por slugConFechaHora', () => {
  // apps/web/tests/ingesta -> apps/web/tests -> apps/web -> lib|app/...
  const ALPOGO_SCRAPER_PATH = fileURLToPath(new URL('../../lib/scraper/alpogo-scraper.ts', import.meta.url))
  const RUN_SCRAPE_JOB_PATH = fileURLToPath(new URL('../../app/api/cron/scrape/run-scrape-job.ts', import.meta.url))

  // Igual que tests/scraper/cines-alias-detector.test.ts: se pelan los comentarios antes de
  // buscar la llamada, para que una línea comentada ("// const slug = slugConFechaHora(...)") no
  // haga pasar el detector en verde con el código real roto al lado.
  function stripComments(content: string): string {
    return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
  }

  // POR QUÉ SÓLO ESTOS DOS ARCHIVOS, Y NO entradauno-scraper.ts NI vamos-scraper.ts
  // -------------------------------------------------------------------------------
  // El plan de la ronda (ops/rondas/40-dedup-tolerancia/plan.md, tarea 40-d) separaba el slug con
  // hora de entradauno y vamos en su propio commit, justamente por si había que revertirlo solo.
  // Mauro decidió a las 17:05 del 17/10 que 40-d NO corre (ops/loop/respuestas/01-r40-entradauno-vamos.md):
  // esas dos fuentes mandan UN ÍTEM POR ESPECTÁCULO (no por función), así que la hora en su slug no
  // separa nada y abre el riesgo de filas solapadas si la API deja de listar funciones pasadas.
  //
  // El commit de 40-d ya existía cuando llegó esa decisión (e730d8a, ops/rondas/40-dedup-tolerancia/
  // progreso.md) y se revierte DE DÍA (`git revert` lo deniega el perfil de noche). Hoy
  // (17/10, de noche) entradauno-scraper.ts y vamos-scraper.ts SÍ llaman a slugConFechaHora;
  // mañana, revertido el commit, van a dejar de hacerlo. Por eso este detector:
  //   - EXIGE slugConFechaHora sólo en alpogo-scraper.ts y run-scrape-job.ts (40-c, que sí corrió
  //     y no se revierte);
  //   - no dice nada de entradauno-scraper.ts ni de vamos-scraper.ts: exigirlo rompería el test en
  //     cuanto se revierta 40-d, y prohibirlo está en rojo ahora mismo (antes de revertir).
  // Si alguien lee esto creyendo que es un olvido: no lo es, está a propósito y documentado acá,
  // en progreso.md y en la respuesta de Mauro.
  it('alpogo-scraper.ts arma el slug con slugConFechaHora', () => {
    const src = stripComments(readFileSync(ALPOGO_SCRAPER_PATH, 'utf8'))
    expect(src).toMatch(/slugConFechaHora\(/)
    expect(src).toMatch(/from ['"]@qps\/core\/scraper\/slug-fecha-hora['"]/)
  })

  it('run-scrape-job.ts (cron diario) arma el slug con slugConFechaHora', () => {
    const src = stripComments(readFileSync(RUN_SCRAPE_JOB_PATH, 'utf8'))
    expect(src).toMatch(/slugConFechaHora\(/)
    expect(src).toMatch(/from ['"]@qps\/core\/scraper\/slug-fecha-hora['"]/)
  })
})
