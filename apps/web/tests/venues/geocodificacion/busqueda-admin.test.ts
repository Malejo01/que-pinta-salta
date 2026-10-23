/**
 * `lib/venues/geocodificacion/busqueda-admin.ts` (R65-b): la lógica pura de la
 * búsqueda de direcciones del admin. Sin red ni base; entorno `node`.
 */
import { describe, expect, it } from 'vitest'
import { ZONA_SALTA } from '@qps/core/mapa/zona'
import { urlDeBusqueda } from '@/lib/venues/geocodificacion/consultas'
import {
  consultaDeBusquedaAdmin,
  normalizarTextoBusqueda,
  resultadosParaAdmin,
} from '@/lib/venues/geocodificacion/busqueda-admin'
import { SALTA_CAPITAL, ZONA_SALTA_CAPITAL } from '@/lib/venues/geocodificacion/localidades'
import type { ResultadoNominatim } from '@/lib/venues/geocodificacion/nominatim'

function resultado(lat: number, lon: number, display_name = 'Lugar de Prueba, Salta'): ResultadoNominatim {
  return { lat, lon, display_name, place_rank: 30, importance: 0.5, category: 'building', type: 'yes' }
}

describe('normalizarTextoBusqueda', () => {
  it('recorta y colapsa los espacios (también saltos de línea y tabs)', () => {
    expect(normalizarTextoBusqueda('  Balcarce \t  123\n')).toBe('Balcarce 123')
  })

  it('no toca mayúsculas ni tildes', () => {
    expect(normalizarTextoBusqueda('Güemes 456')).toBe('Güemes 456')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['un número', 123],
    ['un objeto', {}],
    ['un array', ['abc']],
    ['un booleano', true],
  ])('%s: null', (_nombre, entrada) => {
    expect(normalizarTextoBusqueda(entrada)).toBeNull()
  })

  it('el largo se mide después de normalizar: "a    b" tiene 3 caracteres, no 6', () => {
    expect(normalizarTextoBusqueda('a    b')).toBe('a b')
    expect(normalizarTextoBusqueda('  ab  ')).toBeNull()
  })

  it('borde inferior: 2 caracteres no, 3 sí', () => {
    expect(normalizarTextoBusqueda('ab')).toBeNull()
    expect(normalizarTextoBusqueda('abc')).toBe('abc')
  })

  it('borde superior: 200 caracteres sí, 201 no', () => {
    expect(normalizarTextoBusqueda('a'.repeat(200))).toBe('a'.repeat(200))
    expect(normalizarTextoBusqueda('a'.repeat(201))).toBeNull()
  })

  it('vacío y solo espacios: null', () => {
    expect(normalizarTextoBusqueda('')).toBeNull()
    expect(normalizarTextoBusqueda('     ')).toBeNull()
  })
})

describe('consultaDeBusquedaAdmin', () => {
  it('por defecto busca en Salta Capital, libre y en la ciudad', () => {
    expect(consultaDeBusquedaAdmin('Balcarce 123')).toEqual({
      tipo: 'libre',
      q: 'Balcarce 123',
      alcance: 'ciudad',
      zona: ZONA_SALTA_CAPITAL,
      donde: SALTA_CAPITAL.nombre,
    })
  })

  it('si el texto nombra una localidad del interior, busca en esa ciudad (sin tildes ni mayúsculas)', () => {
    const consulta = consultaDeBusquedaAdmin('Plaza principal, CAFAYATE')
    expect(consulta.donde).toBe('Cafayate')
    expect(consulta.alcance).toBe('ciudad')
    expect(consulta.zona).not.toEqual(ZONA_SALTA_CAPITAL)
    expect(consulta.q).toBe('Plaza principal, CAFAYATE')

    expect(consultaDeBusquedaAdmin('Calle de Prueba, Metan').donde).toBe('Metán')
  })

  it('el nombre de una localidad pegado a otra palabra no cuenta ("cachivache" no es Cachi)', () => {
    expect(consultaDeBusquedaAdmin('Cachivache 123').donde).toBe(SALTA_CAPITAL.nombre)
  })

  it('la URL sale a Nominatim con q, bounded=1, limit=3, el viewbox de la ciudad y el email', () => {
    const url = new URL(urlDeBusqueda(consultaDeBusquedaAdmin('Balcarce 123'), { email: 'contacto@ejemplo.test' }))

    expect(`${url.origin}${url.pathname}`).toBe('https://nominatim.openstreetmap.org/search')
    expect(url.searchParams.get('q')).toBe('Balcarce 123')
    expect(url.searchParams.get('bounded')).toBe('1')
    expect(url.searchParams.get('limit')).toBe('3')
    expect(url.searchParams.get('email')).toBe('contacto@ejemplo.test')
    expect(url.searchParams.get('viewbox')).toBe(
      `${ZONA_SALTA_CAPITAL.lngMin},${ZONA_SALTA_CAPITAL.latMax},${ZONA_SALTA_CAPITAL.lngMax},${ZONA_SALTA_CAPITAL.latMin}`
    )
  })

  it('una consulta del admin nunca es la de toda la provincia (sin bounded se saldría de la ciudad)', () => {
    expect(consultaDeBusquedaAdmin('cualquier cosa').alcance).toBe('ciudad')
  })
})

describe('resultadosParaAdmin', () => {
  it('filtra lo que cae fuera de ZONA_SALTA', () => {
    const salida = resultadosParaAdmin([
      resultado(-34.6037, -58.3816, 'Buenos Aires'),
      resultado(-24.79, -65.41, 'En Salta'),
      resultado(40.4, -3.7, 'Madrid'),
    ])
    expect(salida.map((r) => r.etiqueta)).toEqual(['En Salta'])
  })

  it('los bordes de ZONA_SALTA cuentan como adentro; un poco más allá, no', () => {
    expect(resultadosParaAdmin([resultado(ZONA_SALTA.latMin, ZONA_SALTA.lngMin)])).toHaveLength(1)
    expect(resultadosParaAdmin([resultado(ZONA_SALTA.latMax, ZONA_SALTA.lngMax)])).toHaveLength(1)
    expect(resultadosParaAdmin([resultado(ZONA_SALTA.latMin - 0.01, ZONA_SALTA.lngMin)])).toHaveLength(0)
    expect(resultadosParaAdmin([resultado(ZONA_SALTA.latMax, ZONA_SALTA.lngMax + 0.01)])).toHaveLength(0)
  })

  it('descarta coordenadas no finitas', () => {
    expect(resultadosParaAdmin([resultado(NaN, -65.4), resultado(-24.8, Infinity)])).toEqual([])
  })

  it('tope de 3, en el orden de Nominatim, contando solo los que están en Salta', () => {
    const entrada = [
      resultado(-34.6, -58.4, 'Fuera 1'),
      resultado(-24.71, -65.41, 'A'),
      resultado(-24.72, -65.41, 'B'),
      resultado(-34.7, -58.5, 'Fuera 2'),
      resultado(-24.73, -65.41, 'C'),
      resultado(-24.74, -65.41, 'D'),
      resultado(-24.75, -65.41, 'E'),
    ]
    expect(resultadosParaAdmin(entrada).map((r) => r.etiqueta)).toEqual(['A', 'B', 'C'])
  })

  it('redondea lat y lng a 6 decimales', () => {
    const [r] = resultadosParaAdmin([resultado(-24.78831249, -65.41061251)])
    expect(r.lat).toBe(-24.788312)
    expect(r.lng).toBe(-65.410613)
  })

  it('no toca las coordenadas que ya tienen 6 decimales o menos', () => {
    const [r] = resultadosParaAdmin([resultado(-24.7883, -65.410612)])
    expect(r).toMatchObject({ lat: -24.7883, lng: -65.410612 })
  })

  it('recorta la etiqueta a 200 caracteres', () => {
    const [largo, justo] = resultadosParaAdmin([resultado(-24.79, -65.41, 'x'.repeat(500)), resultado(-24.8, -65.41, 'y'.repeat(200))])
    expect(largo.etiqueta).toHaveLength(200)
    expect(justo.etiqueta).toHaveLength(200)
  })

  it('devuelve solo lat, lng y etiqueta (no filtra campos internos de Nominatim)', () => {
    const [r] = resultadosParaAdmin([resultado(-24.79, -65.41)])
    expect(Object.keys(r).sort()).toEqual(['etiqueta', 'lat', 'lng'])
  })

  it('lista vacía: lista vacía', () => {
    expect(resultadosParaAdmin([])).toEqual([])
  })
})
