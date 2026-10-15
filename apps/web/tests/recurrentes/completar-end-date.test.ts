import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// QPS-136: el generador completa el end_date de las filas que ya existen sin él (las que se
// generaron antes de que la config tuviera `cierre`) y nunca pisa uno cargado. Config de
// prueba inyectada por vi.mock, como en cierre.test.ts.

const { MUSEO, PENA_CRUZA, PENA_SIN_CIERRE } = vi.hoisted(() => ({
  MUSEO: {
    tipo: 'museo' as const,
    venue: 'Museo de Prueba',
    venueIdPrefijo: 'cccccccc',
    titulo: 'Museo de Prueba',
    dias: [0, 1, 2, 3, 4, 5, 6] as const,
    hora: '10:00',
    cierre: '20:00',
  },
  PENA_CRUZA: {
    tipo: 'pena' as const,
    venue: 'Peña que Cruza',
    titulo: 'Peña que Cruza',
    descripcion: 'Descripción de prueba',
    resumen: 'Resumen de prueba',
    dias: [0, 1, 2, 3, 4, 5, 6] as const,
    hora: '22:00',
    cierre: '02:00', // del día siguiente
    ticketUrl: null as string | null,
  },
  PENA_SIN_CIERRE: {
    tipo: 'pena' as const,
    venue: 'Peña sin Cierre',
    titulo: 'Peña sin Cierre',
    descripcion: 'Descripción de prueba',
    resumen: 'Resumen de prueba',
    dias: [0, 1, 2, 3, 4, 5, 6] as const,
    hora: '21:00',
    ticketUrl: null as string | null,
  },
}))

vi.mock('@/lib/recurrentes/config', () => ({
  CATEGORIA_PENAS: 'cat-penas-de-prueba',
  CATEGORIA_MUSEOS: 'cat-museos-de-prueba',
  HORIZONTE_PENAS_DIAS: 3,
  HORIZONTE_MUSEOS_DIAS: 3,
  PENAS: [PENA_CRUZA, PENA_SIN_CIERRE],
  MUSEOS: [MUSEO],
}))

const resolveVenueId = vi.fn()
const upsert = vi.fn()
vi.mock('@/lib/venues/resolve', () => ({
  resolveVenueId: (...args: unknown[]) => resolveVenueId(...args),
}))
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...args: unknown[]) => upsert(...args),
}))
vi.mock('@/lib/images/external', () => ({
  copyExternalImage: vi.fn(),
  isOwnStorageUrl: () => true,
}))

import { generarRecurrentes } from '@/lib/recurrentes/generar'

// --- Cliente de Supabase falso en memoria, con UPDATE ----------------------
type Row = Record<string, unknown>
type Resultado = { data: Row[] | Row | null; error: null }

let store: Row[]
/** Ids que recibieron un UPDATE (aunque no haya tocado ninguna fila). */
let updates: string[]
/** Se llama justo antes de aplicar cada UPDATE: para simular otro proceso escribiendo entre medio. */
let antesDelUpdate: (id: string) => void

class FakeQuery implements PromiseLike<Resultado> {
  private filters: Array<(r: Row) => boolean> = []
  private orderKey: string | null = null
  private desc = false
  private max = Infinity
  private single = false
  private patch: Row | null = null
  private idFiltro: string | null = null
  select() { return this }
  update(patch: Row) { this.patch = patch; return this }
  eq(k: string, v: unknown) {
    if (k === 'id') this.idFiltro = v as string
    this.filters.push((r) => r[k] === v)
    return this
  }
  is(k: string, v: null) { this.filters.push((r) => (r[k] ?? null) === v); return this }
  not(k: string, op: string, v: unknown) {
    if (op === 'is' && v === null) this.filters.push((r) => r[k] !== null && r[k] !== undefined)
    return this
  }
  gte(k: string, v: string) { this.filters.push((r) => (r[k] as string) >= v); return this }
  order(k: string, o?: { ascending?: boolean }) { this.orderKey = k; this.desc = o?.ascending === false; return this }
  limit(n: number) { this.max = n; return this }
  maybeSingle() { this.single = true; return this }
  private run(): Resultado {
    if (this.patch) {
      updates.push(this.idFiltro ?? '(sin id)')
      antesDelUpdate(this.idFiltro ?? '')
      const tocadas = store.filter((r) => this.filters.every((f) => f(r)))
      for (const r of tocadas) Object.assign(r, this.patch)
      return { data: tocadas.map((r) => ({ id: r.id })), error: null }
    }
    let out = store.filter((r) => this.filters.every((f) => f(r)))
    if (this.orderKey) {
      const k = this.orderKey
      out = [...out].sort((a, b) => ((a[k] as string) < (b[k] as string) ? -1 : (a[k] as string) > (b[k] as string) ? 1 : 0))
      if (this.desc) out.reverse()
    }
    out = out.slice(0, this.max)
    return { data: this.single ? (out[0] ?? null) : out, error: null }
  }
  then<R1 = Resultado, R2 = never>(
    ok?: ((v: Resultado) => R1 | PromiseLike<R1>) | null,
    ko?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return Promise.resolve(this.run()).then(ok, ko)
  }
}

const fakeSupabase = {
  from(table: string) {
    if (table !== 'events') throw new Error(`tabla inesperada: ${table}`)
    return new FakeQuery()
  },
  storage: { from: () => ({}) },
} as unknown as SupabaseClient

// --- Fixtures ---------------------------------------------------------------
// Lunes 09/11 09:00 en Salta (12:00Z): todas las filas de abajo son futuras.
const AHORA = new Date('2026-11-09T12:00:00Z')

const VENUES: Record<string, string> = {
  [MUSEO.venue]: 'cccccccc-0000-4000-8000-000000000001',
  [PENA_CRUZA.venue]: 'dddddddd-0000-4000-8000-000000000001',
  [PENA_SIN_CIERRE.venue]: 'eeeeeeee-0000-4000-8000-000000000001',
}

function fila(id: string, r: { venue: string; titulo: string }, startUtc: string, extra: Row = {}): Row {
  return { id, venue_id: VENUES[r.venue], title: r.titulo, status: 'PUBLISHED', start_date: startUtc, end_date: null, ...extra }
}

const porId = (id: string) => store.find((r) => r.id === id)!

beforeEach(() => {
  updates = []
  antesDelUpdate = () => {}
  resolveVenueId.mockReset()
  resolveVenueId.mockImplementation(async (_s: unknown, name: string) => VENUES[name] ?? null)
  upsert.mockReset()
  upsert.mockImplementation(async (f: Row) => {
    store.push({ ...f, id: `nueva-${store.length}` })
    return { success: true, action: 'insert', eventId: 'x' }
  })
  store = [
    // Plantilla del museo (pasada): de acá salen descripción, precio, etc.
    fila('m-plantilla', MUSEO, '2026-10-01T13:00:00.000Z', { end_date: '2026-10-01T23:00:00.000Z' }),
    // Museo, martes 10/11 10:00 Salta, sin end_date: se completa a las 20:00 Salta (23:00Z).
    fila('m-sin-fin', MUSEO, '2026-11-10T13:00:00.000Z'),
    // Museo, miércoles 11/11, con un end_date cargado distinto del de la config: no se toca.
    fila('m-con-fin', MUSEO, '2026-11-11T13:00:00.000Z', { end_date: '2026-11-11T21:30:00.000Z' }),
    // Museo, jueves 12/11, sin end_date pero DRAFT: no se toca.
    fila('m-draft', MUSEO, '2026-11-12T13:00:00.000Z', { status: 'DRAFT' }),
    // Museo, viernes 13/11, sin end_date pero movido a mano a las 12:00 Salta: no se adivina.
    fila('m-movido', MUSEO, '2026-11-13T15:00:00.000Z'),
    // Peña que cruza la medianoche, martes 10/11 22:00 Salta (11/11 01:00Z): cierra 11/11 02:00 Salta.
    fila('p-cruza', PENA_CRUZA, '2026-11-11T01:00:00.000Z'),
    // Peña sin cierre en la config: queda sin end_date.
    fila('p-sin-cierre', PENA_SIN_CIERRE, '2026-11-11T00:00:00.000Z'),
  ]
})

describe('generarRecurrentes: completa end_date vacíos (QPS-136)', () => {
  it('completa la fila del museo con el cierre de la config, en hora de Salta', async () => {
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(res.conError).toBe(0)
    expect(porId('m-sin-fin').end_date).toBe('2026-11-10T23:00:00.000Z')
    expect(res.items.find((i) => i.titulo === MUSEO.titulo)!.completadas).toBe(1)
  })

  it('nunca pisa un end_date cargado', async () => {
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(porId('m-con-fin').end_date).toBe('2026-11-11T21:30:00.000Z')
    expect(updates).not.toContain('m-con-fin')
  })

  it('el día que cruza la medianoche: el cierre es del día siguiente', async () => {
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    // Abre martes 10/11 22:00 Salta, cierra miércoles 11/11 02:00 Salta = 05:00Z.
    expect(porId('p-cruza').end_date).toBe('2026-11-11T05:00:00.000Z')
    expect(res.items.find((i) => i.titulo === PENA_CRUZA.titulo)!.completadas).toBe(1)
  })

  it('no toca DRAFT, filas movidas de hora ni ítems sin cierre en la config', async () => {
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(porId('m-draft').end_date).toBeNull()
    expect(porId('m-movido').end_date).toBeNull()
    expect(porId('p-sin-cierre').end_date).toBeNull()
    expect(res.items.find((i) => i.titulo === PENA_SIN_CIERRE.titulo)!.completadas).toBe(0)
    // Solo dos UPDATE en toda la corrida: los dos casos que se completan.
    expect(updates.sort()).toEqual(['m-sin-fin', 'p-cruza'])
    expect(res.completadas).toBe(2)
  })

  it('si otro proceso cargó el end_date entre la lectura y el UPDATE, no lo pisa', async () => {
    antesDelUpdate = (id) => {
      if (id === 'm-sin-fin') porId('m-sin-fin').end_date = '2026-11-10T22:00:00.000Z'
    }
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(porId('m-sin-fin').end_date).toBe('2026-11-10T22:00:00.000Z')
    expect(res.items.find((i) => i.titulo === MUSEO.titulo)!.completadas).toBe(0)
  })

  it('una segunda corrida no vuelve a escribir nada', async () => {
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    updates = []
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(updates).toEqual([])
    expect(res.completadas).toBe(0)
  })
})
