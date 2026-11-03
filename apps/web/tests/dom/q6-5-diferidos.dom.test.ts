// @vitest-environment jsdom
//
// Q6-5: lo que se sacó del JavaScript inicial sigue funcionando cuando hace
// falta. El Toaster no monta Radix Toast hasta el primer aviso (y después
// muestra el aviso), el modal de donación no monta su contenido hasta que se
// abre, y el cargador diferido de supabase-js pide el módulo una sola vez.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

const { estadoDonacion, creados } = vi.hoisted(() => ({
  estadoDonacion: { isOpen: false },
  creados: { n: 0 },
}))

vi.mock('@/components/donation-context', () => ({
  useDonation: () => ({ isOpen: estadoDonacion.isOpen, message: 'Gracias', closeDonationModal: () => {} }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/',
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    creados.n += 1
    return { soy: 'cliente' }
  },
  signInWithGoogle: async () => ({ error: null }),
}))

import { Toaster } from '@/components/ui/toaster'
import { toast } from '@/hooks/use-toast'
import { DonationModal } from '@/components/donation-modal'
import { AuthModalProvider, useAuthModal } from '@/components/auth-modal'
import { cargarModuloCliente, clienteSupabase, cuandoEsteLibre } from '@/lib/supabase/cliente-diferido'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Toaster diferido', () => {
  it('sin avisos no monta nada (ni la región de Radix)', () => {
    const { container } = render(React.createElement(Toaster))
    expect(container.innerHTML).toBe('')
    expect(document.querySelector('[role="region"]')).toBeNull()
  })

  it('con el primer aviso carga el contenido y lo muestra', async () => {
    render(React.createElement(Toaster))
    act(() => {
      toast({ title: 'Guardado', description: 'Listo' })
    })
    expect(await screen.findByText('Guardado')).toBeTruthy()
    expect(screen.getByText('Listo')).toBeTruthy()
  })
})

describe('Modal de donación diferido', () => {
  it('cerrado no monta el contenido', () => {
    estadoDonacion.isOpen = false
    const { container } = render(React.createElement(DonationModal))
    expect(container.innerHTML).toBe('')
  })

  it('al abrirse carga el contenido (con su mensaje)', async () => {
    estadoDonacion.isOpen = true
    render(React.createElement(DonationModal))
    expect(await screen.findByText('Gracias')).toBeTruthy()
    estadoDonacion.isOpen = false
  })
})

describe('Modal de ingreso con el diálogo diferido', () => {
  function Abridor() {
    const { open } = useAuthModal()
    return React.createElement('button', { type: 'button', onClick: open }, 'Ingresar')
  }

  it('cerrado no monta el diálogo; al abrirse lo carga y lo muestra con su título', async () => {
    render(React.createElement(AuthModalProvider, null, React.createElement(Abridor)))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    act(() => {
      screen.getByRole('button', { name: 'Ingresar' }).click()
    })
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo.textContent).toContain('Email')
  })
})

describe('lib/supabase/cliente-diferido', () => {
  it('pide el módulo una sola vez y devuelve el cliente de createClient', async () => {
    const [a, b] = await Promise.all([cargarModuloCliente(), cargarModuloCliente()])
    expect(a).toBe(b)
    const antes = creados.n
    expect(await clienteSupabase()).toEqual({ soy: 'cliente' })
    expect(creados.n).toBe(antes + 1)
  })

  it('cuandoEsteLibre usa requestIdleCallback (con tope de 2 s) y se puede cancelar', () => {
    const pedir = vi.fn<(tarea: IdleRequestCallback, opciones?: IdleRequestOptions) => number>(() => 7)
    const cancelar = vi.fn()
    vi.stubGlobal('requestIdleCallback', pedir)
    vi.stubGlobal('cancelIdleCallback', cancelar)
    const tarea = vi.fn()
    const deshacer = cuandoEsteLibre(tarea)
    expect(pedir).toHaveBeenCalledWith(tarea, { timeout: 2000 })
    deshacer()
    expect(cancelar).toHaveBeenCalledWith(7)
    vi.unstubAllGlobals()
  })

  it('sin requestIdleCallback (Safari) cae a setTimeout', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const tarea = vi.fn()
    cuandoEsteLibre(tarea)
    expect(tarea).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5)
    expect(tarea).toHaveBeenCalledTimes(1)
    const otra = vi.fn()
    const deshacer = cuandoEsteLibre(otra)
    deshacer()
    vi.advanceTimersByTime(5)
    expect(otra).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
