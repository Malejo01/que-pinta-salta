/**
 * `lib/home/carousel.ts`: orden de categorías (favoritos, volumen próximo,
 * alfabético) y selección del carrusel ("destacados" + relleno por
 * categoría). Fixtures inventadas y evidentes; sin red ni base.
 */
import { describe, expect, it } from 'vitest'
import { getCategoryPriority, sortCategories, selectCarouselEvents } from '@/lib/home/carousel'
import type { DisplayEvent } from '@/lib/home/types'
import type { Category } from '@/lib/types'
import { saltaWallClockToDate } from '@/lib/date-format'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

function makeCategory(slug: string, name: string): Category {
  return { id: `cat-${slug}`, slug, name, color: null, icon: null, created_at: null }
}

let autoId = 0
function makeDisplayEvent(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  autoId += 1
  return {
    id: overrides.id ?? `evento-de-prueba-${autoId}`,
    slug: overrides.slug ?? `evento-de-prueba-${autoId}`,
    title: overrides.title ?? 'Evento de Prueba',
    venue: overrides.venue ?? 'Venue de Prueba',
    date: overrides.date ?? '2030-10-10',
    time: overrides.time ?? '21:00',
    category: overrides.category ?? 'boliches',
    categoryName: overrides.categoryName ?? 'Boliches',
    price: overrides.price ?? 'confirmar',
    image: overrides.image ?? '/placeholder.svg?height=600&width=400',
    description: overrides.description ?? '',
    address: overrides.address ?? '',
    startDateTime: overrides.startDateTime ?? salta('2030-10-10T21:00:00').toISOString(),
    isFeatured: overrides.isFeatured ?? false,
    ...overrides,
  }
}

describe('getCategoryPriority', () => {
  const now = salta('2030-10-10T12:00:00')
  const boliches = makeCategory('boliches', 'Boliches')
  const teatro = makeCategory('teatro', 'Teatro')
  const ferias = makeCategory('ferias', 'Ferias')
  const museos = makeCategory('museos', 'Museos')
  const categories = [boliches, teatro, ferias, museos]

  const events = [
    makeDisplayEvent({ category: 'boliches', startDateTime: salta('2030-10-12T21:00:00').toISOString() }),
    makeDisplayEvent({ category: 'boliches', startDateTime: salta('2030-10-13T21:00:00').toISOString() }),
    makeDisplayEvent({ category: 'ferias', startDateTime: salta('2030-10-14T10:00:00').toISOString() }),
    // Evento pasado: no cuenta como "próximo".
    makeDisplayEvent({ category: 'boliches', startDateTime: salta('2030-10-01T21:00:00').toISOString() }),
  ]

  it('un favorito va primero, sin importar su volumen de eventos próximos', () => {
    const order = getCategoryPriority(categories, events, now, ['teatro']).map((c) => c.slug)
    expect(order[0]).toBe('teatro')
  })

  it('sin favoritos: por cantidad de eventos próximos, de mayor a menor', () => {
    const order = getCategoryPriority(categories, events, now, []).map((c) => c.slug)
    // boliches: 2 próximos, ferias: 1, teatro y museos: 0.
    expect(order[0]).toBe('boliches')
    expect(order[1]).toBe('ferias')
  })

  it('empate en 0 próximos: desempata alfabético ("es"), ferias antes que museos', () => {
    const order = getCategoryPriority(categories, events, now, []).map((c) => c.slug)
    const sinProximos = order.filter((slug) => slug === 'teatro' || slug === 'museos')
    // Ninguno de los dos tiene eventos próximos ni es favorito: alfabético.
    expect(sinProximos).toEqual(['museos', 'teatro'].sort((a, b) => a.localeCompare(b, 'es')))
  })
})

describe('sortCategories', () => {
  it('delega en getCategoryPriority (mismo resultado con los mismos argumentos)', () => {
    const now = salta('2030-10-10T12:00:00')
    const categories = [makeCategory('boliches', 'Boliches'), makeCategory('teatro', 'Teatro')]
    const events = [makeDisplayEvent({ category: 'boliches', startDateTime: salta('2030-10-12T21:00:00').toISOString() })]

    expect(sortCategories(categories, events, now, ['teatro'])).toEqual(
      getCategoryPriority(categories, events, now, ['teatro']),
    )
  })
})

describe('selectCarouselEvents', () => {
  const now = salta('2030-10-10T12:00:00')

  it('respeta el máximo de 6: con más de 6 destacados futuros, corta en 6 y los ordena por fecha ascendente', () => {
    const destacados = Array.from({ length: 8 }, (_, i) =>
      makeDisplayEvent({
        id: `destacado-${i}`,
        isFeatured: true,
        startDateTime: salta(`2030-10-${11 + i}T21:00:00`).toISOString(),
      }),
    )

    const result = selectCarouselEvents(destacados, [], now)
    expect(result).toHaveLength(6)
    expect(result.map((e) => e.id)).toEqual(['destacado-0', 'destacado-1', 'destacado-2', 'destacado-3', 'destacado-4', 'destacado-5'])
  })

  it('destacados pasados no cuentan: solo los futuros entran por esa vía', () => {
    const pasado = makeDisplayEvent({ id: 'destacado-pasado', isFeatured: true, startDateTime: salta('2030-09-01T21:00:00').toISOString() })
    const futuro = makeDisplayEvent({ id: 'destacado-futuro', isFeatured: true, startDateTime: salta('2030-10-15T21:00:00').toISOString() })

    const result = selectCarouselEvents([pasado, futuro], [], now)
    expect(result.map((e) => e.id)).toEqual(['destacado-futuro'])
  })

  it('con menos de 6 destacados: rellena con un evento próximo por categoría, en el orden de sortedCategories, sin duplicar', () => {
    const teatro = makeCategory('teatro', 'Teatro')
    const boliches = makeCategory('boliches', 'Boliches')
    const ferias = makeCategory('ferias', 'Ferias')
    const museos = makeCategory('museos', 'Museos')
    const sortedCategories = [teatro, boliches, ferias, museos]

    const destacadoTeatro = makeDisplayEvent({
      id: 'destacado-teatro',
      category: 'teatro',
      isFeatured: true,
      startDateTime: salta('2030-10-11T21:00:00').toISOString(),
    })
    const bolichesEvento = makeDisplayEvent({ id: 'relleno-boliches', category: 'boliches', startDateTime: salta('2030-10-12T21:00:00').toISOString() })
    const feriasEvento = makeDisplayEvent({ id: 'relleno-ferias', category: 'ferias', startDateTime: salta('2030-10-13T21:00:00').toISOString() })
    const museosEvento = makeDisplayEvent({ id: 'relleno-museos', category: 'museos', startDateTime: salta('2030-10-14T21:00:00').toISOString() })

    const result = selectCarouselEvents(
      [destacadoTeatro, bolichesEvento, feriasEvento, museosEvento],
      sortedCategories,
      now,
    )

    // 1 destacado + 3 de relleno (teatro ya quedó cubierto por el destacado,
    // así que no vuelve a aparecer un segundo evento de teatro).
    expect(result.map((e) => e.id)).toEqual(['destacado-teatro', 'relleno-boliches', 'relleno-ferias', 'relleno-museos'])
  })

  it('el relleno por categoría también respeta el máximo de 6 y corta según el orden de sortedCategories', () => {
    // 4 destacados (quedan 2 cupos) + 5 categorías candidatas a relleno:
    // solo entran las 2 primeras en el orden de sortedCategories.
    const destacados = Array.from({ length: 4 }, (_, i) =>
      makeDisplayEvent({ id: `destacado-${i}`, category: 'cine', isFeatured: true, startDateTime: salta(`2030-10-${11 + i}T21:00:00`).toISOString() }),
    )
    const categoriasRelleno = ['a', 'b', 'c', 'd', 'e'].map((slug) => makeCategory(slug, `Categoría ${slug.toUpperCase()} de Prueba`))
    const eventosRelleno = categoriasRelleno.map((cat) =>
      makeDisplayEvent({ id: `relleno-${cat.slug}`, category: cat.slug, startDateTime: salta('2030-10-20T21:00:00').toISOString() }),
    )

    const result = selectCarouselEvents([...destacados, ...eventosRelleno], categoriasRelleno, now)

    expect(result).toHaveLength(6)
    expect(result.map((e) => e.id)).toEqual(['destacado-0', 'destacado-1', 'destacado-2', 'destacado-3', 'relleno-a', 'relleno-b'])
  })
})
