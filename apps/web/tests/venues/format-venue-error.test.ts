import { describe, expect, it } from 'vitest'
import { formatVenueError } from '@/lib/venues/resolve'

describe('formatVenueError', () => {
  it('formato básico: "venue: <nombre>: <mensaje>"', () => {
    expect(formatVenueError('Lugar de Prueba', 'no resolvió')).toBe('venue: Lugar de Prueba: no resolvió')
  })

  it('colapsa saltos de línea y espacios repetidos del nombre', () => {
    expect(formatVenueError('Lugar   de\n\nPrueba', 'boom')).toBe('venue: Lugar de Prueba: boom')
  })

  it('colapsa saltos de línea y espacios repetidos del mensaje', () => {
    expect(formatVenueError('Lugar', 'error  \n muy   \n raro')).toBe('venue: Lugar: error muy raro')
  })

  it('recorta los bordes de espacio del nombre y del mensaje', () => {
    expect(formatVenueError('  Lugar  ', '  boom  ')).toBe('venue: Lugar: boom')
  })

  it('tabs y saltos de línea mezclados cuentan como un solo espacio', () => {
    expect(formatVenueError('Lugar\t\tInventado', 'mensaje\t\ncon\t mezcla')).toBe(
      'venue: Lugar Inventado: mensaje con mezcla'
    )
  })

  it('trunca a 200 caracteres cuando el resultado es más largo', () => {
    const resultado = formatVenueError('L'.repeat(50), 'm'.repeat(300))
    expect(resultado.length).toBe(200)
    expect(resultado.startsWith(`venue: ${'L'.repeat(50)}: `)).toBe(true)
  })

  it('con nombre y mensaje cortos no trunca nada', () => {
    const resultado = formatVenueError('Lugar', 'boom')
    expect(resultado).toBe('venue: Lugar: boom')
    expect(resultado.length).toBeLessThan(200)
  })

  it('justo en el límite de 200 caracteres no se recorta', () => {
    // "venue: " (7) + ": " (2) = 9 caracteres fijos; el resto se completa a 200.
    const nombre = 'L'.repeat(100)
    const mensaje = 'm'.repeat(91)
    const resultado = formatVenueError(nombre, mensaje)
    expect(resultado.length).toBe(200)
    expect(resultado).toBe(`venue: ${nombre}: ${mensaje}`)
  })
})
