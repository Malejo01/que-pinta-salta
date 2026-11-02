import { describe, expect, it } from 'vitest'
import { coberturaDelMapa, textoCoberturaMapa } from '@/lib/admin/cobertura-mapa'

const venue = (latitude: unknown, longitude: unknown) => ({ id: 'v', name: 'Lugar', address: 'Calle 1', latitude, longitude })

describe('coberturaDelMapa', () => {
  it('cuenta coordenadas en Salta, también las que llegan como texto', () => {
    const c = coberturaDelMapa([{ venue: venue(-24.78, -65.41) }, { venue: venue('-24.78', '-65.41') }])
    expect(c).toEqual({ conUbicacion: 2, total: 2, porcentaje: 100 })
  })

  it('no cuenta coordenadas fuera de Salta', () => {
    const c = coberturaDelMapa([{ venue: venue(-34.6, -58.4) }, { venue: venue(-24.78, -65.41) }])
    expect(c.conUbicacion).toBe(1)
    expect(c.total).toBe(2)
  })

  it('no cuenta eventos sin lugar ni con coordenadas vacías', () => {
    const c = coberturaDelMapa([{ venue: null }, {}, { venue: venue(null, null) }, { venue: venue('', '') }])
    expect(c).toEqual({ conUbicacion: 0, total: 4, porcentaje: 0 })
  })

  it('con M = 0 no divide', () => {
    const c = coberturaDelMapa([])
    expect(c.porcentaje).toBeNull()
    expect(textoCoberturaMapa(c)).toBe('Sin eventos próximos')
  })

  it('redondea el porcentaje a entero', () => {
    const buenos = [{ venue: venue(-24.78, -65.41) }]
    const malos = [{ venue: null }, { venue: null }]
    const c = coberturaDelMapa([...buenos, ...malos])
    expect(c.porcentaje).toBe(33)
    expect(textoCoberturaMapa(c)).toBe('1 de 3 eventos próximos con ubicación (33 %)')
    expect(coberturaDelMapa([...buenos, ...buenos, ...malos.slice(0, 1)]).porcentaje).toBe(67)
  })
})
