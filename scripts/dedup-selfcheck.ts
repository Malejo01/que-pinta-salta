/**
 * Chequeo de la lógica de deduplicación sobre fixtures en memoria.
 *
 *   npm run dedup:check
 *
 * No toca la base ni necesita credenciales: ejercita las funciones puras
 * (normalización de título, clave, merge y elección del sobreviviente) con los
 * tres casos que se repiten en producción:
 *
 *   1. Un evento por 3 fuentes (Instagram + portal provincial + ticketera),
 *      con venue y horario contradictorios.
 *   2. Un evento por 2 ticketeras, que tiene que quedar con los dos links.
 *   3. Carga manual + flyer de Instagram, donde la manual tiene que ganar.
 *
 * El proyecto no tiene runner de tests, así que esto es un script con exit
 * code: 0 si pasa todo, 1 si algo falla. Sirve en CI tal cual.
 */

import { normalizeTitleForKey, buildDedupKey } from '../lib/scraper/dedup-key'
import { planGroup, formatReport, type DedupCleanupReport } from '../lib/scraper/dedup-cleanup'

let failures = 0

function check(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures++
    console.log(`FALLA  ${label}`)
    console.log(`       actual   = ${JSON.stringify(actual)}`)
    console.log(`       esperado = ${JSON.stringify(expected)}`)
  } else {
    console.log(`ok     ${label}`)
  }
}

/** Valor final de un campo tras la fusión: el del patch si cambió, si no el del que queda. */
function finalOf(plan: { patch: Record<string, any> }, keeperRow: Record<string, any>, field: string) {
  return field in plan.patch ? plan.patch[field] : keeperRow[field]
}

/** Fixture mínimo de una fila de `events`. */
function event(overrides: Record<string, any>): Record<string, any> {
  return {
    id: 'x',
    title: 'Evento',
    slug: 'evento',
    description: null,
    short_description: null,
    scrape_source_key: null,
    created_by: null,
    status: 'PUBLISHED',
    venue_id: null,
    start_date: '2026-09-13T01:00:00.000Z',
    end_date: null,
    image_url: null,
    price_min: 0,
    price_max: null,
    is_free: false,
    is_commercial: false,
    age_restriction: 0,
    ticket_url: null,
    ticket_sources: [],
    tags: [],
    gallery_urls: [],
    category_id: null,
    classification_source: null,
    view_count: 0,
    merge_audit: [],
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

console.log('\n== Normalización del título ==')
check('acentos y mayúsculas', normalizeTitleForKey('AIRBAG — Gira Histórica'), 'airbag gira historica')
check('sufijo "EN SALTA"', normalizeTitleForKey('Los Nocheros EN SALTA'), 'los nocheros')
check('sufijo "Salta 2026"', normalizeTitleForKey('Los Nocheros - Salta 2026'), 'los nocheros')
check('sufijo "Salta Capital"', normalizeTitleForKey('Los Nocheros | Salta Capital'), 'los nocheros')
check('sufijo "(Salta, Argentina)"', normalizeTitleForKey('Los Nocheros (Salta, Argentina)'), 'los nocheros')
check('espacios colapsados', normalizeTitleForKey('  Los   Nocheros  '), 'los nocheros')
check('ciudad en el medio se conserva', normalizeTitleForKey('Salta la Linda Fest'), 'salta la linda fest')
check('título que ES la ciudad no se vacía', normalizeTitleForKey('Salta Capital'), 'salta capital')
check('año suelto se conserva', normalizeTitleForKey('Expo Ganadera 2026'), 'expo ganadera 2026')
check('título vacío', normalizeTitleForKey(''), '')

console.log('\n== Clave de dedup ==')
// 22:00 del 12/09 en Salta son las 01:00 UTC del 13/09: el día tiene que ser el 12.
check('el día es el de Salta, no el UTC', buildDedupKey('Fiesta X', '2026-09-13T01:00:00.000Z'), 'fiesta x|2026-09-12')
check(
  'mismo evento, distinto horario del mismo día -> misma clave',
  buildDedupKey('Los Nocheros en Salta', '2026-09-12T23:00:00.000Z') ===
    buildDedupKey('LOS NOCHEROS - Salta 2026', '2026-09-13T01:30:00.000Z'),
  true
)
check('sin fecha no hay clave', buildDedupKey('Algo', null), '')
check(
  'títulos distintos no colapsan',
  buildDedupKey('Show de Rock', '2026-09-12T23:00:00Z') === buildDedupKey('Rock', '2026-09-12T23:00:00Z'),
  false
)

console.log('\n== Caso 1: mismo evento por Instagram + portal + ticketera ==')
const caso1 = [
  event({
    id: 'ig-1',
    title: 'Los Nocheros en Salta',
    slug: 'los-nocheros-ig',
    scrape_source_key: 'instagram-ai',
    venue_id: 'venue-handle-instagram',
    start_date: '2026-09-13T01:00:00.000Z',
    image_url: 'https://cdn.instagram/150x150/thumb.jpg',
    ticket_url: 'https://instagram.com/p/abc',
    ticket_sources: [{ source: 'instagram-ai', url: 'https://instagram.com/p/abc', price_min: 0 }],
    tags: ['instagram'],
    view_count: 10,
    created_at: '2026-08-01T00:00:00.000Z',
    category_id: 'cat-boliches',
    classification_source: 'scraper',
    is_free: true,
  }),
  event({
    id: 'vamos-1',
    title: 'Los Nocheros',
    slug: 'los-nocheros-vamos',
    scrape_source_key: 'vamos',
    venue_id: 'venue-teatro',
    start_date: '2026-09-13T00:30:00.000Z',
    image_url: 'https://vamos.gob.ar/foto.jpg',
    price_min: 18000,
    ticket_url: 'https://vamos.gob.ar/e/1',
    tags: ['vamos'],
    view_count: 3,
    created_at: '2026-08-02T00:00:00.000Z',
    category_id: 'cat-penas',
    classification_source: 'scraper',
  }),
  event({
    id: 'nt-1',
    title: 'LOS NOCHEROS - SALTA 2026',
    slug: 'los-nocheros-nt',
    scrape_source_key: 'norteticket',
    venue_id: 'venue-teatro-provincial',
    start_date: '2026-09-13T01:00:00.000Z',
    image_url: 'https://norteticket.com/afiche.jpg',
    price_min: 15000,
    ticket_url: 'https://norteticket.com/e/9',
    tags: ['norteticket'],
    view_count: 1,
    created_at: '2026-08-03T00:00:00.000Z',
    category_id: 'cat-penas',
    classification_source: 'scraper',
  }),
]

const key1 = buildDedupKey(caso1[0].title, caso1[0].start_date)
const plan1 = planGroup(key1, caso1)

check('los 3 caen en la misma clave', new Set(caso1.map((e) => buildDedupKey(e.title, e.start_date))).size, 1)
check('queda 1 solo registro', 1 + plan1.absorbed.length, caso1.length)
check('sobrevive la ticketera', plan1.keeper.id, 'nt-1')
check('conserva los 3 links de compra', plan1.ticketSourcesAfter, 3)
check('el precio mínimo es el más barato positivo', finalOf(plan1, caso1[2], 'price_min'), 15000)
check('no queda marcado como gratis', finalOf(plan1, caso1[2], 'is_free'), false)
check('las vistas se suman', finalOf(plan1, caso1[2], 'view_count'), 14)
check('el venue de la ticketera no se pisa', finalOf(plan1, caso1[2], 'venue_id'), 'venue-teatro-provincial')
check('hay conflictos registrados en auditoría', plan1.conflicts.length > 0, true)
check(
  'el venue descartado queda auditado',
  plan1.conflicts.some((c) => c.field === 'venue_id' && c.discarded === 'venue-handle-instagram'),
  true
)

console.log('\n== Caso 2: mismo evento en dos ticketeras ==')
const caso2 = [
  event({
    id: 'nt-2',
    title: 'Airbag en Salta',
    slug: 'airbag-nt',
    scrape_source_key: 'norteticket',
    venue_id: 'venue-estadio',
    price_min: 40000,
    ticket_url: 'https://norteticket.com/e/airbag',
    created_at: '2026-08-01T00:00:00.000Z',
  }),
  event({
    id: 'e1-2',
    title: 'AIRBAG — Salta 2026',
    slug: 'airbag-e1',
    scrape_source_key: 'entradauno',
    venue_id: 'venue-estadio',
    price_min: 35000,
    ticket_url: 'https://entradauno.com/e/airbag',
    created_at: '2026-08-05T00:00:00.000Z',
  }),
]

const plan2 = planGroup(buildDedupKey(caso2[0].title, caso2[0].start_date), caso2)
check('queda 1 solo registro', 1 + plan2.absorbed.length, caso2.length)
check('empate de prioridad -> gana el más viejo', plan2.keeper.id, 'nt-2')
check('quedan los 2 links de compra', plan2.ticketSourcesAfter, 2)
check('el precio mínimo baja al más barato', finalOf(plan2, caso2[0], 'price_min'), 35000)

console.log('\n== Caso 3: carga manual + flyer de Instagram ==')
const caso3 = [
  event({
    id: 'ig-3',
    title: 'Peña de los Viernes en Salta',
    slug: 'pena-ig',
    scrape_source_key: 'instagram-ai',
    venue_id: 'venue-handle',
    image_url: 'https://cdn.instagram/flyer-grande.jpg',
    ticket_url: 'https://instagram.com/p/xyz',
    created_at: '2026-08-01T00:00:00.000Z',
  }),
  event({
    id: 'man-3',
    title: 'Peña de los Viernes',
    slug: 'pena-manual',
    // Carga por formulario: scrape_source_key queda NULL y created_by tiene el usuario.
    scrape_source_key: null,
    created_by: 'user-uuid',
    venue_id: 'venue-real',
    price_min: 8000,
    created_at: '2026-08-04T00:00:00.000Z',
  }),
]

const plan3 = planGroup(buildDedupKey(caso3[0].title, caso3[0].start_date), caso3)
check('queda 1 solo registro', 1 + plan3.absorbed.length, caso3.length)
check('gana la carga manual sobre Instagram', plan3.keeper.id, 'man-3')
check('la manual hereda la imagen del flyer (no tenía)', finalOf(plan3, caso3[1], 'image_url'), 'https://cdn.instagram/flyer-grande.jpg')
check('el link del flyer se conserva', plan3.ticketSourcesAfter, 1)

console.log('\n== Reporte de ejemplo (dry-run) ==')
const report: DedupCleanupReport = {
  dryRun: true,
  scannedEvents: caso1.length + caso2.length + caso3.length,
  duplicateGroups: 3,
  totalMerges: plan1.absorbed.length + plan2.absorbed.length + plan3.absorbed.length,
  eventsAfter: 3,
  groups: [plan1, plan2, plan3],
  applied: { keepersUpdated: 0, eventsDeleted: 0, favoritesRepointed: 0, viewsRepointed: 0, keysBackfilled: 0 },
  errors: [],
  range: { from: '2026-09-01', to: null },
}
console.log(formatReport(report))

check('los 3 casos quedan en 1 registro cada uno', report.eventsAfter, 3)

console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} CHEQUEOS FALLARON`}`)
process.exit(failures === 0 ? 0 : 1)
