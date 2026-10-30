import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { armarPropuesta } from '@qps/core/publicidad/formula'
import { cargarCicloAnterior, proponerCicloDelMes } from '@/lib/publicidad/ciclo'
import { clienteServicio, crearAlmacen, escrituras, filasDe, sembrar, type Almacen, type ErrorDb, type Fila } from './_soporte/doble-supabase'

/**
 * R74 (74-q): robustez del ciclo de precios.
 * - 74-a: un ciclo del mes que quedó sin precios se completa con sus datos guardados.
 * - 74-b: el ciclo anterior solo vale con todos sus precios `aprobado`.
 * Sin red ni base: el doble en memoria de `_soporte/` y un `fetch` inventado.
 */

const AHORA = new Date('2026-10-23T15:00:00Z')
const MES = '2026-10-01'

function cliente(almacen: Almacen): SupabaseClient {
  return clienteServicio(almacen) as unknown as SupabaseClient
}

function fetchDolar(venta: number | null = 1530) {
  return vi.fn(async () => {
    if (venta === null) return new Response('caído', { status: 503 })
    return new Response(JSON.stringify({ venta, fechaActualizacion: '2026-10-23T14:00:00.000Z' }), { status: 200 })
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

/** El ciclo del mes, con sus datos guardados. */
function cicloDelMes(extra: Fila = {}): Fila {
  return {
    ciclo: MES,
    estado: 'propuesto',
    audiencia_web_28d: 0,
    audiencia: 0,
    fuente_audiencia: 'manual',
    tramo_calculado: 500,
    tramo_vigente: 500,
    tipo_cambio: 1530,
    fuente_tipo_cambio: 'dolarapi',
    factor_hero: 1,
    factor_push: 1,
    dispositivos_push: null,
    approved_at: null,
    ...extra,
  }
}

/** Un ciclo anterior aprobado. */
function cicloAnterior(ciclo: string, extra: Fila = {}): Fila {
  return {
    ciclo,
    estado: 'aprobado',
    audiencia_web_28d: 300,
    audiencia: 300,
    fuente_audiencia: 'manual',
    tramo_calculado: 500,
    tramo_vigente: 500,
    cambio_tramo_desde: null,
    tipo_cambio: 1400,
    factor_hero: 1,
    factor_push: 1,
    approved_at: '2026-09-01T12:00:00.000Z',
    ...extra,
  }
}

function precioAnterior(ciclo: string, producto: string, extra: Fila = {}): Fila {
  return { ciclo, producto, tramo_ref: 500, precio_usd: 1, precio_ars: 11500, tipo_cambio: 1400, estado: 'aprobado', vigente_desde: ciclo, ...extra }
}

const sinCamposDeBase = ({ id: _id, created_at: _c, ...resto }: Fila): Fila => resto
const preciosDe = (a: Almacen, ciclo: string): Fila[] => filasDe(a, 'ad_prices').filter((p) => p.ciclo === ciclo).map(sinCamposDeBase)
const productosDe = (a: Almacen, ciclo: string): string[] => preciosDe(a, ciclo).map((p) => p.producto as string).sort()
const arsDe = (a: Almacen, ciclo: string, producto: string): unknown => preciosDe(a, ciclo).find((p) => p.producto === producto)?.precio_ars

function fallarCuando(a: Almacen, tabla: string, op: string): void {
  a.fallar = (t, o): ErrorDb | null => (t === tabla && o === op ? { code: 'XX000', message: 'falla inventada' } : null)
}

let avisos: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  avisos.mockRestore()
})

// ---------------------------------------------------------------------------
// 74-a: el ciclo del mes que quedó sin precios
// ---------------------------------------------------------------------------
describe('proponerCicloDelMes: ciclo del mes sin precios (74-a)', () => {
  it('con precios ya cargados devuelve ya-existia sin escribir ni pedir el dólar', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes()])
    sembrar(a, 'ad_prices', [{ ciclo: MES, producto: 'destacado-7', tramo_ref: 500, precio_usd: 9, precio_ars: 14000, precio_fundador_ars: 10000, tipo_cambio: 1530, vigente_desde: MES }])
    const f = fetchDolar()
    expect(await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: f })).toBe('ya-existia')
    expect(escrituras(a)).toHaveLength(0)
    expect(f).not.toHaveBeenCalled()
    expect(productosDe(a, MES)).toEqual(['destacado-7'])
  })

  it('propuesto sin precios: inserta los precios propuestos y devuelve precios-completados, sin pedir el dólar ni la ocupación', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes()])
    const f = fetchDolar()
    expect(await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: f })).toBe('precios-completados')

    expect(f).not.toHaveBeenCalled()
    expect(a.llamadas.some((l) => l.tabla === 'ad_occupancy_daily')).toBe(false)
    expect(a.llamadas.some((l) => l.tabla === 'ad_settings')).toBe(false)
    expect(productosDe(a, MES)).toEqual(['destacado-14', 'destacado-3', 'destacado-7', 'pack-lanzamiento', 'plan-mensual', 'plan-rrpp'])
    const filas = preciosDe(a, MES)
    expect(filas.every((p) => p.estado === 'propuesto' && p.tipo_cambio === 1530 && p.vigente_desde === MES && p.tramo_ref === 500)).toBe(true)
    // Los de la prueba de aceptación (tramo 500, dólar 1.530).
    expect(arsDe(a, MES, 'destacado-7')).toBe(14000)
    // Solo escribió en ad_prices, y una sola vez; el ciclo no se tocó.
    const escritas = escrituras(a)
    expect(escritas).toHaveLength(1)
    expect(escritas[0]).toMatchObject({ tabla: 'ad_prices', op: 'insert' })
    expect(filasDe(a, 'ad_price_cycles')).toHaveLength(1)
  })

  it('automatico sin precios: los precios entran aprobado', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes({ estado: 'automatico', approved_at: AHORA.toISOString() })])
    expect(await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: fetchDolar() })).toBe('precios-completados')
    const filas = preciosDe(a, MES)
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every((p) => p.estado === 'aprobado')).toBe(true)
  })

  it.each(['aprobado', 'descartado'])('un ciclo %s sin precios: avisa, no escribe y devuelve ya-existia', async (estado) => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes({ estado, approved_at: '2026-10-01T12:00:00.000Z' })])
    const f = fetchDolar()
    expect(await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: f })).toBe('ya-existia')
    expect(escrituras(a)).toHaveLength(0)
    expect(filasDe(a, 'ad_prices')).toHaveLength(0)
    expect(f).not.toHaveBeenCalled()
    expect(avisos).toHaveBeenCalledTimes(1)
    expect(String(avisos.mock.calls[0][0])).toContain(estado)
  })

  it('si el insert de los precios falla, lanza y NO borra el ciclo que ya existía', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes()])
    fallarCuando(a, 'ad_prices', 'insert')
    await expect(proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: fetchDolar() })).rejects.toThrow(/no se pudieron completar los precios/)
    expect(a.llamadas.some((l) => l.op === 'delete')).toBe(false)
    expect(filasDe(a, 'ad_price_cycles')).toHaveLength(1)
    expect(filasDe(a, 'ad_prices')).toHaveLength(0)
  })

  it('si falla la lectura de si hay precios, lanza sin escribir', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes()])
    fallarCuando(a, 'ad_prices', 'select')
    await expect(proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: fetchDolar() })).rejects.toThrow(/no se pudieron leer los precios del ciclo del mes/)
    expect(escrituras(a)).toHaveLength(0)
  })

  it.each([
    ['tramo_vigente', 0],
    ['tramo_vigente', null],
    ['tramo_vigente', -500],
    ['tipo_cambio', 0],
    ['tipo_cambio', null],
    ['tipo_cambio', Number.NaN],
    ['tipo_cambio', 'abc'],
    ['factor_hero', 0],
    ['factor_hero', null],
    ['factor_push', 0],
    ['factor_push', Number.NaN],
  ])('%s = %s inválido: lanza y no inserta nada', async (columna, valor) => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes({ [columna]: valor })])
    await expect(proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: fetchDolar() })).rejects.toThrow(/inválidos/)
    expect(escrituras(a)).toHaveLength(0)
    expect(filasDe(a, 'ad_prices')).toHaveLength(0)
  })

  it('dispositivos_push null: no hay fila de push; con dispositivos sí, y el pack y el plan la incluyen', async () => {
    const sin = crearAlmacen()
    sembrar(sin, 'ad_price_cycles', [cicloDelMes({ dispositivos_push: null })])
    await proponerCicloDelMes(cliente(sin), { ahora: AHORA, fetch: fetchDolar() })
    expect(productosDe(sin, MES)).not.toContain('push')

    const con = crearAlmacen()
    sembrar(con, 'ad_price_cycles', [cicloDelMes({ dispositivos_push: 4000 })])
    await proponerCicloDelMes(cliente(con), { ahora: AHORA, fetch: fetchDolar() })
    expect(productosDe(con, MES)).toContain('push')
    expect(productosDe(con, MES)).toHaveLength(7)
    // El push entra en el pack y el plan: valen más que sin push.
    expect(Number(arsDe(con, MES, 'pack-lanzamiento'))).toBeGreaterThan(Number(arsDe(sin, MES, 'pack-lanzamiento')))
    expect(Number(arsDe(con, MES, 'plan-mensual'))).toBeGreaterThan(Number(arsDe(sin, MES, 'plan-mensual')))
  })

  it('las columnas numeric que llegan como texto se calculan igual que los números', async () => {
    const texto = crearAlmacen()
    sembrar(texto, 'ad_price_cycles', [
      cicloDelMes({ tramo_vigente: '500.00', tipo_cambio: '1530.00', factor_hero: '1.00', factor_push: '1.00', dispositivos_push: null }),
    ])
    expect(await proponerCicloDelMes(cliente(texto), { ahora: AHORA, fetch: fetchDolar() })).toBe('precios-completados')

    const esperado = armarPropuesta({
      ciclo: MES,
      audienciaWeb28d: 0,
      mauApp28d: null,
      dispositivosPush: null,
      fuenteAudiencia: 'manual',
      tipoCambio: 1530,
      fuenteTipoCambio: 'dolarapi',
      anterior: null,
      ocupacionHero: [null, null],
      ocupacionPush: [null, null],
    })
    expect(preciosDe(texto, MES)).toEqual(esperado.precios.map((p) => ({ ...p, ciclo: MES, estado: 'propuesto' })))
    // Y los valores guardados son números, no texto.
    expect(preciosDe(texto, MES).every((p) => typeof p.precio_ars === 'number' && p.tipo_cambio === 1530 && p.tramo_ref === 500)).toBe(true)
  })

  it('equivalencia: los precios completados son los de armarPropuesta con los mismos insumos, aunque la ocupación del mes haya cambiado', async () => {
    const a = crearAlmacen()
    // Tramo 5.000, factores ya escritos 1,15 y 0,90, 4.000 dispositivos, dólar 1.530.
    sembrar(a, 'ad_price_cycles', [
      cicloDelMes({ audiencia_web_28d: 5000, audiencia: 5000, tramo_calculado: 5000, tramo_vigente: 5000, factor_hero: 1.15, factor_push: 0.9, dispositivos_push: 4000 }),
    ])
    // La ocupación de los 2 meses anteriores quedó llena: si el código la leyera, el factor del Hero subiría a 1,32.
    const dias: Fila[] = []
    for (const mes of ['2026-08', '2026-09']) {
      for (let d = 1; d <= 28; d++) {
        dias.push({ day: `${mes}-${String(d).padStart(2, '0')}`, hero_ocupados: 6, hero_cupos: 6, push_cupos_usados: 1, push_cupos: 1 })
      }
    }
    sembrar(a, 'ad_occupancy_daily', dias)
    const f = fetchDolar(9999)

    expect(await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: f })).toBe('precios-completados')
    expect(f).not.toHaveBeenCalled()
    expect(a.llamadas.some((l) => l.tabla === 'ad_occupancy_daily')).toBe(false)

    const esperado = armarPropuesta({
      ciclo: MES,
      audienciaWeb28d: 5000,
      mauApp28d: null,
      dispositivosPush: 4000,
      fuenteAudiencia: 'manual',
      tipoCambio: 1530,
      fuenteTipoCambio: 'dolarapi',
      // Un anterior que deja el tramo en 5.000 y los factores en 1,15 / 0,90, sin cambio de tramo.
      anterior: { ciclo: '2026-09-01', audiencia: 5000, tramoVigente: 5000, tramoCalculado: 5000, cambioTramoDesde: null, factorHero: 1.15, factorPush: 0.9, precios: {} },
      ocupacionHero: [null, null],
      ocupacionPush: [null, null],
    })
    expect(esperado.ciclo.factor_hero).toBe(1.15)
    expect(esperado.ciclo.tramo_vigente).toBe(5000)
    expect(preciosDe(a, MES)).toEqual(esperado.precios.map((p) => ({ ...p, ciclo: MES, estado: 'propuesto' })))
  })

  it('trinquete: con un anterior aprobado de precio en pesos más alto, el completado no baja', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes(), cicloAnterior('2026-09-01', { tipo_cambio: 1530 })])
    // USD del anterior más bajo que el nuevo y mismo dólar: el trinquete lo sostiene en 100.000.
    sembrar(a, 'ad_prices', [precioAnterior('2026-09-01', 'destacado-7', { precio_ars: 100000, precio_usd: 1, tipo_cambio: 1530 })])

    expect(await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: fetchDolar() })).toBe('precios-completados')
    expect(arsDe(a, MES, 'destacado-7')).toBe(100000)

    // Contraste: sin anterior el mismo ciclo da el precio calculado, más bajo.
    const sin = crearAlmacen()
    sembrar(sin, 'ad_price_cycles', [cicloDelMes()])
    await proponerCicloDelMes(cliente(sin), { ahora: AHORA, fetch: fetchDolar() })
    expect(arsDe(sin, MES, 'destacado-7')).toBe(14000)
  })

  it('el ciclo anterior a medio aprobar no frena el completado: el trinquete usa el aprobado más viejo', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloDelMes(), cicloAnterior('2026-09-01', { tipo_cambio: 1530 }), cicloAnterior('2026-08-01', { tipo_cambio: 1530 })])
    sembrar(a, 'ad_prices', [
      precioAnterior('2026-09-01', 'destacado-7', { precio_ars: 100000, precio_usd: 1, tipo_cambio: 1530, estado: 'propuesto' }),
      precioAnterior('2026-08-01', 'destacado-7', { precio_ars: 20000, precio_usd: 1, tipo_cambio: 1530 }),
    ])
    await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: fetchDolar() })
    expect(arsDe(a, MES, 'destacado-7')).toBe(20000)
  })
})

// ---------------------------------------------------------------------------
// 74-b: el ciclo anterior solo vale con todos sus precios aprobados
// ---------------------------------------------------------------------------
describe('cargarCicloAnterior (74-b)', () => {
  /** Dos ciclos: el de septiembre con el estado y los precios que se indiquen, y agosto sano con otro dólar. */
  function conAgostoSano(septiembre: Fila[], preciosSeptiembre: Fila[]): Almacen {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [...septiembre, cicloAnterior('2026-08-01', { tipo_cambio: 1300, audiencia: 200 })])
    sembrar(a, 'ad_prices', [...preciosSeptiembre, precioAnterior('2026-08-01', 'destacado-7', { precio_ars: 9000, precio_usd: 7, tipo_cambio: 1300 })])
    return a
  }

  it('un anterior aprobado con todos sus precios aprobados es el anterior', async () => {
    const a = conAgostoSano([cicloAnterior('2026-09-01')], [precioAnterior('2026-09-01', 'destacado-7'), precioAnterior('2026-09-01', 'destacado-3', { precio_ars: 7000 })])
    const r = await cargarCicloAnterior(cliente(a), MES)
    expect(r?.ciclo).toBe('2026-09-01')
    expect(r?.tipoCambio).toBe(1400)
    expect(r?.precios['destacado-7']).toEqual({ precioArs: 11500, precioUsd: 1, tipoCambio: 1400 })
    expect(avisos).not.toHaveBeenCalled()
  })

  it('a medio aprobar (ciclo aprobado, precios propuesto): se saltea con un aviso y se usa el aprobado más viejo', async () => {
    const a = conAgostoSano([cicloAnterior('2026-09-01')], [precioAnterior('2026-09-01', 'destacado-7', { estado: 'propuesto' })])
    const r = await cargarCicloAnterior(cliente(a), MES)
    expect(r?.ciclo).toBe('2026-08-01')
    expect(r?.tipoCambio).toBe(1300)
    expect(r?.audiencia).toBe(200)
    expect(r?.precios['destacado-7']?.precioArs).toBe(9000)
    expect(avisos).toHaveBeenCalledTimes(1)
    expect(String(avisos.mock.calls[0][0])).toContain('2026-09-01')
  })

  it('con precios mezclados (uno aprobado y otro propuesto) también se saltea', async () => {
    const a = conAgostoSano(
      [cicloAnterior('2026-09-01')],
      [precioAnterior('2026-09-01', 'destacado-7'), precioAnterior('2026-09-01', 'destacado-3', { estado: 'propuesto' })],
    )
    expect((await cargarCicloAnterior(cliente(a), MES))?.ciclo).toBe('2026-08-01')
  })

  it('un anterior sin ningún precio se saltea con un aviso', async () => {
    const a = conAgostoSano([cicloAnterior('2026-09-01')], [])
    const r = await cargarCicloAnterior(cliente(a), MES)
    expect(r?.ciclo).toBe('2026-08-01')
    expect(avisos).toHaveBeenCalledTimes(1)
  })

  it('sin ningún anterior válido devuelve null', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloAnterior('2026-09-01'), cicloAnterior('2026-08-01')])
    sembrar(a, 'ad_prices', [precioAnterior('2026-09-01', 'destacado-7', { estado: 'propuesto' })])
    expect(await cargarCicloAnterior(cliente(a), MES)).toBeNull()
    expect(avisos).toHaveBeenCalledTimes(2)
  })

  it('sin ciclos devuelve null', async () => {
    expect(await cargarCicloAnterior(cliente(crearAlmacen()), MES)).toBeNull()
  })

  it('un automatico con precios aprobados sí cuenta', async () => {
    const a = conAgostoSano([cicloAnterior('2026-09-01', { estado: 'automatico' })], [precioAnterior('2026-09-01', 'destacado-7')])
    expect((await cargarCicloAnterior(cliente(a), MES))?.ciclo).toBe('2026-09-01')
  })

  it('los ciclos propuesto y descartado no cuentan aunque tengan precios aprobados', async () => {
    const a = conAgostoSano(
      [cicloAnterior('2026-09-01', { estado: 'propuesto' }), cicloAnterior('2026-07-01', { estado: 'descartado' })],
      [precioAnterior('2026-09-01', 'destacado-7'), precioAnterior('2026-07-01', 'destacado-7')],
    )
    expect((await cargarCicloAnterior(cliente(a), MES))?.ciclo).toBe('2026-08-01')
  })

  it('el ciclo del mes y los posteriores no son anteriores', async () => {
    const a = conAgostoSano([cicloAnterior(MES), cicloAnterior('2026-11-01')], [precioAnterior(MES, 'destacado-7'), precioAnterior('2026-11-01', 'destacado-7')])
    expect((await cargarCicloAnterior(cliente(a), MES))?.ciclo).toBe('2026-08-01')
  })

  it('los números que llegan como texto (numeric) se convierten', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloAnterior('2026-09-01', { tipo_cambio: '1400.00', tramo_vigente: '1000', factor_hero: '1.15' })])
    sembrar(a, 'ad_prices', [precioAnterior('2026-09-01', 'destacado-7', { precio_ars: '11500.00', precio_usd: '8.20', tipo_cambio: '1400.00' })])
    const r = await cargarCicloAnterior(cliente(a), MES)
    expect(r).toMatchObject({ tipoCambio: 1400, tramoVigente: 1000, factorHero: 1.15 })
    expect(r?.precios['destacado-7']).toEqual({ precioArs: 11500, precioUsd: 8.2, tipoCambio: 1400 })
  })

  it('mira hasta 12 candidatos: con 12 rotos más recientes, uno sano más viejo ya no se alcanza', async () => {
    const a = crearAlmacen()
    const meses: string[] = []
    for (let i = 0; i < 13; i++) {
      const total = 2025 * 12 + 8 + i // de 2025-09 a 2026-09
      meses.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`)
    }
    sembrar(a, 'ad_price_cycles', meses.map((m) => cicloAnterior(m)))
    // El más viejo (2025-09) está sano; los 12 más nuevos, sin precios.
    sembrar(a, 'ad_prices', [precioAnterior(meses[0], 'destacado-7')])
    expect(await cargarCicloAnterior(cliente(a), MES)).toBeNull()
    expect(avisos).toHaveBeenCalledTimes(12)

    // Con 11 rotos, el sano es el candidato 12 y se alcanza.
    const b = crearAlmacen()
    sembrar(b, 'ad_price_cycles', meses.slice(1).map((m) => cicloAnterior(m)))
    sembrar(b, 'ad_prices', [precioAnterior(meses[1], 'destacado-7')])
    expect((await cargarCicloAnterior(cliente(b), MES))?.ciclo).toBe(meses[1])
  })

  it('si falla la lectura de los precios de un candidato, lanza (no lo da por inválido)', async () => {
    const a = conAgostoSano([cicloAnterior('2026-09-01')], [precioAnterior('2026-09-01', 'destacado-7')])
    fallarCuando(a, 'ad_prices', 'select')
    await expect(cargarCicloAnterior(cliente(a), MES)).rejects.toThrow(/no se pudieron leer los precios del ciclo anterior/)
  })

  it('si falla la lectura de los ciclos, lanza', async () => {
    const a = conAgostoSano([cicloAnterior('2026-09-01')], [precioAnterior('2026-09-01', 'destacado-7')])
    fallarCuando(a, 'ad_price_cycles', 'select')
    await expect(cargarCicloAnterior(cliente(a), MES)).rejects.toThrow(/no se pudo leer el ciclo anterior/)
  })
})

describe('proponerCicloDelMes con un anterior a medio aprobar (74-b)', () => {
  it('crea el ciclo con el dólar de respaldo del aprobado completo más viejo, no del a medio aprobar', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloAnterior('2026-09-01', { tipo_cambio: 1400 }), cicloAnterior('2026-08-01', { tipo_cambio: 1300 })])
    sembrar(a, 'ad_prices', [
      precioAnterior('2026-09-01', 'destacado-7', { estado: 'propuesto', tipo_cambio: 1400 }),
      precioAnterior('2026-08-01', 'destacado-7', { tipo_cambio: 1300 }),
    ])
    expect(await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: fetchDolar(null) })).toBe('creado')
    const nuevo = filasDe(a, 'ad_price_cycles').find((c) => c.ciclo === MES)
    expect(nuevo).toMatchObject({ tipo_cambio: 1300, fuente_tipo_cambio: 'anterior' })
  })

  it('sin ningún anterior válido y sin fuente no crea nada', async () => {
    const a = crearAlmacen()
    sembrar(a, 'ad_price_cycles', [cicloAnterior('2026-09-01')])
    sembrar(a, 'ad_prices', [precioAnterior('2026-09-01', 'destacado-7', { estado: 'propuesto' })])
    expect(await proponerCicloDelMes(cliente(a), { ahora: AHORA, fetch: fetchDolar(null) })).toBe('sin-tipo-de-cambio')
    expect(escrituras(a)).toHaveLength(0)
  })
})
