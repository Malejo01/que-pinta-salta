// @vitest-environment jsdom
//
// `MapaDiferido` avisa por `onFallo` cuando el mapa no va a aparecer (C5): si
// el `import()` de `mapa-maplibre` falla o si el mapa avisa un error. Con eso
// `mapa-contenido` saca "Ver en el mapa" (ver `mapa-pulido.dom.test.ts`).
// Y por `onListo` cuando el mapa se monta bien (así un fallo anterior se
// deshace). También: sin JavaScript, el `<noscript>` tapa el esqueleto con su aviso.
//
// `mapa-maplibre` es un doble (ver `diferido()`): según el modo, su módulo no
// carga (el `import()` se rechaza), el componente llama a `onError` al montar,
// o anda. Cada test vuelve a importar `mapa-diferido` para que el `import()`
// pida el módulo de nuevo. En jsdom no hay IntersectionObserver ni
// requestIdleCallback: el diferido carga con su respaldo de `setTimeout`.
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

type Modo = 'no-carga' | 'error-del-mapa' | 'anda'

/**
 * `MapaDiferido` recién importado, con `mapa-maplibre` reemplazado según
 * `modo`. `vi.doMock` en cada test (y no un `vi.mock` arriba): la fábrica tiene
 * que volver a correr, y con `vi.resetModules()` solo no alcanza (un módulo
 * doble que ya cargó queda guardado).
 */
async function diferido(modo: Modo = 'anda') {
  vi.doMock('@/components/mapa/mapa-maplibre', async () => {
    if (modo === 'no-carga') throw new Error('el chunk del mapa no cargó')
    const { createElement, useEffect } = await import('react')
    if (modo === 'anda') return { default: () => createElement('div', { 'data-testid': 'mapa-vivo' }) }
    return {
      default: function MapaQueFalla({ onError }: { onError: () => void }) {
        useEffect(() => {
          onError()
        }, [onError])
        return null
      },
    }
  })
  return (await import('@/components/mapa/mapa-diferido')).MapaDiferido
}

const PROPS = { pines: [], seleccionado: null, centrar: null, onSeleccionar: () => {} }
const AVISO = 'No pudimos cargar el mapa. La lista tiene los mismos lugares.'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  cleanup()
  vi.doUnmock('@/components/mapa/mapa-maplibre')
})

describe('onFallo', () => {
  it('si el import() del mapa falla, avisa una vez y queda el mensaje', async () => {
    const MapaDiferido = await diferido('no-carga')
    const onFallo = vi.fn()
    render(React.createElement(MapaDiferido, { ...PROPS, onFallo }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(AVISO))
    expect(onFallo).toHaveBeenCalledTimes(1)
  })

  it('si el mapa avisa un error (onError), también llama a onFallo', async () => {
    const MapaDiferido = await diferido('error-del-mapa')
    const onFallo = vi.fn()
    render(React.createElement(MapaDiferido, { ...PROPS, onFallo }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(AVISO))
    expect(onFallo).toHaveBeenCalledTimes(1)
  })

  it('llama al onFallo más nuevo aunque haya cambiado después de montar', async () => {
    const MapaDiferido = await diferido('no-carga')
    const viejo = vi.fn()
    const nuevo = vi.fn()
    const { rerender } = render(React.createElement(MapaDiferido, { ...PROPS, onFallo: viejo }))
    rerender(React.createElement(MapaDiferido, { ...PROPS, onFallo: nuevo }))
    await waitFor(() => expect(nuevo).toHaveBeenCalledTimes(1))
    expect(viejo).not.toHaveBeenCalled()
  })

  it('sin onFallo no rompe (es opcional)', async () => {
    const MapaDiferido = await diferido('no-carga')
    render(React.createElement(MapaDiferido, PROPS))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(AVISO))
  })
})

describe('onListo', () => {
  it('si el mapa se monta bien, avisa una vez y no llama a onFallo', async () => {
    const MapaDiferido = await diferido('anda')
    const onListo = vi.fn()
    const onFallo = vi.fn()
    const { rerender } = render(React.createElement(MapaDiferido, { ...PROPS, onFallo, onListo }))
    await screen.findByTestId('mapa-vivo')
    await waitFor(() => expect(onListo).toHaveBeenCalledTimes(1))
    // Otro render (por ejemplo, otra selección) no lo repite.
    rerender(React.createElement(MapaDiferido, { ...PROPS, seleccionado: 'otro', onFallo, onListo }))
    expect(onListo).toHaveBeenCalledTimes(1)
    expect(onFallo).not.toHaveBeenCalled()
  })

  it('si el mapa avisa un error al montarse, no dice que está listo (aunque el error llegue en el mismo commit)', async () => {
    const MapaDiferido = await diferido('error-del-mapa')
    const onListo = vi.fn()
    const onFallo = vi.fn()
    render(React.createElement(MapaDiferido, { ...PROPS, onFallo, onListo }))
    await waitFor(() => expect(onFallo).toHaveBeenCalledTimes(1))
    expect(onListo).not.toHaveBeenCalled()
  })

  it('si el import() falla, tampoco', async () => {
    const MapaDiferido = await diferido('no-carga')
    const onListo = vi.fn()
    render(React.createElement(MapaDiferido, { ...PROPS, onListo }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(AVISO))
    expect(onListo).not.toHaveBeenCalled()
  })
})

describe('sin JavaScript', () => {
  it('el servidor manda el esqueleto con un <noscript> que lo tapa con el aviso', async () => {
    const MapaDiferido = await diferido()
    const markup = renderToStaticMarkup(React.createElement(MapaDiferido, PROPS))
    const adentro = /<noscript>([\s\S]*?)<\/noscript>/.exec(markup)
    expect(adentro, 'falta el <noscript>').not.toBeNull()
    const caja = document.createElement('div')
    caja.innerHTML = adentro![1]
    const aviso = caja.firstElementChild as HTMLElement
    expect(aviso.textContent).toBe('El mapa necesita JavaScript. La lista de abajo tiene los mismos lugares.')
    // Tapa el esqueleto: ocupa todo el contenedor (que es `relative`) con el mismo fondo.
    expect(aviso.className).toContain('absolute inset-0')
    expect(aviso.className).toContain('bg-muted')
    expect(markup).toMatch(/^<div class="relative /)
  })
})
