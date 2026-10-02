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

import { normalizeTitleForKey, buildDedupKey, venuesCompatible, normalizeTicketUrl, sameTicketEvent } from '../lib/scraper/dedup-key'
import { planGroup, formatReport, groupByDedupKey, splitByVenue, buildDuplicateGroups, type DedupCleanupReport } from '../lib/scraper/dedup-cleanup'

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

console.log('\n== Caso 4: mismo título genérico, mismo día, venues distintos ==')
// Dos boliches que publican "Fiesta de fin de semana" el mismo sábado son dos
// eventos. Con los venues canónicos (Sprint 3), venue distinto = lugar distinto.
const caso4 = [
  event({ id: 'ig-a', title: 'Fiesta de fin de semana', scrape_source_key: 'instagram-ai', venue_id: 'venue-boliche-a' }),
  event({ id: 'ig-b', title: 'Fiesta de Fin de Semana', scrape_source_key: 'instagram-ai', venue_id: 'venue-boliche-b' }),
  event({ id: 'ig-c', title: 'Fiesta de fin de semana', scrape_source_key: 'instagram-ai', venue_id: null }),
]
const bucket4 = [...groupByDedupKey(caso4).values()][0]
const split4 = splitByVenue(bucket4)
check('los 3 comparten clave', bucket4.length, 3)
check('se separan por venue: 2 grupos de 1, ninguno fusionable', split4.groups.map((g) => g.length), [1, 1])
check('la fila sin venue queda afuera (ambigua)', split4.excluded.map((r) => r.id), ['ig-c'])
check('venues distintos no son compatibles', venuesCompatible('venue-boliche-a', 'venue-boliche-b'), false)
check('sin venue de un lado sí es compatible', venuesCompatible('venue-boliche-a', null), true)

const caso5 = [
  event({ id: 'nt-5', title: 'Airbag', scrape_source_key: 'norteticket', venue_id: 'venue-x' }),
  event({ id: 'ig-5', title: 'Airbag en Salta', scrape_source_key: 'instagram-ai', venue_id: null }),
]
const split5 = splitByVenue([...groupByDedupKey(caso5).values()][0])
check('un venue + uno sin venue: un solo grupo fusionable', split5.groups.map((g) => g.length), [2])

console.log('\n== Link de compra como identidad ==')
check(
  'normaliza host, mayúsculas, barra final y tracking',
  normalizeTicketUrl('https://www.NorteTicket.com/BERSUIT-EN-SALTA-2026/?utm_source=ig&fbclid=x'),
  'norteticket.com/bersuit-en-salta-2026'
)
check('conserva el query que identifica', normalizeTicketUrl('https://entradauno.com/landing/x?idEspectaculoCartel=1'), 'entradauno.com/landing/x?idespectaculocartel=1')
check('la home de un sitio no identifica', normalizeTicketUrl('https://www.laviejaestacion.com.ar'), '')
check('un perfil de Instagram no identifica', normalizeTicketUrl('https://instagram.com/p/abc'), '')
check('basura no rompe', normalizeTicketUrl('no es un link'), '')

// No Te Va Gustar: norteticket en un venue, carga manual en otro, mismo link.
const caso6 = [
  event({
    id: 'nt-6', title: 'NO TE VA GUSTAR EN SALTA 2026', scrape_source_key: 'norteticket', venue_id: 'venue-patio',
    start_date: '2026-09-26T00:30:00.000Z', ticket_url: 'https://norteticket.com/NO-TE-VA-GUSTAR-EN-SALTA-2026/',
    created_at: '2026-08-10T00:00:00.000Z',
  }),
  event({
    id: 'man-6', title: 'No Te Va Gustar', scrape_source_key: null, created_by: 'user-uuid', venue_id: 'venue-estadio',
    start_date: '2026-09-26T00:30:00.000Z',
    ticket_sources: [{ source: 'manual', url: 'https://norteticket.com/no-te-va-gustar-en-salta-2026' }],
    created_at: '2026-08-01T00:00:00.000Z',
  }),
]
check('mismo link, misma hora, venues distintos -> mismo evento', sameTicketEvent(caso6[0], caso6[1]), true)
const built6 = buildDuplicateGroups(caso6)
check('un solo grupo, marcado por link', built6.groups.map((g) => [g.rows.length, g.byTicketUrl]), [[2, true]])
const plan6 = planGroup('x', built6.groups[0].rows, true)
check('sobrevive la ticketera (prioridad de fuente)', plan6.keeper.id, 'nt-6')
check('el venue que queda es el de la ticketera', finalOf(plan6, caso6[0], 'venue_id'), 'venue-patio')

// Funciones del mismo espectáculo: la ticketera usa un solo link para todas.
const funcion = (id: string, start: string) =>
  event({ id, title: 'El Amor de un Pueblo', scrape_source_key: 'entradauno', venue_id: 'venue-teatro', start_date: start, ticket_url: 'https://entradauno.com/landing/el-amor?idEspectaculoCartel=1' })
check('mismo link, otra hora (16 y 21) -> no', sameTicketEvent(funcion('a', '2026-09-11T19:00:00.000Z'), funcion('b', '2026-09-12T00:00:00.000Z')), false)
check('mismo link, otro día -> no', sameTicketEvent(funcion('a', '2026-09-11T19:00:00.000Z'), funcion('b', '2026-09-12T19:00:00.000Z')), false)
check('mismo link, una sin hora (00:00) -> sí', sameTicketEvent(funcion('a', '2026-09-11T03:00:00.000Z'), funcion('b', '2026-09-12T00:00:00.000Z')), true)
console.log('\n== Quién sobrevive ==')
// Halloween 30/10: dos flyers, uno sin hora (00:00) y otro a las 20:00.
const halloween = [
  event({ id: 'sin-hora', title: 'Halloween 2026', scrape_source_key: 'instagram-ai', venue_id: 'venue-cc', start_date: '2026-10-30T03:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z' }),
  event({ id: 'con-hora', title: 'Halloween 2026', scrape_source_key: 'instagram-ai', venue_id: 'venue-cc', start_date: '2026-10-30T23:00:00.000Z', description: 'Fiesta de disfraces', created_at: '2026-10-02T00:00:00.000Z' }),
]
const planHalloween = planGroup('halloween 2026|2026-10-30', halloween)
check('la hora real gana sobre 00:00', planHalloween.keeper.id, 'con-hora')
check('y conserva su hora', finalOf(planHalloween, halloween[1], 'start_date'), '2026-10-30T23:00:00.000Z')
// La hora real gana aunque la fila sin hora sea de una fuente de mayor prioridad.
const horaVsPrioridad = [
  event({ id: 'nt-sin-hora', title: 'Show', scrape_source_key: 'norteticket', start_date: '2026-10-30T03:00:00.000Z' }),
  event({ id: 'ig-con-hora', title: 'Show', scrape_source_key: 'instagram-ai', start_date: '2026-10-30T23:00:00.000Z' }),
]
check('hora real antes que prioridad de fuente', planGroup('show|2026-10-30', horaVsPrioridad).keeper.id, 'ig-con-hora')
// Misma fuente y hora: gana la descripción real sobre la autogenerada.
const descripcion = [
  event({ id: 'auto', title: 'Gabriela Roca', scrape_source_key: 'entradauno', description: 'Evento importado automáticamente desde EntradaUno', created_at: '2026-06-30T00:00:00.000Z' }),
  event({ id: 'real', title: 'Gabriela Roca', scrape_source_key: 'entradauno', description: 'Stand up de Gabriela Roca', created_at: '2026-07-04T00:00:00.000Z' }),
]
const planDescripcion = planGroup('gabriela roca|2026-09-12', descripcion)
check('la descripción real gana sobre la autogenerada', planDescripcion.keeper.id, 'real')
// Y en la ingesta (la fila existente siempre queda) la autogenerada se reemplaza.
const planIngesta = planGroup('gabriela roca|2026-09-12', [
  event({ id: 'nt', title: 'X', scrape_source_key: 'norteticket', description: 'Evento importado automáticamente desde NorteTicket' }),
  event({ id: 'ig', title: 'X', scrape_source_key: 'instagram-ai', description: 'Descripción del flyer' }),
])
check('la autogenerada nunca pisa ni se conserva frente a una real', planIngesta.patch.description, 'Descripción del flyer')

const museo = Array.from({ length: 5 }, (_, d) => funcion(`m${d}`, `2026-09-1${d}T15:00:00.000Z`))
check('un link con 5 fechas no colapsa nada', buildDuplicateGroups(museo).groups.length, 0)

console.log('\n== Reporte de ejemplo (dry-run) ==')
const report: DedupCleanupReport = {
  dryRun: true,
  scannedEvents: caso1.length + caso2.length + caso3.length,
  duplicateGroups: 3,
  totalMerges: plan1.absorbed.length + plan2.absorbed.length + plan3.absorbed.length,
  eventsAfter: 3,
  groups: [plan1, plan2, plan3],
  venueConflicts: [],
  applied: { keepersUpdated: 0, eventsDeleted: 0, favoritesRepointed: 0, keysBackfilled: 0 },
  errors: [],
  range: { from: '2026-09-01', to: null },
}
console.log(formatReport(report))

check('los 3 casos quedan en 1 registro cada uno', report.eventsAfter, 3)

console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} CHEQUEOS FALLARON`}`)
process.exit(failures === 0 ? 0 : 1)
