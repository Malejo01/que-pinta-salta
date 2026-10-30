import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cicloDeLaFecha, proponerCicloDelMes } from '@/lib/publicidad/ciclo'

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

function fetchDolar(venta: number | null = 1530): typeof fetch {
  return vi.fn(async () => {
    if (venta === null) return new Response('caído', { status: 503 })
    return new Response(JSON.stringify({ venta, fechaActualizacion: '2026-10-23T14:00:00.000Z' }), { status: 200 })
  }) as unknown as typeof fetch
}

const escrituras = (f: ReturnType<typeof crearFake>) => f.llamadas.filter((l) => l.op !== 'select')

function cicloAprobado(extra: Fila = {}): Fila {
  return {
    ciclo: '2026-09-01',
    estado: 'aprobado',
    audiencia_web_28d: 300,
    audiencia: 300,
    tramo_vigente: 500,
    tramo_calculado: 500,
    cambio_tramo_desde: null,
    factor_hero: 1,
    factor_push: 1,
    tipo_cambio: 1400,
    ...extra,
  }
}

/** Los precios aprobados de un ciclo aprobado (con 74-b, un anterior sin precios no cuenta). */
function preciosAprobados(ciclo: string, tipoCambio: number): Fila[] {
  return [
    { ciclo, producto: 'destacado-7', precio_ars: 11500, precio_usd: 8.2, tipo_cambio: tipoCambio, estado: 'aprobado' },
    { ciclo, producto: 'destacado-3', precio_ars: 7000, precio_usd: 4.9, tipo_cambio: tipoCambio, estado: 'aprobado' },
  ]
}

describe('cicloDeLaFecha', () => {
  it('es el día 1 del mes de Salta', () => {
    expect(cicloDeLaFecha(new Date('2026-10-15T12:00:00Z'))).toBe('2026-10-01')
    // 22:00 del 31/10 en Salta ya es 01/11 en UTC.
    expect(cicloDeLaFecha(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10-01')
    expect(cicloDeLaFecha(new Date('2026-11-01T04:00:00Z'))).toBe('2026-11-01')
  })
})

describe('proponerCicloDelMes', () => {
  it('si el ciclo del mes ya existe (en cualquier estado) no escribe nada ni llama a la fuente', async () => {
    const f = crearFake({ ad_price_cycles: [{ ciclo: '2026-10-01', estado: 'descartado' }] })
    const fetchFalso = fetchDolar()
    expect(await proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchFalso })).toBe('ya-existia')
    expect(escrituras(f)).toHaveLength(0)
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it('sin anterior, audiencia 0 y TC 1.530: los precios de la prueba de aceptación, propuestos y sin push', async () => {
    const f = crearFake({ ad_price_cycles: [], ad_prices: [], ad_occupancy_daily: [], ad_settings: [{ id: true, aprobacion_automatica: false }] })
    expect(await proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchDolar(1530) })).toBe('creado')

    const [ciclo] = f.datos.ad_price_cycles
    expect(ciclo).toMatchObject({
      ciclo: '2026-10-01',
      estado: 'propuesto',
      approved_at: null,
      approved_by: null,
      audiencia_web_28d: 0,
      fuente_audiencia: 'manual',
      mau_app_28d: null,
      dispositivos_push: null,
      tipo_cambio: 1530,
      fuente_tipo_cambio: 'dolarapi',
      tramo_vigente: 500,
    })

    const porProducto = Object.fromEntries(f.datos.ad_prices.map((p) => [p.producto as string, p]))
    expect(Object.keys(porProducto).sort()).toEqual(['destacado-14', 'destacado-3', 'destacado-7', 'pack-lanzamiento', 'plan-mensual', 'plan-rrpp'])
    expect(Object.fromEntries(Object.entries(porProducto).map(([k, v]) => [k, v.precio_ars]))).toEqual({
      'destacado-3': 8500,
      'destacado-7': 14000,
      'destacado-14': 24000,
      'pack-lanzamiento': 20000,
      'plan-mensual': 42000,
      'plan-rrpp': 14500,
    })
    expect(Object.fromEntries(Object.entries(porProducto).map(([k, v]) => [k, v.precio_fundador_ars]))).toEqual({
      'destacado-3': 6000,
      'destacado-7': 10000,
      'destacado-14': 17000,
      'pack-lanzamiento': 14000,
      'plan-mensual': 29500,
      'plan-rrpp': 10000,
    })
    expect(f.datos.ad_prices.every((p) => p.estado === 'propuesto' && p.ciclo === '2026-10-01')).toBe(true)
  })

  it('si la fuente falla usa el tipo de cambio y la audiencia del anterior, marcado como "anterior"', async () => {
    const f = crearFake({ ad_price_cycles: [cicloAprobado()], ad_prices: preciosAprobados('2026-09-01', 1400), ad_occupancy_daily: [], ad_settings: [] })
    expect(await proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchDolar(null) })).toBe('creado')
    const nuevo = f.datos.ad_price_cycles.find((c) => c.ciclo === '2026-10-01')
    expect(nuevo).toMatchObject({ tipo_cambio: 1400, fuente_tipo_cambio: 'anterior', audiencia_web_28d: 300, fuente_audiencia: 'manual' })
  })

  it('una fuente que se desvía más de 30% del anterior se descarta y usa el anterior', async () => {
    const f = crearFake({ ad_price_cycles: [cicloAprobado({ tipo_cambio: 1530 })], ad_prices: preciosAprobados('2026-09-01', 1530), ad_occupancy_daily: [], ad_settings: [] })
    expect(await proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchDolar(2100) })).toBe('creado')
    const nuevo = f.datos.ad_price_cycles.find((c) => c.ciclo === '2026-10-01')
    expect(nuevo).toMatchObject({ tipo_cambio: 1530, fuente_tipo_cambio: 'anterior' })
  })

  it('una fuente con +18% sobre el anterior es válida', async () => {
    const f = crearFake({ ad_price_cycles: [cicloAprobado({ tipo_cambio: 1530 })], ad_prices: preciosAprobados('2026-09-01', 1530), ad_occupancy_daily: [], ad_settings: [] })
    expect(await proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchDolar(1800) })).toBe('creado')
    const nuevo = f.datos.ad_price_cycles.find((c) => c.ciclo === '2026-10-01')
    expect(nuevo).toMatchObject({ tipo_cambio: 1800, fuente_tipo_cambio: 'dolarapi' })
  })

  it('el anterior que cuenta es solo uno aprobado o automático: un propuesto no sirve', async () => {
    const f = crearFake({ ad_price_cycles: [cicloAprobado({ estado: 'propuesto' })], ad_prices: [] })
    expect(await proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchDolar(null) })).toBe('sin-tipo-de-cambio')
  })

  it('sin fuente y sin anterior no crea nada', async () => {
    const f = crearFake({ ad_price_cycles: [], ad_prices: [] })
    expect(await proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchDolar(null) })).toBe('sin-tipo-de-cambio')
    expect(escrituras(f)).toHaveLength(0)
  })

  it('con aprobacion_automatica el ciclo entra "automatico" con approved_at y los precios "aprobado"', async () => {
    const f = crearFake({ ad_price_cycles: [], ad_prices: [], ad_settings: [{ id: true, aprobacion_automatica: true }] })
    expect(await proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchDolar() })).toBe('creado')
    expect(f.datos.ad_price_cycles[0]).toMatchObject({ estado: 'automatico', approved_at: AHORA.toISOString(), approved_by: null })
    expect(f.datos.ad_prices.length).toBeGreaterThan(0)
    expect(f.datos.ad_prices.every((p) => p.estado === 'aprobado')).toBe(true)
  })

  it('si falla el insert de los precios, borra el ciclo recién creado y lanza', async () => {
    const f = crearFake({ ad_price_cycles: [], ad_prices: [], ad_settings: [] }, (t, op) => t === 'ad_prices' && op === 'insert')
    await expect(proponerCicloDelMes(f.cliente, { ahora: AHORA, fetch: fetchDolar() })).rejects.toThrow(/se borró el ciclo/)
    expect(f.datos.ad_price_cycles).toHaveLength(0)
  })

  it('el día 15 sin ciclo del mes lo crea con ciclo = AAAA-MM-01', async () => {
    const f = crearFake({ ad_price_cycles: [], ad_prices: [], ad_settings: [] })
    const quince = new Date('2026-10-15T15:00:00Z')
    const fetchQuince = vi.fn(async () => new Response(JSON.stringify({ venta: 1530, fechaActualizacion: '2026-10-15T10:00:00.000Z' }), { status: 200 })) as unknown as typeof fetch
    expect(await proponerCicloDelMes(f.cliente, { ahora: quince, fetch: fetchQuince })).toBe('creado')
    expect(f.datos.ad_price_cycles[0].ciclo).toBe('2026-10-01')
    expect(f.datos.ad_prices.every((p) => p.vigente_desde === '2026-10-01')).toBe(true)
  })
})
