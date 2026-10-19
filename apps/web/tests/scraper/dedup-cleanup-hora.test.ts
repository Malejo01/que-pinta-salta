// Tarea 57-a (QPS-209): la limpieza retroactiva (dedup-cleanup.ts) agrupa por clave (título +
// día) y venues compatibles, pero hasta ahora no miraba la hora: volvía a juntar en un solo
// evento dos funciones reales del mismo show (16:00 y 21:00) que la ingesta separa desde la R40
// (ver tests/ingesta/punta-a-punta-tolerancia.test.ts, el "LÍMITE CONOCIDO" que esta tarea cierra).
// Esta suite cubre splitByFunction y su integración en buildDuplicateGroups/runDedupCleanup/
// formatReport. Sin red ni base: fixtures inventados, igual que dedup-cleanup-plan.test.ts.
import { describe, expect, it } from 'vitest'
import { TOLERANCIA_HORA_DEDUP_MIN } from '@qps/core/scraper/dedup-key'
import { buildDuplicateGroups, formatReport, runDedupCleanup, splitByFunction } from '@/lib/scraper/dedup-cleanup'
import { createFakeEventsDb } from '../events/fake-events-db'

const uid = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`
const VENUE_A = 'ffffffff-ffff-4fff-8fff-000000000001'
const VENUE_B = 'ffffffff-ffff-4fff-8fff-000000000002'

type Row = Record<string, unknown>

function row(n: number, over: Row = {}): Row {
  return {
    id: uid(n),
    title: 'Show De Prueba Con Hora',
    slug: `show-de-prueba-con-hora-${n}`,
    status: 'PUBLISHED',
    start_date: '2026-11-20T23:00:00.000Z', // 20:00 Salta, hora real
    venue_id: VENUE_A,
    scrape_source_key: 'manual',
    ticket_sources: [],
    created_at: `2026-01-0${n}T10:00:00.000Z`,
    ...over,
  }
}

// Instantes en horario de Salta (UTC-3, sin DST), ya resueltos a UTC como guarda la base. El día
// de referencia es el 20/11/2026 en Salta; sumar 3 horas puede cruzar la medianoche UTC (21:00
// Salta = 00:00 UTC del día siguiente), por eso se suma en milisegundos sobre un Date real y no
// con un template de string que fijaría el día.
const BASE_DAY_SALTA = '2026-11-20'
const SALTA_OFFSET_MS = 3 * 60 * 60 * 1000
const H = (saltaHour: number, saltaMinute = 0) => {
  const wallClock = new Date(
    `${BASE_DAY_SALTA}T${String(saltaHour).padStart(2, '0')}:${String(saltaMinute).padStart(2, '0')}:00.000Z`
  )
  return new Date(wallClock.getTime() + SALTA_OFFSET_MS).toISOString()
}
const SIN_HORA = '2026-11-20T03:00:00.000Z' // 00:00 Salta: placeholder "sin hora"

describe('splitByFunction', () => {
  it('16:00 y 21:00, mismo título, mismo venue: dos funciones (ninguna se fusiona)', () => {
    const f16 = row(1, { start_date: H(16) })
    const f21 = row(2, { start_date: H(21) })
    const { groups, ambiguousNoTime } = splitByFunction([f16, f21])
    expect(groups).toHaveLength(2)
    expect(ambiguousNoTime).toHaveLength(0)
  })

  it('21:00 y 21:30 de dos fuentes distintas, mismo venue: una sola función', () => {
    const f21 = row(1, { start_date: H(21), scrape_source_key: 'norteticket' })
    const f21_30 = row(2, { start_date: H(21, 30), scrape_source_key: 'alpogo' })
    const { groups, ambiguousNoTime } = splitByFunction([f21, f21_30])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
    expect(ambiguousNoTime).toHaveLength(0)
  })

  it('borde: exactamente la tolerancia de diferencia: una sola función', () => {
    const base = row(1, { start_date: H(18) })
    const limite = row(2, { start_date: new Date(new Date(H(18)).getTime() + TOLERANCIA_HORA_DEDUP_MIN * 60_000).toISOString() })
    const { groups } = splitByFunction([base, limite])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
  })

  it('borde: un minuto más que la tolerancia: dos funciones', () => {
    const base = row(1, { start_date: H(18) })
    const masUnMinuto = row(2, {
      start_date: new Date(new Date(H(18)).getTime() + (TOLERANCIA_HORA_DEDUP_MIN + 1) * 60_000).toISOString(),
    })
    const { groups } = splitByFunction([base, masUnMinuto])
    expect(groups).toHaveLength(2)
  })

  it('cadena 16:00 · 17:30 · 19:00: no es una sola función, y ningún grupo tiene dos filas a más de la tolerancia entre sí', () => {
    const f16 = row(1, { start_date: H(16) })
    const f17_30 = row(2, { start_date: H(17, 30) })
    const f19 = row(3, { start_date: H(19) })
    const { groups } = splitByFunction([f16, f17_30, f19])

    // No colapsa en un solo grupo por transitividad (16:00-17:30 compatibles, 17:30-19:00
    // compatibles, pero 16:00-19:00 no: 180 min > tolerancia).
    expect(groups.length).toBeGreaterThan(1)

    for (const group of groups) {
      const times = group.map((r) => new Date(r.start_date as string).getTime())
      const maxDiffMin = (Math.max(...times) - Math.min(...times)) / 60_000
      expect(maxDiffMin).toBeLessThanOrEqual(TOLERANCIA_HORA_DEDUP_MIN)
    }
  })

  it('una fila sin hora + una sola función: entra en ella (como antes de esta regla)', () => {
    const conHora = row(1, { start_date: H(21) })
    const sinHora = row(2, { start_date: SIN_HORA })
    const { groups, ambiguousNoTime } = splitByFunction([conHora, sinHora])
    expect(groups).toHaveLength(1)
    expect(groups[0].map((r) => r.id).sort()).toEqual([uid(1), uid(2)])
    expect(ambiguousNoTime).toHaveLength(0)
  })

  it('una fila sin hora + dos funciones: no entra en ninguna, queda en ambiguousNoTime', () => {
    const f16 = row(1, { start_date: H(16) })
    const f21 = row(2, { start_date: H(21) })
    const sinHora = row(3, { start_date: SIN_HORA })
    const { groups, ambiguousNoTime } = splitByFunction([f16, f21, sinHora])
    expect(groups).toHaveLength(2)
    for (const group of groups) expect(group.map((r) => r.id)).not.toContain(uid(3))
    expect(ambiguousNoTime.map((r) => r.id)).toEqual([uid(3)])
  })

  it('todas sin hora: un solo grupo (como antes de esta regla)', () => {
    const a = row(1, { start_date: SIN_HORA })
    const b = row(2, { start_date: SIN_HORA })
    const { groups, ambiguousNoTime } = splitByFunction([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
    expect(ambiguousNoTime).toHaveLength(0)
  })
})

describe('buildDuplicateGroups: integración con splitByFunction', () => {
  it('16:00 y 21:00, mismo título y venue: ningún grupo de duplicados, un functionSplit', () => {
    const f16 = row(1, { start_date: H(16) })
    const f21 = row(2, { start_date: H(21) })
    const { groups, functionSplits, venueConflicts } = buildDuplicateGroups([f16, f21])
    expect(groups).toHaveLength(0)
    expect(venueConflicts).toHaveLength(0)
    expect(functionSplits).toHaveLength(1)
    expect(functionSplits[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2)])
    expect(functionSplits[0].sinHoraExcluidas).toHaveLength(0)
  })

  it('venues distintos + horas distintas: venueConflicts y functionSplits reportan cada uno lo suyo', () => {
    const a = row(1, { start_date: H(16), venue_id: VENUE_A })
    const b = row(2, { start_date: H(21), venue_id: VENUE_B })
    const { groups, venueConflicts, functionSplits } = buildDuplicateGroups([a, b])
    expect(groups).toHaveLength(0)
    // Partido por venue (splitByVenue da dos grupos de un elemento cada uno).
    expect(venueConflicts).toHaveLength(1)
    expect(venueConflicts[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2)])
    // Cada venue-grupo tiene una sola fila, así que splitByFunction no separa nada DENTRO de cada
    // venue — y las horas de las dos filas en conjunto nunca se comparan entre venues (cada una es
    // su propia función de un solo elemento). No hay dos funciones DENTRO de un mismo venue: acá
    // functionSplits queda vacío porque la única razón para no fusionar es el venue, no la hora.
    expect(functionSplits).toHaveLength(0)
  })

  it('venues distintos pero CADA venue con dos funciones por hora: venueConflicts y functionSplits reportan cada uno lo suyo', () => {
    const a1 = row(1, { start_date: H(16), venue_id: VENUE_A })
    const a2 = row(2, { start_date: H(21), venue_id: VENUE_A })
    const b1 = row(3, { start_date: H(16), venue_id: VENUE_B })
    const b2 = row(4, { start_date: H(21), venue_id: VENUE_B })
    const { groups, venueConflicts, functionSplits } = buildDuplicateGroups([a1, a2, b1, b2])
    expect(groups).toHaveLength(0)
    expect(venueConflicts).toHaveLength(1) // partido por venue (A vs B)
    expect(functionSplits).toHaveLength(1) // partido por hora dentro de cada venue

    // venueConflicts.rows es siempre el bucket COMPLETO (nunca se filtra por grupo de venue),
    // mientras que functionSplits.rows es sólo de los grupos de venue que se partieron por hora.
    // Acá los DOS grupos de venue (A y B) se partieron por hora, así que los dos conjuntos
    // terminan siendo iguales: las mismas 4 filas aparecen en el reporte por dos motivos
    // distintos, los dos ciertos. Si algún día venueConflicts.rows se filtrara por grupo de venue,
    // esta aserción se pone en rojo y obliga a actualizar el docstring de buildDuplicateGroups en
    // el mismo cambio.
    expect(venueConflicts[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2), uid(3), uid(4)].sort())
    expect(functionSplits[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2), uid(3), uid(4)].sort())
    expect(new Set(venueConflicts[0].rows.map((r) => r.id))).toEqual(new Set(functionSplits[0].rows.map((r) => r.id)))
  })

  it('venue A con dos funciones (16:00/21:00) + venue B con una sola fila (20:00): functionSplits.rows trae SÓLO las de A', () => {
    // Caso señalado en la revisión: B no tiene nada que ver con la partición por hora (su único
    // motivo para no fusionar es el venue, y ya está en venueConflicts con el bucket entero). Si
    // functionSplits.rows filtrara por "hora real en el bucket" en vez de por "venueGroup que se
    // partió", la fila de B se filtraría ahí también — que es justo el bug que este test detecta.
    const a16 = row(1, { start_date: H(16), venue_id: VENUE_A })
    const a21 = row(2, { start_date: H(21), venue_id: VENUE_A })
    const b20 = row(3, { start_date: H(20), venue_id: VENUE_B })
    const { groups, venueConflicts, functionSplits } = buildDuplicateGroups([a16, a21, b20])
    expect(groups).toHaveLength(0)
    expect(venueConflicts).toHaveLength(1)
    expect(venueConflicts[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2), uid(3)].sort())
    expect(functionSplits).toHaveLength(1)
    expect(functionSplits[0].rows.map((r) => r.id).sort()).toEqual([uid(1), uid(2)])
    expect(functionSplits[0].sinHoraExcluidas).toHaveLength(0)
  })

  it('link de compra compartido a distinta hora: sigue sin fusionar (regla b, sameTicketEvent exige hora exacta)', () => {
    const url = 'https://tickets.example.test/show-de-prueba-con-hora'
    const f16 = row(1, { start_date: H(16), ticket_url: url })
    const f21 = row(2, { start_date: H(21), ticket_url: url })
    const { groups, functionSplits } = buildDuplicateGroups([f16, f21])
    expect(groups).toHaveLength(0)
    expect(functionSplits).toHaveLength(1)
  })
})

describe('runDedupCleanup + formatReport: sección de functionSplits', () => {
  it('formatReport muestra la sección nueva sólo cuando hay functionSplits', async () => {
    const f16 = row(1, { start_date: H(16) })
    const f21 = row(2, { start_date: H(21) })
    const db = createFakeEventsDb([f16, f21])
    const report = await runDedupCleanup({ dryRun: true, includePast: true, supabase: db.client })
    expect(report.functionSplits).toHaveLength(1)
    const text = formatReport(report)
    expect(text).toContain('DOS FUNCIONES EL MISMO DÍA (no se fusionan): 1 buckets')
  })

  it('formatReport no muestra la sección cuando no hay functionSplits', async () => {
    const a = row(1)
    const b = row(2)
    const db = createFakeEventsDb([a, b])
    const report = await runDedupCleanup({ dryRun: true, includePast: true, supabase: db.client })
    expect(report.functionSplits).toHaveLength(0)
    const text = formatReport(report)
    expect(text).not.toContain('DOS FUNCIONES EL MISMO DÍA')
  })

  it('determinismo: el mismo input en otro orden da el mismo plan', async () => {
    const f16 = row(1, { start_date: H(16) })
    const f21 = row(2, { start_date: H(21) })
    const suelto = row(3, { title: 'Otro Show Suelto De Prueba' })

    const dbA = createFakeEventsDb([f16, f21, suelto])
    const reportA = await runDedupCleanup({ dryRun: true, includePast: true, supabase: dbA.client })

    const dbB = createFakeEventsDb([suelto, f21, f16])
    const reportB = await runDedupCleanup({ dryRun: true, includePast: true, supabase: dbB.client })

    const idsOf = (r: Awaited<ReturnType<typeof runDedupCleanup>>) => ({
      groups: r.groups.map((g) => g.keeper.id).sort(),
      functionSplits: r.functionSplits
        .map((fs) => ({ dedupKey: fs.dedupKey, ids: fs.events.map((e) => e.id).sort() }))
        .sort((x, y) => x.dedupKey.localeCompare(y.dedupKey)),
      venueConflicts: r.venueConflicts.length,
    })

    expect(idsOf(reportA)).toEqual(idsOf(reportB))
  })
})
