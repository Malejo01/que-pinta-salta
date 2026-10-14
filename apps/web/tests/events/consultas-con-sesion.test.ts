// Columnas explícitas en las consultas de eventos con sesión (QPS-106, 107 y 108):
// /nuevo-evento?editId=|cloneId=, /mis-eventos, /admin/revision y getPendingEvents.
// Ninguna pide `*` de `events`; merge_audit, dedup_key y created_by no viajan al
// navegador, y ai_metadata solo a las pantallas de revisión del admin. Sin red ni base.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  selects: [] as Array<{ table: string; columns: string }>,
  role: 'ADMIN' as string | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect: ' + url)
  },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'usuario-de-prueba' } } }) },
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      b.select = (columns: string) => {
        state.selects.push({ table, columns })
        return b
      }
      b.eq = () => b
      b.order = () => b
      b.single = async () =>
        table === 'profiles'
          ? { data: { role: state.role }, error: null }
          : { data: { id: 'evento-de-prueba', title: 'Evento' }, error: null }
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res, rej)
      return b
    },
  }),
}))
vi.mock('@/lib/data', () => ({ getCategories: async () => [], getVenues: async () => [] }))
vi.mock('@/components/event-form', () => ({ EventForm: () => null }))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))
vi.mock('@/app/mis-eventos/mis-eventos-client', () => ({ default: () => null }))

import NuevoEventoPage from '@/app/nuevo-evento/page'
import MisEventosPage from '@/app/mis-eventos/page'
import { getPendingEvents } from '@/lib/admin-actions'
import {
  ADMIN_REVIEW_EVENT_ROW_SELECT,
  PUBLIC_EVENT_COLUMNS,
  PUBLIC_EVENT_ROW_SELECT,
} from '@/lib/events/public-select'

const INTERNAS = ['merge_audit', 'dedup_key', 'created_by'] as const

/** Columnas de `events` de un select, sin los joins (`alias:tabla(...)`). */
function columnasDeEvents(select: string): string[] {
  return select
    .replace(/\w+:[\w!]+\([^)]*\)/g, '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

function selectsDeEvents(): string[] {
  return state.selects.filter((s) => s.table === 'events').map((s) => s.columns)
}

beforeEach(() => {
  state.selects.length = 0
  state.role = 'ADMIN'
})

describe('constantes de columnas', () => {
  it('PUBLIC_EVENT_ROW_SELECT son exactamente las columnas públicas, sin joins ni *', () => {
    expect(columnasDeEvents(PUBLIC_EVENT_ROW_SELECT)).toEqual([...PUBLIC_EVENT_COLUMNS])
    expect(PUBLIC_EVENT_ROW_SELECT).not.toContain('*')
    expect(PUBLIC_EVENT_ROW_SELECT).not.toContain('ai_metadata')
  })

  it('ADMIN_REVIEW_EVENT_ROW_SELECT suma solo ai_metadata a las públicas', () => {
    const cols = columnasDeEvents(ADMIN_REVIEW_EVENT_ROW_SELECT)
    expect(cols).toEqual([...PUBLIC_EVENT_COLUMNS, 'ai_metadata'])
    for (const c of INTERNAS) expect(cols).not.toContain(c)
    expect(ADMIN_REVIEW_EVENT_ROW_SELECT).not.toContain('*')
  })
})

describe('QPS-106: /nuevo-evento con editId o cloneId', () => {
  it.each([['editId'], ['cloneId']])('con %s pide PUBLIC_EVENT_ROW_SELECT', async (param) => {
    await NuevoEventoPage({ searchParams: Promise.resolve({ [param]: 'evento-de-prueba' }) })
    expect(selectsDeEvents()).toEqual([PUBLIC_EVENT_ROW_SELECT])
  })

  it('sin id no consulta events', async () => {
    await NuevoEventoPage({ searchParams: Promise.resolve({}) })
    expect(selectsDeEvents()).toEqual([])
  })
})

describe('QPS-107: /mis-eventos', () => {
  it('pide las columnas públicas más los nombres de categoría y lugar', async () => {
    await MisEventosPage()
    const [select] = selectsDeEvents()
    expect(selectsDeEvents()).toHaveLength(1)
    expect(columnasDeEvents(select)).toEqual([...PUBLIC_EVENT_COLUMNS])
    expect(select).toContain('category:categories(name)')
    expect(select).toContain('venue:venues(name)')
    expect(select).not.toMatch(/(^|,)\s*\*/)
  })
})

describe('QPS-108: pantallas de revisión del admin', () => {
  it('getPendingEvents pide las columnas de revisión y el join con profiles, sin created_by', async () => {
    await getPendingEvents()
    const [select] = selectsDeEvents()
    expect(selectsDeEvents()).toHaveLength(1)
    expect(columnasDeEvents(select)).toEqual([...PUBLIC_EVENT_COLUMNS, 'ai_metadata'])
    expect(select).toContain('profile:profiles!events_created_by_fkey(full_name, email)')
  })

  it('getPendingEvents sin rol de admin no consulta events', async () => {
    state.role = 'USER'
    expect(await getPendingEvents()).toEqual([])
    expect(selectsDeEvents()).toEqual([])
  })

  it('/admin/revision usa ADMIN_REVIEW_EVENT_ROW_SELECT y no pide * de events', () => {
    const src = readFileSync(new URL('../../app/admin/revision/page.tsx', import.meta.url), 'utf8')
    const consulta = src.slice(src.indexOf(".from('events')"), src.indexOf(".eq('status', 'DRAFT')"))
    expect(consulta).toContain('ADMIN_REVIEW_EVENT_ROW_SELECT')
    expect(consulta).not.toMatch(/select\(\s*[`'"]\s*\*/)
  })
})
