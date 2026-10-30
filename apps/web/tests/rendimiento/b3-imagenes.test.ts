/**
 * B3 (rendimiento): pistas de carga de las imágenes que son LCP y tamaño
 * real de los favicons y del patrón de marca.
 *
 * - Portada: el póster nítido de la diapositiva inicial del hero lleva
 *   `preload` + `fetchpriority="high"`, y la copia desenfocada (que es lo que
 *   Lighthouse toma como LCP) ya no es lazy en esa diapositiva.
 * - Ficha: el flyer con `preload` + `fetchPriority="high"` (no `priority`,
 *   deprecado en Next 16 y sin `fetchpriority`).
 * - /cines y /favoritos: las primeras tarjetas cargan ansiosas y la primera
 *   con prioridad alta; el resto, lazy como siempre.
 * - Favicons: 32×32 de verdad (se lee el IHDR del PNG).
 *
 * Entorno `node` y `react-dom/server`, igual que
 * `tests/components/password-input.test.ts`. Los `src` de las imágenes son
 * rutas relativas para que el loader por defecto de `next/image` no pida
 * `remotePatterns`.
 */
import { readFileSync, statSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DisplayEvent } from '@qps/core/home/types'

vi.mock('@/components/favorite-button', () => ({ FavoriteButton: () => null }))
vi.mock('@/components/share-button', () => ({ ShareButton: () => null }))
vi.mock('@/components/donation-context', () => ({ useDonation: () => ({ openDonationModal: () => {} }) }))

import { HeroCarousel } from '@/components/hero-carousel'
import { EventCard } from '@/components/event-card'
import { MovieCard } from '@/components/movie-card'
import { CinesView } from '@/components/cines-view'
import { cargaPorIndice, pistasDeCarga } from '@/lib/images/carga'
import type { CinemaMovie } from '@/lib/types'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

function evento(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id: 'ev-1',
    slug: 'ev-1',
    title: 'Peña de prueba',
    venue: 'La Casona',
    date: '2026-10-30',
    time: '21:00',
    category: 'pena',
    categoryName: 'Peña',
    price: 'gratis',
    image: '/flyers/ev-1.jpg',
    description: 'Una peña',
    address: 'Balcarce 1',
    startDateTime: '2026-10-30T21:00:00-03:00',
    isFeatured: false,
    ...overrides,
  }
}

/** Todas las etiquetas <img ...> del HTML. */
function imgs(html: string): string[] {
  return html.match(/<img\b[^>]*>/g) ?? []
}

/**
 * Valor de un atributo, sin distinguir mayúsculas: React escribe
 * `fetchPriority="high"` en el HTML del servidor y el navegador lo lee igual
 * que `fetchpriority` (los nombres de atributo HTML no distinguen mayúsculas).
 */
function attr(tag: string, nombre: string): string | null {
  const m = tag.match(new RegExp(`\\s${nombre}="([^"]*)"`, 'i'))
  return m ? m[1] : null
}

describe('HeroCarousel: la diapositiva inicial lleva las pistas del LCP', () => {
  const html = renderToStaticMarkup(
    React.createElement(HeroCarousel, {
      events: [evento(), evento({ id: 'ev-2', image: '/flyers/ev-2.jpg', title: 'Otra' })],
    }),
  )
  const [fondo, poster] = imgs(html)

  it('pinta dos <img> de la diapositiva inicial: el fondo desenfocado y el póster', () => {
    expect(imgs(html)).toHaveLength(2)
    expect(attr(fondo, 'class')).toContain('blur-2xl')
    expect(attr(poster, 'alt')).toBe('Peña de prueba')
  })

  it('el póster nítido tiene fetchpriority="high" y no es lazy', () => {
    expect(attr(poster, 'fetchpriority')).toBe('high')
    expect(attr(poster, 'loading')).not.toBe('lazy')
  })

  it('el fondo desenfocado (el LCP para Lighthouse) no es lazy en la diapositiva inicial', () => {
    expect(attr(fondo, 'loading')).not.toBe('lazy')
    expect(attr(fondo, 'fetchpriority')).toBe('high')
  })

  it('fondo y póster piden la misma URL (no hay una descarga extra por sacar el lazy)', () => {
    expect(attr(fondo, 'src')).toBe(attr(poster, 'src'))
  })

  it('el fondo arranca visible: ni la diapositiva ni el zoom lo esconden con opacity 0', () => {
    // Todo lo que envuelve a las dos imágenes (diapositiva y zoom) va antes
    // del primer <img>; el bloque de texto, que sí entra con fade, va después.
    const envoltorios = html.slice(0, html.indexOf('<img'))
    expect(envoltorios).toContain('opacity:1')
    expect(envoltorios).not.toMatch(/opacity:\s*0[;"]/)
  })

  it('fuente: el póster usa preload + fetchPriority, no priority; las diapositivas siguientes siguen lazy', () => {
    const src = sinComentarios(readSource('components/hero-carousel.tsx'))
    expect(src).toMatch(/preload: true, fetchPriority: "high" as const/)
    expect(src).not.toMatch(/priority: true/)
    expect(src.match(/loading: "lazy" as const/g)).toHaveLength(2)
  })
})

describe('event-detail-page.tsx: el flyer de la ficha lleva fetchPriority alta', () => {
  it('usa preload + fetchPriority="high" y ya no priority', () => {
    const src = sinComentarios(readSource('components/event-detail-page.tsx'))
    const flyer = src.slice(src.indexOf('<FlyerImage'), src.indexOf('/>', src.indexOf('<FlyerImage')))
    expect(flyer).toMatch(/\bpreload\b/)
    expect(flyer).toMatch(/fetchPriority="high"/)
    expect(flyer).not.toMatch(/\bpriority\b/)
  })
})

describe('pistasDeCarga / cargaPorIndice', () => {
  it('diferida no agrega nada (next/image queda lazy), ansiosa es eager, prioritaria además fetchPriority high', () => {
    expect(pistasDeCarga()).toEqual({})
    expect(pistasDeCarga('diferida')).toEqual({})
    expect(pistasDeCarga('ansiosa')).toEqual({ loading: 'eager' })
    expect(pistasDeCarga('prioritaria')).toEqual({ loading: 'eager', fetchPriority: 'high' })
  })

  it('las dos primeras tarjetas cargan ansiosas y solo la primera con prioridad', () => {
    expect([0, 1, 2, 3].map((i) => cargaPorIndice(i))).toEqual(['prioritaria', 'ansiosa', 'diferida', 'diferida'])
  })
})

describe('MovieCard (/cines): el primer póster carga ansioso', () => {
  const pelicula = {
    id: 'peli-1',
    slug: 'peli-1',
    title: 'Película',
    poster_url: '/posters/peli-1.jpg',
    showings: {},
  } as unknown as CinemaMovie

  it('por defecto el póster sigue lazy', () => {
    const [img] = imgs(renderToStaticMarkup(React.createElement(MovieCard, { movie: pelicula })))
    expect(attr(img, 'loading')).toBe('lazy')
    expect(attr(img, 'fetchpriority')).toBeNull()
  })

  it('carga="prioritaria": eager + fetchpriority="high"', () => {
    const [img] = imgs(renderToStaticMarkup(React.createElement(MovieCard, { movie: pelicula, carga: 'prioritaria' })))
    expect(attr(img, 'loading')).toBe('eager')
    expect(attr(img, 'fetchpriority')).toBe('high')
  })

  it('carga="ansiosa": eager sin fetchpriority', () => {
    const [img] = imgs(renderToStaticMarkup(React.createElement(MovieCard, { movie: pelicula, carga: 'ansiosa' })))
    expect(attr(img, 'loading')).toBe('eager')
    expect(attr(img, 'fetchpriority')).toBeNull()
  })

  it('CinesView: la prioridad va al primer póster que existe, no a una tarjeta sin afiche', () => {
    const sinAfiche = { ...pelicula, id: 'peli-0', slug: 'peli-0', title: 'Sin afiche', poster_url: null } as unknown as CinemaMovie
    const segunda = { ...pelicula, id: 'peli-2', slug: 'peli-2', title: 'Otra', poster_url: '/posters/peli-2.jpg' } as unknown as CinemaMovie
    const tercera = { ...pelicula, id: 'peli-3', slug: 'peli-3', title: 'Tercera', poster_url: '/posters/peli-3.jpg' } as unknown as CinemaMovie
    const html = renderToStaticMarkup(React.createElement(CinesView, { movies: [sinAfiche, pelicula, segunda, tercera] }))
    const [primera, siguiente, ultima] = imgs(html)
    expect(attr(primera, 'src')).toContain('peli-1')
    expect(attr(primera, 'fetchpriority')).toBe('high')
    expect(attr(siguiente, 'loading')).toBe('eager')
    expect(attr(siguiente, 'fetchpriority')).toBeNull()
    expect(attr(ultima, 'loading')).toBe('lazy')
  })
})

describe('EventCard: prop carga', () => {
  it('sin la prop, el flyer queda lazy como siempre (filas de la portada, etc.)', () => {
    const [img] = imgs(renderToStaticMarkup(React.createElement(EventCard, { event: evento() })))
    expect(attr(img, 'loading')).toBe('lazy')
    expect(attr(img, 'fetchpriority')).toBeNull()
  })

  it('carga="prioritaria": eager + fetchpriority="high"', () => {
    const [img] = imgs(renderToStaticMarkup(React.createElement(EventCard, { event: evento(), carga: 'prioritaria' })))
    expect(attr(img, 'loading')).toBe('eager')
    expect(attr(img, 'fetchpriority')).toBe('high')
  })

  it('carga="ansiosa": eager sin fetchpriority', () => {
    const [img] = imgs(renderToStaticMarkup(React.createElement(EventCard, { event: evento(), carga: 'ansiosa' })))
    expect(attr(img, 'loading')).toBe('eager')
    expect(attr(img, 'fetchpriority')).toBeNull()
  })
})

describe('favicons de 32×32 reales', () => {
  /** Ancho y alto del PNG, leídos del IHDR (bytes 16-23, big endian). */
  function dimensionesPng(relativePath: string) {
    const buf = readFileSync(path.join(WEB_ROOT, relativePath))
    expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR')
    return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) }
  }

  for (const archivo of ['public/icon-light-32x32.png', 'public/icon-dark-32x32.png']) {
    it(`${archivo} mide 32×32 y pesa menos de 8 KB`, () => {
      expect(dimensionesPng(archivo)).toEqual({ ancho: 32, alto: 32 })
      expect(statSync(path.join(WEB_ROOT, archivo)).size).toBeLessThan(8 * 1024)
    })
  }

  it('public/brand/patron-claro.png: 640 px de ancho (2x de los 280-320 px a los que se muestra) y menos de 60 KB', () => {
    expect(dimensionesPng('public/brand/patron-claro.png').ancho).toBe(640)
    expect(statSync(path.join(WEB_ROOT, 'public/brand/patron-claro.png')).size).toBeLessThan(60 * 1024)
  })
})
