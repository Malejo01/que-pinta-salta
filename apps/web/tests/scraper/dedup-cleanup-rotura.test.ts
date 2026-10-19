// Tarea 57-q (QA): red de seguridad de punta a punta sobre lo que acaban de tocar 57-a
// (lib/scraper/dedup-cleanup.ts, QPS-209: splitByFunction/functionSplits) y 57-b (no toca este
// archivo, pero corre en el mismo worktree). El objetivo no es volver a probar la lógica pura
// (ya cubierta por tests/scraper/dedup-cleanup-plan.test.ts y dedup-cleanup-hora.test.ts), sino
// afirmar, con runDedupCleanup de punta a punta y un cliente fake, dos cosas muy puntuales que si
// se rompen son graves:
//   1. dos funciones reales del mismo show (16:00 y 21:00) NUNCA se fusionan, aunque haya además
//      una fila sin hora dando vueltas en el mismo bucket;
//   2. el dry-run nunca escribe nada, ni siquiera cuando SÍ hay un grupo para fusionar.
// Sin red ni base: fixtures inventados, siempre en dry-run.
import { describe, expect, it } from 'vitest'
import { runDedupCleanup } from '@/lib/scraper/dedup-cleanup'
import { createFakeEventsDb, type EventRow } from '../events/fake-events-db'

const uid = (n: number) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`
const VENUE = 'ffffffff-ffff-4fff-8fff-000000000003'

function row(n: number, over: EventRow = {}): EventRow {
  return {
    id: uid(n),
    title: 'Show De Rotura De Prueba',
    slug: `show-de-rotura-de-prueba-${n}`,
    status: 'PUBLISHED',
    start_date: '2026-12-05T23:00:00.000Z',
    venue_id: VENUE,
    scrape_source_key: 'manual',
    ticket_sources: [],
    created_at: `2026-01-0${n}T10:00:00.000Z`,
    ...over,
  }
}

// Instantes en horario de Salta (UTC-3, sin DST, ver date-format.ts), resueltos a UTC como guarda
// la base. El día de referencia (5/12/2026) se fija aparte del cálculo de la hora para no
// depender de que sumar el offset cruce o no la medianoche UTC.
const BASE_DAY_SALTA = '2026-12-05'
const SALTA_OFFSET_MS = 3 * 60 * 60 * 1000
const H = (saltaHour: number, saltaMinute = 0) => {
  const wallClock = new Date(
    `${BASE_DAY_SALTA}T${String(saltaHour).padStart(2, '0')}:${String(saltaMinute).padStart(2, '0')}:00.000Z`
  )
  return new Date(wallClock.getTime() + SALTA_OFFSET_MS).toISOString()
}
// H(0) da exactamente 00:00 de Salta: el placeholder de "sin hora real" (hasRealTime en
// dedup-key.ts), no un instante cualquiera de la medianoche.
const SIN_HORA = H(0)

/**
 * Mismo cliente fake `{ from }` que la última prueba de dedup-cleanup-merged.test.ts (acá
 * copiada, no importada): envuelve createFakeEventsDb para además contar los `delete` que recibe,
 * cosa que el helper compartido (tests/events/fake-events-db.ts) no soporta. `db.updates` ya
 * cuenta los `update` por su cuenta.
 */
function makeTrackedClient(rows: EventRow[]) {
  const db = createFakeEventsDb(rows)
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
  return { client, db, deletes }
}

describe('dedup-cleanup: la rotura que no puede volver a pasar', () => {
  it('16:00 y 21:00 del mismo show, y una fila sin hora: no fusiona nada, reporta el bucket partido y deja la fila sin hora excluida', async () => {
    const rows = [row(1, { start_date: H(16) }), row(2, { start_date: H(21) }), row(3, { start_date: SIN_HORA })]
    const db = createFakeEventsDb(rows)

    const report = await runDedupCleanup({ dryRun: true, includePast: true, supabase: db.client })

    expect(report.groups).toHaveLength(0)
    expect(report.functionSplits).toHaveLength(1)

    const [split] = report.functionSplits
    expect(split.events.map((e) => e.id).sort()).toEqual([uid(1), uid(2)].sort())
    expect(split.sinHoraExcluidos.map((e) => e.id)).toEqual([uid(3)])
  })

  it('21:00 y 21:30 del mismo show y venue: un solo grupo con las dos filas', async () => {
    const rows = [row(1, { start_date: H(21) }), row(2, { start_date: H(21, 30) })]
    const db = createFakeEventsDb(rows)

    const report = await runDedupCleanup({ dryRun: true, includePast: true, supabase: db.client })

    expect(report.groups).toHaveLength(1)
    const ids = [report.groups[0].keeper.id, ...report.groups[0].absorbed.map((a) => a.id)]
    expect(ids.sort()).toEqual([uid(1), uid(2)].sort())
  })

  it('en dry-run, aunque haya un grupo listo para fusionar, el cliente fake no recibe ningún update ni delete', async () => {
    const rows = [row(1, { start_date: H(21) }), row(2, { start_date: H(21, 30) })]
    const { client, db, deletes } = makeTrackedClient(rows)

    const report = await runDedupCleanup({ dryRun: true, includePast: true, supabase: client })

    // Confirma que no es un caso vacío: si no hubiera nada para fusionar, "no se escribió nada"
    // no probaría que el dry-run respeta el dry-run.
    expect(report.groups).toHaveLength(1)
    expect(db.updates).toHaveLength(0)
    expect(deletes).toHaveLength(0)
  })
})
