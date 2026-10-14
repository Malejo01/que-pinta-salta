/**
 * `home/filtros-extra.ts` (nuevo, R26, tarea 26-a): filtros extra de la
 * portada que no entraron en `home/filters.ts`. Por ahora, solo `soloGratis`.
 *
 * No tiene archivo puente en `apps/web/lib` (es código nuevo, no movido), así
 * que no corresponde a `equivalencia.test.ts` ni a `sin-copias.test.ts` (que
 * comparan contra ese puente). `frontera.test.ts` sí lo cubre, porque barre
 * todo `packages/core/src` sin necesidad de una lista explícita.
 */
import { describe, expect, it } from 'vitest'
import { soloGratis } from '@qps/core/home/filtros-extra'
import type { DisplayEvent } from '@qps/core/home/types'

let autoId = 0
function evento(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  autoId += 1
  return {
    id: `evento-de-prueba-${autoId}`,
    slug: `evento-de-prueba-${autoId}`,
    title: `Evento de Prueba ${autoId}`,
    venue: 'Venue de Prueba',
    date: '2026-10-10',
    time: '21:00',
    category: 'recitales',
    categoryName: 'Recitales',
    price: 'confirmar',
    image: '/placeholder.svg',
    description: '',
    address: '',
    startDateTime: '2026-10-10T21:00:00-03:00',
    isFeatured: false,
    ...overrides,
  }
}

describe('soloGratis', () => {
  it('pasa los eventos con price === "gratis"', () => {
    const gratis = evento({ price: 'gratis' })
    expect(soloGratis([gratis])).toEqual([gratis])
  })

  it('no pasan los eventos con price === "confirmar"', () => {
    expect(soloGratis([evento({ price: 'confirmar' })])).toEqual([])
  })

  it('no pasan los eventos con price numérico, incluido 0', () => {
    expect(soloGratis([evento({ price: 0 })])).toEqual([])
    expect(soloGratis([evento({ price: 1500 })])).toEqual([])
  })

  it('lista vacía -> lista vacía', () => {
    expect(soloGratis([])).toEqual([])
  })

  it('no muta la lista de entrada', () => {
    const entrada = [evento({ price: 'gratis' }), evento({ price: 'confirmar' }), evento({ price: 0 })]
    const copia = [...entrada]
    soloGratis(entrada)
    expect(entrada).toEqual(copia)
  })

  it('conserva el orden de los que pasan', () => {
    const a = evento({ price: 'gratis', id: 'a' })
    const b = evento({ price: 1500, id: 'b' })
    const c = evento({ price: 'gratis', id: 'c' })
    const d = evento({ price: 'confirmar', id: 'd' })
    const e = evento({ price: 'gratis', id: 'e' })
    expect(soloGratis([a, b, c, d, e]).map((ev) => ev.id)).toEqual(['a', 'c', 'e'])
  })
})
