import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PRODUCTOS_CON_PRECIO,
  aplicarTrinquete,
  armarPropuesta,
  calcularPrecios,
  factorDeDemanda,
  redondeo500,
} from '@qps/core/publicidad/formula'
import { TARIFARIO } from '@qps/core/publicidad/precios'

const ENTRADA = {
  tramoRef: 500,
  kAlc: 0.7,
  tipoCambio: 1530,
  factorHero: 1,
  factorPush: 1,
  dispositivosPush: null,
  vigentes: {},
}

const ESPERADO = {
  'destacado-3': { lista: 8500, fundador: 6000 },
  'destacado-7': { lista: 14000, fundador: 10000 },
  'destacado-14': { lista: 24000, fundador: 17000 },
  'pack-lanzamiento': { lista: 20000, fundador: 14000 },
  'plan-mensual': { lista: 42000, fundador: 29500 },
  'plan-rrpp': { lista: 14500, fundador: 10000 },
} as const

describe('prueba de aceptación: tramo 500, dólar 1.530', () => {
  const precios = calcularPrecios(ENTRADA)

  it('da exactamente los seis precios de lista y fundador, y no tiene push', () => {
    for (const [producto, esperado] of Object.entries(ESPERADO)) {
      const p = precios[producto as keyof typeof ESPERADO]
      expect(p?.precioArs, producto).toBe(esperado.lista)
      expect(p?.precioFundadorArs, producto).toBe(esperado.fundador)
    }
    expect(precios.push).toBeUndefined()
    expect(Object.keys(precios)).toHaveLength(6)
  })

  it('coincide con el TARIFARIO de precios.ts', () => {
    for (const prod of TARIFARIO) {
      if (prod.precio.tipo !== 'pesos') continue
      const p = precios[prod.id as keyof typeof ESPERADO]
      expect(p?.precioArs, prod.id).toBe(prod.precio.listaArs)
      expect(p?.precioFundadorArs, prod.id).toBe(prod.precio.fundadorArs)
    }
  })

  it('armarPropuesta con audiencia 490 y sin anterior da lo mismo, tramo 500 y sin cambio', () => {
    const p = armarPropuesta({
      ciclo: '2026-11-01',
      audienciaWeb28d: 490,
      mauApp28d: null,
      dispositivosPush: null,
      fuenteAudiencia: 'vercel',
      tipoCambio: 1530,
      fuenteTipoCambio: 'bna',
      ocupacionHero: [null, null],
      ocupacionPush: [null, null],
      anterior: null,
    })
    expect(p.ciclo.tramo_vigente).toBe(500)
    expect(p.ciclo.tramo_calculado).toBe(500)
    expect(p.ciclo.cambio_tramo_desde).toBeNull()
    expect(p.ciclo.factor_hero).toBe(1)
    expect(p.precios).toHaveLength(6)
    for (const fila of p.precios) {
      const esperado = ESPERADO[fila.producto as keyof typeof ESPERADO]
      expect(fila.precio_ars).toBe(esperado.lista)
      expect(fila.precio_fundador_ars).toBe(esperado.fundador)
      expect(fila.tramo_ref).toBe(500)
      expect(fila.vigente_desde).toBe('2026-11-01')
    }
  })
})

describe('el trinquete cableado en calcularPrecios y armarPropuesta', () => {
  // Con el dólar 5% abajo (1.455) y el mismo tramo, el destacado de 7 días
  // daría 13.500 sin trinquete; con el vigente de 14.000, se queda en 14.000.
  const vigente7 = { precioArs: 14000, precioUsd: 9.14, tipoCambio: 1530 }

  it('calcularPrecios usa los vigentes: el ARS no baja por un dólar 5% más barato', () => {
    const sin = calcularPrecios({ ...ENTRADA, tipoCambio: 1455 })
    expect(sin['destacado-7']?.precioArs).toBe(13500)
    const con = calcularPrecios({ ...ENTRADA, tipoCambio: 1455, vigentes: { 'destacado-7': vigente7 } })
    expect(con['destacado-7']?.precioArs).toBe(14000)
  })

  it('armarPropuesta pasa los precios del anterior al trinquete', () => {
    const p = armarPropuesta({
      ciclo: '2026-12-01',
      audienciaWeb28d: 490,
      mauApp28d: null,
      dispositivosPush: null,
      fuenteAudiencia: 'manual',
      tipoCambio: 1455,
      fuenteTipoCambio: 'bna',
      ocupacionHero: [null, null],
      ocupacionPush: [null, null],
      anterior: {
        ciclo: '2026-11-01',
        audiencia: 490,
        tramoVigente: 500,
        tramoCalculado: 500,
        cambioTramoDesde: null,
        factorHero: 1,
        factorPush: 1,
        precios: { 'destacado-7': vigente7 },
      },
    })
    expect(p.precios.find((f) => f.producto === 'destacado-7')?.precio_ars).toBe(14000)
  })
})

describe('redondeo500', () => {
  it('redondea al múltiplo de 500 más cercano', () => {
    expect(redondeo500(8393.6)).toBe(8500)
    expect(redondeo500(10150)).toBe(10000)
    expect(redondeo500(10250)).toBe(10500)
    expect(redondeo500(10249)).toBe(10000)
  })
  it('el mínimo es 500', () => {
    expect(redondeo500(249)).toBe(500)
    expect(redondeo500(250)).toBe(500)
    expect(redondeo500(251)).toBe(500)
    expect(redondeo500(0)).toBe(500)
  })
})

describe('aplicarTrinquete', () => {
  const vigente = { precioArs: 14000, precioUsd: 9.14, tipoCambio: 1530 }
  const nuevo = (usdNuevo: number, tipoCambio: number) => {
    const arsNuevo = redondeo500(usdNuevo * tipoCambio)
    return { arsNuevo, usdNuevo, vigente, tipoCambio }
  }

  it('sin vigente, el nuevo', () => {
    expect(aplicarTrinquete({ arsNuevo: 9000, usdNuevo: 5, vigente: null, tipoCambio: 1500 })).toBe(9000)
  })
  it('el dólar baja 5% con el mismo tramo: el ARS no baja', () => {
    expect(aplicarTrinquete(nuevo(9.14, 1530 * 0.95))).toBe(14000)
  })
  it('el dólar baja 12%: baja', () => {
    const e = nuevo(9.14, 1530 * 0.88)
    expect(aplicarTrinquete(e)).toBe(e.arsNuevo)
    expect(e.arsNuevo).toBeLessThan(14000)
  })
  it('baja el tramo con el dólar igual: baja', () => {
    const e = nuevo(5, 1530)
    expect(aplicarTrinquete(e)).toBe(e.arsNuevo)
    expect(e.arsNuevo).toBeLessThan(14000)
  })
  it('sube el dólar: sube', () => {
    const e = nuevo(9.14, 1700)
    expect(aplicarTrinquete(e)).toBe(e.arsNuevo)
    expect(e.arsNuevo).toBeGreaterThan(14000)
  })
})

describe('factorDeDemanda', () => {
  it('85% y 90% suben x1,15', () => {
    expect(factorDeDemanda([0.85, 0.9], 1)).toBe(1.15)
  })
  it('tope en 1,5', () => {
    expect(factorDeDemanda([0.85, 0.9], 1.4)).toBe(1.5)
  })
  it('20% y 25% bajan x0,9', () => {
    expect(factorDeDemanda([0.2, 0.25], 1)).toBe(0.9)
  })
  it('piso en 0,8', () => {
    expect(factorDeDemanda([0.2, 0.25], 0.85)).toBe(0.8)
  })
  it('85% y 50% queda igual', () => {
    expect(factorDeDemanda([0.85, 0.5], 1.2)).toBe(1.2)
  })
  it('con null queda igual', () => {
    expect(factorDeDemanda([null, 0.9], 1.2)).toBe(1.2)
    expect(factorDeDemanda([0.9, null], 1.2)).toBe(1.2)
  })
  it('siempre con 2 decimales', () => {
    expect(factorDeDemanda([0.9, 0.9], 1.07)).toBe(1.23)
    expect(factorDeDemanda([0.1, 0.1], 1.33)).toBe(1.2)
  })
})

describe('push', () => {
  it('con 1.000 dispositivos hay push (22 USD) y el pack lo suma', () => {
    const sin = calcularPrecios(ENTRADA)
    const con = calcularPrecios({ ...ENTRADA, dispositivosPush: 1000 })
    expect(con.push?.precioUsd).toBe(22)
    expect(con.push?.precioArs).toBe(redondeo500(22 * 1530))
    expect(con['pack-lanzamiento']!.precioUsd).toBeGreaterThan(sin['pack-lanzamiento']!.precioUsd)
    expect(con['plan-mensual']!.precioUsd).toBeGreaterThan(sin['plan-mensual']!.precioUsd)
  })
  it('con 0 dispositivos no hay push', () => {
    expect(calcularPrecios({ ...ENTRADA, dispositivosPush: 0 }).push).toBeUndefined()
  })
})

describe('invariantes', () => {
  it('el fundador nunca supera la lista; los ARS son múltiplos de 500 y mayores que 0', () => {
    for (const tramoRef of [500, 1000, 5000, 20000, 50000, 100000]) {
      for (const tipoCambio of [900, 1530, 3000]) {
        const precios = calcularPrecios({ ...ENTRADA, tramoRef, tipoCambio, dispositivosPush: 2500 })
        for (const p of Object.values(precios)) {
          expect(p.precioFundadorArs).toBeLessThanOrEqual(p.precioArs)
          expect(p.precioArs % 500).toBe(0)
          expect(p.precioFundadorArs % 500).toBe(0)
          expect(p.precioArs).toBeGreaterThan(0)
          expect(p.precioFundadorArs).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('PRODUCTOS_CON_PRECIO', () => {
  it('son los id de TARIFARIO sin basica', () => {
    expect([...PRODUCTOS_CON_PRECIO].sort()).toEqual(TARIFARIO.map((p) => p.id).filter((id) => id !== 'basica').sort())
  })
  it('son los de ad_prices_producto_check de la migración de la R58', () => {
    const ruta = fileURLToPath(
      new URL('../../../../supabase/migrations/20261019120000_r58_precios_publicidad.sql', import.meta.url),
    )
    const sql = readFileSync(ruta, 'utf8')
    const m = /ad_prices_producto_check check \(\s*producto in \(([^)]*)\)/.exec(sql)
    expect(m).not.toBeNull()
    const ids = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect([...PRODUCTOS_CON_PRECIO].sort()).toEqual(ids.sort())
  })
})
