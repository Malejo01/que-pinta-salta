import { describe, expect, it } from 'vitest'
import {
  enlacesEnTexto,
  esSugerenciaDeEnlace,
  lecturasDeEvento,
  leerEnlaceMaps,
  propuestaPorEnlaces,
  textoSugerenciaEnlace,
  type LecturaEnlaceMaps,
} from '@/lib/venues/geocodificacion/enlaces-maps'
import { columnasSugerenciaEnlace, lecturasPorLugarCanonico } from '@/lib/venues/geocodificacion/enlaces-eventos'
import { ZONA_SALTA_CAPITAL } from '@/lib/venues/geocodificacion/localidades'
import { MAX_TEXTO_SUGERENCIA } from '@/lib/venues/geocodificacion/sugerencia'

// Coordenadas inventadas dentro de Salta Capital (plaza 9 de Julio, aprox.).
const LAT = -24.7889
const LNG = -65.4106

describe('leerEnlaceMaps: formas con pin (confianza alta posible)', () => {
  it.each([
    [`https://www.google.com/maps/place/Teatro+de+Prueba/@-24.79,-65.41,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d${LAT}!4d${LNG}!16s`],
    [`https://www.google.com.ar/maps/place/Lugar/data=!4m2!3m1!1s0x0!3d${LAT}!4d${LNG}`],
    [`https://maps.google.com/?q=${LAT},${LNG}`],
    [`https://www.google.com/maps?q=loc:${LAT},${LNG}`],
    [`https://www.google.com/maps/search/?api=1&query=${LAT}%2C${LNG}`],
    [`https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}`],
    [`https://www.google.com/maps/place/${LAT},${LNG}`],
    [`https://www.google.com/maps/search/${LAT},+${LNG}`],
  ])('%s', (enlace) => {
    expect(leerEnlaceMaps(enlace)).toMatchObject({ tipo: 'coordenadas', lat: LAT, lng: LNG, precision: 'pin' })
  })

  it('en un link de place, el pin (!3d!4d) gana sobre el centro del mapa (@)', () => {
    const lectura = leerEnlaceMaps(`https://www.google.com/maps/place/X/@-24.70,-65.30,15z/data=!3d${LAT}!4d${LNG}`)
    expect(lectura).toMatchObject({ lat: LAT, lng: LNG, precision: 'pin' })
  })
})

describe('leerEnlaceMaps: formas que son solo el centro del mapa', () => {
  it.each([
    [`https://www.google.com/maps/@${LAT},${LNG},17z`],
    [`https://www.google.com/maps/place/Teatro+de+Prueba/@${LAT},${LNG},17z`],
    [`https://maps.google.com/maps?ll=${LAT},${LNG}&z=16`],
  ])('%s', (enlace) => {
    expect(leerEnlaceMaps(enlace)).toMatchObject({ tipo: 'coordenadas', lat: LAT, lng: LNG, precision: 'centro' })
  })
})

describe('leerEnlaceMaps: lo que no da coordenadas', () => {
  it('un place con nombre y sin coordenadas: el nombre', () => {
    expect(leerEnlaceMaps('https://www.google.com/maps/place/Teatro+de+Prueba+Salta')).toEqual({
      tipo: 'lugar',
      nombre: 'Teatro de Prueba Salta',
      enlace: 'https://www.google.com/maps/place/Teatro+de+Prueba+Salta',
    })
    expect(leerEnlaceMaps('https://maps.google.com/?q=Teatro%20de%20Prueba')).toMatchObject({ tipo: 'lugar', nombre: 'Teatro de Prueba' })
  })

  it('los links cortos no se resuelven (sería pedirle a Google)', () => {
    expect(leerEnlaceMaps('https://maps.app.goo.gl/AbCdEf123')).toEqual({ tipo: 'corto', enlace: 'https://maps.app.goo.gl/AbCdEf123' })
    expect(leerEnlaceMaps('https://goo.gl/maps/AbCdEf123')).toMatchObject({ tipo: 'corto' })
  })

  it.each([
    ['https://www.google.com/search?q=-24.78,-65.41'],
    ['https://www.openstreetmap.org/?mlat=-24.78&mlon=-65.41'],
    ['https://www.notgoogle.com/maps?q=-24.78,-65.41'],
    ['https://google.com.evil.example/maps?q=-24.78,-65.41'],
    ['https://www.google.com/maps?q=-124.78,-65.41'],
    ['javascript:alert(1)'],
    ['no es un link'],
    ['https://www.instagram.com/p/abc/'],
  ])('%s: null', (enlace) => {
    expect(leerEnlaceMaps(enlace)).toBeNull()
  })
})

describe('enlacesEnTexto', () => {
  it('saca los links de un texto libre, sin puntuación pegada y sin repetir', () => {
    const texto = `Te esperamos! Ubicación: https://maps.app.goo.gl/AbC. Entradas en https://ticketera.example/e/1, y otra vez https://maps.app.goo.gl/AbC`
    expect(enlacesEnTexto(texto)).toEqual(['https://maps.app.goo.gl/AbC', 'https://ticketera.example/e/1'])
  })

  it('null, vacío o sin links: lista vacía', () => {
    expect(enlacesEnTexto(null)).toEqual([])
    expect(enlacesEnTexto('')).toEqual([])
    expect(enlacesEnTexto('sin links acá')).toEqual([])
  })
})

describe('lecturasDeEvento', () => {
  it('mira ticket_url, ticket_sources (cualquier forma) y la descripción', () => {
    const lecturas = lecturasDeEvento({
      id: 'e1',
      venue_id: 'v1',
      ticket_url: `https://www.google.com/maps?q=${LAT},${LNG}`,
      ticket_sources: [{ source: 'instagram-ai', url: 'https://maps.app.goo.gl/XyZ' }],
      description: `Cómo llegar: https://www.google.com/maps/@${LAT},${LNG},17z`,
    })
    expect(lecturas.map((l) => l.tipo)).toEqual(['coordenadas', 'corto', 'coordenadas'])
  })

  it('un evento sin links de Maps: ninguna lectura', () => {
    expect(lecturasDeEvento({ id: 'e1', venue_id: 'v1', ticket_url: 'https://ticketera.example/1', description: 'Show', ticket_sources: null })).toEqual([])
  })
})

function pin(lat: number, lng: number): LecturaEnlaceMaps {
  return { tipo: 'coordenadas', lat, lng, precision: 'pin', enlace: `https://www.google.com/maps?q=${lat},${lng}` }
}

describe('propuestaPorEnlaces', () => {
  it('un pin en la ciudad: confianza alta', () => {
    expect(propuestaPorEnlaces([pin(LAT, LNG)], ZONA_SALTA_CAPITAL)).toMatchObject({ confianza: 'alta', lat: LAT, lng: LNG, links: 1 })
  })

  it('dos pines que coinciden (< 300 m): alta, y cuenta los dos', () => {
    expect(propuestaPorEnlaces([pin(LAT, LNG), pin(LAT + 0.001, LNG)], ZONA_SALTA_CAPITAL)).toMatchObject({ confianza: 'alta', links: 2 })
  })

  it('dos pines que no coinciden: revisar', () => {
    expect(propuestaPorEnlaces([pin(LAT, LNG), pin(-24.75, -65.45)], ZONA_SALTA_CAPITAL)).toMatchObject({
      confianza: 'revisar',
      motivo: 'los links de los eventos marcan puntos distintos',
    })
  })

  it('un pin en la provincia pero fuera de la ciudad: revisar', () => {
    expect(propuestaPorEnlaces([pin(-26.07, -65.97)], ZONA_SALTA_CAPITAL)).toMatchObject({ confianza: 'revisar' })
  })

  it('solo el centro del mapa: revisar', () => {
    const centro: LecturaEnlaceMaps = { tipo: 'coordenadas', lat: LAT, lng: LNG, precision: 'centro', enlace: 'x' }
    expect(propuestaPorEnlaces([centro], ZONA_SALTA_CAPITAL)).toMatchObject({ confianza: 'revisar', motivo: 'el link solo trae el centro del mapa' })
  })

  it('fuera de la provincia, un nombre o un link corto: sin propuesta', () => {
    expect(propuestaPorEnlaces([pin(-34.6, -58.38)], ZONA_SALTA_CAPITAL)).toBeNull()
    expect(propuestaPorEnlaces([{ tipo: 'lugar', nombre: 'X', enlace: 'x' }, { tipo: 'corto', enlace: 'y' }], ZONA_SALTA_CAPITAL)).toBeNull()
    expect(propuestaPorEnlaces([], ZONA_SALTA_CAPITAL)).toBeNull()
  })
})

describe('sugerencia por link', () => {
  it('el texto se reconoce como de link, entra en el check de largo y nunca toca latitude/longitude', () => {
    const columnas = columnasSugerenciaEnlace({ lat: LAT, lng: LNG, links: 2 }, new Date('2026-11-15T12:00:00Z'))
    expect(columnas).toEqual({
      geocode_sugerencia_lat: LAT,
      geocode_sugerencia_lng: LNG,
      geocode_sugerencia_texto: 'Link de Google Maps de un evento (confianza alta, 2 links coinciden)',
      geocode_sugerencia_at: '2026-11-15T12:00:00.000Z',
    })
    expect(Object.keys(columnas)).not.toContain('latitude')
    expect(esSugerenciaDeEnlace(columnas.geocode_sugerencia_texto)).toBe(true)
    expect(textoSugerenciaEnlace(1).length).toBeLessThanOrEqual(MAX_TEXTO_SUGERENCIA)
  })

  it('una sugerencia de Nominatim no se confunde con una de link', () => {
    expect(esSugerenciaDeEnlace('Teatro de Prueba, Zuviría, Salta, Argentina')).toBe(false)
    expect(esSugerenciaDeEnlace(null)).toBe(false)
  })
})

describe('lecturasPorLugarCanonico', () => {
  it('los eventos de un alias fusionado suman a su canónico; los sin lugar no cuentan', () => {
    const venues = [
      { id: 'canonico', canonical_venue_id: null },
      { id: 'alias', canonical_venue_id: 'canonico' },
    ]
    const eventos = [
      { id: 'e1', venue_id: 'alias', ticket_url: `https://www.google.com/maps?q=${LAT},${LNG}`, description: null },
      { id: 'e2', venue_id: 'canonico', ticket_url: null, description: `https://www.google.com/maps/place/${LAT},${LNG}` },
      { id: 'e3', venue_id: null, ticket_url: `https://www.google.com/maps?q=${LAT},${LNG}`, description: null },
    ]
    const porLugar = lecturasPorLugarCanonico(eventos, venues)
    expect([...porLugar.keys()]).toEqual(['canonico'])
    expect(porLugar.get('canonico')).toHaveLength(2)
  })
})
