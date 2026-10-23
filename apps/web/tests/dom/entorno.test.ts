// @vitest-environment jsdom
//
// Canario del entorno (R61, tarea 56-c, QPS-199). Este archivo NO prueba el
// producto: prueba que la infraestructura de tests con DOM real (jsdom
// 29.1.1 + Vitest 3.2.7 + @testing-library/react 16.3.3) sigue viva en este
// worktree. Si este archivo falla, el problema es del entorno, no de
// `fila-acciones-evento.dom.test.ts`: no hay que intentar arreglarlo
// tocando `vitest.config.ts` ni instalando nada — se reporta el error exacto
// y se corta ahí (ver la tarea 56-c).
//
// `apps/web` corre Vitest con `environment: 'node'` por defecto
// (`vitest.config.ts`, no se toca); el entorno de ESTE archivo (y de
// `fila-acciones-evento.dom.test.ts`) se vuelve `jsdom` solo para él, por la
// directiva `// @vitest-environment jsdom` en la primera línea.
import * as React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// `globals` no está activado en `vitest.config.ts`, así que el auto-cleanup
// de Testing Library (que depende de un `afterEach` global) no se registra
// solo: hay que llamar a `cleanup()` a mano, o el próximo test de este
// archivo encuentra los nodos del anterior en `document.body`.
afterEach(() => {
  cleanup()
})

describe('canario del entorno de DOM (jsdom)', () => {
  it('document existe y tiene un body', () => {
    expect(document).toBeTruthy()
    expect(document.body).toBeTruthy()
  })

  it('render (de @testing-library/react) monta un <button> y screen.getByRole lo encuentra', () => {
    render(React.createElement('button', null, 'Click de prueba'))
    const boton = screen.getByRole('button')
    expect(boton).toBeTruthy()
    expect(boton.textContent).toBe('Click de prueba')
  })

  it('fireEvent.click dispara el onClick del elemento', () => {
    const onClick = vi.fn()
    render(React.createElement('button', { onClick }, 'Click de prueba'))
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
