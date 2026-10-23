import { describe, expect, it } from 'vitest'
import { aCsv, resumen, urlOpenStreetMap } from '@/lib/venues/geocodificacion/reporte'

describe('aCsv', () => {
  it('filas vacías: cadena vacía', () => {
    expect(aCsv([])).toBe('')
  })

  it('escapa comas y comillas en los valores (RFC 4180)', () => {
    const csv = aCsv([
      { nombre: 'La Casona, "El Rincón"', direccion: 'Balcarce 123', lat: -24.7883 },
      { nombre: 'Normal', direccion: 'Caseros 456', lat: -24.79 },
    ])

    const lineas = csv.split('\r\n')
    expect(lineas[0]).toBe('nombre,direccion,lat')
    expect(lineas[1]).toBe('"La Casona, ""El Rincón""",Balcarce 123,-24.7883')
    expect(lineas[2]).toBe('Normal,Caseros 456,-24.79')
  })

  it('un salto de línea en un valor también se escapa entre comillas', () => {
    const csv = aCsv([{ nombre: 'Línea 1\nLínea 2', direccion: null }])
    const lineas = csv.split('\r\n')
    expect(lineas).toHaveLength(2) // el \n interno no cuenta como separador de filas: queda adentro de las comillas
    expect(lineas[1]).toBe('"Línea 1\nLínea 2",')
  })

  it('null y undefined quedan como campo vacío', () => {
    const csv = aCsv([{ a: null, b: undefined, c: 'x' }])
    expect(csv.split('\r\n')[1]).toBe(',,x')
  })
})

describe('aCsv: neutraliza la inyección de fórmulas (CSV injection)', () => {
  it('un string que arranca con "=", "@", "+", tab o "-" (que no es número): apóstrofo adelante', () => {
    const csv = aCsv([
      { nombre: '=1+1' },
      { nombre: '@SUM(A1:A9)' },
      { nombre: '+1' },
      { nombre: '\t=1+1' },
      { nombre: '-1+1' },
    ])
    const lineas = csv.split('\r\n').slice(1) // sin encabezado
    expect(lineas).toEqual([`'=1+1`, `'@SUM(A1:A9)`, `'+1`, `'\t=1+1`, `'-1+1`])
  })

  it('lat y lon como number (el caso real del reporte) salen tal cual, sin apóstrofo', () => {
    const csv = aCsv([{ lat: -24.7883, lon: -65.4106 }])
    expect(csv.split('\r\n')[1]).toBe('-24.7883,-65.4106')
  })

  it('un "-24.7883" como string (número escrito como texto) también sale tal cual', () => {
    const csv = aCsv([{ lat: '-24.7883' }])
    expect(csv.split('\r\n')[1]).toBe('-24.7883')
  })

  it('un nombre con coma y comillas sigue escapado como antes (sin apóstrofo: no arranca con un carácter de fórmula)', () => {
    const csv = aCsv([{ nombre: 'La Casona, "El Rincón"' }])
    expect(csv.split('\r\n')[1]).toBe('"La Casona, ""El Rincón"""')
  })

  it('un nombre que arranca con "=" y tiene una coma: el apóstrofo queda adentro de las comillas', () => {
    const csv = aCsv([{ nombre: '=1+1, boom' }])
    expect(csv.split('\r\n')[1]).toBe(`"'=1+1, boom"`)
  })
})

describe('resumen', () => {
  it('cuenta las filas por estado', () => {
    expect(
      resumen([
        { estado: 'guardado' },
        { estado: 'guardado' },
        { estado: 'para-revisar' },
        { estado: 'sin-resultado' },
        { estado: 'guardado' },
      ])
    ).toEqual({ guardado: 3, 'para-revisar': 1, 'sin-resultado': 1 })
  })

  it('sin filas: objeto vacío', () => {
    expect(resumen([])).toEqual({})
  })
})

describe('urlOpenStreetMap', () => {
  it('arma el link con mlat, mlon y zoom 18', () => {
    expect(urlOpenStreetMap(-24.7883, -65.4106)).toBe(
      'https://www.openstreetmap.org/?mlat=-24.7883&mlon=-65.4106#map=18/-24.7883/-65.4106'
    )
  })
})
