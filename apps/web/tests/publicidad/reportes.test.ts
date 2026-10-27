import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generarReportes, productoDeDestacado } from '@/lib/publicidad/reportes'

// --- Doble del cliente de Supabase: respeta los filtros (eq, is, not, gt(e), lt(e), in, range). ---
type Fila = Record<string, unknown>
function crearFake(datos: Record<string, Fila[]>, falla: (tabla: string, op: string) => boolean = () => false) {
  const llamadas: Array<{ tabla: string; op: string; payload?: unknown }> = []
  const cmp = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
  function from(tabla: string) {
    const filtros: Array<(f: Fila) => boolean> = []
    let op: string | null = null
    let payload: unknown
    let opciones: { onConflict?: string; ignoreDuplicates?: boolean } = {}
    let head = false
    let rango: [number, number] | null = null
    let orden: { col: string; asc: boolean } | null = null
    let tope: number | null = null
    const b: Record<string, unknown> = {
      select(_c?: string, o?: { head?: boolean }) {
        if (op === null) op = 'select'
        head = o?.head === true
        return b
      },
      insert(p: unknown) { op = 'insert'; payload = p; return b },
      upsert(p: unknown, o?: typeof opciones) { op = 'upsert'; payload = p; opciones = o ?? {}; return b },
      update(p: unknown) { op = 'update'; payload = p; return b },
      delete() { op = 'delete'; return b },
      eq(c: string, v: unknown) { filtros.push((f) => f[c] === v); return b },
      is(c: string, v: unknown) { filtros.push((f) => (f[c] ?? null) === v); return b },
      not(c: string, _o: string, v: unknown) { filtros.push((f) => (f[c] ?? null) !== v); return b },
      gt(c: string, v: unknown) { filtros.push((f) => f[c] != null && cmp(f[c], v) > 0); return b },
      gte(c: string, v: unknown) { filtros.push((f) => f[c] != null && cmp(f[c], v) >= 0); return b },
      lt(c: string, v: unknown) { filtros.push((f) => f[c] != null && cmp(f[c], v) < 0); return b },
      lte(c: string, v: unknown) { filtros.push((f) => f[c] != null && cmp(f[c], v) <= 0); return b },
      in(c: string, v: unknown[]) { filtros.push((f) => v.includes(f[c])); return b },
      order(col: string, o?: { ascending?: boolean }) { orden = { col, asc: o?.ascending !== false }; return b },
      range(d: number, h: number) { rango = [d, h]; return b },
      limit(n: number) { tope = n; return b },
      then(resolve: (r: unknown) => unknown) {
        llamadas.push({ tabla, op: op ?? 'select', payload })
        if (falla(tabla, op ?? 'select')) return resolve({ data: null, count: null, error: { message: 'falla inventada' } })
        const tablaDatos = (datos[tabla] ??= [])
        const coincide = (f: Fila) => filtros.every((p) => p(f))
        if (op === 'insert') {
          const nuevas = (Array.isArray(payload) ? payload : [payload]) as Fila[]
          tablaDatos.push(...nuevas.map((n) => ({ ...n })))
          return resolve({ data: nuevas, count: null, error: null })
        }
        if (op === 'upsert') {
          const claves = (opciones.onConflict ?? 'id').split(',')
          const devueltas: Fila[] = []
          for (const n of (Array.isArray(payload) ? payload : [payload]) as Fila[]) {
            const i = tablaDatos.findIndex((f) => claves.every((k) => f[k] === n[k]))
            if (i === -1) { tablaDatos.push({ id: `id-${tablaDatos.length}`, ...n }); devueltas.push(n) }
            else if (!opciones.ignoreDuplicates) { tablaDatos[i] = { ...tablaDatos[i], ...n }; devueltas.push(n) }
          }
          return resolve({ data: devueltas, count: null, error: null })
        }
        if (op === 'update') {
          for (const f of tablaDatos.filter(coincide)) Object.assign(f, payload)
          return resolve({ data: null, count: null, error: null })
        }
        if (op === 'delete') {
          datos[tabla] = tablaDatos.filter((f) => !coincide(f))
          return resolve({ data: null, count: null, error: null })
        }
        let filas = tablaDatos.filter(coincide)
        const total = filas.length
        if (orden) { const o = orden as { col: string; asc: boolean }; filas = [...filas].sort((x, y) => (o.asc ? 1 : -1) * cmp(x[o.col], y[o.col])) }
        if (rango) filas = filas.slice((rango as [number, number])[0], (rango as [number, number])[1] + 1)
        if (tope !== null) filas = filas.slice(0, tope)
        return resolve({ data: head ? null : filas, count: total, error: null })
      },
    }
    return b
  }
  return { cliente: { from } as unknown as SupabaseClient, datos, llamadas }
}

const AHORA = new Date('2026-10-23T15:00:00Z')
const dia = (d: string, extra: Fila = {}): Fila => ({ day: d, origin: 'web', featured: true, views: 10, clicks: 2, ...extra })

function base(extra: Record<string, Fila[]> = {}) {
  return crearFake({
    ad_price_cycles: [],
    ad_prices: [],
    events: [
      // Terminó ayer, destacado 3 días.
      { id: 'ev1', featured_set_at: '2026-10-19T12:00:00.000Z', featured_until: '2026-10-22T12:00:00.000Z' },
      // Terminó hace 10 días: fuera de la ventana de 7.
      { id: 'viejo', featured_set_at: '2026-10-01T12:00:00.000Z', featured_until: '2026-10-13T12:00:00.000Z' },
      // Sin featured_set_at: se saltea.
      { id: 'sin-set', featured_set_at: null, featured_until: '2026-10-22T12:00:00.000Z' },
      // Sigue vigente: no terminó.
      { id: 'vigente', featured_set_at: '2026-10-20T12:00:00.000Z', featured_until: '2026-10-28T12:00:00.000Z' },
    ],
    sponsored_campaigns: [],
    event_metrics_daily: [
      ...['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'].map((d) => ({ event_id: 'ev1', ...dia(d) })),
      { event_id: 'ev1', ...dia('2026-10-20', { featured: false, views: 100, clicks: 50 }) },
      { event_id: 'ev1', ...dia('2026-10-18') },
      { event_id: 'ev1', ...dia('2026-10-23') },
    ],
    ad_campaign_reports: [],
    ...extra,
  })
}

describe('productoDeDestacado', () => {
  it('por duración: hasta 3 días, hasta 7 y más', () => {
    expect(productoDeDestacado(1)).toBe('destacado-3')
    expect(productoDeDestacado(3)).toBe('destacado-3')
    expect(productoDeDestacado(4)).toBe('destacado-7')
    expect(productoDeDestacado(7)).toBe('destacado-7')
    expect(productoDeDestacado(8)).toBe('destacado-14')
  })
})

describe('generarReportes: destacados', () => {
  it('un destacado que terminó ayer genera un reporte con las métricas de las filas featured', async () => {
    const f = base()
    expect(await generarReportes(f.cliente, AHORA)).toEqual({ creados: 1 })
    expect(f.datos.ad_campaign_reports).toHaveLength(1)
    const r = f.datos.ad_campaign_reports[0]
    expect(r).toMatchObject({
      event_id: 'ev1',
      tipo: 'destacado',
      sponsored_campaign_id: null,
      desde: '2026-10-19T12:00:00.000Z',
      hasta: '2026-10-22T12:00:00.000Z',
    })
    // 4 días de Salta (19 a 22), 10 vistas y 2 clics por día; la fila featured = false no cuenta.
    expect(r.metricas).toEqual({ dias: 4, vistas: 40, clics: 8, alcanceEstimado: 47 })
    expect(r).not.toHaveProperty('token')
  })

  it('dos corridas dejan un solo reporte (upsert con ignoreDuplicates por event_id, tipo, desde)', async () => {
    const f = base()
    await generarReportes(f.cliente, AHORA)
    expect(await generarReportes(f.cliente, AHORA)).toEqual({ creados: 0 })
    expect(f.datos.ad_campaign_reports).toHaveLength(1)
  })

  it('el precio sale del producto por duración: de la base si hay aprobado vigente, si no del tarifario', async () => {
    const sinBase = base()
    await generarReportes(sinBase.cliente, AHORA)
    expect(sinBase.datos.ad_campaign_reports[0].precio_ars).toBe(8500) // destacado-3 del tarifario de respaldo

    const conBase = base({
      ad_prices: [
        { producto: 'destacado-3', precio_ars: 9000, vigente_desde: '2026-10-01', estado: 'aprobado' },
        // Un precio que entra después del inicio de la campaña no cuenta.
        { producto: 'destacado-3', precio_ars: 12000, vigente_desde: '2026-10-21', estado: 'aprobado' },
        // Otro producto no cuenta.
        { producto: 'destacado-7', precio_ars: 77000, vigente_desde: '2026-10-01', estado: 'aprobado' },
        // Uno propuesto no cuenta.
        { producto: 'destacado-3', precio_ars: 99500, vigente_desde: '2026-10-10', estado: 'propuesto' },
      ],
    })
    await generarReportes(conBase.cliente, AHORA)
    expect(conBase.datos.ad_campaign_reports[0].precio_ars).toBe(9000)
  })

  it('el alcance usa el tramo del ciclo vigente aprobado', async () => {
    const f = base({ ad_price_cycles: [{ ciclo: '2026-10-01', estado: 'aprobado', tramo_vigente: 1000 }] })
    await generarReportes(f.cliente, AHORA)
    expect((f.datos.ad_campaign_reports[0].metricas as Fila).alcanceEstimado).toBe(93)
  })
})

describe('generarReportes: push', () => {
  const campania = (extra: Fila): Fila => ({
    id: 'c1',
    event_id: 'ev2',
    starts_at: '2026-10-18T12:00:00.000Z',
    ends_at: '2026-10-20T12:00:00.000Z',
    sent_at: '2026-10-18T13:00:00.000Z',
    destinatarios: 200,
    bajas_48h: 3,
    ...extra,
  })

  it('una campaña enviada que terminó genera un reporte push con destinatarios y bajas', async () => {
    const f = base({
      sponsored_campaigns: [campania({})],
      event_metrics_daily: [
        { event_id: 'ev2', ...dia('2026-10-18', { featured: false, views: 5, clicks: 1 }) },
        { event_id: 'ev2', ...dia('2026-10-19', { featured: true, views: 5, clicks: 1 }) },
        { event_id: 'ev2', ...dia('2026-10-20', { featured: false, views: 5, clicks: 1 }) },
      ],
      events: [],
    })
    expect(await generarReportes(f.cliente, AHORA)).toEqual({ creados: 1 })
    const r = f.datos.ad_campaign_reports[0]
    expect(r).toMatchObject({ event_id: 'ev2', tipo: 'push', sponsored_campaign_id: 'c1', desde: '2026-10-18T12:00:00.000Z', hasta: '2026-10-20T12:00:00.000Z' })
    // El push cuenta todas las filas del evento en esos días.
    expect(r.metricas).toEqual({ dias: 3, vistas: 15, clics: 3, alcanceEstimado: 35, destinatarios: 200, bajas48h: 3 })
    // El push todavía no tiene precio en el tarifario de respaldo.
    expect(r.precio_ars).toBeNull()
  })

  it('una campaña sin event_id o sin sent_at se saltea, y una que no terminó también', async () => {
    const f = base({
      sponsored_campaigns: [
        campania({ id: 'a', event_id: null }),
        campania({ id: 'b', sent_at: null }),
        campania({ id: 'c', ends_at: '2026-10-25T12:00:00.000Z' }),
        campania({ id: 'd', ends_at: '2026-10-01T12:00:00.000Z', starts_at: '2026-09-29T12:00:00.000Z' }),
      ],
      events: [],
    })
    expect(await generarReportes(f.cliente, AHORA)).toEqual({ creados: 0 })
    expect(f.datos.ad_campaign_reports).toHaveLength(0)
    expect(f.llamadas.some((l) => l.op === 'upsert')).toBe(false)
  })

  it('los destinatarios y las bajas que no se midieron no van en las métricas', async () => {
    const f = base({ sponsored_campaigns: [campania({ destinatarios: null, bajas_48h: null })], events: [] })
    await generarReportes(f.cliente, AHORA)
    expect(Object.keys(f.datos.ad_campaign_reports[0].metricas as Fila).sort()).toEqual(['alcanceEstimado', 'clics', 'dias', 'vistas'])
  })
})

describe('generarReportes: errores', () => {
  it('si falla el guardado lanza un error sin el texto crudo', async () => {
    const f = crearFake(base().datos, (t, op) => t === 'ad_campaign_reports' && op === 'upsert')
    await expect(generarReportes(f.cliente, AHORA)).rejects.toThrow(/no se pudieron guardar/)
  })
})
