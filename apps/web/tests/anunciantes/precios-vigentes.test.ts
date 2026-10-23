/**
 * tests/anunciantes/precios-vigentes.test.ts (R58-d): `cargarTarifarioVigente`
 * con un doble del cliente que RESPETA los filtros (`eq`, `lte`, `in`, `order`,
 * `limit`). Si la consulta no pide `estado = 'aprobado'`, el doble devuelve las
 * filas propuestas y los tests se ponen rojos: es la rotura del plan.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cargarTarifarioVigente } from '@/lib/anunciantes/precios'
import {
  PIE_TARIFARIO,
  TARIFARIO,
  VIGENCIA_TARIFARIO,
  textoPrecioFundador,
  textoPrecioLista,
} from '@qps/core/publicidad/precios'

type Fila = Record<string, unknown>

interface Datos {
  ad_prices?: Fila[]
  ad_price_cycles?: Fila[]
  /** Tabla -> error que devuelve la lectura. */
  errores?: Record<string, { code: string; message: string }>
}

function doble(datos: Datos) {
  const consultas: Array<{ tabla: string; filtros: Array<[string, unknown[]]> }> = []
  return {
    consultas,
    from(tabla: string) {
      const filtros: Array<[string, unknown[]]> = []
      let orden: { col: string; asc: boolean } | null = null
      let tope: number | null = null
      consultas.push({ tabla, filtros })
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filtros.push(['eq', [c, v]]), b),
        lte: (c: string, v: unknown) => (filtros.push(['lte', [c, v]]), b),
        in: (c: string, v: unknown[]) => (filtros.push(['in', [c, v]]), b),
        order: (col: string, o?: { ascending?: boolean }) => ((orden = { col, asc: o?.ascending !== false }), b),
        limit: (n: number) => ((tope = n), b),
        then(resolve: (r: { data: Fila[] | null; error: unknown }) => unknown) {
          const error = datos.errores?.[tabla]
          if (error) return resolve({ data: null, error })
          let filas = [...((datos as Record<string, Fila[] | undefined>)[tabla] ?? [])]
          for (const [tipo, [c, v]] of filtros) {
            if (tipo === 'eq') filas = filas.filter((f) => f[c as string] === v)
            if (tipo === 'lte') filas = filas.filter((f) => (f[c as string] as string) <= (v as string))
            if (tipo === 'in') filas = filas.filter((f) => (v as unknown[]).includes(f[c as string]))
          }
          if (orden) {
            const { col, asc } = orden
            filas.sort((x, y) => ((x[col] as string) < (y[col] as string) ? -1 : 1) * (asc ? 1 : -1))
          }
          if (tope !== null) filas = filas.slice(0, tope)
          return resolve({ data: filas, error: null })
        },
      }
      return b
    },
  }
}

function precio(producto: string, ars: number, extra: Fila = {}): Fila {
  return {
    producto,
    precio_usd: ars / 1500,
    precio_ars: ars,
    precio_fundador_ars: Math.round((ars * 0.7) / 500) * 500,
    tipo_cambio: 1500,
    estado: 'aprobado',
    vigente_desde: '2026-12-01',
    ...extra,
  }
}

const HOY = '2026-12-10'

afterEach(() => vi.restoreAllMocks())

describe('cargarTarifarioVigente: el respaldo', () => {
  it('sin filas devuelve exactamente TARIFARIO y PIE_TARIFARIO', async () => {
    const r = await cargarTarifarioVigente(doble({}), HOY)
    expect(r.productos).toEqual([...TARIFARIO])
    expect(r.vigencia).toBe(VIGENCIA_TARIFARIO)
    expect(r.pie).toBe(PIE_TARIFARIO)
    expect(r.aviso).toBeNull()
  })

  it('una lectura con error devuelve el respaldo entero, sin aviso, y el log solo lleva el código', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const datos: Datos = {
      ad_prices: [precio('destacado-7', 20000)],
      ad_price_cycles: [{ ciclo: '2026-12-01', estado: 'aprobado', cambio_tramo_desde: '2027-01-01', tramo_calculado: 1000 }],
      errores: { ad_price_cycles: { code: 'XX000', message: 'user_id 123e4567-e89b-12d3-a456-426614174000' } },
    }
    const r = await cargarTarifarioVigente(doble(datos), HOY)
    expect(r.productos).toEqual([...TARIFARIO])
    expect(r.pie).toBe(PIE_TARIFARIO)
    expect(r.aviso).toBeNull()
    const logs = JSON.stringify(spy.mock.calls)
    expect(logs).toContain('XX000')
    expect(logs).not.toContain('123e4567')
  })

  it('si el error está en ad_prices, también el respaldo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await cargarTarifarioVigente(doble({ errores: { ad_prices: { code: '42501', message: 'x' } } }), HOY)
    expect(r.productos).toEqual([...TARIFARIO])
  })
})

describe('cargarTarifarioVigente: qué precio se usa', () => {
  it('pide estado = aprobado en la consulta, y entre un aprobado y un propuesto más caro usa el aprobado', async () => {
    const cliente = doble({
      ad_prices: [
        precio('destacado-7', 16000, { estado: 'aprobado' }),
        precio('destacado-7', 99000, { estado: 'propuesto' }),
      ],
    })
    const r = await cargarTarifarioVigente(cliente, HOY)
    const p = r.productos.find((x) => x.id === 'destacado-7')!
    expect(textoPrecioLista(p.precio)).toBe('$ 16.000')
    expect(cliente.consultas[0].tabla).toBe('ad_prices')
    expect(cliente.consultas[0].filtros).toContainEqual(['eq', ['estado', 'aprobado']])
    expect(cliente.consultas[0].filtros).toContainEqual(['lte', ['vigente_desde', HOY]])
  })

  it('solo hay un propuesto: se queda el de respaldo', async () => {
    const r = await cargarTarifarioVigente(doble({ ad_prices: [precio('destacado-7', 99000, { estado: 'propuesto' })] }), HOY)
    expect(r.productos).toEqual([...TARIFARIO])
  })

  it('un aprobado con vigente_desde mañana todavía no se usa', async () => {
    const r = await cargarTarifarioVigente(
      doble({ ad_prices: [precio('destacado-7', 16000, { vigente_desde: '2026-12-11' })] }),
      HOY,
    )
    expect(r.productos).toEqual([...TARIFARIO])
    expect(r.vigencia).toBe(VIGENCIA_TARIFARIO)
  })

  it('con dos ciclos aprobados, el más reciente por producto', async () => {
    const r = await cargarTarifarioVigente(
      doble({
        ad_prices: [
          precio('destacado-7', 15000, { vigente_desde: '2026-11-01' }),
          precio('destacado-7', 16500, { vigente_desde: '2026-12-01' }),
          precio('destacado-3', 9000, { vigente_desde: '2026-11-01' }),
        ],
      }),
      HOY,
    )
    const lista = (id: string) => textoPrecioLista(r.productos.find((x) => x.id === id)!.precio)
    expect(lista('destacado-7')).toBe('$ 16.500')
    expect(lista('destacado-3')).toBe('$ 9.000')
    // El resto sigue con el de respaldo.
    expect(lista('destacado-14')).toBe('$ 24.000')
  })

  it('el orden, el nombre y el período salen del tarifario; de la base, solo los montos', async () => {
    const r = await cargarTarifarioVigente(doble({ ad_prices: [precio('plan-mensual', 45000)] }), HOY)
    expect(r.productos.map((p) => p.id)).toEqual(TARIFARIO.map((p) => p.id))
    const plan = r.productos.find((p) => p.id === 'plan-mensual')!
    expect(plan.nombre).toBe(TARIFARIO.find((p) => p.id === 'plan-mensual')!.nombre)
    expect(textoPrecioLista(plan.precio)).toBe('$ 45.000/mes')
    expect(textoPrecioFundador(plan.precio)).toBe('$ 31.500/mes')
  })

  it('el push con fila aprobada se vende con precio; sin fila, "Próximamente"', async () => {
    const con = await cargarTarifarioVigente(doble({ ad_prices: [precio('push', 12000)] }), HOY)
    expect(textoPrecioLista(con.productos.find((p) => p.id === 'push')!.precio)).toBe('$ 12.000')
    const sin = await cargarTarifarioVigente(doble({}), HOY)
    expect(textoPrecioLista(sin.productos.find((p) => p.id === 'push')!.precio)).toBe('Próximamente')
  })

  it('una fila con montos inválidos no pisa el respaldo', async () => {
    const r = await cargarTarifarioVigente(doble({ ad_prices: [precio('destacado-7', -5), precio('destacado-3', 0)] }), HOY)
    expect(r.productos).toEqual([...TARIFARIO])
  })
})

describe('cargarTarifarioVigente: vigencia y pie', () => {
  it('la vigencia es el mes de vigente_desde y el pie lleva el día del ciclo', async () => {
    const r = await cargarTarifarioVigente(doble({ ad_prices: [precio('destacado-7', 16000)] }), HOY)
    expect(r.vigencia).toBe('diciembre 2026')
    expect(r.pie).toContain('dólar BNA del 1/12/2026')
    expect(r.pie).not.toContain('1/11/2026')
    // El resto del texto (incluida la otra fecha) queda igual.
    expect(r.pie).toContain('31/01/2027')
  })

  it('si el texto ya no trae la fecha del dólar, el pie va tal cual', async () => {
    vi.resetModules()
    vi.doMock('@qps/core/publicidad/precios', async (original) => {
      const real = await original<typeof import('@qps/core/publicidad/precios')>()
      return { ...real, PIE_TARIFARIO: 'Precios al dólar vigente. Pago antes de la publicación.' }
    })
    const { cargarTarifarioVigente: cargar } = await import('@/lib/anunciantes/precios')
    const r = await cargar(doble({ ad_prices: [precio('destacado-7', 16000)] }), HOY)
    expect(r.pie).toBe('Precios al dólar vigente. Pago antes de la publicación.')
    vi.doUnmock('@qps/core/publicidad/precios')
    vi.resetModules()
  })
})

describe('cargarTarifarioVigente: el aviso de cambio de tramo', () => {
  const ciclo = (extra: Fila): Fila => ({ ciclo: '2026-12-01', estado: 'aprobado', tramo_calculado: 5000, ...extra })

  it('con cambio_tramo_desde en el futuro, el aviso con la fecha y el tramo', async () => {
    const r = await cargarTarifarioVigente(
      doble({ ad_price_cycles: [ciclo({ cambio_tramo_desde: '2027-01-01', tramo_calculado: 5000 })] }),
      HOY,
    )
    expect(r.aviso).toBe('Desde el 1/1, los precios pasan al tramo de 5.000 personas.')
  })

  it('el ciclo automático también cuenta', async () => {
    const r = await cargarTarifarioVigente(
      doble({ ad_price_cycles: [ciclo({ estado: 'automatico', cambio_tramo_desde: '2027-01-01', tramo_calculado: 1000 })] }),
      HOY,
    )
    expect(r.aviso).toBe('Desde el 1/1, los precios pasan al tramo de 1.000 personas.')
  })

  it('en el pasado, de hoy o null: sin aviso', async () => {
    for (const desde of ['2026-11-01', HOY, null]) {
      const r = await cargarTarifarioVigente(doble({ ad_price_cycles: [ciclo({ cambio_tramo_desde: desde })] }), HOY)
      expect(r.aviso).toBeNull()
    }
  })

  it('un ciclo propuesto o descartado no avisa nada', async () => {
    for (const estado of ['propuesto', 'descartado']) {
      const r = await cargarTarifarioVigente(
        doble({ ad_price_cycles: [ciclo({ estado, cambio_tramo_desde: '2027-01-01' })] }),
        HOY,
      )
      expect(r.aviso).toBeNull()
    }
  })

  it('lee las dos tablas, en ese orden', async () => {
    const cliente = doble({})
    await cargarTarifarioVigente(cliente, HOY)
    expect(cliente.consultas.map((c) => c.tabla)).toEqual(['ad_prices', 'ad_price_cycles'])
  })
})
