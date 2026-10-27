/**
 * B4: la lógica del "Saltar al contenido" de la Navbar
 * (`lib/accesibilidad/saltar-al-contenido.ts`), con un documento falso: sin
 * DOM, solo lo que la función usa (`getElementById`, `querySelector('main')`
 * y los métodos del <main>).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  asegurarDestino,
  ID_CONTENIDO,
  saltarAlContenido,
  type DocumentoMinimo,
  type ElementoEnfocable,
} from '@/lib/accesibilidad/saltar-al-contenido'

function mainFalso(atributos: Record<string, string> = {}, id = '') {
  const attrs = new Map(Object.entries(atributos))
  const main = {
    id,
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: vi.fn((n: string, v: string) => {
      attrs.set(n, v)
    }),
    focus: vi.fn(),
    scrollIntoView: vi.fn(),
    attrs,
  }
  return main satisfies ElementoEnfocable
}

function documentoFalso(opciones: { conContenido: boolean; main: ElementoEnfocable | null }): DocumentoMinimo {
  return {
    getElementById: (id: string) => (opciones.conContenido && id === ID_CONTENIDO ? {} : null),
    querySelector: () => opciones.main,
  }
}

describe('saltarAlContenido', () => {
  it('el destino es "contenido" (el id de los <main> de las páginas auditadas)', () => {
    expect(ID_CONTENIDO).toBe('contenido')
  })

  it('con #contenido en la página no toca nada y deja seguir el ancla (false)', () => {
    const main = mainFalso()
    expect(saltarAlContenido(documentoFalso({ conContenido: true, main }))).toBe(false)
    expect(main.focus).not.toHaveBeenCalled()
    expect(main.setAttribute).not.toHaveBeenCalled()
  })

  it('sin #contenido: le pone tabindex=-1 al primer <main>, lo trae a la vista, le pasa el foco y pide cancelar el ancla', () => {
    const main = mainFalso()
    expect(saltarAlContenido(documentoFalso({ conContenido: false, main }))).toBe(true)
    expect(main.attrs.get('tabindex')).toBe('-1')
    expect(main.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(main.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('no pisa un tabindex que el <main> ya tenga', () => {
    const main = mainFalso({ tabindex: '0' })
    saltarAlContenido(documentoFalso({ conContenido: false, main }))
    expect(main.setAttribute).not.toHaveBeenCalled()
    expect(main.focus).toHaveBeenCalled()
  })

  it('anda aunque el elemento no tenga scrollIntoView (navegadores viejos, jsdom)', () => {
    const { scrollIntoView: _s, ...sinScroll } = mainFalso()
    expect(saltarAlContenido(documentoFalso({ conContenido: false, main: sinScroll }))).toBe(true)
    expect(sinScroll.focus).toHaveBeenCalled()
  })

  it('sin #contenido ni <main>: no hace nada (false)', () => {
    expect(saltarAlContenido(documentoFalso({ conContenido: false, main: null }))).toBe(false)
  })
})

describe('asegurarDestino (el efecto de la Navbar al montarse)', () => {
  it('sin #contenido: le pone id="contenido" y tabindex=-1 al primer <main>', () => {
    const main = mainFalso()
    expect(asegurarDestino(documentoFalso({ conContenido: false, main }))).toBe(true)
    expect(main.id).toBe('contenido')
    expect(main.attrs.get('tabindex')).toBe('-1')
  })

  it('con #contenido ya en la página no toca nada', () => {
    const main = mainFalso()
    expect(asegurarDestino(documentoFalso({ conContenido: true, main }))).toBe(false)
    expect(main.id).toBe('')
  })

  it('no pisa el id que el <main> ya tenga', () => {
    const main = mainFalso({}, 'mapa')
    expect(asegurarDestino(documentoFalso({ conContenido: false, main }))).toBe(false)
    expect(main.id).toBe('mapa')
    expect(main.setAttribute).not.toHaveBeenCalled()
  })

  it('sin <main>: no hace nada', () => {
    expect(asegurarDestino(documentoFalso({ conContenido: false, main: null }))).toBe(false)
  })
})
