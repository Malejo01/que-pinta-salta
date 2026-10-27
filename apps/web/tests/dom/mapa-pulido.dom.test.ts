// @vitest-environment jsdom
//
// El pulido de accesibilidad de `/mapa` (C5) montado en un DOM real:
// - el anuncio de la selección para el lector de pantalla (WCAG 4.1.3),
// - "Ver en el mapa" no mueve el foco y solo mueve la página si el mapa no se
//   ve (cuando la mueve, el botón con el foco queda fuera de la pantalla),
// - con el mapa caído (`onFallo`) no hay "Ver en el mapa", y si el mapa vuelve
//   a cargar (`onListo`) vuelven,
// - `?lugar=` lleva el lugar a la vista en la lista con scroll propio,
// - lo que queda sin JavaScript (lo que manda el servidor en <noscript>).
//
// El mapa diferido es un doble que guarda sus props: así el test "toca un
// pin" llamando a `onSeleccionar` y "rompe el mapa" llamando a `onFallo`.
// `scrollIntoView` y `matchMedia` no existen en jsdom: se reemplazan por
// espías. Los `vi.mock` van acá (ver el comentario de `preparar-dom.ts`).
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { MapaContenido } from '@/app/mapa/mapa-contenido'
import { idBloqueLugar } from '@/components/mapa/lista-lugares'
import { SIN_FILTROS_EXTRA } from '@qps/core/mapa/filtros'
import type { PinLugar } from '@qps/core/mapa/pines'

const { replace, mapa } = vi.hoisted(() => ({
  replace: vi.fn(),
  /** Las últimas props que recibió el doble del mapa. */
  mapa: { props: null as null | { onSeleccionar: (venueId: string) => void; onFallo?: () => void; onListo?: () => void } },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

vi.mock('@/components/mapa/mapa-diferido', async () => {
  const { createElement } = await import('react')
  return {
    MapaDiferido: (props: { onSeleccionar: (venueId: string) => void; onFallo?: () => void; onListo?: () => void }) => {
      mapa.props = props
      return createElement('div', { 'data-testid': 'mapa-doble' })
    },
  }
})

// Un <a> común que llama a `onNavigate` en un clic sin modificadores, como el de verdad.
vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return {
    default: ({
      href,
      onNavigate,
      children,
      ...resto
    }: Record<string, unknown> & { href: string; onNavigate?: (evento: { preventDefault: () => void }) => void; children?: React.ReactNode }) =>
      createElement(
        'a',
        {
          href,
          ...resto,
          prefetch: undefined,
          onClick: (evento: React.MouseEvent) => {
            if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey || evento.button !== 0) return
            evento.preventDefault()
            onNavigate?.({ preventDefault: () => {} })
          },
        },
        children
      ),
  }
})

const AHORA_ISO = '2026-10-23T18:00:00.000Z'

/** Un pin inventado con `cantidad` eventos. */
function pin(n: number, cantidad: number): PinLugar {
  return {
    venueId: `lugar-de-prueba-${n}`,
    nombre: `Lugar de Prueba ${n}`,
    direccion: `Calle de Prueba ${n}`,
    lat: -24.7883,
    lng: -65.4106,
    eventos: Array.from({ length: cantidad }, (_, i) => ({
      id: `evento-${n}-${i}`,
      titulo: `Evento de Prueba ${n}-${i}`,
      inicio: '2026-10-23T23:00:00Z',
      categoria: 'musica',
    })),
  }
}

const PINES = [pin(1, 1), pin(2, 3), pin(3, 2)]

function props(lugarInicial: string | null = null, pines: PinLugar[] = PINES) {
  return { pines, sinUbicacion: 0, filtro: { tipo: 'hoy' as const }, extra: SIN_FILTROS_EXTRA, categorias: [], lugarInicial, ahoraISO: AHORA_ISO }
}

function montar(lugarInicial: string | null = null, pines: PinLugar[] = PINES) {
  return render(React.createElement(MapaContenido, props(lugarInicial, pines)))
}

function anuncio(): HTMLElement {
  const region = document.querySelector('[data-anuncio-mapa]') as HTMLElement
  expect(region).not.toBeNull()
  return region
}

/** "Ver en el mapa" de un lugar: su nombre accesible suma el del lugar (en un sr-only). */
function verEnElMapa(nombre: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^Ver en el mapa\\s*${nombre}$`) }) as HTMLButtonElement
}

/** El bloque que envuelve al mapa (el padre del doble): es el que se lleva a la vista. */
function bloqueMapa(): HTMLElement {
  return screen.getByTestId('mapa-doble').parentElement as HTMLElement
}

let scrollIntoView: ReturnType<typeof vi.fn>
let movimientoReducido = false

beforeEach(() => {
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView']
  movimientoReducido = false
  window.matchMedia = vi.fn((consulta: string) => ({
    matches: consulta.includes('prefers-reduced-motion') && movimientoReducido,
    media: consulta,
  })) as unknown as typeof window.matchMedia
  mapa.props = null
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

/** El elemento sobre el que se llamó cada `scrollIntoView`, con sus opciones. */
function scrolls(): [Element, unknown][] {
  return scrollIntoView.mock.contexts.map((elemento, i) => [elemento as Element, scrollIntoView.mock.calls[i][0]])
}

describe('el anuncio de la selección (WCAG 4.1.3)', () => {
  it('es una región viva aparte del contador, montada y vacía al abrir', () => {
    montar()
    const region = anuncio()
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.className).toBe('sr-only')
    expect(region.textContent).toBe('')
    expect(screen.getByText('6 eventos en 3 lugares').getAttribute('aria-live')).toBe('polite')
  })

  it('al tocar un pin dice el lugar y cuántos eventos tiene (plural y singular)', () => {
    montar()
    act(() => mapa.props!.onSeleccionar('lugar-de-prueba-2'))
    expect(anuncio().textContent!.trim()).toBe('Lugar de Prueba 2, seleccionado: 3 eventos')
    act(() => mapa.props!.onSeleccionar('lugar-de-prueba-1'))
    expect(anuncio().textContent!.trim()).toBe('Lugar de Prueba 1, seleccionado: 1 evento')
    // El contador no cambia: el anuncio va aparte.
    expect(screen.getByText('6 eventos en 3 lugares')).toBeTruthy()
  })

  it('tocar el mismo pin dos veces cambia el texto igual, así se vuelve a anunciar', () => {
    montar()
    act(() => mapa.props!.onSeleccionar('lugar-de-prueba-3'))
    const primero = anuncio().textContent
    act(() => mapa.props!.onSeleccionar('lugar-de-prueba-3'))
    const segundo = anuncio().textContent
    expect(primero).not.toBe(segundo)
    expect(primero!.trim()).toBe(segundo!.trim())
  })

  it('"Ver en el mapa" dice "Mapa centrado en ‹nombre›"', () => {
    montar()
    fireEvent.click(verEnElMapa('Lugar de Prueba 3'))
    expect(anuncio().textContent!.trim()).toBe('Mapa centrado en Lugar de Prueba 3')
  })

  it('cambiar de filtro borra el anuncio (lo que se dice después es el contador nuevo)', () => {
    montar()
    act(() => mapa.props!.onSeleccionar('lugar-de-prueba-2'))
    fireEvent.click(screen.getByRole('button', { name: 'Este finde' }))
    expect(anuncio().textContent).toBe('')
  })
})

describe('"Ver en el mapa": el foco se queda en el botón y la página solo se mueve si el mapa no se ve', () => {
  function cajaDelMapa(top: number, height = 300) {
    vi.spyOn(bloqueMapa(), 'getBoundingClientRect').mockReturnValue({ top, bottom: top + height, height, left: 0, right: 360, width: 360, x: 0, y: top, toJSON: () => ({}) } as DOMRect)
  }

  it('si el mapa se ve, no se mueve la página y el foco sigue en el botón', () => {
    montar()
    cajaDelMapa(100)
    const boton = verEnElMapa('Lugar de Prueba 3')
    boton.focus()
    fireEvent.click(boton)
    expect(scrolls().filter(([elemento]) => elemento === bloqueMapa())).toHaveLength(0)
    expect(document.activeElement).toBe(boton)
  })

  it('si el mapa quedó arriba, fuera de la pantalla, se lo trae (block: nearest) sin mover el foco', () => {
    montar()
    cajaDelMapa(-900)
    const boton = verEnElMapa('Lugar de Prueba 3')
    boton.focus()
    fireEvent.click(boton)
    expect(scrolls()).toEqual([[bloqueMapa(), { block: 'nearest', behavior: 'smooth' }]])
    expect(document.activeElement).toBe(boton)
  })

  it('si solo asoma el borde del mapa (el pin centrado no se ve), también se lo trae; con movimiento reducido, sin animar', () => {
    movimientoReducido = true
    montar()
    cajaDelMapa(-250) // de -250 a 50: el centro (-100) no se ve
    fireEvent.click(verEnElMapa('Lugar de Prueba 1'))
    expect(scrolls()).toEqual([[bloqueMapa(), { block: 'nearest', behavior: 'auto' }]])
  })
})

describe('con el mapa caído (onFallo) no hay "Ver en el mapa"', () => {
  it('le pasa onFallo al mapa, y al fallar se van los botones pero queda la lista', () => {
    montar()
    expect(screen.getAllByRole('button', { name: /^Ver en el mapa/ })).toHaveLength(3)
    expect(typeof mapa.props!.onFallo).toBe('function')
    act(() => mapa.props!.onFallo!())
    expect(screen.queryAllByRole('button', { name: /^Ver en el mapa/ })).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Lugar de Prueba 2' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Evento de Prueba 2-0' })).toBeTruthy()
  })

  it('si el foco estaba en un "Ver en el mapa", no se pierde: pasa al primer evento de ese lugar', () => {
    montar()
    verEnElMapa('Lugar de Prueba 2').focus()
    act(() => mapa.props!.onFallo!())
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Evento de Prueba 2-0' }))
  })

  it('si el mapa vuelve (otro día sin pines lo desmonta y al volver carga bien: onListo), vuelven los botones', () => {
    const { rerender } = montar()
    act(() => mapa.props!.onFallo!())
    expect(screen.queryAllByRole('button', { name: /^Ver en el mapa/ })).toHaveLength(0)

    // Un día sin pines: el mapa se desmonta. Siguen sin botones (no hay lista).
    rerender(React.createElement(MapaContenido, props(null, [])))
    expect(screen.queryByTestId('mapa-doble')).toBeNull()

    // Se vuelve a un día con pines: el mapa se monta de nuevo; hasta que avise, sin botones.
    rerender(React.createElement(MapaContenido, props(null, PINES)))
    expect(screen.queryAllByRole('button', { name: /^Ver en el mapa/ })).toHaveLength(0)
    expect(typeof mapa.props!.onListo).toBe('function')
    act(() => mapa.props!.onListo!())
    expect(screen.getAllByRole('button', { name: /^Ver en el mapa/ })).toHaveLength(3)
  })

  it('si el foco estaba en otro lado, no se toca', () => {
    montar()
    const evento = screen.getByRole('link', { name: 'Evento de Prueba 3-1' })
    evento.focus()
    act(() => mapa.props!.onFallo!())
    expect(document.activeElement).toBe(evento)
  })
})

describe('?lugar= lleva el lugar a la vista en la lista', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  /**
   * La lista con scroll propio (la compu): más contenido que alto, la lista va
   * de y=300 a y=800 y cada lugar mide 150 (el n-ésimo empieza en 300 + 150·(n-1)).
   */
  function lista(conScroll: boolean) {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(conScroll ? 2000 : 500)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const n = /^lugar-lugar-de-prueba-(\d+)$/.exec(this.id)
      const top = n ? 300 + 150 * (Number(n[1]) - 1) : 300
      const height = n ? 150 : 500
      return { top, bottom: top + height, height, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
    scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement['scrollTo']
  }

  const MUCHOS = Array.from({ length: 8 }, (_, i) => pin(i + 1, 1))

  /** El contenedor con scroll de la lista (el padre de la <ul> de lugares). */
  function contenedorDeLaLista(): Element {
    return document.getElementById(idBloqueLugar('lugar-de-prueba-1'))!.closest('ul')!.parentElement!
  }

  it('si el lugar quedó abajo, mueve solo la lista (no la página) hasta dejarlo arriba de todo', () => {
    lista(true)
    montar('lugar-de-prueba-6', MUCHOS)
    expect(document.getElementById(idBloqueLugar('lugar-de-prueba-6'))!.getAttribute('aria-current')).toBe('true')
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.contexts[0]).toBe(contenedorDeLaLista())
    expect(scrollTo.mock.calls[0][0]).toEqual({ top: 750, behavior: 'smooth' })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('con movimiento reducido, sin animar', () => {
    movimientoReducido = true
    lista(true)
    montar('lugar-de-prueba-8', MUCHOS)
    expect(scrollTo.mock.calls).toEqual([[{ top: 1050, behavior: 'auto' }]])
  })

  it('si el lugar ya se ve en la lista, no la mueve', () => {
    lista(true)
    montar('lugar-de-prueba-2', MUCHOS)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('en el celular (la lista no tiene scroll propio) no baja la página: el mapa de arriba ya muestra el pin', () => {
    lista(false)
    montar('lugar-de-prueba-6', MUCHOS)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('sin ?lugar= no se mueve nada', () => {
    lista(true)
    montar(null, MUCHOS)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('sin JavaScript (lo que manda el servidor)', () => {
  const html = () => renderToStaticMarkup(React.createElement(MapaContenido, props()))

  /** El HTML de cada <noscript> del servidor, ya armado como DOM (sin JavaScript el navegador lo lee así). */
  function noscripts(markup: string): HTMLElement[] {
    return [...markup.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map(([, adentro]) => {
      const caja = document.createElement('div')
      caja.innerHTML = adentro
      return caja
    })
  }

  it('los filtros van en un <form action="/mapa" method="get"> con "Ver ese día" y "Aplicar categoría" adentro de <noscript>', () => {
    const markup = html()
    const contenedor = document.createElement('div')
    contenedor.innerHTML = markup
    const form = contenedor.querySelector('form')!
    expect(form.getAttribute('action')).toBe('/mapa')
    expect(form.getAttribute('method')).toBe('get')

    const botones = noscripts(markup)
      .flatMap((caja) => Array.from(caja.querySelectorAll('button')))
      .map((boton) => [boton.textContent, boton.type, boton.name, boton.value])
    expect(botones).toEqual([
      ['Ver ese día', 'submit', 'cuando', 'fecha'],
      ['Aplicar categoría', 'submit', 'cuando', 'hoy'],
    ])
  })

  it('"Ver en el mapa" se esconde con un <style> en <noscript> (el mapa tampoco está)', () => {
    const markup = html()
    expect(markup).toContain('<noscript><style>[data-ver-en-el-mapa]{display:none}</style></noscript>')
    expect(markup.match(/<button type="button" data-ver-en-el-mapa=""/g)).toHaveLength(3)
  })
})
