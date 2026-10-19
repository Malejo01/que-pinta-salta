import { describe, expect, it } from 'vitest'
import { CONTACTO_EMAIL } from '@qps/core/contacto'
import {
  consultasParaLugar,
  direccionUtil,
  normalizarConsulta,
  REFERER,
  urlDeBusqueda,
  USER_AGENT,
  URL_POLITICA,
} from '@/lib/venues/geocodificacion/consultas'

describe('normalizarConsulta', () => {
  it('minúsculas, sin tildes, espacios colapsados y recortados', () => {
    expect(normalizarConsulta('  Güemes   Norte  ')).toBe('guemes norte')
  })

  it('no toca la puntuación (las comas quedan)', () => {
    expect(normalizarConsulta('Balcarce, Salta, Argentina')).toBe('balcarce, salta, argentina')
  })
})

describe('direccionUtil', () => {
  it('false si la dirección está vacía, null o solo espacios', () => {
    expect(direccionUtil('', 'La Casona')).toBe(false)
    expect(direccionUtil(null, 'La Casona')).toBe(false)
    expect(direccionUtil(undefined, 'La Casona')).toBe(false)
    expect(direccionUtil('   ', 'La Casona')).toBe(false)
  })

  it('false si la dirección normalizada es igual al nombre normalizado', () => {
    expect(direccionUtil('La Casona', 'La Casona')).toBe(false)
    expect(direccionUtil('la casona', 'La Casona')).toBe(false)
  })

  for (const placeholder of ['Salta', 'Salta Capital', 'A confirmar', 'Sin dirección', 'SALTA', '  salta  ']) {
    it(`false para el placeholder "${placeholder}"`, () => {
      expect(direccionUtil(placeholder, 'La Casona')).toBe(false)
    })
  }

  it('true con una dirección real', () => {
    expect(direccionUtil('Balcarce 123', 'La Casona')).toBe(true)
  })
})

describe('consultasParaLugar', () => {
  it('con dirección útil: las 3 consultas, en orden', () => {
    const consultas = consultasParaLugar({ nombre: 'La Casona', direccion: 'Balcarce 123' })
    expect(consultas).toEqual([
      'La Casona, Balcarce 123, Salta, Argentina',
      'Balcarce 123, Salta, Argentina',
      'La Casona, Salta, Argentina',
    ])
  })

  it('sin dirección útil (placeholder): solo la consulta por nombre', () => {
    expect(consultasParaLugar({ nombre: 'La Casona', direccion: 'Salta' })).toEqual(['La Casona, Salta, Argentina'])
  })

  it('sin dirección (undefined): solo la consulta por nombre', () => {
    expect(consultasParaLugar({ nombre: 'La Casona' })).toEqual(['La Casona, Salta, Argentina'])
  })

  it('dirección igual al nombre: se saltea, queda solo la consulta por nombre', () => {
    expect(consultasParaLugar({ nombre: 'La Casona', direccion: 'La Casona' })).toEqual(['La Casona, Salta, Argentina'])
  })

  it('nunca hay dos consultas que normalicen igual, y nunca son más de 3', () => {
    for (const caso of [
      { nombre: 'La Casona', direccion: 'Balcarce 123' },
      { nombre: 'La Casona', direccion: 'Salta, Argentina' },
      { nombre: 'La Casona', direccion: 'Salta' },
      { nombre: 'La Casona' },
    ]) {
      const consultas = consultasParaLugar(caso)
      expect(consultas.length).toBeLessThanOrEqual(3)
      const normalizadas = consultas.map((c) => normalizarConsulta(c))
      expect(new Set(normalizadas).size).toBe(consultas.length)
    }
  })
})

describe('urlDeBusqueda', () => {
  const url = new URL(urlDeBusqueda('La Casona, Salta, Argentina', { email: 'alguien@ejemplo.com' }))

  it('apunta a nominatim.openstreetmap.org/search', () => {
    expect(url.hostname).toBe('nominatim.openstreetmap.org')
    expect(url.pathname).toBe('/search')
  })

  it('tiene format=jsonv2, countrycodes=ar y bounded=1', () => {
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('countrycodes')).toBe('ar')
    expect(url.searchParams.get('bounded')).toBe('1')
  })

  it('el viewbox va en el orden lngMin,latMax,lngMax,latMin', () => {
    expect(url.searchParams.get('viewbox')).toBe('-68.7,-21.8,-62.2,-26.6')
  })

  it('manda el email que se le pasa', () => {
    expect(url.searchParams.get('email')).toBe('alguien@ejemplo.com')
  })

  it('manda q, limit=3, addressdetails=1 y accept-language=es', () => {
    expect(url.searchParams.get('q')).toBe('La Casona, Salta, Argentina')
    expect(url.searchParams.get('limit')).toBe('3')
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('accept-language')).toBe('es')
  })
})

describe('USER_AGENT, REFERER y URL_POLITICA', () => {
  it('el User-Agent trae el sitio y el contacto (no es el de una biblioteca)', () => {
    expect(USER_AGENT).toContain('QuePintaSalta')
    expect(USER_AGENT).toContain('quepintasalta.com.ar')
    expect(USER_AGENT).toContain(CONTACTO_EMAIL)
    expect(USER_AGENT.toLowerCase()).not.toContain('node-fetch')
    expect(USER_AGENT.toLowerCase()).not.toContain('axios')
    expect(USER_AGENT.toLowerCase()).not.toContain('undici')
  })

  it('REFERER es el sitio, URL_POLITICA es la política de Nominatim', () => {
    expect(REFERER).toBe('https://www.quepintasalta.com.ar')
    expect(URL_POLITICA).toBe('https://operations.osmfoundation.org/policies/nominatim/')
  })
})
