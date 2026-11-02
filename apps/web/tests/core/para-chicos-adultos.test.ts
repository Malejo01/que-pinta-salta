// Q4-12: «Para chicos» deja afuera lo de +18 (age_restriction >= 18), en la web
// (filtros combinados de /buscar y /mapa) y en la app (que usa la misma regla de core).
import { describe, expect, it } from 'vitest'
import { esParaChicos } from '@qps/core/filtros/publico'
import { filtrarCombinado } from '@qps/core/home/filtros-combinados'
import type { DisplayEvent } from '@qps/core/home/types'

function ev(id: string, extra: Partial<DisplayEvent>): DisplayEvent {
  return {
    id,
    slug: id,
    title: id,
    venue: 'Lugar',
    date: '2030-01-01',
    time: '21:00',
    category: 'infantil',
    categoryName: 'Infantil',
    price: 'gratis',
    image: '',
    description: '',
    address: '',
    startDateTime: '2030-01-01T00:00:00.000Z',
    isFeatured: false,
    ...extra,
  }
}

describe('esParaChicos con edad', () => {
  it('18 o más: nunca, aunque la categoría o los tags digan que sí', () => {
    expect(esParaChicos({ categorySlug: 'infantil', ageRestriction: 18 })).toBe(false)
    expect(esParaChicos({ categorySlug: 'teatro', tags: ['familia'], ageRestriction: 21 })).toBe(false)
    expect(esParaChicos({ categorySlug: 'infantil', vibe: 'adultos' })).toBe(false)
  })

  it('menos de 18 o sin dato: como siempre', () => {
    expect(esParaChicos({ categorySlug: 'infantil', ageRestriction: 13 })).toBe(true)
    expect(esParaChicos({ categorySlug: 'infantil', ageRestriction: null })).toBe(true)
    expect(esParaChicos({ categorySlug: 'infantil', vibe: 'familiar' })).toBe(true)
    expect(esParaChicos({ categorySlug: 'boliches' })).toBe(false)
  })
})

describe('filtros combinados (web: /buscar y /mapa)', () => {
  it('con «Para chicos», un infantil +18 queda afuera', () => {
    const items = [ev('chicos', {}), ev('adultos', { vibe: 'adultos' }), ev('boliche', { category: 'boliches' })].map((evento) => ({
      evento,
      paraAtajo: null,
    }))
    const r = filtrarCombinado(items, { atajo: null, categoria: null, soloGratis: false, paraChicos: true }, new Date('2029-12-31T00:00:00Z'))
    expect(r.map((e) => e.id)).toEqual(['chicos'])
  })
})
