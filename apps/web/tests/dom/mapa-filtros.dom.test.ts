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

// `next/link` real necesita el router de la app: un <a> común alcanza para mirar el href.
vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch: _prefetch,
    children,
    ...resto
  }: {
    href: string
    prefetch?: boolean
    children?: React.ReactNode
  } & Record<string, unknown>) => React.createElement('a', { href, ...resto }, children),
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

function boton(nombre: string): HTMLButtonElement {
  return screen.getByRole('button', { name: nombre }) as HTMLButtonElement
}

function selectorDeCategoria(): HTMLSelectElement {
  return screen.getByRole('combobox') as HTMLSelectElement
}

function contador(container: HTMLElement): HTMLElement {
  const vivos = container.querySelectorAll('[aria-live="polite"]')
  expect(vivos).toHaveLength(1)
  return vivos[0] as HTMLElement
}

/** La última URL que se pidió con `router.replace`. */
function ultimaUrl(): string {
  expect(replace).toHaveBeenCalled()
  const [url, opciones] = replace.mock.calls[replace.mock.calls.length - 1]
  expect(opciones).toEqual({ scroll: false })
  return url
}

describe('las dos filas de filtros', () => {
  it('"Cuándo" y "Qué tipo de plan" son grupos con nombre, y los chips llevan aria-pressed según extra', () => {
    montar({ extra: { gratis: true, chicos: false, categoria: null } })
    const cuando = screen.getByRole('group', { name: 'Cuándo' })
    const que = screen.getByRole('group', { name: 'Qué tipo de plan' })
    expect(cuando.contains(boton('Hoy'))).toBe(true)
    expect(que.contains(boton('Gratis'))).toBe(true)
    expect(que.contains(selectorDeCategoria())).toBe(true)

    expect(boton('Gratis').getAttribute('aria-pressed')).toBe('true')
    expect(boton('Para chicos').getAttribute('aria-pressed')).toBe('false')
    expect(boton('Gratis').className).toContain('bg-primary')
    expect(boton('Para chicos').className).not.toContain('bg-primary')
  })

  it('con Para chicos prendido, el que dice aria-pressed="true" es Para chicos', () => {
    montar({ extra: { gratis: false, chicos: true, categoria: null } })
    expect(boton('Gratis').getAttribute('aria-pressed')).toBe('false')
    expect(boton('Para chicos').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('cada cambio navega con consultaDelMapa', () => {
  it('tocar Gratis desde "hoy" pide /mapa?cuando=hoy&gratis=1', () => {
    montar()
    fireEvent.click(boton('Gratis'))
    expect(ultimaUrl()).toBe('/mapa?cuando=hoy&gratis=1')
  })

  it('tocar Gratis cuando ya está prendido lo apaga y conserva lo demás', () => {
    montar({ filtro: { tipo: 'finde' }, extra: { gratis: true, chicos: true, categoria: null } })
    fireEvent.click(boton('Gratis'))
    expect(ultimaUrl()).toBe('/mapa?cuando=finde&chicos=1')
  })

  it('cambiar la fecha conserva gratis=1 (el selector de fecha y los botones)', () => {
    const { container } = montar({ extra: { gratis: true, chicos: false, categoria: null } })
    const fecha = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(fecha, { target: { value: '2026-10-25' } })
    expect(ultimaUrl()).toBe('/mapa?cuando=fecha&dia=2026-10-25&gratis=1')

    fireEvent.click(boton('Este finde'))
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

  it('la elegida con 0 dice "(sin eventos)", queda seleccionada y el chip se ve activo', () => {
    montar({
      pines: [],
      extra: { gratis: false, chicos: false, categoria: 'teatro' },
      categorias: [CATEGORIAS[0], { slug: 'teatro', name: 'Teatro', cantidad: 0 }],
    })
    const selector = selectorDeCategoria()
    expect(selector.value).toBe('teatro')
    expect(selector.selectedOptions[0].textContent).toBe('Teatro (sin eventos)')
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
    fireEvent.click(boton('Quitar filtros'))
    expect(ultimaUrl()).toBe('/mapa?cuando=finde')
  })

  it('sin filtros "qué" no hay "Quitar filtros"', () => {
    montar()
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).toBeNull()
  })
})

describe('el vacío con filtros', () => {
  const extra: FiltrosExtraMapa = { gratis: true, chicos: true, categoria: 'teatro' }
  const categorias: CategoriaDelMapa[] = [{ slug: 'teatro', name: 'Teatro', cantidad: 0 }]

  it('dice qué filtros hay, en el contador y en el vacío, con un solo "Quitar filtros" y el enlace a la agenda', () => {
    const { container } = montar({ pines: [], filtro: { tipo: 'fecha', dia: '2026-10-25' }, extra, categorias })
    expect(contador(container).textContent).toBe('Ningún evento con estos filtros')
    expect(screen.getByRole('heading', { name: 'No hay eventos con estos filtros para esta fecha' })).toBeTruthy()
    expect(screen.getByText('Filtros: Gratis · Para chicos · Teatro. Probá con otra fecha o sacá alguno.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Quitar filtros' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Ver la agenda completa' }).getAttribute('href')).toBe('/buscar')
  })

  it('solo nombra los filtros prendidos', () => {
    montar({ pines: [], extra: { gratis: false, chicos: true, categoria: null } })
    expect(screen.getByRole('heading', { name: 'No hay eventos con estos filtros para hoy' })).toBeTruthy()
    expect(screen.getByText('Filtros: Para chicos. Probá con otra fecha o sacá alguno.')).toBeTruthy()
  })

  it('"Quitar filtros" navega sin gratis, chicos ni categoría pero con la fecha, y deja el foco en "Gratis"', async () => {
    montar({ pines: [], filtro: { tipo: 'fecha', dia: '2026-10-25' }, extra, categorias })
    await act(async () => {
      fireEvent.click(boton('Quitar filtros'))
    })
    expect(ultimaUrl()).toBe('/mapa?cuando=fecha&dia=2026-10-25')
    expect(document.activeElement).toBe(boton('Gratis'))
  })

  it('sin filtros "qué", el vacío es el de siempre', () => {
    montar({ pines: [] })
    expect(screen.queryByRole('heading', { name: /con estos filtros/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver todos los eventos' }).getAttribute('href')).toBe('/buscar')
  })
})
