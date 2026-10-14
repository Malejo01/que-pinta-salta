// Cliente Supabase falso para la tabla `events`: aplica eq/neq/gte/lte en memoria sobre filas
// inventadas y registra selects, updates e inserts. Sin red ni base.

export type EventRow = Record<string, unknown>
export type SelectRecord = { columns: string; filters: Array<[string, unknown]> }
export type UpdateRecord = { id: unknown; payload: Record<string, unknown> }

type Result = { data: EventRow[] | EventRow | null; error: null }

export function createFakeEventsDb(initial: EventRow[]) {
  const rows: EventRow[] = initial.map((r) => ({ ...r }))
  const selects: SelectRecord[] = []
  const updates: UpdateRecord[] = []
  const inserts: Array<Record<string, unknown>> = []

  const from = (table: string) => {
    if (table !== 'events') throw new Error('tabla inesperada: ' + table)
    let mode: 'select' | 'update' | 'insert' = 'select'
    let payload: Record<string, unknown> = {}
    let rec: SelectRecord = { columns: '*', filters: [] }
    const preds: Array<(r: EventRow) => boolean> = []

    const run = (): Result => {
      const matched = rows.filter((r) => preds.every((p) => p(r)))
      if (mode === 'update') {
        for (const r of matched) updates.push({ id: r.id, payload })
        return { data: null, error: null }
      }
      if (mode === 'insert') {
        const row: EventRow = { id: `00000000-0000-4000-8000-${String(900000000000 + inserts.length)}`, ...payload }
        inserts.push(payload)
        rows.push(row)
        return { data: { id: row.id }, error: null }
      }
      return { data: matched, error: null }
    }

    const b: Record<string, unknown> = {}
    b.select = (cols = '*') => {
      if (mode === 'select') {
        rec = { columns: cols, filters: [] }
        selects.push(rec)
      }
      return b
    }
    b.update = (p: Record<string, unknown>) => {
      mode = 'update'
      payload = p
      return b
    }
    b.insert = (p: Record<string, unknown>) => {
      mode = 'insert'
      payload = p
      return b
    }
    const cmp = (col: string, v: unknown, f: (a: number, b: number) => boolean) => {
      preds.push((r) => f(Date.parse(String(r[col])), Date.parse(String(v))))
      return b
    }
    b.eq = (col: string, v: unknown) => {
      rec.filters.push([col, v])
      preds.push((r) => r[col] === v)
      return b
    }
    b.neq = (col: string, v: unknown) => {
      preds.push((r) => r[col] !== v)
      return b
    }
    b.gte = (col: string, v: unknown) => cmp(col, v, (a, c) => a >= c)
    b.lte = (col: string, v: unknown) => cmp(col, v, (a, c) => a <= c)
    b.order = () => b
    b.range = () => b
    b.maybeSingle = async () => {
      const res = run()
      const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data
      return { data, error: null }
    }
    b.single = b.maybeSingle
    b.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve().then(run).then(resolve, reject)
    return b
  }

  return { client: { from }, rows, selects, updates, inserts }
}
