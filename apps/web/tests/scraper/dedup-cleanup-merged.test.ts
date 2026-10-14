import { describe, expect, it } from 'vitest'
import { runDedupCleanup } from '@/lib/scraper/dedup-cleanup'
import { createFakeEventsDb, type EventRow } from '../events/fake-events-db'

const uid = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`
const VENUE = 'ffffffff-ffff-4fff-8fff-000000000001'
const START = '2026-11-20T23:00:00.000Z'

function row(n: number, over: EventRow = {}, mergedInto?: string): EventRow {
  return {
    id: uid(n),
    title: 'Banda de Prueba',
    slug: `banda-de-prueba-${n}`,
    status: 'PUBLISHED',
    start_date: START,
    venue_id: VENUE,
    scrape_source_key: 'manual',
    ticket_sources: [],
    created_at: `2026-10-0${n}T10:00:00.000Z`,
    ai_metadata: mergedInto ? { merged_into_event_id: mergedInto } : null,
    ...over,
  }
}

const run = (rows: EventRow[]) => {
  const db = createFakeEventsDb(rows)
  return runDedupCleanup({ dryRun: true, includePast: true, supabase: db.client })
}
const idsInGroups = (r: Awaited<ReturnType<typeof run>>) =>
  r.groups.flatMap((g) => [g.keeper.id, ...g.absorbed.map((a) => a.id)])

describe('dedup-cleanup excluye fusionados', () => {
  it('un fusionado con la misma clave no aparece en ningún grupo', async () => {
    const report = await run([row(1), row(2), row(3, { status: 'DRAFT' }, uid(1))])
    expect(report.groups).toHaveLength(1)
    expect(idsInGroups(report)).not.toContain(uid(3))
    expect(idsInGroups(report).sort()).toEqual([uid(1), uid(2)])
  })

  it('un fusionado nunca es keeper aunque tenga más prioridad o antigüedad', async () => {
    const report = await run([
      row(1, { scrape_source_key: 'norteticket', created_at: '2020-01-01T00:00:00.000Z' }, uid(2)),
      row(2),
      row(3),
    ])
    for (const g of report.groups) expect(g.keeper.id).not.toBe(uid(1))
    expect(idsInGroups(report)).not.toContain(uid(1))
  })

  it('un fusionado con el mismo link de compra tampoco entra al grupo', async () => {
    const url = 'https://tickets.example.test/show-de-prueba'
    const report = await run([
      row(1, { title: 'Show A', ticket_url: url }),
      row(2, { title: 'Show B Otro', ticket_url: url }),
      row(3, { title: 'Show C Otro', ticket_url: url, status: 'DRAFT' }, uid(1)),
    ])
    expect(idsInGroups(report)).not.toContain(uid(3))
  })

  it('si el único par está fusionado, no hay grupos', async () => {
    const report = await run([row(1), row(2, { status: 'DRAFT' }, uid(1))])
    expect(report.duplicateGroups).toBe(0)
    expect(report.totalMerges).toBe(0)
  })

  it('el fusionado no cuenta como escaneado ni como conflicto de venue', async () => {
    const report = await run([row(1), row(2, { venue_id: 'ffffffff-ffff-4fff-8fff-000000000002' }, uid(1))])
    expect(report.scannedEvents).toBe(1)
    expect(report.venueConflicts).toHaveLength(0)
  })

  it('en modo aplicar no se borra ni se actualiza el fusionado', async () => {
    const db = createFakeEventsDb([row(1), row(2), row(3, { status: 'DRAFT' }, uid(1))])
    const deletes: unknown[] = []
    const inner = db.client.from
    const client = {
      from: (t: string) => {
        const b = inner(t) as Record<string, unknown>
        b.delete = () => {
          const d: Record<string, unknown> = {}
          d.eq = (_c: string, id: unknown) => {
            deletes.push(id)
            return Promise.resolve({ error: null })
          }
          return d
        }
        return b
      },
    }
    await runDedupCleanup({ dryRun: false, includePast: true, supabase: client })
    expect(deletes).not.toContain(uid(3))
    expect(db.updates.map((u) => u.id)).not.toContain(uid(3))
  })

  it('no regresión: sin fusionados, el par duplicado sigue agrupándose', async () => {
    const report = await run([row(1), row(2)])
    expect(report.duplicateGroups).toBe(1)
    expect(report.totalMerges).toBe(1)
  })
})
