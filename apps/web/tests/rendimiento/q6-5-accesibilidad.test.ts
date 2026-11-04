/**
 * Q6-5 (accesibilidad, Lighthouse en celular): los dos avisos que daba
 * Lighthouse en las páginas medidas, arreglados y fijados con el marcado que
 * sale del servidor.
 *
 *  - target-size (WCAG 2.5.8) en la portada: los puntos del carrusel eran
 *    botones de 8×8 px (el área ampliada era un `::after`, que no cuenta).
 *    Ahora el botón mide al menos 24×24 (`h-6 min-w-6`) y el punto visible es
 *    un `<span>` adentro, del mismo tamaño que antes.
 *  - color-contrast en /mapa: el ítem activo de la barra inferior, en modo
 *    oscuro, era rojo `primary` sobre el fondo (4,3:1 con letra de 11 px).
 *    Ahora lleva `dark:text-[#F0585D]` (5,9:1), el mismo tono de los links
 *    rojos en oscuro.
 */
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DisplayEvent } from '@qps/core/home/types'

const { rutaActual } = vi.hoisted(() => ({ rutaActual: { valor: '/mapa' } }))
vi.mock('next/navigation', () => ({ usePathname: () => rutaActual.valor }))

import { HeroCarousel } from '@/components/hero-carousel'
import { MobileNav } from '@/components/mobile-nav'

function evento(n: number): DisplayEvent {
  return {
    id: `ev-${n}`,
    slug: `ev-${n}`,
    title: `Peña ${n}`,
    venue: 'La Casona',
    date: '2026-10-30',
    time: '21:00',
    category: 'penas',
    categoryName: 'Peñas',
    price: 'gratis',
    image: `/flyers/ev-${n}.jpg`,
    description: 'Una peña',
    address: 'Balcarce 1',
    startDateTime: '2026-10-30T21:00:00-03:00',
    isFeatured: false,
  }
}

/** Las etiquetas `<button …>…</button>` de los puntos del carrusel. */
function puntos(html: string): string[] {
  return html.match(/<button\b[^>]*aria-label="Ir al evento \d+"[^>]*>[\s\S]*?<\/button>/g) ?? []
}
const clases = (etiqueta: string) => (etiqueta.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

describe('HeroCarousel: los puntos son áreas de toque de al menos 24×24 px (target-size)', () => {
  const html = renderToStaticMarkup(React.createElement(HeroCarousel, { events: [1, 2, 3, 4].map(evento) }))
  const botones = puntos(html)

  it('hay un botón por evento', () => {
    expect(botones).toHaveLength(4)
  })

  it.each([0, 1, 2, 3])('el botón %i mide 24 px de alto y al menos 24 de ancho', (i) => {
    const deBoton = clases(botones[i])
    expect(deBoton).toContain('h-6')
    expect(deBoton).toContain('min-w-6')
    // El botón ya no es el punto de 8 px.
    expect(deBoton).not.toContain('h-2')
  })

  it('el punto visible va adentro, oculto para el lector de pantalla, con el tamaño de antes', () => {
    for (const [i, boton] of botones.entries()) {
      const punto = boton.match(/<span\b[^>]*>/)?.[0] ?? ''
      expect(punto).toContain('aria-hidden="true"')
      expect(clases(punto)).toContain('h-2')
      expect(clases(punto)).toContain(i === 0 ? 'w-8' : 'w-2')
    }
  })

  it('el punto del evento que se ve lleva aria-current, los otros no', () => {
    expect(botones[0]).toContain('aria-current="true"')
    for (const boton of botones.slice(1)) expect(boton).not.toContain('aria-current')
  })
})

describe('MobileNav: el ítem activo tiene contraste suficiente en modo oscuro (color-contrast)', () => {
  it.each(['/mapa', '/', '/buscar'])('en %s, el activo lleva el rojo claro en oscuro; los otros no', (ruta) => {
    rutaActual.valor = ruta
    const html = renderToStaticMarkup(React.createElement(MobileNav))
    const enlaces = html.match(/<a\b[^>]*>/g) ?? []
    expect(enlaces).toHaveLength(5)
    for (const enlace of enlaces) {
      const activo = enlace.includes('aria-current="page"')
      expect(clases(enlace).includes('dark:text-[#F0585D]'), enlace).toBe(activo)
    }
  })
})
