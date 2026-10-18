/**
 * `FilaAccionesEventoVista` y `BotonSeguirVista` (R47, tarea 47-c, QPS-199):
 * las piezas SIN estado y SIN hooks de `components/fila-acciones-evento.tsx`
 * y `components/boton-seguir.tsx`.
 *
 * `apps/web` no tiene jsdom ni @testing-library/react (vitest corre con
 * `environment: 'node'`, ver `apps/web/vitest.config.ts`), así que no hay
 * forma de montar los componentes en un DOM real y disparar un click sin
 * agregar una dependencia nueva (no autorizado para esta tarea). El patrón
 * es el mismo que `tests/components/password-input.test.ts`:
 *
 *   - Para el HTML real (orden de los botones, texto, `aria-pressed`) se usa
 *     `renderToStaticMarkup` de `react-dom/server`, que funciona en Node
 *     puro porque las vistas no tienen hooks.
 *   - Para los `onClick` se llama a la vista como una función común (sin
 *     `createElement`) y se inspecciona el árbol de elementos que devuelve,
 *     sin necesidad de un DOM.
 */
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { TEXTO_ENTRAR_PARA_MARCAR } from '@qps/core/asistencia'
import { FilaAccionesEventoVista, type FilaAccionesEventoVistaProps } from '@/components/fila-acciones-evento'
import { BotonSeguirVista } from '@/components/boton-seguir'

type ReactElementLike = { type: unknown; props: Record<string, unknown> }

/** Un stub de "compartir" que no depende de nada del navegador: solo texto. */
function stubCompartir(): React.ReactElement {
  return React.createElement('span', { 'data-testid': 'compartir-stub' }, 'Compartir')
}

function propsBase(overrides: Partial<FilaAccionesEventoVistaProps> = {}): FilaAccionesEventoVistaProps {
  return {
    guardado: false,
    voy: false,
    cantidadVoy: 0,
    mostrarVoy: true,
    haySesion: true,
    pendiente: false,
    onClickGuardar: vi.fn(),
    onClickVoy: vi.fn(),
    compartir: stubCompartir(),
    ...overrides,
  }
}

describe('FilaAccionesEventoVista: el HTML real', () => {
  it('contiene "Guardar", "Voy" y "Compartir" EN ESE ORDEN (posición en el HTML)', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsBase()))

    const iGuardar = html.indexOf('Guardar')
    const iVoy = html.indexOf('Voy')
    const iCompartir = html.indexOf('Compartir')

    expect(iGuardar).toBeGreaterThanOrEqual(0)
    expect(iVoy).toBeGreaterThan(iGuardar)
    expect(iCompartir).toBeGreaterThan(iVoy)
  })

  it('con cantidadVoy = 2 (debajo del umbral) dice "Voy", sin número', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsBase({ cantidadVoy: 2 })))
    expect(html).toMatch(/>Voy</)
    expect(html).not.toMatch(/Voy\s*·/)
  })

  it('con cantidadVoy = 12 (sobre el umbral) dice "Voy · 12 van"', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsBase({ cantidadVoy: 12 })))
    expect(html).toContain('Voy · 12 van')
  })

  it('aria-pressed refleja guardado y voy (cada uno en su propio botón)', () => {
    const html = renderToStaticMarkup(
      React.createElement(FilaAccionesEventoVista, propsBase({ guardado: true, voy: false, cantidadVoy: 0 })),
    )
    // Dos <button>: el primero (Guardar) con aria-pressed="true", el
    // segundo (Voy) con aria-pressed="false". Partiendo el HTML por cada
    // apertura de <button> alcanza porque ninguno anida al otro.
    const botones = html.split('<button').slice(1)
    expect(botones).toHaveLength(2)
    expect(botones[0]).toMatch(/aria-pressed="true"/)
    expect(botones[1]).toMatch(/aria-pressed="false"/)
  })

  it('aria-pressed se invierte cuando guardado y voy se invierten', () => {
    const html = renderToStaticMarkup(
      React.createElement(FilaAccionesEventoVista, propsBase({ guardado: false, voy: true, cantidadVoy: 0 })),
    )
    const botones = html.split('<button').slice(1)
    expect(botones[0]).toMatch(/aria-pressed="false"/)
    expect(botones[1]).toMatch(/aria-pressed="true"/)
  })

  it('con mostrarVoy: false no hay ningún botón de Voy (ni su texto)', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsBase({ mostrarVoy: false })))
    const botones = html.split('<button').slice(1)
    expect(botones).toHaveLength(1)
    expect(html).not.toContain('Voy')
  })

  it('sin sesión aparece TEXTO_ENTRAR_PARA_MARCAR', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsBase({ haySesion: false })))
    expect(html).toContain(TEXTO_ENTRAR_PARA_MARCAR)
  })

  it('con sesión NO aparece TEXTO_ENTRAR_PARA_MARCAR', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsBase({ haySesion: true })))
    expect(html).not.toContain(TEXTO_ENTRAR_PARA_MARCAR)
  })

  it('el HTML no contiene "Me interesa" (desapareció del modelo, QPS-197)', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsBase()))
    expect(html).not.toContain('Me interesa')
  })

  it('sin el prop compartir, no se dibuja nada en ese lugar (y no explota)', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, propsBase({ compartir: undefined })))
    expect(html).not.toContain('Compartir')
  })
})

describe('FilaAccionesEventoVista: los onClick disparan el callback que corresponde', () => {
  it('el botón de Guardar llama a onClickGuardar, no a onClickVoy', () => {
    const onClickGuardar = vi.fn()
    const onClickVoy = vi.fn()
    const el = FilaAccionesEventoVista(propsBase({ onClickGuardar, onClickVoy })) as unknown as ReactElementLike

    // outer <div> -> children[0] es el <div> con los botones -> children[0] es el botón de Guardar (primero en ORDEN_FILA_ACCIONES).
    const fila = (el.props.children as ReactElementLike[])[0]
    const guardarEl = (fila.props.children as ReactElementLike[])[0]

    expect(guardarEl.props.onClick).toBe(onClickGuardar)
    ;(guardarEl.props.onClick as () => void)()
    expect(onClickGuardar).toHaveBeenCalledTimes(1)
    expect(onClickVoy).not.toHaveBeenCalled()
  })

  it('el botón de Voy llama a onClickVoy, no a onClickGuardar', () => {
    const onClickGuardar = vi.fn()
    const onClickVoy = vi.fn()
    const el = FilaAccionesEventoVista(propsBase({ onClickGuardar, onClickVoy })) as unknown as ReactElementLike

    const fila = (el.props.children as ReactElementLike[])[0]
    const voyEl = (fila.props.children as ReactElementLike[])[1]

    expect(voyEl.props.onClick).toBe(onClickVoy)
    ;(voyEl.props.onClick as () => void)()
    expect(onClickVoy).toHaveBeenCalledTimes(1)
    expect(onClickGuardar).not.toHaveBeenCalled()
  })
})

describe('BotonSeguirVista', () => {
  it('tipo lugar, sin seguir: "+ Seguir"', () => {
    const html = renderToStaticMarkup(
      React.createElement(BotonSeguirVista, {
        tipo: 'lugar',
        etiqueta: 'La Casona',
        siguiendo: false,
        pendiente: false,
        onClick: vi.fn(),
      }),
    )
    expect(html).toContain('+ Seguir')
  })

  it('tipo lugar, siguiendo: "✓ Siguiendo"', () => {
    const html = renderToStaticMarkup(
      React.createElement(BotonSeguirVista, {
        tipo: 'lugar',
        etiqueta: 'La Casona',
        siguiendo: true,
        pendiente: false,
        onClick: vi.fn(),
      }),
    )
    expect(html).toContain('✓ Siguiendo')
  })

  it('tipo cuenta, sin seguir: "Seguir @cuenta"', () => {
    const html = renderToStaticMarkup(
      React.createElement(BotonSeguirVista, {
        tipo: 'cuenta',
        etiqueta: 'quepintasalta',
        siguiendo: false,
        pendiente: false,
        onClick: vi.fn(),
      }),
    )
    expect(html).toContain('Seguir @quepintasalta')
  })

  it('tipo cuenta, siguiendo: "Siguiendo @cuenta"', () => {
    const html = renderToStaticMarkup(
      React.createElement(BotonSeguirVista, {
        tipo: 'cuenta',
        etiqueta: 'quepintasalta',
        siguiendo: true,
        pendiente: false,
        onClick: vi.fn(),
      }),
    )
    expect(html).toContain('Siguiendo @quepintasalta')
  })

  it('el aria-pressed refleja siguiendo', () => {
    const htmlFalse = renderToStaticMarkup(
      React.createElement(BotonSeguirVista, {
        tipo: 'lugar',
        etiqueta: 'La Casona',
        siguiendo: false,
        pendiente: false,
        onClick: vi.fn(),
      }),
    )
    const htmlTrue = renderToStaticMarkup(
      React.createElement(BotonSeguirVista, {
        tipo: 'lugar',
        etiqueta: 'La Casona',
        siguiendo: true,
        pendiente: false,
        onClick: vi.fn(),
      }),
    )
    expect(htmlFalse).toMatch(/aria-pressed="false"/)
    expect(htmlTrue).toMatch(/aria-pressed="true"/)
  })

  it('clickear llama a onClick', () => {
    const onClick = vi.fn()
    const el = BotonSeguirVista({
      tipo: 'lugar',
      etiqueta: 'La Casona',
      siguiendo: false,
      pendiente: false,
      onClick,
    }) as unknown as ReactElementLike

    expect(el.props.onClick).toBe(onClick)
    ;(el.props.onClick as () => void)()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
