import { describe, expect, it } from 'vitest'
import { CENTRO_SALTA_CAPITAL, coordenadasEnSalta, ZONA_SALTA } from '@qps/core/mapa/zona'

describe('coordenadasEnSalta', () => {
  it('el centro de Salta capital cae adentro de la zona', () => {
    expect(coordenadasEnSalta(CENTRO_SALTA_CAPITAL.lat, CENTRO_SALTA_CAPITAL.lng)).toBe(true)
  })

  it('las cuatro esquinas del rectángulo cuentan como adentro (bordes inclusive)', () => {
    expect(coordenadasEnSalta(ZONA_SALTA.latMin, ZONA_SALTA.lngMin)).toBe(true)
    expect(coordenadasEnSalta(ZONA_SALTA.latMax, ZONA_SALTA.lngMax)).toBe(true)
  })

  it('afuera de la zona: Buenos Aires', () => {
    expect(coordenadasEnSalta(-34.6037, -58.3816)).toBe(false)
  })

  it('apenas afuera de cada borde', () => {
    expect(coordenadasEnSalta(ZONA_SALTA.latMin - 0.001, CENTRO_SALTA_CAPITAL.lng)).toBe(false)
    expect(coordenadasEnSalta(ZONA_SALTA.latMax + 0.001, CENTRO_SALTA_CAPITAL.lng)).toBe(false)
    expect(coordenadasEnSalta(CENTRO_SALTA_CAPITAL.lat, ZONA_SALTA.lngMin - 0.001)).toBe(false)
    expect(coordenadasEnSalta(CENTRO_SALTA_CAPITAL.lat, ZONA_SALTA.lngMax + 0.001)).toBe(false)
  })

  it('NaN en cualquiera de las dos: false', () => {
    expect(coordenadasEnSalta(Number.NaN, CENTRO_SALTA_CAPITAL.lng)).toBe(false)
    expect(coordenadasEnSalta(CENTRO_SALTA_CAPITAL.lat, Number.NaN)).toBe(false)
  })

  it('strings (ni se intentan convertir): false', () => {
    expect(coordenadasEnSalta('-24.7883', '-65.4106')).toBe(false)
  })

  it('(0, 0) está lejísimos de Salta: false', () => {
    expect(coordenadasEnSalta(0, 0)).toBe(false)
  })

  it('undefined / null: false', () => {
    expect(coordenadasEnSalta(undefined, null)).toBe(false)
  })
})
