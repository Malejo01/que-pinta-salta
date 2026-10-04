import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// --- Mocks de los módulos con red/base -------------------------------------
const resolveVenueId = vi.fn()
const upsert = vi.fn()

vi.mock('@/lib/venues/resolve', () => ({
  resolveVenueId: (...args: unknown[]) => resolveVenueId(...args),
}))
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...args: unknown[]) => upsert(...args),
}))

import { generarRecurrentes } from '@/lib/recurrentes/generar'
import { MUSEOS, PENAS } from '@/lib/recurrentes/config'

// --- Cliente de Supabase falso en memoria ----------------------------------
type Row = Record<string, unknown>
type Resultado = { data: Row[] | Row | null; error: null }

class FakeQuery implements PromiseLike<Resultado> {
  private filters: Array<(r: Row) => boolean> = []
  private orderKey: string | null = null
  private desc = false
  private max = Infinity
  private single = false
  constructor(private rows: Row[]) {}
  select() { return this }
  eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
  not(k: string, op: string, v: unknown) {
    if (op === 'is' && v === null) this.filters.push((r) => r[k] !== null && r[k] !== undefined)
    return this
  }
  gte(k: string, v: string) { this.filters.push((r) => (r[k] as string) >= v); return this }
  order(k: string, o?: { ascending?: boolean }) { this.orderKey = k; this.desc = o?.ascending === false; return this }
  limit(n: number) { this.max = n; return this }
  maybeSingle() { this.single = true; return this }
  private run(): Resultado {
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.orderKey) {
      const k = this.orderKey
      out = [...out].sort((a, b) => ((a[k] as string) < (b[k] as string) ? -1 : (a[k] as string) > (b[k] as string) ? 1 : 0))
      if (this.desc) out.reverse()
    }
    out = out.slice(0, this.max)
    return { data: this.single ? (out[0] ?? null) : out, error: null as null }
  }
  then<R1 = Resultado, R2 = never>(
    ok?: ((v: Resultado) => R1 | PromiseLike<R1>) | null,
    ko?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return Promise.resolve(this.run()).then(ok, ko)
  }
}

let store: Row[]
const fakeSupabase = {
  from(table: string) {
    if (table !== 'events') throw new Error(`tabla inesperada: ${table}`)
    return new FakeQuery(store)
  },
} as unknown as SupabaseClient

// --- Fixtures ---------------------------------------------------------------
const AHORA = new Date('2026-11-09T12:00:00Z') // lunes 09:00 en Salta

const VENUE_IDS: Record<string, string> = {
  Balderrama: 'aaaaaaaa-0000-0000-0000-000000000001',
  'La Vieja Estación': 'aaaaaaaa-0000-0000-0000-000000000002',
}
for (const m of MUSEOS) VENUE_IDS[m.venue] = `${m.venueIdPrefijo}-0000-0000-0000-000000000000`

function plantillaMuseo(m: (typeof MUSEOS)[number]): Row {
  return {
    venue_id: VENUE_IDS[m.venue],
    title: m.titulo,
    status: 'PUBLISHED',
    start_date: '2026-10-01T13:00:00.000Z', // pasada: no cuenta como "ya cargada"
    description: 'Descripción de Prueba',
    short_description: 'Resumen de Prueba',
    image_url: 'https://imagenes.test/museo.jpg',
    price_min: 500,
    price_max: null,
    is_free: false,
    ticket_url: 'https://tickets.test/museo',
    ticket_sources: [{ url: 'https://tickets.test/museo', source: 'manual', price_min: 500 }],
    tags: [],
    gallery_urls: [],
    classification_source: null,
    is_commercial: true,
  }
}

beforeEach(() => {
  resolveVenueId.mockReset()
  upsert.mockReset()
  resolveVenueId.mockImplementation(async (_s: unknown, name: string) => VENUE_IDS[name] ?? null)
  // Dedup falsa: inserta en el store; si ya hay fila con mismo venue+título+start_date, 'update'.
  upsert.mockImplementation(async (fila: Row) => {
    const existente = store.find(
      (r) => r.venue_id === fila.venue_id && r.title === fila.title && r.start_date === fila.start_date,
    )
    if (existente) return { success: true, action: 'update', eventId: 'x' }
    store.push({ ...fila })
    return { success: true, action: 'insert', eventId: 'x' }
  })
  store = MUSEOS.map(plantillaMuseo)
})

const porTitulo = (res: Awaited<ReturnType<typeof generarRecurrentes>>, titulo: string) =>
  res.items.find((i) => i.titulo === titulo)!

describe('generarRecurrentes', () => {
  it('primera corrida: inserta peñas (14 días) y museos (7 días, sin lunes)', async () => {
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(res.conError).toBe(0)
    expect(res.items).toHaveLength(PENAS.length + MUSEOS.length)
    expect(porTitulo(res, PENAS[0].titulo).insertadas).toBe(10) // Balderrama mié-dom
    expect(porTitulo(res, PENAS[1].titulo).insertadas).toBe(14) // todos los días
    for (const m of MUSEOS) expect(porTitulo(res, m.titulo).insertadas).toBe(6)
    expect(res.insertadas).toBe(10 + 14 + 6 * MUSEOS.length)
    expect(upsert).toHaveBeenCalledTimes(res.insertadas)
  })

  it('las filas de museo replican la plantilla y las de peña usan los datos de config', async () => {
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const museo = store.find((r) => r.title === MUSEOS[0].titulo && r.start_date === '2026-11-10T14:00:00.000Z')
    expect(museo).toBeDefined()
    expect(museo!.description).toBe('Descripción de Prueba')
    expect(museo!.price_min).toBe(500)
    expect(museo!.status).toBe('PUBLISHED')
    expect(museo!.slug).toMatch(/-2026-11-10$/)

    const pena = store.find((r) => r.title === PENAS[0].titulo)!
    expect(pena.is_free).toBe(false)
    expect(pena.price_min).toBe(0)
    expect(pena.age_restriction).toBe(0)
    expect(pena.venue_id).toBe(VENUE_IDS.Balderrama)
  })

  it('no genera ningún lunes de museo', async () => {
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const lunesMuseo = store
      .filter((r) => MUSEOS.some((m) => m.titulo === r.title) && (r.start_date as string) > AHORA.toISOString())
      .filter((r) => new Date(new Date(r.start_date as string).getTime() - 3 * 3600_000).getUTCDay() === 1)
    expect(lunesMuseo).toEqual([])
  })

  it('idempotente: la segunda corrida inserta 0 y cuenta todo como yaExistian', async () => {
    const primera = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const filasDespues = store.length
    upsert.mockClear()

    const segunda = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(segunda.insertadas).toBe(0)
    expect(segunda.conError).toBe(0)
    expect(upsert).not.toHaveBeenCalled()
    expect(store).toHaveLength(filasDespues)
    for (const item of segunda.items) {
      const antes = primera.items.find((i) => i.titulo === item.titulo)!
      expect(item.yaExistian).toBe(antes.insertadas)
    }
  })

  it('si ya hay un día cargado, solo se agregan los que faltan', async () => {
    store.push({
      venue_id: VENUE_IDS.Balderrama,
      title: PENAS[0].titulo,
      start_date: '2026-11-12T00:00:00.000Z', // miércoles 11 21:00 Salta
    })
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const item = porTitulo(res, PENAS[0].titulo)
    expect(item.insertadas).toBe(9)
    expect(item.yaExistian).toBe(1)
  })

  it('venue que no resuelve: ítem salteado con error y los demás siguen', async () => {
    resolveVenueId.mockImplementation(async (_s: unknown, name: string) =>
      name === 'Balderrama' ? null : (VENUE_IDS[name] ?? null),
    )
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const item = porTitulo(res, PENAS[0].titulo)
    expect(item.insertadas).toBe(0)
    expect(item.error).toMatch(/no resuelve/)
    expect(res.conError).toBe(1)
    expect(porTitulo(res, PENAS[1].titulo).insertadas).toBe(14)
    expect(store.some((r) => r.title === PENAS[0].titulo)).toBe(false)
  })

  it('resolveVenueId se llama sin autocrear venues', async () => {
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    for (const call of resolveVenueId.mock.calls) {
      expect(call[2]).toMatchObject({ autocreate: false })
    }
  })

  it('museo cuyo venue resuelve a un id con otro prefijo: salteado con error', async () => {
    const museo = MUSEOS[1]
    resolveVenueId.mockImplementation(async (_s: unknown, name: string) =>
      name === museo.venue ? 'ffffffff-0000-0000-0000-000000000000' : (VENUE_IDS[name] ?? null),
    )
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const item = porTitulo(res, museo.titulo)
    expect(item.insertadas).toBe(0)
    expect(item.error).toMatch(/se esperaba/)
    expect(res.conError).toBe(1)
  })

  it('museo sin fila previa: no hay plantilla, se saltea con error', async () => {
    store = store.filter((r) => r.title !== MUSEOS[2].titulo)
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const item = porTitulo(res, MUSEOS[2].titulo)
    expect(item.insertadas).toBe(0)
    expect(item.error).toMatch(/Sin fila previa/)
  })

  it('una plantilla de museo que no está PUBLISHED no sirve de modelo', async () => {
    for (const r of store) if (r.title === MUSEOS[3].titulo) r.status = 'DRAFT'
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const item = porTitulo(res, MUSEOS[3].titulo)
    expect(item.insertadas).toBe(0)
    expect(item.error).toMatch(/Sin fila previa/)
  })

  it('si la dedup responde "update", cuenta como yaExistian y no como insertada', async () => {
    upsert.mockImplementation(async () => ({ success: true, action: 'update', eventId: 'x' }))
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(res.insertadas).toBe(0)
    expect(res.conError).toBe(0)
    expect(porTitulo(res, PENAS[1].titulo).yaExistian).toBe(14)
    expect(porTitulo(res, MUSEOS[0].titulo).yaExistian).toBe(6)
  })

  it('un error al escribir un día se reporta con el día y el resto se sigue procesando', async () => {
    let n = 0
    upsert.mockImplementation(async (fila: Row) => {
      n++
      if (fila.title === PENAS[1].titulo && n % 2 === 0) throw new Error('falla de prueba')
      store.push({ ...fila })
      return { success: true, action: 'insert', eventId: 'x' }
    })
    const res = await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    const item = porTitulo(res, PENAS[1].titulo)
    expect(item.error).toMatch(/^2026-\d\d-\d\d: falla de prueba/)
    expect(item.insertadas).toBeGreaterThan(0)
    expect(item.insertadas).toBeLessThan(14)
    expect(res.conError).toBe(1)
  })

  it('cerca de medianoche UTC: lunes 01:30Z (domingo 22:30 Salta) no genera lunes para museos y salta la peña de las 22:00 de hoy', async () => {
    const ahora = new Date('2026-11-09T01:30:00Z')
    const res = await generarRecurrentes(fakeSupabase, { ahora })
    // La Vieja Estación (22:00, todos los días): hoy en Salta es domingo 8 y las 22:00 ya pasaron.
    const filas = store.filter((r) => r.title === PENAS[1].titulo)
    const dias = filas.map((r) => new Date(new Date(r.start_date as string).getTime() - 3 * 3600_000).toISOString().slice(0, 10))
    expect(dias).not.toContain('2026-11-08')
    expect(dias).toContain('2026-11-09')
    expect(res.conError).toBe(0)
  })
})
