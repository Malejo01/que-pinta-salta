// Columnas públicas de `events` (QPS-095): sin red ni base.
//
// No reusamos tests/events/fake-events-db.ts para getEvents/getFeaturedEvents
// porque esos dos llaman `.or(...)` y `.not(...)` (vía applyVigenciaPrefilter)
// y fake-events-db.ts no los soporta (solo select/eq/neq/gte/lte/order/range);
// no se puede tocar ese archivo. Usamos en cambio un mock inline del mismo
// estilo que tests/events/get-featured.test.ts (mockea '@/lib/supabase/server'
// con un query builder que registra cada llamada).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/database.types'

const state = vi.hoisted(() => ({
  // Fila devuelta por `.single()`/al resolver la promesa: una sola, no importa
  // el contenido para estos tests (solo nos interesa qué columnas se pidieron).
  row: { id: 'evento-de-prueba' } as Record<string, unknown>,
  calls: [] as Array<{ method: string; args: unknown[] }>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'not', 'or', 'order', 'limit', 'in', 'ilike']) {
        c[m] = (...args: unknown[]) => {
          state.calls.push({ method: m, args })
          return c
        }
      }
      c.single = async () => ({ data: state.row, error: null })
      // getEventById usa maybeSingle desde el PR de SEO (13/10).
      c.maybeSingle = async () => ({ data: state.row, error: null })
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: [state.row], error: null }).then(res, rej)
      return c
    },
  }),
}))

import { getEventById, getEventBySlug, getEvents, getFeaturedEvents } from '@/lib/data'
import { PUBLIC_EVENT_COLUMNS, PUBLIC_EVENT_SELECT } from '@/lib/events/public-select'

beforeEach(() => {
  state.calls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

function selectArgs(): unknown[] {
  return state.calls.filter((c) => c.method === 'select').map((c) => c.args[0])
}

const COLUMNAS_INTERNAS = ['merge_audit', 'dedup_key', 'ai_metadata', 'created_by']

describe('PUBLIC_EVENT_COLUMNS', () => {
  it('no incluye columnas internas (merge_audit, dedup_key, ai_metadata, created_by)', () => {
    for (const interna of COLUMNAS_INTERNAS) {
      expect(PUBLIC_EVENT_COLUMNS).not.toContain(interna)
    }
  })

  it('no incluye un "*" (ni vacío)', () => {
    expect(PUBLIC_EVENT_COLUMNS).not.toContain('*')
    expect(PUBLIC_EVENT_COLUMNS.length).toBeGreaterThan(0)
  })
})

describe('PUBLIC_EVENT_SELECT', () => {
  it('lista todas las columnas de PUBLIC_EVENT_COLUMNS', () => {
    for (const columna of PUBLIC_EVENT_COLUMNS) {
      expect(PUBLIC_EVENT_SELECT).toContain(columna)
    }
  })

  it('incluye los joins category:categories(*) y venue:venues(*)', () => {
    expect(PUBLIC_EVENT_SELECT).toContain('category:categories(*)')
    expect(PUBLIC_EVENT_SELECT).toContain('venue:venues(*)')
  })

  it('no tiene un "*" suelto a nivel de events: los únicos "*" son los de los joins', () => {
    const sinJoins = PUBLIC_EVENT_SELECT.replace('category:categories(*)', '').replace('venue:venues(*)', '')
    expect(sinJoins).not.toContain('*')
  })

  it('no contiene las columnas internas ni siquiera como parte de los joins', () => {
    for (const interna of COLUMNAS_INTERNAS) {
      expect(PUBLIC_EVENT_SELECT).not.toContain(interna)
    }
  })
})

describe('lib/data.ts pide PUBLIC_EVENT_SELECT (y no "*") a la tabla events', () => {
  it('getEvents', async () => {
    await getEvents()
    expect(selectArgs()).toEqual([PUBLIC_EVENT_SELECT])
  })

  it('getEventBySlug', async () => {
    await getEventBySlug('evento-de-prueba')
    expect(selectArgs()).toEqual([PUBLIC_EVENT_SELECT])
  })

  it('getEventById', async () => {
    await getEventById('11111111-1111-4111-8111-111111111111')
    expect(selectArgs()).toEqual([PUBLIC_EVENT_SELECT])
  })

  it('getFeaturedEvents', async () => {
    await getFeaturedEvents()
    expect(selectArgs()).toEqual([PUBLIC_EVENT_SELECT])
  })
})

// ---------------------------------------------------------------------------
// Punto 4 del encargo: cada columna de PUBLIC_EVENT_COLUMNS existe en
// Database['public']['Tables']['events']['Row']. Es un chequeo DE TIPOS, no
// de runtime: si no compila, `npm run typecheck` (y por lo tanto el CI) falla;
// `vitest run` no lo detecta porque no tipa (usa esbuild, que solo borra los
// tipos sin chequearlos). Ver el informe de la tarea para cómo se comprobó
// a mano (agregando una columna inventada a PUBLIC_EVENT_COLUMNS y corriendo
// `npm run typecheck`).
// ---------------------------------------------------------------------------
type EventRow = Database['public']['Tables']['events']['Row']
type Expect<T extends true> = T
// Conditional distribuido sobre la unión de columnas: si TODAS son keyof
// EventRow, el resultado es `true`; si alguna no lo es, el resultado es
// `boolean` (`true | false`), que no es asignable a `true` y rompe Expect<>.
type EveryPublicColumnExistsInEventRow = (typeof PUBLIC_EVENT_COLUMNS)[number] extends keyof EventRow
  ? true
  : false
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPublicColumnsExistInEventRow = Expect<EveryPublicColumnExistsInEventRow>

describe('PUBLIC_EVENT_COLUMNS vs. Database (chequeo de tipos)', () => {
  it('el chequeo de tipos de arriba compila (ver comentario): este test solo confirma que el archivo se pudo importar', () => {
    expect(PUBLIC_EVENT_COLUMNS.length).toBeGreaterThan(0)
  })
})
