import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CUPOS_HERO,
  PUSH_CUPOS_POR_DIA,
  cargarOcupacion2Meses,
  ocupacionDelMes,
  registrarOcupacionDelDia,
  restarMeses,
} from '@/lib/publicidad/ocupacion'

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
const futuro = new Date(AHORA.getTime() + 86_400_000).toISOString()
const pasado = new Date(AHORA.getTime() - 86_400_000).toISOString()

function destacados(n: number): Fila[] {
  return Array.from({ length: n }, (_, i) => ({ id: `ev-${i}`, status: 'PUBLISHED', featured_until: futuro }))
}

describe('registrarOcupacionDelDia', () => {
  it('con 8 destacados vigentes, hero_ocupados queda en 6 (los cupos)', async () => {
    const f = crearFake({
      events: [
        ...destacados(8),
        { id: 'viejo', status: 'PUBLISHED', featured_until: pasado },
        { id: 'borrador', status: 'DRAFT', featured_until: futuro },
      ],
      sponsored_campaigns: [],
    })
    const fila = await registrarOcupacionDelDia(f.cliente, AHORA)
    expect(CUPOS_HERO).toBe(6)
    expect(PUSH_CUPOS_POR_DIA).toBe(1)
    expect(fila).toMatchObject({ day: '2026-10-23', hero_ocupados: 6, hero_cupos: 6, push_cupos_usados: 0, push_cupos: 1 })
    expect(f.datos.ad_occupancy_daily).toHaveLength(1)
  })

  it('cuenta solo los destacados vigentes (3 de 5)', async () => {
    const f = crearFake({ events: [...destacados(3), { id: 'v', status: 'PUBLISHED', featured_until: pasado }, { id: 'n', status: 'PUBLISHED', featured_until: null }], sponsored_campaigns: [] })
    expect((await registrarOcupacionDelDia(f.cliente, AHORA)).hero_ocupados).toBe(3)
  })

  it('dos corridas el mismo día dejan una sola fila (upsert por día)', async () => {
    const f = crearFake({ events: destacados(2), sponsored_campaigns: [] })
    await registrarOcupacionDelDia(f.cliente, AHORA)
    await registrarOcupacionDelDia(f.cliente, new Date(AHORA.getTime() + 3_600_000))
    expect(f.datos.ad_occupancy_daily).toHaveLength(1)
    expect(f.llamadas.filter((l) => l.op === 'upsert')).toHaveLength(2)
  })

  it('con una campaña vigente, push_cupos_usados es 1; una que ya terminó no cuenta', async () => {
    const vigente = crearFake({
      events: [],
      sponsored_campaigns: [{ id: 'c1', starts_at: pasado, ends_at: futuro }],
    })
    expect((await registrarOcupacionDelDia(vigente.cliente, AHORA)).push_cupos_usados).toBe(1)

    const terminada = crearFake({
      events: [],
      sponsored_campaigns: [{ id: 'c2', starts_at: new Date(AHORA.getTime() - 5 * 86_400_000).toISOString(), ends_at: pasado }],
    })
    expect((await registrarOcupacionDelDia(terminada.cliente, AHORA)).push_cupos_usados).toBe(0)
  })

  it('a las 23:30 de Salta (ya es otro día en UTC) el día es el de Salta', async () => {
    const f = crearFake({ events: [], sponsored_campaigns: [] })
    const fila = await registrarOcupacionDelDia(f.cliente, new Date('2026-10-23T02:30:00Z'))
    expect(fila.day).toBe('2026-10-22')
  })

  it('si falla la base, lanza un error sin el texto crudo', async () => {
    const f = crearFake({ events: [], sponsored_campaigns: [] }, (t) => t === 'ad_occupancy_daily')
    await expect(registrarOcupacionDelDia(f.cliente, AHORA)).rejects.toThrow(/no se pudo guardar/)
  })
})

describe('ocupacionDelMes', () => {
  it('sin filas es null', () => {
    expect(ocupacionDelMes([])).toBeNull()
  })
  it('es Σ ocupados / Σ cupos', () => {
    expect(ocupacionDelMes([{ ocupados: 6, cupos: 6 }, { ocupados: 0, cupos: 6 }, { ocupados: 3, cupos: 6 }])).toBeCloseTo(0.5)
  })
})

describe('restarMeses', () => {
  it('cruza el año', () => {
    expect(restarMeses('2026-01-01', 2)).toBe('2025-11-01')
    expect(restarMeses('2026-11-01', 1)).toBe('2026-10-01')
  })
})

describe('cargarOcupacion2Meses', () => {
  it('devuelve [m-2, m-1] del Hero y del push, con null en el mes sin filas', async () => {
    const f = crearFake({
      ad_occupancy_daily: [
        { day: '2026-09-10', hero_ocupados: 3, hero_cupos: 6, push_cupos_usados: 1, push_cupos: 1 },
        { day: '2026-09-11', hero_ocupados: 3, hero_cupos: 6, push_cupos_usados: 0, push_cupos: 1 },
        { day: '2026-08-31', hero_ocupados: 6, hero_cupos: 6, push_cupos_usados: 1, push_cupos: 1 },
        { day: '2026-11-01', hero_ocupados: 6, hero_cupos: 6, push_cupos_usados: 1, push_cupos: 1 },
      ],
    })
    const o = await cargarOcupacion2Meses(f.cliente, '2026-11-01')
    expect(o.hero[0]).toBeCloseTo(0.5)
    expect(o.hero[1]).toBeNull()
    expect(o.push[0]).toBeCloseTo(0.5)
    expect(o.push[1]).toBeNull()
  })
})
