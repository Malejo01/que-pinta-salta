// @vitest-environment jsdom
//
// B4: `useVolverAlFocoDeOrigen` (lib/accesibilidad/foco-de-origen.ts). Los
// modales de ruta interceptada (evento y flyer) no tienen `DialogTrigger`, y
// al cerrarlos con Escape el foco quedaba en el <body>. El hook recuerda el
// elemento con foco al montarse y lo devuelve en `onCloseAutoFocus`.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { useVolverAlFocoDeOrigen } from '@/lib/accesibilidad/foco-de-origen'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function montarModal(): (evento: Event) => void {
  let volver: ((evento: Event) => void) | null = null
  function ModalFalso() {
    volver = useVolverAlFocoDeOrigen()
    return React.createElement('div', { role: 'dialog' })
  }
  render(React.createElement(ModalFalso))
  return volver!
}

function eventoDeCierre() {
  const evento = new Event('focusOutside', { cancelable: true })
  const preventDefault = vi.spyOn(evento, 'preventDefault')
  return { evento, preventDefault }
}

describe('useVolverAlFocoDeOrigen', () => {
  it('devuelve el foco al link de la tarjeta que tenía el foco al abrirse el modal', () => {
    const tarjeta = document.createElement('a')
    tarjeta.href = '/evento/1'
    document.body.appendChild(tarjeta)
    tarjeta.focus()

    const volver = montarModal()
    // Radix mueve el foco adentro del diálogo; acá basta con sacárselo a la tarjeta.
    tarjeta.blur()
    expect(document.activeElement).toBe(document.body)

    const { evento, preventDefault } = eventoDeCierre()
    volver(evento)
    expect(preventDefault).toHaveBeenCalled()
    expect(document.activeElement).toBe(tarjeta)
  })

  it('si la tarjeta ya no está en la página, deja que Radix haga lo de siempre', () => {
    const tarjeta = document.createElement('a')
    tarjeta.href = '/evento/1'
    document.body.appendChild(tarjeta)
    tarjeta.focus()
    const volver = montarModal()
    tarjeta.remove()

    const { evento, preventDefault } = eventoDeCierre()
    volver(evento)
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('si no había nada con foco (se llegó directo a la URL), no hace nada', () => {
    const volver = montarModal()
    const { evento, preventDefault } = eventoDeCierre()
    volver(evento)
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
