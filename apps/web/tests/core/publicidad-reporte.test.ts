import { describe, expect, it } from 'vitest'
import {
  FRASE_REFERENCIA_META,
  MEDIANA_CPC_META_ARS,
  comparacionConMeta,
  costoPorClic,
  metricasDeCampania,
  textoCostoPorClic,
  validarMetricasReporte,
} from '@qps/core/publicidad/reporte'

const filas = [
  { day: '2026-11-09', origin: 'web', featured: true, views: 10, clicks: 2 },
  { day: '2026-11-10', origin: 'web', featured: false, views: 100, clicks: 20 },
  { day: '2026-11-11', origin: 'app', featured: true, views: 30, clicks: 4 },
  { day: '2026-11-20', origin: 'web', featured: true, views: 999, clicks: 99 },
  { day: '2026-11-08', origin: 'web', featured: true, views: 999, clicks: 99 },
]
const desde = '2026-11-09T09:00:00-03:00'
const hasta = '2026-11-11T21:00:00-03:00'

describe('metricasDeCampania', () => {
  it("'destacado' cuenta solo featured = true y dentro de los días", () => {
    const m = metricasDeCampania({ filas, tipo: 'destacado', desde, hasta, tramoRef: 500 })
    expect(m.dias).toBe(3)
    expect(m.vistas).toBe(40)
    expect(m.clics).toBe(6)
    expect(m.alcanceEstimado).toBe(Math.round((500 * 0.7 * 3) / 30))
  })
  it("'push' cuenta todas las del evento en esos días", () => {
    const m = metricasDeCampania({ filas, tipo: 'push', desde, hasta, tramoRef: 500 })
    expect(m.vistas).toBe(140)
    expect(m.clics).toBe(26)
  })
  it('usa el día de Salta, no el de UTC', () => {
    // 23:30 en Salta del 11/11 es el 12/11 en UTC.
    const m = metricasDeCampania({
      filas,
      tipo: 'push',
      desde: '2026-11-09T09:00:00-03:00',
      hasta: '2026-11-11T23:30:00-03:00',
      tramoRef: 500,
    })
    expect(m.dias).toBe(3)
  })
})

describe('costo por clic', () => {
  it('con 0 clics: "sin clics todavía" y costoPorClic null', () => {
    expect(textoCostoPorClic(14000, 0)).toBe('sin clics todavía')
    expect(costoPorClic(14000, 0)).toBeNull()
  })
  it('con precio nulo, null', () => {
    expect(costoPorClic(null, 10)).toBeNull()
    expect(costoPorClic(0, 10)).toBeNull()
    expect(textoCostoPorClic(null, 10)).toBeNull()
  })
  it('divide precio por clics', () => {
    expect(costoPorClic(14000, 100)).toBe(140)
    expect(textoCostoPorClic(14000, 100)).toContain('140')
  })
})

describe('comparacionConMeta', () => {
  it('con cpc nulo, null', () => {
    expect(comparacionConMeta(null)).toBeNull()
  })
  it('compara con la mediana de 290', () => {
    expect(MEDIANA_CPC_META_ARS).toBe(290)
    const barato = comparacionConMeta(140)!
    expect(barato.cpcMeta).toBe(290)
    expect(barato.masBarato).toBe(true)
    expect(barato.texto).toContain(FRASE_REFERENCIA_META)
    expect(comparacionConMeta(400)!.masBarato).toBe(false)
  })
})

describe('validarMetricasReporte', () => {
  it('acepta enteros >= 0 en las claves conocidas', () => {
    expect(validarMetricasReporte({ vistas: 10, clics: 0 })).toEqual({ vistas: 10, clics: 0 })
    expect(validarMetricasReporte({})).toEqual({})
  })
  it('acepta lo que devuelve metricasDeCampania más destinatarios y bajas48h del push', () => {
    const m = metricasDeCampania({
      filas,
      tipo: 'push',
      desde: '2026-11-09T12:00:00-03:00',
      hasta: '2026-11-11T12:00:00-03:00',
      tramoRef: 500,
    })
    const metricas = { ...m, destinatarios: 200, bajas48h: 3 }
    expect(validarMetricasReporte(metricas)).toEqual(metricas)
  })
  it('rechaza strings, negativos, decimales y objetos anidados', () => {
    expect(validarMetricasReporte({ vistas: '10' })).toBeNull()
    expect(validarMetricasReporte({ vistas: -1 })).toBeNull()
    expect(validarMetricasReporte({ vistas: 1.5 })).toBeNull()
    expect(validarMetricasReporte({ vistas: { a: 1 } })).toBeNull()
  })
  it('rechaza claves desconocidas y lo que no es un objeto', () => {
    expect(validarMetricasReporte({ otra: 1 })).toBeNull()
    expect(validarMetricasReporte(null)).toBeNull()
    expect(validarMetricasReporte([1])).toBeNull()
    expect(validarMetricasReporte('x')).toBeNull()
  })
})
