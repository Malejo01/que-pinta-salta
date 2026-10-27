/** Rutas en inglés (Q3): `rutaEn`, `separarIdioma` y `rutaEnOtroIdioma`. Puro, sin red. */
import { describe, expect, it } from 'vitest'
import { RUTAS_EN_INGLES, hrefLangDestino, rutaEn, rutaEnOtroIdioma, separarIdioma } from '@/lib/i18n/rutas'

describe('RUTAS_EN_INGLES', () => {
  it('la portada, /cines y la ficha del evento (/evento/<id>)', () => {
    expect([...RUTAS_EN_INGLES]).toEqual(['/', '/cines', '/evento/*'])
  })
})

describe('rutaEn', () => {
  it('en castellano no toca nada', () => {
    expect(rutaEn('es', '/')).toBe('/')
    expect(rutaEn('es', '/cines?x=1')).toBe('/cines?x=1')
    expect(rutaEn('es', '/mapa')).toBe('/mapa')
  })

  it('la portada en inglés es /en (sin barra final)', () => {
    expect(rutaEn('en', '/')).toBe('/en')
  })

  it('agrega /en a las rutas que existen en inglés', () => {
    expect(rutaEn('en', '/cines')).toBe('/en/cines')
    expect(rutaEn('en', '/cines/')).toBe('/en/cines')
  })

  it('respeta la query y el hash', () => {
    expect(rutaEn('en', '/?category=cine')).toBe('/en?category=cine')
    expect(rutaEn('en', '/?date=hoy&search=pe%C3%B1a#hoy')).toBe('/en?date=hoy&search=pe%C3%B1a#hoy')
    expect(rutaEn('en', '/cines?x=1#cartelera')).toBe('/en/cines?x=1#cartelera')
    expect(rutaEn('en', '/#arriba')).toBe('/en#arriba')
  })

  it('las rutas sin versión en inglés quedan en castellano (con su query)', () => {
    expect(rutaEn('en', '/mapa')).toBe('/mapa')
    expect(rutaEn('en', '/buscar?q=pena')).toBe('/buscar?q=pena')
    expect(rutaEn('en', '/auth/login?next=/nuevo-evento')).toBe('/auth/login?next=/nuevo-evento')
    // "/cinesxyz" no es "/cines".
    expect(rutaEn('en', '/cinesxyz')).toBe('/cinesxyz')
  })
})

describe('rutaEn: la ficha del evento (/evento/*, un solo segmento)', () => {
  it('/evento/<id> va a /en/evento/<id>, con su query y su hash', () => {
    expect(rutaEn('en', '/evento/abc')).toBe('/en/evento/abc')
    expect(rutaEn('en', '/evento/abc/')).toBe('/en/evento/abc')
    expect(rutaEn('en', '/evento/abc?o=hero')).toBe('/en/evento/abc?o=hero')
    expect(rutaEn('en', '/evento/abc#x')).toBe('/en/evento/abc#x')
  })

  it('/evento solo, /evento/<id>/otra o /eventos/<id> no tienen versión en inglés', () => {
    expect(rutaEn('en', '/evento')).toBe('/evento')
    expect(rutaEn('en', '/evento/')).toBe('/evento/')
    expect(rutaEn('en', '/evento/abc/otra')).toBe('/evento/abc/otra')
    expect(rutaEn('en', '/eventos/abc')).toBe('/eventos/abc')
    expect(rutaEn('en', '/flyer/abc')).toBe('/flyer/abc')
  })

  it('en castellano no cambia', () => {
    expect(rutaEn('es', '/evento/abc?o=hero')).toBe('/evento/abc?o=hero')
  })
})

describe('separarIdioma', () => {
  it('/en y /en/... son inglés', () => {
    expect(separarIdioma('/en')).toEqual({ idioma: 'en', ruta: '/' })
    expect(separarIdioma('/en/')).toEqual({ idioma: 'en', ruta: '/' })
    expect(separarIdioma('/en/cines')).toEqual({ idioma: 'en', ruta: '/cines' })
    expect(separarIdioma('/en/evento/abc')).toEqual({ idioma: 'en', ruta: '/evento/abc' })
  })

  it('/entradas (o cualquier ruta que solo empiece con "en") NO es inglés', () => {
    expect(separarIdioma('/entradas')).toEqual({ idioma: 'es', ruta: '/entradas' })
    expect(separarIdioma('/enlace/x')).toEqual({ idioma: 'es', ruta: '/enlace/x' })
  })

  it('el resto es castellano, con la ruta tal cual', () => {
    expect(separarIdioma('/')).toEqual({ idioma: 'es', ruta: '/' })
    expect(separarIdioma('/cines')).toEqual({ idioma: 'es', ruta: '/cines' })
    expect(separarIdioma('/evento/abc')).toEqual({ idioma: 'es', ruta: '/evento/abc' })
  })
})

describe('rutaEnOtroIdioma', () => {
  it('de castellano a inglés en las páginas que existen', () => {
    expect(rutaEnOtroIdioma('/', 'en')).toBe('/en')
    expect(rutaEnOtroIdioma('/cines', 'en')).toBe('/en/cines')
    expect(rutaEnOtroIdioma('/cines?x=1', 'en')).toBe('/en/cines?x=1')
    expect(rutaEnOtroIdioma('/?date=hoy#hoy', 'en')).toBe('/en?date=hoy#hoy')
  })

  it('si la página no existe en inglés, va a /en (sin la query de la otra página)', () => {
    expect(rutaEnOtroIdioma('/mapa', 'en')).toBe('/en')
    expect(rutaEnOtroIdioma('/buscar?q=pena', 'en')).toBe('/en')
    expect(rutaEnOtroIdioma('/entradas', 'en')).toBe('/en')
  })

  it('de inglés a castellano: saca el /en y conserva query y hash', () => {
    expect(rutaEnOtroIdioma('/en', 'es')).toBe('/')
    expect(rutaEnOtroIdioma('/en/cines', 'es')).toBe('/cines')
    expect(rutaEnOtroIdioma('/en/cines?x=1', 'es')).toBe('/cines?x=1')
    expect(rutaEnOtroIdioma('/en?date=hoy#hoy', 'es')).toBe('/?date=hoy#hoy')
  })

  it('la ficha del evento, ida y vuelta (con la query)', () => {
    expect(rutaEnOtroIdioma('/evento/abc', 'en')).toBe('/en/evento/abc')
    expect(rutaEnOtroIdioma('/evento/abc?o=hero', 'en')).toBe('/en/evento/abc?o=hero')
    expect(rutaEnOtroIdioma('/en/evento/abc', 'es')).toBe('/evento/abc')
    expect(rutaEnOtroIdioma('/en/evento/abc?o=hero#x', 'es')).toBe('/evento/abc?o=hero#x')
    // /flyer existe solo en castellano: el destino en inglés es la portada.
    expect(rutaEnOtroIdioma('/flyer/abc', 'en')).toBe('/en')
  })

  it('pedir el mismo idioma en el que ya se está no rompe nada', () => {
    expect(rutaEnOtroIdioma('/en/cines', 'en')).toBe('/en/cines')
    expect(rutaEnOtroIdioma('/cines', 'es')).toBe('/cines')
  })
})

describe('hrefLangDestino', () => {
  it('en castellano, nunca', () => {
    expect(hrefLangDestino('es', '/buscar')).toBeUndefined()
    expect(hrefLangDestino('es', '/')).toBeUndefined()
  })

  it('en inglés, "es-AR" solo para las páginas que existen solo en castellano', () => {
    expect(hrefLangDestino('en', '/buscar')).toBe('es-AR')
    expect(hrefLangDestino('en', '/mapa')).toBe('es-AR')
    expect(hrefLangDestino('en', '/radar')).toBe('es-AR')
    expect(hrefLangDestino('en', '/favoritos')).toBe('es-AR')
    expect(hrefLangDestino('en', '/auth/login?next=/nuevo-evento')).toBe('es-AR')
    expect(hrefLangDestino('en', '/')).toBeUndefined()
    expect(hrefLangDestino('en', '/?category=cine')).toBeUndefined()
    expect(hrefLangDestino('en', '/cines#x')).toBeUndefined()
    expect(hrefLangDestino('en', '/evento/abc?o=hero')).toBeUndefined()
    expect(hrefLangDestino('en', '/flyer/abc')).toBe('es-AR')
  })
})
