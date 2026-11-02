// @vitest-environment jsdom
//
// Los filtros y la lista de lugares de /mapa en inglés (78-a): etiquetas
// traducidas, links con los MISMOS query params que en castellano pero bajo
// /en/mapa, y nombres, direcciones y títulos de eventos (contenido de la
// fuente) con lang="es". En castellano no aparece ningún lang. Se montan
// `FiltrosQue` y `ListaLugares` directo (no llevan AvisoContenidoEs ni
// usePathname). Sin red ni base.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { FiltrosQue, nombresDeFiltrosExtra, urlDelMapa } from '@/components/mapa/filtros-mapa'
import { ListaLugares } from '@/components/mapa/lista-lugares'
import type { FiltrosExtraMapa, CategoriaDelMapa } from '@qps/core/mapa/filtros'
import type { PinLugar } from '@qps/core/mapa/pines'

vi.mock('next/link', () => ({
  default: ({ href, onNavigate, children, ...resto }: { href: string; onNavigate?: unknown; children?: React.ReactNode } & Record<string, unknown>) => {
    delete resto.prefetch
    return React.createElement('a', { href, ...resto }, children)
  },
}))

afterEach(() => {
  cleanup()
})

const CATEGORIAS: CategoriaDelMapa[] = [
  { slug: 'teatro', name: 'Teatro', cantidad: 2 },
  { slug: 'categoria-nueva', name: 'Categoría Nueva', cantidad: 1 },
]

const SIN_EXTRA: FiltrosExtraMapa = { gratis: false, chicos: false, categoria: null }

function pin(): PinLugar {
  return {
    venueId: 'lugar-de-prueba-1',
    nombre: 'Peña de Prueba',
    direccion: 'Calle de Prueba 123',
    lat: -24.7883,
    lng: -65.4106,
    eventos: [{ id: 'evento-de-prueba-1', titulo: 'Show de Prueba', inicio: '2026-10-23T23:00:00Z', categoria: 'teatro' }],
  }
}

function montarFiltros(idioma?: 'es' | 'en', extra: FiltrosExtraMapa = SIN_EXTRA, filtro: Parameters<typeof urlDelMapa>[0] = { tipo: 'finde' }) {
  return render(
    React.createElement(FiltrosQue, { extra, filtro, categorias: CATEGORIAS, onCambiar: vi.fn(), idioma }),
  )
}

describe('urlDelMapa', () => {
  it('castellano: /mapa?…; inglés: /en/mapa?… con exactamente los mismos parámetros', () => {
    const extra: FiltrosExtraMapa = { gratis: true, chicos: true, categoria: 'teatro' }
    const es = urlDelMapa({ tipo: 'finde' }, extra)
    const en = urlDelMapa({ tipo: 'finde' }, extra, 'en')
    expect(es).toBe('/mapa?cuando=finde&gratis=1&chicos=1&categoria=teatro')
    expect(en).toBe('/en/mapa?cuando=finde&gratis=1&chicos=1&categoria=teatro')
    expect(en.replace('/en/mapa', '/mapa')).toBe(es)
  })

  it('con día elegido conserva cuando=fecha&dia=', () => {
    expect(urlDelMapa({ tipo: 'fecha', dia: '2026-10-25' }, SIN_EXTRA, 'en')).toBe('/en/mapa?cuando=fecha&dia=2026-10-25')
  })
})

describe('FiltrosQue en inglés', () => {
  it('etiquetas traducidas: grupo «Type of plan», chips «Free» y «For kids», selector «Category» con «All»', () => {
    montarFiltros('en')
    expect(screen.getByRole('group', { name: 'Type of plan' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Free' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'For kids' })).toBeTruthy()
    expect(screen.getByText('Category')).toBeTruthy()
    const opciones = Array.from((screen.getByRole('combobox') as HTMLSelectElement).options).map((o) => [o.value, o.textContent])
    expect(opciones[0]).toEqual(['', 'All'])
    expect(screen.queryByText('Gratis')).toBeNull()
    expect(screen.queryByText('Para chicos')).toBeNull()
  })

  it('las categorías se traducen por slug; una sin traducción queda en castellano con lang="es"', () => {
    montarFiltros('en')
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const teatro = select.querySelector('option[value="teatro"]') as HTMLOptionElement
    const nueva = select.querySelector('option[value="categoria-nueva"]') as HTMLOptionElement
    expect(teatro.textContent).toBe('Theater (2)')
    expect(teatro.hasAttribute('lang')).toBe(false)
    expect(nueva.textContent).toBe('Categoría Nueva (1)')
    expect(nueva.getAttribute('lang')).toBe('es')
  })

  it('los links de los chips van bajo /en/mapa con los mismos query params que en castellano', () => {
    const extra: FiltrosExtraMapa = { gratis: true, chicos: false, categoria: 'teatro' }
    const { unmount } = montarFiltros('en', extra)
    const hrefsEn = ['Free', 'For kids'].map((n) => screen.getByRole('button', { name: n }).getAttribute('href'))
    unmount()
    montarFiltros('es', extra)
    const hrefsEs = ['Gratis', 'Para chicos'].map((n) => screen.getByRole('button', { name: n }).getAttribute('href'))
    expect(hrefsEn).toEqual(['/en/mapa?cuando=finde&categoria=teatro', '/en/mapa?cuando=finde&gratis=1&chicos=1&categoria=teatro'])
    expect(hrefsEn.map((h) => h!.replace('/en/mapa', '/mapa'))).toEqual(hrefsEs)
  })

  it('aria-pressed sigue a los filtros prendidos', () => {
    montarFiltros('en', { gratis: false, chicos: true, categoria: null })
    expect(screen.getByRole('button', { name: 'Free' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'For kids' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('el selector avisa el cambio y el input oculto sigue llamándose gratis/chicos', () => {
    const onCambiar = vi.fn()
    const { container } = render(
      React.createElement(FiltrosQue, { extra: { gratis: true, chicos: true, categoria: null }, filtro: { tipo: 'hoy' }, categorias: CATEGORIAS, onCambiar, idioma: 'en' }),
    )
    expect(Array.from(container.querySelectorAll('input[type="hidden"]')).map((i) => (i as HTMLInputElement).name)).toEqual(['gratis', 'chicos'])
    expect((screen.getByRole('combobox') as HTMLSelectElement).name).toBe('categoria')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'teatro' } })
    expect(onCambiar).toHaveBeenCalledWith({ gratis: true, chicos: true, categoria: 'teatro' })
  })
})

describe('FiltrosQue por omisión es el de siempre', () => {
  it('sin idioma: castellano, links a /mapa y ningún lang en las opciones', () => {
    const { container } = montarFiltros(undefined)
    expect(screen.getByRole('group', { name: 'Qué tipo de plan' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gratis' }).getAttribute('href')).toBe('/mapa?cuando=finde&gratis=1')
    expect(container.querySelectorAll('[lang]')).toHaveLength(0)
    expect((screen.getByRole('combobox') as HTMLSelectElement).options[0].textContent).toBe('Todas')
  })
})

describe('nombresDeFiltrosExtra', () => {
  const extra: FiltrosExtraMapa = { gratis: true, chicos: true, categoria: 'teatro' }
  it('castellano e inglés', () => {
    expect(nombresDeFiltrosExtra(extra, CATEGORIAS)).toBe('Gratis · Para chicos · Teatro')
    expect(nombresDeFiltrosExtra(extra, CATEGORIAS, 'en')).toBe('Free · For kids · Theater')
  })
})

describe('ListaLugares en inglés', () => {
  it('«View on map» en inglés; nombre, dirección y título del evento con lang="es"', () => {
    const { container } = render(
      React.createElement(ListaLugares, { pines: [pin()], seleccionado: null, onVerEnElMapa: vi.fn(), idioma: 'en' }),
    )
    expect(screen.getByRole('heading', { name: 'Peña de Prueba' }).getAttribute('lang')).toBe('es')
    expect(screen.getByText('Calle de Prueba 123').getAttribute('lang')).toBe('es')
    const enlace = screen.getByRole('link', { name: 'Show de Prueba' })
    expect(enlace.getAttribute('lang')).toBe('es')
    expect(enlace.getAttribute('href')).toBe('/en/evento/evento-de-prueba-1')
    const boton = container.querySelector('[data-ver-en-el-mapa]') as HTMLElement
    expect(boton.textContent).toContain('View on map')
    expect(boton.textContent).not.toContain('Ver en el mapa')
    // El nombre que lee el lector de pantalla junto al botón también está marcado como castellano.
    expect(boton.querySelector('.sr-only')!.getAttribute('lang')).toBe('es')
  })

  it('la hora sale en formato inglés (AM/PM)', () => {
    const { container } = render(
      React.createElement(ListaLugares, { pines: [pin()], seleccionado: null, onVerEnElMapa: vi.fn(), idioma: 'en' }),
    )
    expect(container.querySelector('time')!.textContent).toMatch(/\b8:00 PM$/)
  })

  it('el botón llama a onVerEnElMapa con el id del lugar; sin mapa disponible no se muestra', () => {
    const onVer = vi.fn()
    const { container, rerender } = render(
      React.createElement(ListaLugares, { pines: [pin()], seleccionado: null, onVerEnElMapa: onVer, idioma: 'en' }),
    )
    fireEvent.click(container.querySelector('[data-ver-en-el-mapa]') as HTMLElement)
    expect(onVer).toHaveBeenCalledWith('lugar-de-prueba-1')
    rerender(React.createElement(ListaLugares, { pines: [pin()], seleccionado: null, onVerEnElMapa: onVer, idioma: 'en', mapaDisponible: false }))
    expect(container.querySelector('[data-ver-en-el-mapa]')).toBeNull()
  })
})

describe('ListaLugares por omisión es la de siempre', () => {
  it('castellano: «Ver en el mapa», link a /evento/<id>, hora de siempre y ningún lang', () => {
    const { container } = render(
      React.createElement(ListaLugares, { pines: [pin()], seleccionado: 'lugar-de-prueba-1', onVerEnElMapa: vi.fn() }),
    )
    expect(screen.getByRole('link', { name: 'Show de Prueba' }).getAttribute('href')).toBe('/evento/evento-de-prueba-1')
    expect((container.querySelector('[data-ver-en-el-mapa]') as HTMLElement).textContent).toContain('Ver en el mapa')
    // La hora en castellano es la de siempre (formatEventTime: «08:00 p. m.»), no la de inglés.
    expect(container.querySelector('time')!.textContent).toMatch(/^23 oct · 08:00/)
    expect(container.querySelector('time')!.textContent).not.toMatch(/\bPM\b/)
    expect(container.querySelectorAll('[lang]')).toHaveLength(0)
    expect(container.querySelector('li[aria-current="true"]')).not.toBeNull()
  })
})
