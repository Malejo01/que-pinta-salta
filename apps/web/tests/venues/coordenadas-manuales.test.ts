/**
 * `lib/venues/coordenadas-manuales.ts` (R53, tarea 53-c): parseo de lo que
 * un admin pega en /admin/lugares (coordenadas sueltas o un link de
 * OpenStreetMap), y los dos links de OpenStreetMap que arma la página.
 */
import { describe, expect, it } from 'vitest'
import { parsearCoordenadas, urlBuscarEnOsm, urlVerEnOsm } from '@/lib/venues/coordenadas-manuales'

const LAT = -24.7883
const LNG = -65.4106

describe('parsearCoordenadas: los tres formatos de coordenadas sueltas', () => {
  it('separadas por coma', () => {
    expect(parsearCoordenadas('-24.7883, -65.4106')).toEqual({ lat: LAT, lng: LNG })
  })

  it('separadas por punto y coma', () => {
    expect(parsearCoordenadas('-24.7883;-65.4106')).toEqual({ lat: LAT, lng: LNG })
  })

  it('separadas por un espacio', () => {
    expect(parsearCoordenadas('-24.7883 -65.4106')).toEqual({ lat: LAT, lng: LNG })
  })

  it('recorta espacios alrededor', () => {
    expect(parsearCoordenadas('  -24.7883, -65.4106  ')).toEqual({ lat: LAT, lng: LNG })
  })
})

describe('parsearCoordenadas: links de OpenStreetMap', () => {
  it('con #map=<zoom>/<lat>/<lng>', () => {
    expect(parsearCoordenadas('https://www.openstreetmap.org/#map=18/-24.7883/-65.4106')).toEqual({
      lat: LAT,
      lng: LNG,
    })
  })

  it('con ?mlat=&mlon=', () => {
    expect(
      parsearCoordenadas('https://www.openstreetmap.org/?mlat=-24.7883&mlon=-65.4106#map=18/-24.7883/-65.4106'),
    ).toEqual({ lat: LAT, lng: LNG })
  })

  it('con ?mlat=&mlon= sin el hash', () => {
    expect(parsearCoordenadas('https://www.openstreetmap.org/?mlat=-24.7883&mlon=-65.4106')).toEqual({
      lat: LAT,
      lng: LNG,
    })
  })
})

describe('parsearCoordenadas: rechaza lo que no es un formato aceptado', () => {
  it('coma decimal (en vez de punto): no matchea ningún formato', () => {
    const resultado = parsearCoordenadas('-24,7883, -65,4106')
    expect('error' in resultado).toBe(true)
    if ('error' in resultado) {
      expect(resultado.error).toBe('Pegá las coordenadas como -24.7883, -65.4106 o un link de OpenStreetMap')
    }
  })

  it('texto suelto', () => {
    const resultado = parsearCoordenadas('plaza 9 de julio')
    expect('error' in resultado).toBe(true)
    if ('error' in resultado) {
      expect(resultado.error).toBe('Pegá las coordenadas como -24.7883, -65.4106 o un link de OpenStreetMap')
    }
  })

  it('vacío', () => {
    const resultado = parsearCoordenadas('')
    expect('error' in resultado).toBe(true)
  })

  it('solo espacios', () => {
    const resultado = parsearCoordenadas('   ')
    expect('error' in resultado).toBe(true)
  })

  it('no es un string', () => {
    const resultado = parsearCoordenadas(undefined)
    expect('error' in resultado).toBe(true)
  })

  it('una URL que no es de OpenStreetMap ni de Google Maps', () => {
    const resultado = parsearCoordenadas('https://example.com/algun-lugar')
    expect('error' in resultado).toBe(true)
    if ('error' in resultado) {
      expect(resultado.error).toBe('Pegá las coordenadas como -24.7883, -65.4106 o un link de OpenStreetMap')
    }
  })
})

describe('parsearCoordenadas: un link de Google Maps se rechaza con su propio mensaje', () => {
  const MENSAJE_GOOGLE =
    'Los links de Google Maps no se aceptan. Si ya tenés las coordenadas, pegalas como -24.7883, -65.4106.'

  it('maps.google.com', () => {
    const resultado = parsearCoordenadas('https://maps.google.com/?q=-24.7883,-65.4106')
    expect(resultado).toEqual({ error: MENSAJE_GOOGLE })
  })

  it('www.google.com/maps/...', () => {
    const resultado = parsearCoordenadas('https://www.google.com/maps/place/algo/@-24.7883,-65.4106,17z')
    expect(resultado).toEqual({ error: MENSAJE_GOOGLE })
  })

  it('www.google.com.ar/maps/... (el dominio argentino, el más probable)', () => {
    const resultado = parsearCoordenadas('https://www.google.com.ar/maps/@-24.78,-65.41,15z')
    expect(resultado).toEqual({ error: MENSAJE_GOOGLE })
  })

  it('goo.gl/maps/...', () => {
    const resultado = parsearCoordenadas('https://goo.gl/maps/abc123')
    expect(resultado).toEqual({ error: MENSAJE_GOOGLE })
  })

  it('maps.app.goo.gl/...', () => {
    const resultado = parsearCoordenadas('https://maps.app.goo.gl/abc123')
    expect(resultado).toEqual({ error: MENSAJE_GOOGLE })
  })
})

describe('parsearCoordenadas: lat/lng invertidas quedan fuera de la zona de Salta', () => {
  it('rechaza con el mensaje de "fuera de Salta"', () => {
    const resultado = parsearCoordenadas('-65.4106, -24.7883')
    expect(resultado).toEqual({
      error: 'Ese punto queda fuera de Salta: revisá que no estén invertidas la latitud y la longitud.',
    })
  })
})

describe('urlVerEnOsm', () => {
  it('arma el link con zoom 18 y el mismo lat/lng tres veces', () => {
    expect(urlVerEnOsm(LAT, LNG)).toBe(
      `https://www.openstreetmap.org/?mlat=${LAT}&mlon=${LNG}#map=18/${LAT}/${LNG}`,
    )
  })
})

describe('urlBuscarEnOsm', () => {
  it('codifica un nombre con "&" y espacios', () => {
    const resultado = urlBuscarEnOsm('Bar & Resto "El Rincón"', 'Calle Falsa 123')
    expect(resultado).toBe(
      'https://www.openstreetmap.org/search?query=' +
        encodeURIComponent('Bar & Resto "El Rincón", Calle Falsa 123'),
    )
    expect(resultado).not.toContain('&amp;')
    expect(resultado).not.toContain(' ')
  })

  it('sin dirección, usa solo el nombre', () => {
    expect(urlBuscarEnOsm('Plaza 9 de Julio', null)).toBe(
      `https://www.openstreetmap.org/search?query=${encodeURIComponent('Plaza 9 de Julio')}`,
    )
  })
})
