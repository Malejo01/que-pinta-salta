import { describe, expect, it } from 'vitest'
import { ZONA_SALTA } from '@qps/core/mapa/zona'
import {
  enZona,
  LOCALIDADES_DEL_INTERIOR,
  localidadDelLugar,
  SALTA_CAPITAL,
  ZONA_SALTA_CAPITAL,
} from '@/lib/venues/geocodificacion/localidades'

describe('ZONA_SALTA_CAPITAL', () => {
  it('es el rectángulo documentado', () => {
    expect(ZONA_SALTA_CAPITAL).toEqual({ lngMin: -65.5, lngMax: -65.33, latMin: -24.86, latMax: -24.7 })
  })

  it('está adentro de la provincia', () => {
    expect(enZona(ZONA_SALTA, ZONA_SALTA_CAPITAL.latMin, ZONA_SALTA_CAPITAL.lngMin)).toBe(true)
    expect(enZona(ZONA_SALTA, ZONA_SALTA_CAPITAL.latMax, ZONA_SALTA_CAPITAL.lngMax)).toBe(true)
  })
})

describe('enZona', () => {
  it('la plaza 9 de Julio (aprox.) está en la capital; Tartagal y Cafayate, no', () => {
    expect(enZona(ZONA_SALTA_CAPITAL, -24.7883, -65.4106)).toBe(true)
    expect(enZona(ZONA_SALTA_CAPITAL, -22.52, -63.8)).toBe(false)
    expect(enZona(ZONA_SALTA_CAPITAL, -26.07, -65.97)).toBe(false)
  })

  it('los bordes cuentan como adentro; un pelito afuera no', () => {
    expect(enZona(ZONA_SALTA_CAPITAL, -24.86, -65.5)).toBe(true)
    expect(enZona(ZONA_SALTA_CAPITAL, -24.7, -65.33)).toBe(true)
    expect(enZona(ZONA_SALTA_CAPITAL, -24.8601, -65.4)).toBe(false)
    expect(enZona(ZONA_SALTA_CAPITAL, -24.8, -65.3299)).toBe(false)
  })
})

describe('localidadDelLugar', () => {
  it('por defecto: Salta Capital', () => {
    expect(localidadDelLugar({ nombre: 'Lugar de Prueba' })).toBe(SALTA_CAPITAL)
    expect(localidadDelLugar({ nombre: 'Lugar de Prueba', direccion: 'Balcarce 123' })).toBe(SALTA_CAPITAL)
    expect(localidadDelLugar({ nombre: 'Lugar de Prueba', direccion: null })).toBe(SALTA_CAPITAL)
  })

  it('"Museo Arqueológico de Cachi" -> Cachi', () => {
    expect(localidadDelLugar({ nombre: 'Museo Arqueológico de Cachi' }).nombre).toBe('Cachi')
  })

  it('"Campo Municipal de Deportes, Oran, Argentina" -> Orán (sin tilde en la entrada)', () => {
    const l = localidadDelLugar({ nombre: 'Campo Municipal de Deportes', direccion: 'Oran, Argentina' })
    expect(l.nombre).toBe('Orán')
    expect(l.ciudad).toBe('San Ramón de la Nueva Orán')
    expect(localidadDelLugar({ nombre: 'Campo Municipal de Deportes, Oran, Argentina' }).nombre).toBe('Orán')
  })

  it('la dirección también señala la localidad, con tilde o sin ella, en cualquier mayúscula', () => {
    expect(localidadDelLugar({ nombre: 'Club de Prueba', direccion: 'Calle Falsa 1, ORÁN' }).nombre).toBe('Orán')
    expect(localidadDelLugar({ nombre: 'Club de Prueba', direccion: 'Calle Falsa 1, Metán' }).nombre).toBe('Metán')
    expect(localidadDelLugar({ nombre: 'Club de Prueba', direccion: 'Calle Falsa 1, Cafayate' }).nombre).toBe('Cafayate')
  })

  it('"Boliche Gauchos de Guemes" y "La Güemesiana" siguen en la capital', () => {
    expect(localidadDelLugar({ nombre: 'Boliche Gauchos de Guemes' })).toBe(SALTA_CAPITAL)
    expect(localidadDelLugar({ nombre: 'La Güemesiana' })).toBe(SALTA_CAPITAL)
  })

  it('palabra entera: "cachivache" no es Cachi', () => {
    expect(localidadDelLugar({ nombre: 'Cachivache' })).toBe(SALTA_CAPITAL)
    expect(localidadDelLugar({ nombre: 'Bar Cachivache', direccion: 'Calle 1' })).toBe(SALTA_CAPITAL)
  })

  it('otras palabras que contienen un nombre de pueblo tampoco cuentan', () => {
    expect(localidadDelLugar({ nombre: 'Metanol Bar' })).toBe(SALTA_CAPITAL)
    expect(localidadDelLugar({ nombre: 'Cerrillosa' })).toBe(SALTA_CAPITAL)
  })

  it('nombres de varias palabras ("Rosario de la Frontera", "San Antonio de los Cobres")', () => {
    expect(localidadDelLugar({ nombre: 'Teatro de Rosario de la Frontera' }).nombre).toBe('Rosario de la Frontera')
    expect(localidadDelLugar({ nombre: 'Plaza', direccion: 'San Antonio de los Cobres' }).nombre).toBe('San Antonio de los Cobres')
  })

  it('"Guemes", "San Lorenzo" y "Vaqueros" no están entre las localidades (también son calles o barrios de la capital)', () => {
    const menciones = LOCALIDADES_DEL_INTERIOR.flatMap((l) => l.menciones)
    for (const m of ['guemes', 'san lorenzo', 'vaqueros', 'molinos', 'la vina']) expect(menciones).not.toContain(m)
  })
})

describe('LOCALIDADES_DEL_INTERIOR', () => {
  it('cada zona es un rectángulo válido con su centro adentro de la provincia', () => {
    for (const l of LOCALIDADES_DEL_INTERIOR) {
      expect(l.zona.latMin, l.nombre).toBeLessThan(l.zona.latMax)
      expect(l.zona.lngMin, l.nombre).toBeLessThan(l.zona.lngMax)
      expect(enZona(ZONA_SALTA, (l.zona.latMin + l.zona.latMax) / 2, (l.zona.lngMin + l.zona.lngMax) / 2), l.nombre).toBe(true)
    }
  })

  it('las menciones están normalizadas (minúsculas, sin tildes)', () => {
    for (const l of LOCALIDADES_DEL_INTERIOR) {
      for (const m of l.menciones) {
        expect(m, l.nombre).toBe(m.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
      }
    }
  })
})
