// Hotfix 13/10: /admin/revision listaba borradores ya fusionados en otro
// (ai_metadata.merged_into_event_id) y el servidor los rechazaba en silencio.
// - La página los separa: no son pendientes y traen el título del que quedó.
// - "Rechazar" (deleteDraftEvent) no borra un fusionado, solo borra DRAFT, y
//   no toca un flyer que quedó apuntando al evento que se conserva.
// Sin red ni base: los dos clientes de Supabase van mockeados.
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect: ' + url)
  },
}))
vi.mock('@/lib/data', () => ({ getCategories: async () => [], getVenues: async () => [] }))

const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))
vi.mock('@/components/draft-events-manager', () => ({
  DraftEventsManager: (props: Record<string, unknown>) => {
    captured.props = props
    return null
  },
}))

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  role: 'ADMIN' as string | null,
  sessionDrafts: [] as Row[],
  events: [] as Row[],
  flyers: [] as Row[],
  flyerUpdates: [] as Array<{ id: string; payload: Row }>,
  eventDeletes: [] as Array<Array<[string, unknown]>>,
}))

/** Builder encadenable y awaitable: guarda los filtros eq/in y resuelve según la tabla. */
function builder(resolve: (b: { op: string; filters: Array<[string, unknown]>; inFilter?: [string, unknown[]]; payload?: Row }) => unknown) {
  const ctx: { op: string; filters: Array<[string, unknown]>; inFilter?: [string, unknown[]]; payload?: Row } = { op: 'select', filters: [] }
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.order = () => b
  b.update = (p: Row) => {
    ctx.op = 'update'
    ctx.payload = p
    return b
  }
  b.delete = () => {
    ctx.op = 'delete'
    return b
  }
  b.eq = (col: string, val: unknown) => {
    ctx.filters.push([col, val])
    return b
  }
  b.in = (col: string, vals: unknown[]) => {
    ctx.inFilter = [col, vals]
    return b
  }
  b.single = async () => resolve({ ...ctx, op: 'single' })
  b.maybeSingle = async () => resolve({ ...ctx, op: 'maybeSingle' })
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resolve(ctx)).then(res, rej)
  return b
}

const byId = (rows: Row[], filters: Array<[string, unknown]>) =>
  rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-de-prueba' } } }) },
    from: (table: string) =>
      builder(() => {
        if (table === 'profiles') return { data: { role: state.role }, error: null }
        if (table === 'events') return { data: state.sessionDrafts, error: null }
        if (table === 'instagram_flyers') return { count: 0, error: null }
        throw new Error('tabla inesperada (sesión): ' + table)
      }),
  }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) =>
      builder((q) => {
        if (table === 'events') {
          if (q.op === 'delete') {
            state.eventDeletes.push(q.filters)
            return { error: null }
          }
          if (q.inFilter) {
            const ids = q.inFilter[1]
            return { data: state.events.filter((e) => ids.includes(e.id)).map(({ id, title, status }) => ({ id, title, status })), error: null }
          }
          return { data: byId(state.events, q.filters), error: null }
        }
        if (table === 'instagram_flyers') {
          if (q.op === 'update') {
            state.flyerUpdates.push({ id: q.filters.find(([c]) => c === 'id')?.[1] as string, payload: q.payload ?? {} })
            return { error: null }
          }
          if (q.inFilter) return { data: [], error: null } // loadFlyersByEvent
          return { data: byId(state.flyers, q.filters), error: null }
        }
        throw new Error('tabla inesperada (admin): ' + table)
      }),
  }),
}))

import AdminRevisionPage from '@/app/admin/revision/page'
import { deleteDraftEvent } from '@/lib/admin-actions'

const uid = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`
const DRAFT = uid(1)
const MERGED = uid(2)
const KEEP = uid(3)
const OTHER = uid(4)
const FLYER = uid(10)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-falsa-de-test'
  state.role = 'ADMIN'
  state.sessionDrafts = []
  state.events = []
  state.flyers = []
  state.flyerUpdates = []
  state.eventDeletes = []
  captured.props = null
})

function findManager(node: ReactNode): ReactElement | null {
  if (!isValidElement(node)) return null
  const el = node as ReactElement<{ children?: ReactNode; initialEvents?: unknown }>
  if (el.props && 'initialEvents' in el.props) return el
  const kids = el.props?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) {
    const found = findManager(k as ReactNode)
    if (found) return found
  }
  return null
}

describe('/admin/revision separa los fusionados', () => {
  it('un fusionado no queda en pendientes y trae el título del evento que quedó', async () => {
    state.sessionDrafts = [
      { id: DRAFT, title: 'Borrador común', start_date: '2026-10-31T01:00:00.000Z', ai_metadata: null, scrape_source_key: null },
      {
        id: MERGED,
        title: 'Halloween 2026',
        start_date: '2026-10-31T03:00:00.000Z',
        image_url: null,
        ai_metadata: { merged_into_event_id: KEEP },
        venue: { id: 'v', name: 'Live Fresh', address: '' },
        scrape_source_key: 'instagram-ai',
      },
    ]
    state.events = [{ id: KEEP, title: 'Halloween 2026 en el Centro de Convenciones', status: 'PUBLISHED' }]

    const tree = await AdminRevisionPage()
    const manager = findManager(tree)
    expect(manager).not.toBeNull()
    const props = manager!.props as { initialEvents: Row[]; mergedEvents: Row[] }

    expect(props.initialEvents.map((e) => e.id)).toEqual([DRAFT])
    expect(props.mergedEvents).toEqual([
      {
        id: MERGED,
        title: 'Halloween 2026',
        start_date: '2026-10-31T03:00:00.000Z',
        image_url: null,
        venueName: 'Live Fresh',
        mergedInto: { id: KEEP, title: 'Halloween 2026 en el Centro de Convenciones', status: 'PUBLISHED' },
      },
    ])
  })

  it('si el destino no se encuentra, igual sale de pendientes (con el id para el link)', async () => {
    state.sessionDrafts = [{ id: MERGED, title: 'X', start_date: '2026-10-31T03:00:00.000Z', ai_metadata: { merged_into_event_id: KEEP } }]
    const props = findManager(await AdminRevisionPage())!.props as { initialEvents: Row[]; mergedEvents: Row[] }
    expect(props.initialEvents).toEqual([])
    expect(props.mergedEvents[0].mergedInto).toEqual({ id: KEEP, title: null, status: null })
  })
})

describe('deleteDraftEvent ("Rechazar")', () => {
  it('sobre un fusionado: error, sin tocar el flyer ni borrar', async () => {
    state.events = [{ id: MERGED, status: 'DRAFT', ai_metadata: { merged_into_event_id: KEEP, flyer_id: FLYER } }]
    state.flyers = [{ id: FLYER, ai_metadata: { event_id: KEEP, merged_from_event_id: MERGED } }]

    const res = await deleteDraftEvent(MERGED, FLYER)
    expect(res).toEqual({ error: expect.stringContaining('fusionado en otro evento') })
    expect(state.flyerUpdates).toEqual([])
    expect(state.eventDeletes).toEqual([])
  })

  it('borrador común cuyo flyer apunta a OTRO evento: borra el borrador y no toca el flyer', async () => {
    state.events = [{ id: DRAFT, status: 'DRAFT', ai_metadata: { flyer_id: FLYER } }]
    state.flyers = [{ id: FLYER, ai_metadata: { event_id: OTHER } }]

    const res = await deleteDraftEvent(DRAFT, FLYER)
    expect(res).toEqual({ success: true })
    expect(state.flyerUpdates).toEqual([])
    expect(state.eventDeletes).toEqual([[['id', DRAFT], ['status', 'DRAFT']]])
  })

  it('borrador común cuyo flyer apunta a él: flyer en SKIPPED y borrado (lo de siempre)', async () => {
    state.events = [{ id: DRAFT, status: 'DRAFT', ai_metadata: { flyer_id: FLYER } }]
    state.flyers = [{ id: FLYER, ai_metadata: { event_id: DRAFT } }]

    const res = await deleteDraftEvent(DRAFT, FLYER)
    expect(res).toEqual({ success: true })
    expect(state.flyerUpdates).toHaveLength(1)
    expect(state.flyerUpdates[0]).toMatchObject({ id: FLYER, payload: { ai_status: 'SKIPPED' } })
    expect(state.eventDeletes).toHaveLength(1)
  })

  it('usa el flyer del borrador, no el que manda el cliente', async () => {
    const OTRO_FLYER = uid(11)
    state.events = [{ id: DRAFT, status: 'DRAFT', ai_metadata: { flyer_id: FLYER } }]
    state.flyers = [
      { id: FLYER, ai_metadata: { event_id: DRAFT } },
      { id: OTRO_FLYER, ai_metadata: { event_id: DRAFT } },
    ]
    await deleteDraftEvent(DRAFT, OTRO_FLYER)
    expect(state.flyerUpdates.map((u) => u.id)).toEqual([FLYER])
  })

  it('sobre un PUBLISHED: error, sin borrar', async () => {
    state.events = [{ id: DRAFT, status: 'PUBLISHED', ai_metadata: null }]
    const res = await deleteDraftEvent(DRAFT)
    expect(res).toEqual({ error: 'Solo se pueden rechazar borradores.' })
    expect(state.eventDeletes).toEqual([])
  })

  it('inexistente: error', async () => {
    expect(await deleteDraftEvent(DRAFT)).toEqual({ error: 'No se encontró el borrador a rechazar.' })
  })

  it('sin rol admin: no llega a leer nada', async () => {
    state.role = 'USER'
    state.events = [{ id: DRAFT, status: 'DRAFT', ai_metadata: null }]
    expect(await deleteDraftEvent(DRAFT)).toEqual({ error: 'No tienes permisos de administrador' })
    expect(state.eventDeletes).toEqual([])
  })
})
