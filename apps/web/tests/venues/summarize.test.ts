import { describe, expect, it } from 'vitest'
import { summarizeVenueErrors } from '@/lib/venues/resolve'

const errs = (n: number) => Array.from({ length: n }, (_, i) => `venue: Lugar ${i + 1}: boom`)

describe('summarizeVenueErrors', () => {
  it('lista vacia: vacia', () => {
    expect(summarizeVenueErrors([])).toEqual([])
  })
  it('deduplica por mensaje conservando el orden', () => {
    expect(summarizeVenueErrors(['venue: A: x', 'venue: B: x', 'venue: A: x', 'venue: A: x']))
      .toEqual(['venue: A: x', 'venue: B: x'])
  })
  it('hasta 5 distintos: se devuelven todos, sin resumen', () => {
    expect(summarizeVenueErrors(errs(5))).toEqual(errs(5))
  })
  it('mas de 5 distintos: primeros 5 mas el resumen con el total', () => {
    expect(summarizeVenueErrors(errs(8))).toEqual([...errs(5), 'venue: 8 mensajes de lugar sin resolver en total'])
  })
  it('el total cuenta distintos, no repeticiones', () => {
    const r = summarizeVenueErrors([...errs(6), ...errs(6)])
    expect(r).toHaveLength(6)
    expect(r[5]).toBe('venue: 6 mensajes de lugar sin resolver en total')
  })
  it('no muta la entrada', () => {
    const entrada = errs(8)
    summarizeVenueErrors(entrada)
    expect(entrada).toEqual(errs(8))
  })
})
