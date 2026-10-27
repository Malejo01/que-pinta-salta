/**
 * B3 (rendimiento): en /favoritos solo las dos primeras tarjetas de la
 * PRIMERA grilla que se pinta cargan sin lazy (la primera con prioridad
 * alta). Las demás grillas quedan como siempre.
 *
 * `EventCard` se reemplaza por un doble que deja la prop `carga` en un
 * atributo, así se ve qué recibe cada tarjeta sin montar imágenes.
 */
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DisplayEvent } from '@qps/core/home/types'

vi.mock('@/components/event-card', () => ({
  EventCard: ({ event, carga }: { event: DisplayEvent; carga?: string }) =>
    React.createElement('div', { 'data-evento': event.id, 'data-carga': carga ?? 'sin-prop' }),
}))
vi.mock('@/components/movie-modal', () => ({ MovieModal: () => null }))
vi.mock('@/components/donation-context', () => ({ useDonation: () => ({ openDonationModal: () => {} }) }))

import { FavoritosList, primeraGrilla } from '@/app/favoritos/favoritos-list'

function ev(id: string): DisplayEvent {
  return {
    id,
    slug: id,
    title: id,
    venue: 'Lugar',
    date: '2026-10-30',
    time: '21:00',
    category: 'pena',
    categoryName: 'Peña',
    price: 'gratis',
    image: `/flyers/${id}.jpg`,
    description: '',
    address: '',
    startDateTime: '2026-10-30T21:00:00-03:00',
    isFeatured: false,
  }
}

function cargas(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of html.matchAll(/data-evento="([^"]+)" data-carga="([^"]+)"/g)) out[m[1]] = m[2]
  return out
}

describe('primeraGrilla', () => {
  it('Voy si hay; si no Plan flexible; si no el primer día con eventos; null sin tarjetas', () => {
    expect(primeraGrilla([ev('a')], [ev('b')], [{ dia: '2026-10-30', items: [ev('c')] }])).toBe('voy')
    expect(primeraGrilla([], [ev('b')], [{ dia: '2026-10-30', items: [ev('c')] }])).toBe('flexibles')
    expect(
      primeraGrilla([], [], [
        { dia: '2026-10-29', items: [] },
        { dia: '2026-10-30', items: [ev('c')] },
      ]),
    ).toBe('dia:2026-10-30')
    expect(primeraGrilla([], [], [])).toBeNull()
  })
})

describe('FavoritosList: carga de las tarjetas', () => {
  it('con Voy: las dos primeras de Voy ansiosas (la primera prioritaria); Guardados, diferida', () => {
    const html = renderToStaticMarkup(
      React.createElement(FavoritosList, {
        voy: [ev('v1'), ev('v2'), ev('v3')],
        flexibles: [ev('f1')],
        porDia: [{ dia: '2026-10-30', items: [ev('d1'), ev('d2')] }],
      }),
    )
    expect(cargas(html)).toEqual({
      v1: 'prioritaria',
      v2: 'ansiosa',
      v3: 'diferida',
      f1: 'diferida',
      d1: 'diferida',
      d2: 'diferida',
    })
  })

  it('sin Voy ni Plan flexible: la prioridad pasa al primer día', () => {
    const html = renderToStaticMarkup(
      React.createElement(FavoritosList, {
        voy: [],
        flexibles: [],
        porDia: [
          { dia: '2026-10-30', items: [ev('d1'), ev('d2'), ev('d3')] },
          { dia: '2026-10-31', items: [ev('e1')] },
        ],
      }),
    )
    expect(cargas(html)).toEqual({ d1: 'prioritaria', d2: 'ansiosa', d3: 'diferida', e1: 'diferida' })
  })
})
