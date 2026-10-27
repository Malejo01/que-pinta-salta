// @vitest-environment jsdom
//
// `MapaDiferido` avisa por `onFallo` cuando el mapa no va a aparecer (C5): si
// el `import()` de `mapa-maplibre` falla o si el mapa avisa un error. Con eso
// `mapa-contenido` saca "Ver en el mapa" (ver `mapa-pulido.dom.test.ts`).
// También: sin JavaScript, el `<noscript>` tapa el esqueleto con su aviso.
//
// `mapa-maplibre` es un doble: según `doble.modo`, su módulo no carga (el
// `import()` se rechaza) o el componente llama a `onError` al montar. Cada
// test vuelve a importar `mapa-diferido` con `vi.resetModules()` para que el
// `import()` pida el módulo de nuevo. En jsdom no hay IntersectionObserver ni
// requestIdleCallback: el diferido carga con su respaldo de `setTimeout`.
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const doble = vi.hoisted(() => ({ modo: 'error-del-mapa' as 'no-carga' | 'error-del-mapa' }))

vi.mock('@/components/mapa/mapa-maplibre', async () => {
  if (doble.modo === 'no-carga') throw new Error('el chunk del mapa no cargó')
  const { useEffect } = await import('react')
  return {
    default: function MapaQueFalla({ onError }: { onError: () => void }) {
      useEffect(() => {
        onError()
      }, [onError])
      return null
    },
  }
})

async function diferido() {
  return (await import('@/components/mapa/mapa-diferido')).MapaDiferido
}

const PROPS = { pines: [], seleccionado: null, centrar: null, onSeleccionar: () => {} }
const AVISO = 'No pudimos cargar el mapa. La lista tiene los mismos lugares.'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  cleanup()
})

describe('onFallo', () => {
  it('si el import() del mapa falla, avisa una vez y queda el mensaje', async () => {
    doble.modo = 'no-carga'
    const MapaDiferido = await diferido()
    const onFallo = vi.fn()
    render(React.createElement(MapaDiferido, { ...PROPS, onFallo }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(AVISO))
    expect(onFallo).toHaveBeenCalledTimes(1)
  })

  it('si el mapa avisa un error (onError), también llama a onFallo', async () => {
    doble.modo = 'error-del-mapa'
    const MapaDiferido = await diferido()
    const onFallo = vi.fn()
    render(React.createElement(MapaDiferido, { ...PROPS, onFallo }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(AVISO))
    expect(onFallo).toHaveBeenCalledTimes(1)
  })

  it('llama al onFallo más nuevo aunque haya cambiado después de montar', async () => {
    doble.modo = 'no-carga'
    const MapaDiferido = await diferido()
    const viejo = vi.fn()
    const nuevo = vi.fn()
    const { rerender } = render(React.createElement(MapaDiferido, { ...PROPS, onFallo: viejo }))
    rerender(React.createElement(MapaDiferido, { ...PROPS, onFallo: nuevo }))
    await waitFor(() => expect(nuevo).toHaveBeenCalledTimes(1))
    expect(viejo).not.toHaveBeenCalled()
  })

  it('sin onFallo no rompe (es opcional)', async () => {
    doble.modo = 'no-carga'
    const MapaDiferido = await diferido()
    render(React.createElement(MapaDiferido, PROPS))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(AVISO))
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
