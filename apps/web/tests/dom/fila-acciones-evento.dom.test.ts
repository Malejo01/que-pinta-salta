// @vitest-environment jsdom
//
// `FilaAccionesEvento` (R61, tarea 56-c, QPS-199): el componente CON
// ESTADO, montado en un DOM real (jsdom) con `@testing-library/react`. Hasta
// esta tarea solo existía `tests/asistencia/fila-render.test.ts`, que prueba
// `FilaAccionesEventoVista` (la vista pura, sin hooks) con
// `renderToStaticMarkup`: nunca se había podido clickear el componente real,
// el que llama a las server actions.
//
// Nota sobre `disabled` vs `aria-busy`: el componente NO pone `aria-busy`
// mientras hay una acción en vuelo — el único indicador es
// `disabled={pendiente}` en los DOS botones (`components/fila-acciones-evento.tsx`
// líneas 89 y, vía `BotonVoy`, `components/botones-asistencia.tsx` línea 41).
// Por eso estos tests comprueban `boton.disabled`, no un `aria-busy`.
//
// No hay `@testing-library/jest-dom` instalado en este worktree (solo
// `@testing-library/dom`, `@testing-library/react` y `jsdom`, ver la tarea):
// no hay `toBeDisabled()` / `toHaveAttribute()`. Se usan las propiedades del
// DOM nativo (`boton.disabled`, `boton.getAttribute('aria-pressed')`).
//
// Por qué los `vi.mock` están ACÁ y no en `preparar-dom.ts`: ver el
// comentario de cabecera de ese archivo.
import * as React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'

import {
  ORDEN_FILA_ACCIONES,
  textoBotonVoy,
  TEXTO_SACASTE_GUARDADO_CON_VOY,
} from '@qps/core/asistencia'
import { FilaAccionesEvento } from '@/components/fila-acciones-evento'
import { marcarAsistencia } from '@/lib/asistencia'
import { toggleFavorite } from '@/lib/actions/favorites'

import { deferred, propsBase, botonGuardar, botonVoy } from './preparar-dom'

vi.mock('@/lib/asistencia', () => ({
  marcarAsistencia: vi.fn(),
}))

vi.mock('@/lib/actions/favorites', () => ({
  toggleFavorite: vi.fn(),
}))

// `useAuthModal` y `useToast` devuelven funciones (`open`/`close`/`toast`)
// que el test necesita inspeccionar: con `vi.hoisted` quedan creadas ANTES
// de que el `vi.mock` (que también se iza) las referencie, evitando el
// "Cannot access '...' before initialization" de usar un `const` normal
// dentro de una factory izada.
const { mockOpenAuthModal, mockCloseAuthModal, mockToast } = vi.hoisted(() => ({
  mockOpenAuthModal: vi.fn(),
  mockCloseAuthModal: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock('@/components/auth-modal', () => ({
  useAuthModal: () => ({ open: mockOpenAuthModal, close: mockCloseAuthModal }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('FilaAccionesEvento: el click con estado en un DOM real', () => {
  it('♥ optimista: aria-pressed pasa a "true" apenas se clickea, ANTES de que toggleFavorite resuelva; si el servidor dice success:false, vuelve a "false"', async () => {
    const { promesa, resolver } = deferred<Awaited<ReturnType<typeof toggleFavorite>>>()
    vi.mocked(toggleFavorite).mockReturnValueOnce(promesa)

    render(React.createElement(FilaAccionesEvento, propsBase()))
    const guardar = botonGuardar()
    expect(guardar.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(guardar)
    // Lo que pasa ANTES del primer `await` del handler se ve sin esperar nada más.
    expect(guardar.getAttribute('aria-pressed')).toBe('true')

    await act(async () => {
      resolver({ success: false, error: 'DB_ERROR', message: 'Fallo de prueba' })
    })

    expect(guardar.getAttribute('aria-pressed')).toBe('false')
  })

  it('Voy pesimista: aria-pressed NO cambia hasta que marcarAsistencia resuelve; mientras espera, los dos botones quedan disabled; al resolver ok con propia:"voy" y guardado:true, Voy Y el ♥ quedan en "true" (voy ⇒ guardado)', async () => {
    const { promesa, resolver } = deferred<Awaited<ReturnType<typeof marcarAsistencia>>>()
    vi.mocked(marcarAsistencia).mockReturnValueOnce(promesa)

    render(React.createElement(FilaAccionesEvento, propsBase()))
    const guardar = botonGuardar()
    const voy = botonVoy()

    fireEvent.click(voy)
    expect(voy.getAttribute('aria-pressed')).toBe('false')
    expect((voy as HTMLButtonElement).disabled).toBe(true)
    expect((guardar as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      resolver({ ok: true, cantidades: { voy: 1 }, propia: 'voy', guardado: true })
    })

    expect(voy.getAttribute('aria-pressed')).toBe('true')
    expect(guardar.getAttribute('aria-pressed')).toBe('true')
    expect((voy as HTMLButtonElement).disabled).toBe(false)
  })

  it('el contador: con cantidadesIniciales.voy = 2 el botón de Voy dice "Voy" sin número; con 3 dice textoBotonVoy(3) ("Voy · 3 van")', () => {
    // `toBe` y no `toContain`: el "✓" es un <svg> de lucide-react sin texto,
    // así que el `textContent` del botón es EXACTAMENTE `textoBotonVoy(n)`.
    // Con `toContain(textoBotonVoy(2))` ('Voy') el caso de 2 pasaba también
    // si el botón decía "Voy · 2 van", y la única aserción que lo salvaba era
    // la ausencia del "·" — que no dice nada de un formato distinto
    // ("Voy (2)"). Con `toBe` el umbral queda fijado de verdad, y queda
    // fijado contra la función de core en vez de contra un literal.
    const { unmount } = render(React.createElement(FilaAccionesEvento, propsBase({ cantidadesIniciales: { voy: 2 } })))
    expect(botonVoy().textContent).toBe(textoBotonVoy(2))
    expect(botonVoy().textContent).not.toContain('2')
    unmount()

    render(React.createElement(FilaAccionesEvento, propsBase({ cantidadesIniciales: { voy: 3 } })))
    expect(botonVoy().textContent).toBe(textoBotonVoy(3))
    expect(botonVoy().textContent).toContain('3')
  })

  it('sin sesión: los dos botones llaman a open() de useAuthModal y NO llaman ni a toggleFavorite ni a marcarAsistencia', () => {
    render(React.createElement(FilaAccionesEvento, propsBase({ haySesion: false })))

    fireEvent.click(botonGuardar())
    fireEvent.click(botonVoy())

    expect(mockOpenAuthModal).toHaveBeenCalledTimes(2)
    expect(toggleFavorite).not.toHaveBeenCalled()
    expect(marcarAsistencia).not.toHaveBeenCalled()
  })

  it('sacar el ♥ de un evento con Voy marcado: con voyQuitado:true el Voy se apaga, el contador baja en 1 y el toast recibe TEXTO_SACASTE_GUARDADO_CON_VOY', async () => {
    vi.mocked(toggleFavorite).mockResolvedValueOnce({ success: true, favorited: false, voyQuitado: true })

    render(
      React.createElement(
        FilaAccionesEvento,
        propsBase({ guardadoInicial: true, voyInicial: true, cantidadesIniciales: { voy: 5 } }),
      ),
    )

    await act(async () => {
      fireEvent.click(botonGuardar())
    })

    expect(botonGuardar().getAttribute('aria-pressed')).toBe('false')
    expect(botonVoy().getAttribute('aria-pressed')).toBe('false')
    expect(botonVoy().textContent).toContain(textoBotonVoy(4))
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: TEXTO_SACASTE_GUARDADO_CON_VOY }))
  })

  it('error del segundo paso de Voy: marcarAsistencia devuelve ok:false con guardado:true → el ♥ queda "true" y el Voy "false" (voy ⇒ guardado no se rompe en el camino de error)', async () => {
    vi.mocked(marcarAsistencia).mockResolvedValueOnce({ ok: false, error: 'DB_ERROR', guardado: true })

    render(React.createElement(FilaAccionesEvento, propsBase()))

    await act(async () => {
      fireEvent.click(botonVoy())
    })

    expect(botonGuardar().getAttribute('aria-pressed')).toBe('true')
    expect(botonVoy().getAttribute('aria-pressed')).toBe('false')
  })

  // CUÁL de las dos barreras del doble click puede fijar un test con DOM, y
  // cuál no. Contra el doble click hay dos mecanismos: `disabled={pendiente}`
  // en el botón y `if (pendiente) return` al principio de `alTocarVoy`. El
  // único que un test con DOM puede poner en rojo es el `disabled`, y por una
  // razón de React, no del test: React decide si entrega un `click` mirando
  // `props.disabled` del fiber (`shouldPreventMouseEvent` del plugin de
  // eventos), no el nodo del DOM. O sea que mientras `pendiente` sea `true`
  // NINGÚN click llega al handler — ni forzando `nodo.disabled = false` antes
  // de disparar, que es lo primero que se intenta. Verificado con tres
  // roturas (R61, lead), con el worktree limpio:
  //
  //   - borrar `if (pendiente) return` de `alTocarVoy`: los 12 tests siguen
  //     en VERDE, también uno que forzaba `nodo.disabled = false` entre los
  //     dos clicks. La guarda es defensa en profundidad inalcanzable por
  //     la pantalla mientras el botón se deshabilite;
  //   - borrar `disabled={pendiente}` de `BotonVoy`: 2 tests en rojo (este y
  //     el del Voy pesimista);
  //   - borrar las dos: los mismos 2 en rojo.
  //
  // Por eso acá NO hay un caso que diga que prueba la guarda: sería un test
  // que afirma vigilar algo que no puede ponerse en rojo. Lo que se fija es
  // la garantía que el usuario ve (una sola llamada) Y la barrera que la
  // sostiene de verdad (el `disabled`), con su aserción propia.
  it('doble click rápido en Voy, con la promesa sin resolver todavía: el botón queda disabled (la barrera efectiva) y marcarAsistencia se llama UNA sola vez', () => {
    const { promesa } = deferred<Awaited<ReturnType<typeof marcarAsistencia>>>()
    vi.mocked(marcarAsistencia).mockReturnValueOnce(promesa)

    render(React.createElement(FilaAccionesEvento, propsBase()))
    const voy = botonVoy() as HTMLButtonElement

    fireEvent.click(voy)
    // La barrera que hace el trabajo de verdad: sin esta aserción, borrar
    // `disabled={pendiente}` de `BotonVoy` no pondría este test en rojo.
    expect(voy.disabled).toBe(true)

    fireEvent.click(voy)

    expect(marcarAsistencia).toHaveBeenCalledTimes(1)
  })

  it('ni forzando `disabled = false` en el nodo del DOM el segundo click llega al handler: React mira props.disabled del fiber, no el nodo (por eso la guarda `if (pendiente) return` no se puede fijar desde acá)', () => {
    const { promesa } = deferred<Awaited<ReturnType<typeof marcarAsistencia>>>()
    vi.mocked(marcarAsistencia).mockReturnValueOnce(promesa)

    render(React.createElement(FilaAccionesEvento, propsBase()))
    const voy = botonVoy() as HTMLButtonElement

    fireEvent.click(voy)
    expect(marcarAsistencia).toHaveBeenCalledTimes(1)

    // Se le saca el `disabled` al nodo a mano, sin re-renderizar: el atributo
    // del DOM queda en `false` y el click se dispara igual…
    voy.disabled = false
    expect(voy.disabled).toBe(false)
    fireEvent.click(voy)

    // …y el handler NO corre, porque la decisión la toma React con las props
    // del fiber. Este caso está acá para que el próximo que quiera escribir
    // un test de la guarda no pierda la noche averiguándolo: si algún día
    // React cambia ese criterio, este test se pone en rojo y avisa.
    expect(marcarAsistencia).toHaveBeenCalledTimes(1)
  })

  it('el orden de los elementos en el DOM sale de ORDEN_FILA_ACCIONES, no de una lista escrita a mano', () => {
    render(React.createElement(FilaAccionesEvento, propsBase()))

    const compartirStub = document.querySelector('[data-testid="compartir-stub"]')
    expect(compartirStub).not.toBeNull()
    const fila = compartirStub!.parentElement!
    const hijos = Array.from(fila.children)

    const ordenReal = hijos.map((hijo) => {
      if (hijo.getAttribute('data-testid') === 'compartir-stub') return 'compartir'
      const ariaLabel = (hijo.getAttribute('aria-label') ?? '').toLowerCase()
      return ariaLabel.includes('marcar') ? 'voy' : 'guardar'
    })

    expect(ordenReal).toEqual([...ORDEN_FILA_ACCIONES])
  })
})
