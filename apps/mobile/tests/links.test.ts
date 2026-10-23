// 24-c: `eventoIdDesdeLink` y `esUuid` (lib/links.ts). Sin red: todo son
// strings fijos, ningún `fetch` ni `Linking` real.
//
// Decisión de 24-a (ver comentario de `eventoIdDesdeLink` en lib/links.ts):
// el id devuelto siempre va en minúsculas, aunque el link llegue con el
// hexadecimal del uuid en mayúsculas.
import { describe, expect, it } from 'vitest'
import { esUuid, eventoIdDesdeLink, urlSitio } from '../lib/links'

const UUID_MINUSCULAS = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'
const UUID_MAYUSCULAS = UUID_MINUSCULAS.toUpperCase()

describe('eventoIdDesdeLink', () => {
  it('esquema propio: quepintasalta://evento/<uuid>', () => {
    expect(eventoIdDesdeLink(`quepintasalta://evento/${UUID_MINUSCULAS}`)).toBe(UUID_MINUSCULAS)
  })

  it('https con www: https://www.quepintasalta.com.ar/evento/<uuid>', () => {
    expect(eventoIdDesdeLink(`https://www.quepintasalta.com.ar/evento/${UUID_MINUSCULAS}`)).toBe(UUID_MINUSCULAS)
  })

  it('con ?o=hoy', () => {
    expect(eventoIdDesdeLink(`https://www.quepintasalta.com.ar/evento/${UUID_MINUSCULAS}?o=hoy`)).toBe(
      UUID_MINUSCULAS
    )
  })

  it('con barra final', () => {
    expect(eventoIdDesdeLink(`https://www.quepintasalta.com.ar/evento/${UUID_MINUSCULAS}/`)).toBe(UUID_MINUSCULAS)
    expect(eventoIdDesdeLink(`quepintasalta://evento/${UUID_MINUSCULAS}/`)).toBe(UUID_MINUSCULAS)
  })

  it('uuid en mayúsculas: devuelve el id en minúsculas (decisión de 24-a)', () => {
    expect(eventoIdDesdeLink(`https://www.quepintasalta.com.ar/evento/${UUID_MAYUSCULAS}`)).toBe(UUID_MINUSCULAS)
    expect(eventoIdDesdeLink(`quepintasalta://evento/${UUID_MAYUSCULAS}`)).toBe(UUID_MINUSCULAS)
  })

  it('http (sin "s"): null', () => {
    expect(eventoIdDesdeLink(`http://www.quepintasalta.com.ar/evento/${UUID_MINUSCULAS}`)).toBeNull()
  })

  it('https sin www: null', () => {
    expect(eventoIdDesdeLink(`https://quepintasalta.com.ar/evento/${UUID_MINUSCULAS}`)).toBeNull()
  })

  it('otro host: null', () => {
    expect(eventoIdDesdeLink(`https://www.otro-sitio.com.ar/evento/${UUID_MINUSCULAS}`)).toBeNull()
    expect(eventoIdDesdeLink(`https://www.quepintasalta.com.ar.evil.com/evento/${UUID_MINUSCULAS}`)).toBeNull()
  })

  it('id que no es uuid ("evento/123"): null', () => {
    expect(eventoIdDesdeLink('evento/123')).toBeNull()
    expect(eventoIdDesdeLink(`quepintasalta://evento/123`)).toBeNull()
    expect(eventoIdDesdeLink(`https://www.quepintasalta.com.ar/evento/123`)).toBeNull()
  })

  it('subruta después del uuid ("evento/<uuid>/x"): null', () => {
    expect(eventoIdDesdeLink(`evento/${UUID_MINUSCULAS}/x`)).toBeNull()
    expect(eventoIdDesdeLink(`quepintasalta://evento/${UUID_MINUSCULAS}/x`)).toBeNull()
    expect(eventoIdDesdeLink(`https://www.quepintasalta.com.ar/evento/${UUID_MINUSCULAS}/x`)).toBeNull()
  })

  it('un "javascript:": null', () => {
    expect(eventoIdDesdeLink(`javascript:alert(1)`)).toBeNull()
    expect(eventoIdDesdeLink(`javascript:quepintasalta://evento/${UUID_MINUSCULAS}`)).toBeNull()
  })

  it('string vacío (y solo espacios): null', () => {
    expect(eventoIdDesdeLink('')).toBeNull()
    expect(eventoIdDesdeLink('   ')).toBeNull()
  })
})

describe('esUuid', () => {
  it('true para un uuid válido, en mayúsculas o minúsculas', () => {
    expect(esUuid(UUID_MINUSCULAS)).toBe(true)
    expect(esUuid(UUID_MAYUSCULAS)).toBe(true)
  })

  it('false para lo que no es un uuid', () => {
    expect(esUuid('123')).toBe(false)
    expect(esUuid('')).toBe(false)
    expect(esUuid(`${UUID_MINUSCULAS}x`)).toBe(false)
    expect(esUuid(UUID_MINUSCULAS.slice(0, -1))).toBe(false)
  })
})

// 49-a (QPS-237): RUTAS_SITIO_PERMITIDAS suma los dos legales. El detalle de
// la guarda de TERMINOS_PUBLICADOS vive en tests/legales.test.ts; acá solo
// se confirma que las rutas conocidas ("/auth/otra-cosa" y "/admin" siguen
// en null) resuelven como corresponde desde lib/links.ts.
describe('urlSitio: rutas legales (QPS-237)', () => {
  it('/privacidad resuelve', () => {
    expect(urlSitio('/privacidad')).toBe('https://www.quepintasalta.com.ar/privacidad')
  })

  it('/terminos: null (TERMINOS_PUBLICADOS en false)', () => {
    expect(urlSitio('/terminos')).toBeNull()
  })

  it('rutas desconocidas siguen en null', () => {
    expect(urlSitio('/auth/otra-cosa')).toBeNull()
    expect(urlSitio('/admin')).toBeNull()
  })
})
