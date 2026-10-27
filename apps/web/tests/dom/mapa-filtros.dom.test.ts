// @vitest-environment jsdom
//
// Los filtros "qué" de `/mapa` (Q3) montados en un DOM real: `MapaContenido`
// con las dos filas ("Cuándo" y "Qué"), el contador, el vacío con filtros y
// "Quitar filtros". Va en `tests/dom/` y no en `tests/mapa/` porque solo esta
// carpeta puede pedir jsdom (ver `convencion-entorno.test.ts`).
//
// El router es un doble: lo que se mira es la URL que se pide con
// `replace`, no la página que vuelve del servidor (eso lo cubren
// `tests/mapa/pagina.test.ts` y `tests/core/mapa-filtros.test.ts`). El mapa
// diferido se reemplaza por un componente nulo: acá no importa el mapa.
//
// Los `vi.mock` van en este archivo (se izan al principio de ESTE archivo,
// antes de resolver el componente); ver el comentario de `preparar-dom.ts`.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { MapaContenido } from '@/app/mapa/mapa-contenido'
import { SIN_FILTROS_EXTRA, type CategoriaDelMapa, type FiltrosExtraMapa } from '@qps/core/mapa/filtros'
import type { FiltroMapa, PinLugar } from '@qps/core/mapa/pines'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

vi.mock('@/components/mapa/mapa-diferido', () => ({
  MapaDiferido: () => null,
}))

// `next/link` real necesita el router de la app: un <a> común alcanza para
// mirar el href. Imita lo que hace el de verdad con `onNavigate`: en un clic
// sin modificadores lo llama (y el navegador no sigue el link); con Ctrl o
// Cmd no, y el link queda para el navegador (abrir en otra pestaña).
vi.mock('next/link', () => ({
  default: ({
    href,
    onNavigate,
    children,
    ...resto
  }: {
    href: string
    onNavigate?: (evento: { preventDefault: () => void }) => void
    children?: React.ReactNode
  } & Record<string, unknown>) =>
    React.createElement(
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
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const AHORA_ISO = '2026-10-23T18:00:00.000Z' // viernes 15:00 en Salta: "hoy" es el 23

const CATEGORIAS: CategoriaDelMapa[] = [
  { slug: 'musica', name: 'Música', cantidad: 5 },
  { slug: 'teatro', name: 'Teatro', cantidad: 2 },
]

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

interface Props {
  pines?: PinLugar[]
  filtro?: FiltroMapa
  extra?: FiltrosExtraMapa
  categorias?: CategoriaDelMapa[]
}

function props({ pines = [pin(1, 1)], filtro = { tipo: 'hoy' }, extra = SIN_FILTROS_EXTRA, categorias = CATEGORIAS }: Props = {}) {
  return { pines, sinUbicacion: 0, filtro, extra, categorias, lugarInicial: null, ahoraISO: AHORA_ISO }
}

function montar(p: Props = {}) {
  return render(React.createElement(MapaContenido, props(p)))
}

/** Un chip de filtro ("Hoy", "Gratis"…) o "Quitar filtros": son links a su URL, para que anden sin JavaScript. */
function chip(nombre: string): HTMLAnchorElement {
  return screen.getByRole('link', { name: nombre }) as HTMLAnchorElement
}

function selectorDeCategoria(): HTMLSelectElement {
  return screen.getByRole('combobox') as HTMLSelectElement
}

/** El contador: la región viva que no es el anuncio de la selección (hay exactamente esas dos). */
function contador(container: HTMLElement): HTMLElement {
  const vivos = container.querySelectorAll('[aria-live="polite"]')
  expect(vivos).toHaveLength(2)
  const sinAnuncio = container.querySelectorAll('[aria-live="polite"]:not([data-anuncio-mapa])')
  expect(sinAnuncio).toHaveLength(1)
  return sinAnuncio[0] as HTMLElement
}

/** La última URL que se pidió con `router.replace`. */
function ultimaUrl(): string {
  expect(replace).toHaveBeenCalled()
  const [url, opciones] = replace.mock.calls[replace.mock.calls.length - 1]
  expect(opciones).toEqual({ scroll: false })
  return url
}

describe('las dos filas de filtros', () => {
  it('"Cuándo" y "Qué tipo de plan" son grupos con nombre, y los chips llevan aria-current según extra', () => {
    montar({ extra: { gratis: true, chicos: false, categoria: null } })
    const cuando = screen.getByRole('group', { name: 'Cuándo' })
    const que = screen.getByRole('group', { name: 'Qué tipo de plan' })
    expect(cuando.contains(chip('Hoy'))).toBe(true)
    expect(que.contains(chip('Gratis'))).toBe(true)
    expect(que.contains(selectorDeCategoria())).toBe(true)

    expect(chip('Gratis').getAttribute('aria-current')).toBe('true')
    expect(chip('Para chicos').getAttribute('aria-current')).toBeNull()
    expect(chip('Gratis').className).toContain('bg-primary')
    expect(chip('Para chicos').className).not.toContain('bg-primary')
    // En un link aria-pressed no vale (no es un botón): no tiene que quedar ninguno.
    expect(document.querySelectorAll('[aria-pressed]')).toHaveLength(0)
  })

  it('con Para chicos prendido, el que dice aria-current="true" es Para chicos', () => {
    montar({ extra: { gratis: false, chicos: true, categoria: null } })
    expect(chip('Gratis').getAttribute('aria-current')).toBeNull()
    expect(chip('Para chicos').getAttribute('aria-current')).toBe('true')
  })

  it('"Hoy" o "Este finde": el de la fecha activa lleva aria-current, y con una fecha elegida ninguno', () => {
    montar({ filtro: { tipo: 'finde' } })
    expect(chip('Hoy').getAttribute('aria-current')).toBeNull()
    expect(chip('Este finde').getAttribute('aria-current')).toBe('true')
    cleanup()
    montar({ filtro: { tipo: 'fecha', dia: '2026-10-25' } })
    expect(chip('Hoy').getAttribute('aria-current')).toBeNull()
    expect(chip('Este finde').getAttribute('aria-current')).toBeNull()
  })
})

describe('sin JavaScript los filtros andan igual', () => {
  it('cada chip es un link a la URL que pediría con JavaScript (se puede compartir o abrir en otra pestaña)', () => {
    montar({ filtro: { tipo: 'finde' }, extra: { gratis: true, chicos: false, categoria: 'teatro' } })
    expect(chip('Hoy').getAttribute('href')).toBe('/mapa?cuando=hoy&gratis=1&categoria=teatro')
    expect(chip('Este finde').getAttribute('href')).toBe('/mapa?cuando=finde&gratis=1&categoria=teatro')
    expect(chip('Gratis').getAttribute('href')).toBe('/mapa?cuando=finde&categoria=teatro')
    expect(chip('Para chicos').getAttribute('href')).toBe('/mapa?cuando=finde&gratis=1&chicos=1&categoria=teatro')
    expect(chip('Quitar filtros').getAttribute('href')).toBe('/mapa?cuando=finde')
  })

  it('el día y la categoría van en un <form action="/mapa" method="get"> con los nombres que lee el servidor', () => {
    const { container } = montar({ filtro: { tipo: 'fecha', dia: '2026-10-25' }, extra: { gratis: true, chicos: true, categoria: null } })
    const form = container.querySelector('form') as HTMLFormElement
    expect(form.getAttribute('action')).toBe('/mapa')
    expect(form.getAttribute('method')).toBe('get')
    expect(form.contains(selectorDeCategoria())).toBe(true)
    expect(selectorDeCategoria().name).toBe('categoria')
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).name).toBe('dia')
    const ocultos = Array.from(form.querySelectorAll('input[type="hidden"]')).map((i) => [(i as HTMLInputElement).name, (i as HTMLInputElement).value])
    expect(ocultos).toEqual([
      ['gratis', '1'],
      ['chicos', '1'],
    ])
  })

  it('los botones "Ver ese día" y "Aplicar" están solo en <noscript> (con JavaScript no se ven)', () => {
    const { container } = montar({ filtro: { tipo: 'finde' } })
    // React no dibuja el contenido de <noscript> en el cliente: con JS no hay botones de enviar.
    expect(container.querySelectorAll('noscript').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0)
  })

  it('con JavaScript el formulario no se envía (Enter en el selector de fecha no recarga la página)', () => {
    const { container } = montar()
    const form = container.querySelector('form') as HTMLFormElement
    expect(fireEvent.submit(form)).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('un clic con Ctrl queda para el navegador: no navega desde la app', () => {
    montar()
    // Se mira si la app lo previno y después se lo frena acá (jsdom no sabe abrir otra pestaña).
    let prevenidoPorLaApp: boolean | null = null
    const mirar = (evento: Event) => {
      prevenidoPorLaApp = evento.defaultPrevented
      evento.preventDefault()
    }
    window.addEventListener('click', mirar)
    try {
      fireEvent.click(chip('Gratis'), { ctrlKey: true })
    } finally {
      window.removeEventListener('click', mirar)
    }
    expect(prevenidoPorLaApp).toBe(false)
    expect(replace).not.toHaveBeenCalled()

    // Y sin Ctrl, el mismo chip sí navega desde la app (el control de arriba no es ciego).
    window.addEventListener('click', mirar)
    try {
      fireEvent.click(chip('Gratis'))
    } finally {
      window.removeEventListener('click', mirar)
    }
    expect(prevenidoPorLaApp).toBe(true)
    expect(ultimaUrl()).toBe('/mapa?cuando=hoy&gratis=1')
  })
})

describe('cada cambio navega con consultaDelMapa', () => {
  it('tocar Gratis desde "hoy" pide /mapa?cuando=hoy&gratis=1', () => {
    montar()
    fireEvent.click(chip('Gratis'))
    expect(ultimaUrl()).toBe('/mapa?cuando=hoy&gratis=1')
  })

  it('tocar Gratis cuando ya está prendido lo apaga y conserva lo demás', () => {
    montar({ filtro: { tipo: 'finde' }, extra: { gratis: true, chicos: true, categoria: null } })
    fireEvent.click(chip('Gratis'))
    expect(ultimaUrl()).toBe('/mapa?cuando=finde&chicos=1')
  })

  it('cambiar la fecha conserva gratis=1 (el selector de fecha y los botones)', () => {
    const { container } = montar({ extra: { gratis: true, chicos: false, categoria: null } })
    const fecha = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(fecha, { target: { value: '2026-10-25' } })
    expect(ultimaUrl()).toBe('/mapa?cuando=fecha&dia=2026-10-25&gratis=1')

    fireEvent.click(chip('Este finde'))
    expect(ultimaUrl()).toBe('/mapa?cuando=finde&gratis=1')
  })

  it('una fecha fuera de rango no navega', () => {
    const { container } = montar()
    const fecha = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(fecha, { target: { value: '2026-10-01' } })
    expect(replace).not.toHaveBeenCalled()
  })

  it('el selector de categoría navega con categoria=<slug>, y "Todas" la saca', () => {
    montar({ filtro: { tipo: 'fecha', dia: '2026-10-25' } })
    fireEvent.change(selectorDeCategoria(), { target: { value: 'teatro' } })
    expect(ultimaUrl()).toBe('/mapa?cuando=fecha&dia=2026-10-25&categoria=teatro')

    cleanup()
    replace.mockClear()
    montar({ extra: { gratis: false, chicos: false, categoria: 'teatro' } })
    fireEvent.change(selectorDeCategoria(), { target: { value: '' } })
    expect(ultimaUrl()).toBe('/mapa?cuando=hoy')
  })
})

describe('el selector de categoría', () => {
  it('"Todas" primero y después cada categoría con su cantidad', () => {
    montar()
    const opciones = Array.from(selectorDeCategoria().options).map((o) => [o.value, o.textContent])
    expect(opciones).toEqual([
      ['', 'Todas'],
      ['musica', 'Música (5)'],
      ['teatro', 'Teatro (2)'],
    ])
    expect(selectorDeCategoria().value).toBe('')
  })

  it('la elegida con 0 dice "(0)", queda seleccionada y el chip se ve activo', () => {
    montar({
      pines: [],
      extra: { gratis: false, chicos: false, categoria: 'teatro' },
      categorias: [CATEGORIAS[0], { slug: 'teatro', name: 'Teatro', cantidad: 0 }],
    })
    const selector = selectorDeCategoria()
    expect(selector.value).toBe('teatro')
    expect(selector.selectedOptions[0].textContent).toBe('Teatro (0)')
    expect(selector.closest('label')!.className).toContain('bg-primary')
  })
})

describe('el contador', () => {
  it.each([
    { pines: [pin(1, 1)], texto: '1 evento en 1 lugar' },
    { pines: [pin(1, 3)], texto: '3 eventos en 1 lugar' },
    { pines: [pin(1, 4), pin(2, 1), pin(3, 1), pin(4, 1), pin(5, 1)], texto: '8 eventos en 5 lugares' },
  ])('$texto', ({ pines, texto }) => {
    const { container } = montar({ pines })
    expect(contador(container).textContent).toBe(texto)
  })

  it('está montado aunque no haya pines, y es el mismo nodo antes y después', () => {
    const { container, rerender } = montar({ pines: [pin(1, 2)] })
    const antes = contador(container)
    expect(antes.textContent).toBe('2 eventos en 1 lugar')

    rerender(React.createElement(MapaContenido, props({ pines: [], filtro: { tipo: 'finde' } })))
    const despues = contador(container)
    expect(despues).toBe(antes)
    expect(despues.textContent).toBe('No hay eventos con ubicación para este finde')
  })

  it('con filtros "qué" y pines, "Quitar filtros" va al lado del contador y conserva la fecha', () => {
    const { container } = montar({ pines: [pin(1, 1)], filtro: { tipo: 'finde' }, extra: { gratis: true, chicos: false, categoria: null } })
    expect(contador(container).textContent).toBe('1 evento en 1 lugar')
    fireEvent.click(chip('Quitar filtros'))
    expect(ultimaUrl()).toBe('/mapa?cuando=finde')
  })

  it('sin filtros "qué" no hay "Quitar filtros"', () => {
    montar()
    expect(screen.queryByRole('link', { name: 'Quitar filtros' })).toBeNull()
  })
})

describe('el vacío con filtros', () => {
  const extra: FiltrosExtraMapa = { gratis: true, chicos: true, categoria: 'teatro' }
  const categorias: CategoriaDelMapa[] = [{ slug: 'teatro', name: 'Teatro', cantidad: 0 }]

  it('dice qué filtros hay, en el contador y en el vacío, con un solo "Quitar filtros" y el enlace a la agenda', () => {
    const { container } = montar({ pines: [], filtro: { tipo: 'fecha', dia: '2026-10-25' }, extra, categorias })
    expect(contador(container).textContent).toBe('Ningún evento en el mapa con estos filtros')
    expect(screen.getByRole('heading', { name: 'No hay eventos en el mapa con estos filtros para esta fecha' })).toBeTruthy()
    expect(screen.getByText('Filtros: Gratis · Para chicos · Teatro. Probá con otra fecha o sacá alguno.')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Quitar filtros' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Ver la agenda completa' }).getAttribute('href')).toBe('/buscar')
  })

  it('solo nombra los filtros prendidos', () => {
    montar({ pines: [], extra: { gratis: false, chicos: true, categoria: null } })
    expect(screen.getByRole('heading', { name: 'No hay eventos en el mapa con estos filtros para hoy' })).toBeTruthy()
    expect(screen.getByText('Filtros: Para chicos. Probá con otra fecha o sacá alguno.')).toBeTruthy()
  })

  it('"Quitar filtros" navega sin gratis, chicos ni categoría pero con la fecha, y deja el foco en "Gratis"', async () => {
    montar({ pines: [], filtro: { tipo: 'fecha', dia: '2026-10-25' }, extra, categorias })
    await act(async () => {
      fireEvent.click(chip('Quitar filtros'))
    })
    expect(ultimaUrl()).toBe('/mapa?cuando=fecha&dia=2026-10-25')
    expect(document.activeElement).toBe(chip('Gratis'))
  })

  it('sin pines el contador queda solo para el lector de pantalla: a la vista no se repite el vacío', () => {
    const { container } = montar({ pines: [], extra, categorias })
    expect(contador(container).className).toBe('sr-only')
    const conPines = montar({ pines: [pin(1, 1)], extra })
    expect(contador(conPines.container).className).not.toContain('sr-only')
  })

  it('"Quitar filtros" no le saca el foco a otro control que se tocó mientras cargaba', async () => {
    montar({ pines: [], extra, categorias })
    await act(async () => {
      fireEvent.click(chip('Quitar filtros'))
      chip('Para chicos').focus()
    })
    expect(document.activeElement).toBe(chip('Para chicos'))
  })

  it('sin filtros "qué", el vacío es el de siempre', () => {
    montar({ pines: [] })
    expect(screen.queryByRole('heading', { name: /con estos filtros/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver todos los eventos' }).getAttribute('href')).toBe('/buscar')
  })
})
