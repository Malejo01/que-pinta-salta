/**
 * `LoQueSeguisVista` (R47, tarea 47-d, QPS-197): la parte sin estado y sin
 * hooks de `app/perfil/lo-que-seguis.tsx` — la sección de `/perfil`
 * ("Cuenta") que muestra exactamente lo que el usuario sigue.
 *
 * Mismo patrón que `tests/asistencia/fila-render.test.ts` y
 * `tests/components/password-input.test.ts` (sin DOM; cuando se escribió,
 * jsdom y @testing-library/react no estaban autorizados para esa tarea —
 * desde la R61 están instalados y hay tests con DOM real en `tests/dom/`):
 *   - Para el HTML real (textos, qué se dibuja y qué no) se usa
 *     `renderToStaticMarkup` de `react-dom/server`, que funciona en Node
 *     puro porque la vista no tiene hooks.
 *   - Para los `onClick` se llama a la vista como una función común (sin
 *     `createElement`) y se inspecciona el árbol de elementos que devuelve.
 */
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  LoQueSeguisVista,
  type CategoriaSeguida,
  type CuentaSeguida,
  type LugarSeguido,
} from '@/app/perfil/lo-que-seguis'

type ReactElementLike = { type: unknown; props: Record<string, unknown> }

const UN_LUGAR: LugarSeguido = { id: 'lugar-1', nombre: 'La Casona del Molino' }
const OTRO_LUGAR: LugarSeguido = { id: 'lugar-2', nombre: 'Anfiteatro' }
const UNA_CUENTA: CuentaSeguida = { id: 'cuenta-1', username: 'quepintasalta' }
const UNA_CATEGORIA: CategoriaSeguida = { id: 'categoria-1', nombre: 'Teatro' }

function propsBase(overrides: Partial<Parameters<typeof LoQueSeguisVista>[0]> = {}) {
  return {
    lugares: [] as LugarSeguido[],
    cuentas: [] as CuentaSeguida[],
    categorias: [] as CategoriaSeguida[],
    onDejarDeSeguir: vi.fn(),
    ...overrides,
  }
}

describe('LoQueSeguisVista: el HTML real', () => {
  it('con las tres listas, dibuja los tres grupos con sus ítems', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        LoQueSeguisVista,
        propsBase({ lugares: [UN_LUGAR], cuentas: [UNA_CUENTA], categorias: [UNA_CATEGORIA] }),
      ),
    )

    expect(html).toContain('Lugares')
    expect(html).toContain('La Casona del Molino')
    expect(html).toContain('Cuentas de Instagram')
    expect(html).toContain('@quepintasalta')
    expect(html).toContain('Categorías')
    expect(html).toContain('Teatro')
    // Tres botones de "Dejar de seguir" (el texto visible del botón, no el
    // aria-label: cada `aria-label="Dejar de seguir ..."` también contiene
    // la frase, así que se cuenta solo el texto entre tags).
    expect(html.match(/>Dejar de seguir</g)).toHaveLength(3)
  })

  it('un grupo vacío no dibuja su encabezado (ni el de Lugares, ni el de Cuentas, ni el de Categorías)', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoQueSeguisVista, propsBase({ lugares: [UN_LUGAR] })),
    )

    expect(html).toContain('Lugares')
    expect(html).not.toContain('Cuentas de Instagram')
    expect(html).not.toContain('Categorías')
  })

  it('con dos lugares, muestra los dos (no se limita a uno)', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoQueSeguisVista, propsBase({ lugares: [UN_LUGAR, OTRO_LUGAR] })),
    )

    expect(html).toContain('La Casona del Molino')
    expect(html).toContain('Anfiteatro')
    expect(html.match(/>Dejar de seguir</g)).toHaveLength(2)
  })

  it('sin nada seguido, muestra el texto del vacío con un link a /radar (y ningún "Dejar de seguir")', () => {
    const html = renderToStaticMarkup(React.createElement(LoQueSeguisVista, propsBase()))

    expect(html).toContain('Todavía no seguís nada. Seguí un lugar desde la ficha de un evento, o elegí categorías en el Radar.')
    expect(html).toContain('href="/radar"')
    expect(html).not.toContain('Dejar de seguir')
  })

  it('accesibilidad: cada botón tiene su propio aria-label, distinto del texto visible "Dejar de seguir"', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        LoQueSeguisVista,
        propsBase({ lugares: [UN_LUGAR], cuentas: [UNA_CUENTA], categorias: [UNA_CATEGORIA] }),
      ),
    )

    expect(html).toContain('aria-label="Dejar de seguir La Casona del Molino"')
    expect(html).toContain('aria-label="Dejar de seguir @quepintasalta"')
    expect(html).toContain('aria-label="Dejar de seguir Teatro"')
  })
})

describe('LoQueSeguisVista: los onClick mandan el tipo y el id correctos (justo donde un copiar y pegar manda "lugar" para todo)', () => {
  /** Busca, en el árbol de elementos, el primer <button> cuyo aria-label sea exactamente `etiqueta`. */
  function botonConAriaLabel(nodo: unknown, etiqueta: string): ReactElementLike | null {
    if (nodo === null || typeof nodo !== 'object') return null
    const el = nodo as ReactElementLike
    if (el.props && el.props['aria-label'] === etiqueta) return el
    const hijos = el.props?.children
    if (Array.isArray(hijos)) {
      for (const hijo of hijos) {
        const encontrado = botonConAriaLabel(hijo, etiqueta)
        if (encontrado) return encontrado
      }
      return null
    }
    return botonConAriaLabel(hijos, etiqueta)
  }

  it('el botón del lugar manda { tipo: "lugar", id del lugar }', () => {
    const onDejarDeSeguir = vi.fn()
    const el = LoQueSeguisVista(propsBase({ lugares: [UN_LUGAR], onDejarDeSeguir })) as unknown as ReactElementLike

    const boton = botonConAriaLabel(el, 'Dejar de seguir La Casona del Molino')
    expect(boton).toBeTruthy()
    ;(boton!.props.onClick as () => void)()

    expect(onDejarDeSeguir).toHaveBeenCalledTimes(1)
    expect(onDejarDeSeguir).toHaveBeenCalledWith('lugar', 'lugar-1')
  })

  it('el botón de la cuenta de Instagram manda { tipo: "cuenta", id de la cuenta } (no "lugar")', () => {
    const onDejarDeSeguir = vi.fn()
    const el = LoQueSeguisVista(propsBase({ cuentas: [UNA_CUENTA], onDejarDeSeguir })) as unknown as ReactElementLike

    const boton = botonConAriaLabel(el, 'Dejar de seguir @quepintasalta')
    expect(boton).toBeTruthy()
    ;(boton!.props.onClick as () => void)()

    expect(onDejarDeSeguir).toHaveBeenCalledTimes(1)
    expect(onDejarDeSeguir).toHaveBeenCalledWith('cuenta', 'cuenta-1')
  })

  it('el botón de la categoría manda { tipo: "categoria", id de la categoría } (no "lugar")', () => {
    const onDejarDeSeguir = vi.fn()
    const el = LoQueSeguisVista(propsBase({ categorias: [UNA_CATEGORIA], onDejarDeSeguir })) as unknown as ReactElementLike

    const boton = botonConAriaLabel(el, 'Dejar de seguir Teatro')
    expect(boton).toBeTruthy()
    ;(boton!.props.onClick as () => void)()

    expect(onDejarDeSeguir).toHaveBeenCalledTimes(1)
    expect(onDejarDeSeguir).toHaveBeenCalledWith('categoria', 'categoria-1')
  })
})
