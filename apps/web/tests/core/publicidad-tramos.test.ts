import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { aplicarHisteresis, tramoDeAudiencia, umbralDeTramo } from '@qps/core/publicidad/tramos'
import { armarPropuesta, sumarUnMes } from '@qps/core/publicidad/formula'

const ARCHIVOS = ['formula', 'tramos', 'reporte', 'bajas']

describe('tramoDeAudiencia', () => {
  it.each([
    [0, 500],
    [749, 500],
    [750, 1000],
    [2499, 1000],
    [2500, 5000],
    [9999, 5000],
    [10000, 20000],
    [34999, 20000],
    [35000, 50000],
    [59999, 50000],
    [60000, 75000],
    [85000, 100000],
  ])('audiencia %i -> tramo %i', (audiencia, tramo) => {
    expect(tramoDeAudiencia(audiencia)).toBe(tramo)
  })

  it('una audiencia negativa o no finita cuenta como 0', () => {
    expect(tramoDeAudiencia(-10)).toBe(500)
    expect(tramoDeAudiencia(Number.NaN)).toBe(500)
    expect(tramoDeAudiencia(Number.POSITIVE_INFINITY)).toBe(500)
  })
})

describe('umbralDeTramo', () => {
  it('es la audiencia desde la que empieza el tramo', () => {
    expect(umbralDeTramo(500)).toBe(0)
    expect(umbralDeTramo(1000)).toBe(750)
    expect(umbralDeTramo(5000)).toBe(2500)
    expect(umbralDeTramo(20000)).toBe(10000)
    expect(umbralDeTramo(50000)).toBe(35000)
    expect(umbralDeTramo(75000)).toBe(60000)
    expect(umbralDeTramo(100000)).toBe(85000)
  })
})

describe('aplicarHisteresis', () => {
  it('sube con dos ciclos por encima y anuncia el cambio sin aplicarlo', () => {
    const r = aplicarHisteresis({
      vigente: 500,
      calculadoAnterior: 1000,
      calculadoActual: 1000,
      audienciaActual: 900,
      audienciaAnterior: 800,
    })
    expect(r.tramo).toBe(500)
    expect(r.cambioAnunciado).toEqual({ tramoNuevo: 1000 })
  })

  it('no sube con un solo ciclo por encima', () => {
    const r = aplicarHisteresis({
      vigente: 500,
      calculadoAnterior: 500,
      calculadoActual: 1000,
      audienciaActual: 900,
      audienciaAnterior: 600,
    })
    expect(r).toEqual({ tramo: 500, cambioAnunciado: null })
  })

  it('el tramo nuevo sale de la menor de las dos audiencias', () => {
    const r = aplicarHisteresis({
      vigente: 500,
      calculadoAnterior: 5000,
      calculadoActual: 5000,
      audienciaActual: 3000,
      audienciaAnterior: 800,
    })
    expect(r.cambioAnunciado).toEqual({ tramoNuevo: 1000 })
  })

  it('baja con dos ciclos por debajo del 85% del umbral', () => {
    // Vigente 1000 (umbral 750): 85% = 637,5.
    const r = aplicarHisteresis({
      vigente: 1000,
      calculadoAnterior: 500,
      calculadoActual: 500,
      audienciaActual: 600,
      audienciaAnterior: 620,
    })
    expect(r.tramo).toBe(1000)
    expect(r.cambioAnunciado).toEqual({ tramoNuevo: 500 })
  })

  it('no baja con un solo ciclo por debajo', () => {
    const r = aplicarHisteresis({
      vigente: 1000,
      calculadoAnterior: 1000,
      calculadoActual: 500,
      audienciaActual: 600,
      audienciaAnterior: 800,
    })
    expect(r).toEqual({ tramo: 1000, cambioAnunciado: null })
  })

  it('no baja con el 90% del umbral', () => {
    const r = aplicarHisteresis({
      vigente: 1000,
      calculadoAnterior: 500,
      calculadoActual: 500,
      audienciaActual: 675,
      audienciaAnterior: 675,
    })
    expect(r.cambioAnunciado).toBeNull()
  })

  it('el tramo de 500 nunca baja', () => {
    const r = aplicarHisteresis({
      vigente: 500,
      calculadoAnterior: 500,
      calculadoActual: 500,
      audienciaActual: 0,
      audienciaAnterior: 0,
    })
    expect(r).toEqual({ tramo: 500, cambioAnunciado: null })
  })

  it('sin ciclo anterior nunca hay cambio', () => {
    const r = aplicarHisteresis({
      vigente: 500,
      calculadoAnterior: 5000,
      calculadoActual: 5000,
      audienciaActual: 4000,
      audienciaAnterior: null,
    })
    expect(r).toEqual({ tramo: 500, cambioAnunciado: null })
  })
})

describe('armarPropuesta y los tramos', () => {
  const base = {
    dispositivosPush: null,
    fuenteAudiencia: 'vercel' as const,
    tipoCambio: 1530,
    fuenteTipoCambio: 'bna',
    ocupacionHero: [null, null] as [null, null],
    ocupacionPush: [null, null] as [null, null],
  }

  it('el ciclo con cambioTramoDesde igual al ciclo aplica el tramo anunciado', () => {
    const p = armarPropuesta({
      ...base,
      ciclo: '2026-12-01',
      audienciaWeb28d: 900,
      mauApp28d: null,
      anterior: {
        ciclo: '2026-11-01',
        audiencia: 900,
        tramoVigente: 500,
        tramoCalculado: 1000,
        cambioTramoDesde: '2026-12-01',
        factorHero: 1,
        factorPush: 1,
        precios: {},
      },
    })
    expect(p.ciclo.tramo_vigente).toBe(1000)
    expect(p.precios.every((f) => f.tramo_ref === 1000)).toBe(true)
    expect(p.ciclo.cambio_tramo_desde).toBeNull()
  })

  it('un cambio anunciado para un mes que nunca se aprobó (cambioTramoDesde anterior al ciclo) no se pierde', () => {
    const p = armarPropuesta({
      ...base,
      ciclo: '2027-01-01',
      audienciaWeb28d: 900,
      mauApp28d: null,
      anterior: {
        ciclo: '2026-11-01',
        audiencia: 900,
        tramoVigente: 500,
        tramoCalculado: 1000,
        cambioTramoDesde: '2026-12-01',
        factorHero: 1,
        factorPush: 1,
        precios: {},
      },
    })
    expect(p.ciclo.tramo_vigente).toBe(1000)
    expect(p.precios.every((f) => f.tramo_ref === 1000)).toBe(true)
  })

  it('un cambio anunciado para un ciclo futuro no se aplica todavía', () => {
    const p = armarPropuesta({
      ...base,
      ciclo: '2026-12-01',
      audienciaWeb28d: 900,
      mauApp28d: null,
      anterior: {
        ciclo: '2026-11-01',
        audiencia: 900,
        tramoVigente: 500,
        tramoCalculado: 1000,
        cambioTramoDesde: '2027-01-01',
        factorHero: 1,
        factorPush: 1,
        precios: {},
      },
    })
    expect(p.ciclo.tramo_vigente).toBe(500)
  })

  it('un cambio anunciado deja el vigente, guarda el nuevo y fija la fecha (diciembre -> enero)', () => {
    const p = armarPropuesta({
      ...base,
      ciclo: '2026-12-01',
      audienciaWeb28d: 900,
      mauApp28d: null,
      anterior: {
        ciclo: '2026-11-01',
        audiencia: 850,
        tramoVigente: 500,
        tramoCalculado: 1000,
        cambioTramoDesde: null,
        factorHero: 1,
        factorPush: 1,
        precios: {},
      },
    })
    expect(p.ciclo.tramo_vigente).toBe(500)
    expect(p.ciclo.tramo_calculado).toBe(1000)
    expect(p.ciclo.cambio_tramo_desde).toBe('2027-01-01')
  })

  it('sumarUnMes pasa de diciembre a enero del año siguiente', () => {
    expect(sumarUnMes('2026-12-01')).toBe('2027-01-01')
    expect(sumarUnMes('2026-11-01')).toBe('2026-12-01')
  })

  it('suma la audiencia web y el 80% de los MAU de la app', () => {
    const p = armarPropuesta({ ...base, ciclo: '2026-11-01', audienciaWeb28d: 100, mauApp28d: 51, anterior: null })
    expect(p.ciclo.audiencia).toBe(141)
  })
})

describe('pureza', () => {
  it('ningún archivo llama Date.now() ni new Date() sin argumento', () => {
    for (const nombre of ARCHIVOS) {
      const ruta = fileURLToPath(new URL(`../../../../packages/core/src/publicidad/${nombre}.ts`, import.meta.url))
      const texto = readFileSync(ruta, 'utf8')
      expect(texto, nombre).not.toMatch(/Date\.now\s*\(/)
      expect(texto, nombre).not.toMatch(/new Date\s*\(\s*\)/)
    }
  })
})
