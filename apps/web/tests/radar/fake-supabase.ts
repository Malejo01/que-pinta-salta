// Cliente Supabase falso, encadenable, que registra cada consulta y APLICA los filtros en
// memoria sobre filas inventadas. Sin red ni base. Solo cubre lo que usa el Radar:
// eq, gte, lte, in, or (con `col.op.valor` y `and(...)`), order, limit.

export type Row = Record<string, unknown>
export type Call = { method: string; args: unknown[] }
export type RecordedQuery = { table: string; calls: Call[] }
export type FakeTable = { rows: Row[]; error?: { message: string } | null }

const toComparable = (v: unknown): number | string => {
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isNaN(t) ? v : t
  }
  return v as number
}

function splitTop(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function evalTerm(row: Row, term: string): boolean {
  if (term.startsWith('and(') && term.endsWith(')')) {
    return splitTop(term.slice(4, -1)).every((t) => evalTerm(row, t))
  }
  const m = /^([\w.]+?)\.(gte|lte|gt|lt|eq|is)\.(.*)$/.exec(term)
  if (!m) throw new Error('término de .or() no soportado por el falso: ' + term)
  const [, col, op, raw] = m
  const v = row[col]
  if (op === 'is') return raw === 'null' ? v === null || v === undefined : v === raw
  if (v === null || v === undefined) return false
  const a = toComparable(v)
  const b = toComparable(raw)
  if (op === 'gte') return a >= b
  if (op === 'lte') return a <= b
  if (op === 'gt') return a > b
  if (op === 'lt') return a < b
  return a === b
}

export function createFakeSupabase(tables: Record<string, FakeTable>) {
  const queries: RecordedQuery[] = []

  const from = (table: string) => {
    if (!(table in tables)) throw new Error('tabla inesperada: ' + table)
    const rec: RecordedQuery = { table, calls: [] }
    queries.push(rec)
    const filters: Array<(r: Row) => boolean> = []
    let order: { col: string; asc: boolean } | null = null
    let limit: number | null = null

    const result = () => {
      const t = tables[table]
      if (t.error) return { data: null, error: t.error }
      let rows = t.rows.filter((r) => filters.every((f) => f(r)))
      if (order) {
        const { col, asc } = order
        rows = [...rows].sort((x, y) => {
          const a = toComparable(x[col])
          const b = toComparable(y[col])
          return (a < b ? -1 : a > b ? 1 : 0) * (asc ? 1 : -1)
        })
      }
      if (limit !== null) rows = rows.slice(0, limit)
      return { data: rows, error: null }
    }

    const c: Record<string, unknown> = {}
    const add = (method: string, apply?: (...a: unknown[]) => void) => {
      c[method] = (...args: unknown[]) => {
        rec.calls.push({ method, args })
        apply?.(...args)
        return c
      }
    }
    add('select')
    add('eq', (col, val) => filters.push((r) => r[col as string] === val))
    add('gte', (col, val) => filters.push((r) => r[col as string] != null && toComparable(r[col as string]) >= toComparable(val)))
    add('lte', (col, val) => filters.push((r) => r[col as string] != null && toComparable(r[col as string]) <= toComparable(val)))
    add('in', (col, vals) => filters.push((r) => (vals as unknown[]).includes(r[col as string])))
    add('or', (expr) => filters.push((r) => splitTop(expr as string).some((t) => evalTerm(r, t))))
    add('order', (col, opts) => {
      order = { col: col as string, asc: (opts as { ascending?: boolean } | undefined)?.ascending !== false }
    })
    add('limit', (n) => {
      limit = n as number
    })
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
    return c
  }

  const callsOf = (table: string) => queries.filter((q) => q.table === table)
  const args = (q: RecordedQuery, method: string) => q.calls.filter((c) => c.method === method).map((c) => c.args)
  return { client: { from }, queries, callsOf, args }
}
