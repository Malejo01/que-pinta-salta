// Tarea 32-q (QA): caracterización de lib/scraper/dedup-cleanup.ts (funciones puras, sin
// Supabase): pickKeeper, splitByVenue, groupByDedupKey, buildDuplicateGroups y planGroup.
// Ya cubierto en tests/scraper/dedup-cleanup-merged.test.ts: exclusión de fusionados a mano
// (merged_into_event_id). Acá se cubre el orden de pickKeeper, la separación por venue, los
// venueConflicts (misma clave, venues distintos, sin fusionar), el flag byTicketUrl y la fusión
// de ticket_sources con precio mínimo dentro de planGroup. Sin red ni base: fixtures inventados.
import { describe, expect, it } from 'vitest'
import {
  buildDuplicateGroups,
  groupByDedupKey,
  pickKeeper,
  planGroup,
  splitByVenue,
} from '@/lib/scraper/dedup-cleanup'

const uid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
const VENUE_A = 'ffffffff-ffff-4fff-8fff-000000000001'
const VENUE_B = 'ffffffff-ffff-4fff-8fff-000000000002'
const START = '2026-11-20T23:00:00.000Z' // 20:00 Salta: hora real
const SIN_HORA = '2026-11-20T03:00:00.000Z' // 00:00 Salta: placeholder "sin hora"

type Row = Record<string, unknown>

function row(n: number, over: Row = {}): Row {
  return {
    id: uid(n),
    title: 'Banda de Prueba',
    slug: `banda-de-prueba-${n}`,
    status: 'PUBLISHED',
    start_date: START,
    venue_id: VENUE_A,
    scrape_source_key: 'manual',
    ticket_sources: [],
    created_at: `2026-01-0${n}T10:00:00.000Z`,
    ...over,
  }
}

describe('pickKeeper: orden de selección', () => {
  it('1) hora real gana sobre fuente de mayor prioridad sin hora', () => {
    const sinHoraTicketera = row(1, { start_date: SIN_HORA, scrape_source_key: 'norteticket' })
    const conHoraManual = row(2, { start_date: START, scrape_source_key: 'manual' })
    const [keeper] = pickKeeper([sinHoraTicketera, conHoraManual])
    expect(keeper.id).toBe(uid(2))
    // Simétrico: el orden de entrada no cambia el resultado.
    expect(pickKeeper([conHoraManual, sinHoraTicketera])[0].id).toBe(uid(2))
  })

  it('2) con hora real en ambos, gana la fuente de mayor prioridad (ticketera > instagram)', () => {
    const ticketera = row(1, { scrape_source_key: 'norteticket' })
    const instagram = row(2, { scrape_source_key: 'instagram-ai' })
    expect(pickKeeper([instagram, ticketera])[0].id).toBe(uid(1))
  })

  it('3) misma prioridad: gana la descripción más completa (la autogenerada cuenta como vacía)', () => {
    const autogenerada = row(1, { description: 'Evento importado automáticamente desde el scraper de prueba' })
    const real = row(2, { description: 'Una descripción real con detalles del show de prueba' })
    expect(pickKeeper([autogenerada, real])[0].id).toBe(uid(2))
  })

  it('4) todo empatado: gana el registro más viejo (created_at menor), no el de menor id', () => {
    const viejo = row(9, { created_at: '2020-01-01T00:00:00.000Z' })
    const nuevo = row(1, { created_at: '2026-01-01T00:00:00.000Z' })
    expect(pickKeeper([nuevo, viejo])[0].id).toBe(uid(9))
  })

  it('orden completo con 4 filas que ejercen las 4 reglas en cascada', () => {
    const porPrioridad = row(1, { scrape_source_key: 'norteticket', created_at: '2026-01-01T00:00:00.000Z' })
    const porDescripcion = row(2, {
      scrape_source_key: 'manual',
      description: 'Descripción completa y real de prueba',
      created_at: '2026-01-02T00:00:00.000Z',
    })
    const porAntiguedad = row(3, { scrape_source_key: 'manual', created_at: '2020-01-01T00:00:00.000Z' })
    const sinHora = row(4, { start_date: SIN_HORA, scrape_source_key: 'norteticket' })

    const sorted = pickKeeper([sinHora, porDescripcion, porAntiguedad, porPrioridad])
    expect(sorted.map((r) => r.id)).toEqual([uid(1), uid(2), uid(3), uid(4)])
  })
})

describe('splitByVenue', () => {
  it('un solo venue: un solo grupo, nada excluido', () => {
    const { groups, excluded } = splitByVenue([row(1), row(2)])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
    expect(excluded).toHaveLength(0)
  })

  it('venue + sin venue: un solo grupo (venue único salvo las sin venue)', () => {
    const { groups, excluded } = splitByVenue([row(1), row(2, { venue_id: null })])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
    expect(excluded).toHaveLength(0)
  })

  it('dos venues distintos: dos grupos separados y las filas sin venue quedan excluidas', () => {
    const a = row(1, { venue_id: VENUE_A })
    const b = row(2, { venue_id: VENUE_B })
    const sinVenue = row(3, { venue_id: null })
    const { groups, excluded } = splitByVenue([a, b, sinVenue])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.map((r) => r.id)).sort()).toEqual([[uid(1)], [uid(2)]])
    expect(excluded.map((r) => r.id)).toEqual([uid(3)])
  })
})

describe('groupByDedupKey', () => {
  it('agrupa por título normalizado + día', () => {
    const groups = groupByDedupKey([row(1), row(2), row(3, { title: 'Otro Show de Prueba' })])
    expect(groups.size).toBe(2)
    expect(groups.get('banda de prueba|2026-11-20')).toHaveLength(2)
  })

  it('fila sin título o sin fecha: no se agrupa (nunca a ciegas)', () => {
    const groups = groupByDedupKey([row(1, { title: '' }), row(2, { start_date: null })])
    expect(groups.size).toBe(0)
  })
})

describe('buildDuplicateGroups', () => {
  it('misma clave, mismo venue: un grupo, byTicketUrl false', () => {
    const { groups, venueConflicts } = buildDuplicateGroups([row(1), row(2)])
    expect(groups).toHaveLength(1)
    expect(groups[0].byTicketUrl).toBe(false)
    expect(groups[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2)])
    expect(venueConflicts).toHaveLength(0)
  })

  it('misma clave, venues distintos, sin link en común: venueConflict, ningún grupo', () => {
    const a = row(1, { venue_id: VENUE_A })
    const b = row(2, { venue_id: VENUE_B })
    const { groups, venueConflicts } = buildDuplicateGroups([a, b])
    expect(groups).toHaveLength(0)
    expect(venueConflicts).toHaveLength(1)
    expect(venueConflicts[0].dedupKey).toBe('banda de prueba|2026-11-20')
    expect(venueConflicts[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2)])
  })

  it('misma clave, venues distintos, PERO mismo link de compra: sí se agrupan y queda byTicketUrl true', () => {
    const url = 'https://tickets.example.test/banda-de-prueba'
    const a = row(1, { venue_id: VENUE_A, ticket_url: url })
    const b = row(2, { venue_id: VENUE_B, ticket_url: url })
    const { groups, venueConflicts } = buildDuplicateGroups([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0].byTicketUrl).toBe(true)
    expect(venueConflicts).toHaveLength(0)
  })

  it('dos funciones el mismo día (16:00 y 21:00), mismo venue, títulos distintos: NO se agrupan por clave', () => {
    // dedup_key es título+día (sin hora): con títulos distintos no hay clave compartida.
    const funcion16 = row(1, { title: 'Show Funcion Tarde', start_date: '2026-11-20T19:00:00.000Z' }) // 16:00 Salta
    const funcion21 = row(2, { title: 'Show Funcion Noche', start_date: START }) // 20:00 Salta (usamos START existente)
    const { groups } = buildDuplicateGroups([funcion16, funcion21])
    expect(groups).toHaveLength(0)
  })

  it('QPS-209: dos funciones el mismo día (16:00 y 21:00) con el MISMO título y venue YA NO se agrupan por clave', () => {
    // Antes de QPS-209 esto era el HALLAZGO de esta suite: la clave es título+día, sin hora, y
    // dedup-cleanup no distinguía dos funciones del mismo espectáculo (las fusionaba). Desde
    // QPS-209, buildDuplicateGroups también exige horas compatibles dentro de cada grupo de venue
    // (splitByFunction): con 4 horas de diferencia (> TOLERANCIA_HORA_DEDUP_MIN), cada función
    // queda sola y se reporta en functionSplits en lugar de fusionarse. Esto es examinado también
    // a nivel de ingesta en tests/scraper/dos-funciones-mismo-dia.test.ts.
    const funcion16 = row(1, { start_date: '2026-11-20T19:00:00.000Z' }) // 16:00 Salta
    const funcion21 = row(2, { start_date: START }) // 20:00 Salta
    const { groups, venueConflicts, functionSplits } = buildDuplicateGroups([funcion16, funcion21])
    expect(groups).toHaveLength(0)
    expect(venueConflicts).toHaveLength(0)
    expect(functionSplits).toHaveLength(1)
    expect(functionSplits[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2)])
  })
})

describe('planGroup: fusión de ticket_sources con precio mínimo', () => {
  it('el keeper conserva su link y suma los de los absorbidos; price_min queda en el más barato', () => {
    const keeper = row(1, {
      ticket_url: 'https://tickets.example.test/general',
      price_min: 15000,
      ticket_sources: [],
    })
    const absorbido = row(2, {
      ticket_url: 'https://otra.example.test/preventa',
      price_min: 12000,
      created_at: '2026-01-05T00:00:00.000Z', // más nuevo: no afecta quién es keeper acá (ya viene ordenado)
    })
    const plan = planGroup('banda de prueba|2026-11-20', [keeper, absorbido])

    expect(plan.keeper.id).toBe(uid(1))
    expect(plan.absorbed.map((a) => a.id)).toEqual([uid(2)])
    const urls = (plan.patch.ticket_sources as Array<{ url: string }>).map((s) => s.url)
    expect(urls.sort()).toEqual(['https://otra.example.test/preventa', 'https://tickets.example.test/general'])
    expect(plan.patch.price_min).toBe(12000) // el mínimo de los dos, no el del keeper
    expect(plan.ticketSourcesBefore).toBe(0)
    expect(plan.ticketSourcesAfter).toBe(2)
  })

  it('tres filas: las fusiones se aplican en orden, cada una sobre el resultado de la anterior', () => {
    // planGroup reordena el grupo con pickKeeper ANTES de fusionar (ver hallazgo más abajo);
    // acá las tres filas empatan en todo salvo created_at, así que el orden resultante es el
    // mismo que el de llegada y "absorbed" queda en orden de created_at ascendente.
    const keeper = row(1, { ticket_url: 'https://tickets.example.test/a', price_min: 20000 })
    const segundo = row(2, { ticket_url: 'https://tickets.example.test/b', price_min: 18000 })
    const tercero = row(3, { ticket_url: 'https://tickets.example.test/c', price_min: 9000 })

    const plan = planGroup('banda de prueba|2026-11-20', [keeper, segundo, tercero])
    expect(plan.absorbed.map((a) => a.id)).toEqual([uid(2), uid(3)]) // orden de llegada, no reordenado
    expect(plan.auditEntries).toHaveLength(2) // una entrada de auditoría por absorbido
    expect(plan.patch.price_min).toBe(9000) // el mínimo de las tres fuentes
    expect(plan.ticketSourcesAfter).toBe(3)
  })

  it('las vistas (view_count) de todas las filas del grupo se suman en el patch', () => {
    const keeper = row(1, { view_count: 10 })
    const absorbido = row(2, { view_count: 5 })
    const plan = planGroup('banda de prueba|2026-11-20', [keeper, absorbido])
    expect(plan.patch.view_count).toBe(15)
  })

  it('dedup_key del patch se recalcula sobre el título final (post-fusión), completando el hueco', () => {
    // Mismo start_date real y misma prioridad en las dos filas (si no, pickKeeper elegiría
    // keeper según otra regla antes de llegar a esto, ver el hallazgo de abajo). El keeper queda
    // primero por created_at más viejo; su título vacío se completa con el del absorbido.
    const keeper = row(1, { title: '', created_at: '2026-01-01T00:00:00.000Z' })
    const absorbido = row(2, { title: 'Banda Completa De Prueba', created_at: '2026-01-02T00:00:00.000Z' })
    const plan = planGroup('banda de prueba|2026-11-20', [keeper, absorbido])
    expect(plan.keeper.id).toBe(uid(1))
    expect(plan.patch.title).toBe('Banda Completa De Prueba')
    expect(plan.patch.dedup_key).toBe('banda completa de prueba|2026-11-20')
  })

  it('HALLAZGO: planGroup reordena el grupo con pickKeeper, sin importar en qué posición venga el keeper', () => {
    // planGroup llama a pickKeeper(group) internamente (no usa group[0] a ciegas). Si el primer
    // elemento del array no gana pickKeeper (por ejemplo porque no tiene hora real y el otro sí),
    // termina DE TODOS MODOS como absorbido, aunque se lo haya pasado primero.
    const sinHora = row(1, { title: '', start_date: SIN_HORA }) // sin hora real: pierde contra la otra
    const conHora = row(2, { title: 'Banda Con Hora De Prueba', start_date: START })
    const plan = planGroup('banda de prueba|2026-11-20', [sinHora, conHora])
    expect(plan.keeper.id).toBe(uid(2)) // no uid(1), aunque vino primero en el array
    expect(plan.absorbed.map((a) => a.id)).toEqual([uid(1)])
  })
})
