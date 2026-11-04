// @vitest-environment jsdom
//
// R-1 · Seguir y dejar de seguir un lugar desde su ficha (/lugar/<slug>,
// Q5-5 / Q5-6), con el `BotonSeguir` real en un DOM: qué se le manda a
// `cambiarSeguimiento` (la server action, doble), que el botón espere la
// respuesta antes de cambiar, sin sesión el modal de ingreso, y los errores.
// Antes, la ficha del lugar solo tenía un detector que buscaba
// `<BotonSeguir tipo="lugar"` en el fuente.
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const dobles = vi.hoisted(() => ({
  cambiarSeguimiento: vi.fn(),
  abrirIngreso: vi.fn(),
  toast: vi.fn(),
  ruta: '/lugar/teatro-provincial',
}))
vi.mock('@/lib/actions/radar', () => ({ cambiarSeguimiento: dobles.cambiarSeguimiento }))
vi.mock('@/components/auth-modal', () => ({ useAuthModal: () => ({ open: dobles.abrirIngreso }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: dobles.toast }) }))
vi.mock('next/navigation', () => ({ usePathname: () => dobles.ruta }))

import { BotonSeguir } from '@/components/boton-seguir'

const TEATRO = '11111111-1111-4111-8111-111111111111'

function dibujar(props: Partial<{ siguiendoInicial: boolean; haySesion: boolean }> = {}) {
  render(React.createElement(BotonSeguir, { tipo: 'lugar', id: TEATRO, etiqueta: 'Teatro Provincial', siguiendoInicial: false, haySesion: true, ...props }))
  return screen.getByRole('button') as HTMLButtonElement
}

async function tocar(boton: HTMLElement) {
  await act(async () => {
    fireEvent.click(boton)
  })
}

beforeEach(() => {
  dobles.ruta = '/lugar/teatro-provincial'
  dobles.cambiarSeguimiento.mockImplementation(async ({ seguir }: { seguir: boolean }) => ({ ok: true, siguiendo: seguir }))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Seguir un lugar desde su ficha', () => {
  it('seguir y dejar de seguir: cada toque manda tipo «lugar», el id y el valor nuevo; el botón refleja la respuesta', async () => {
    const boton = dibujar()
    expect(boton.textContent).toBe('+ Seguir')
    expect(boton.getAttribute('aria-pressed')).toBe('false')
    await tocar(boton)
    expect(dobles.cambiarSeguimiento).toHaveBeenLastCalledWith({ tipo: 'lugar', id: TEATRO, seguir: true })
    expect(boton.textContent).toBe('✓ Siguiendo')
    expect(boton.getAttribute('aria-pressed')).toBe('true')
    await tocar(boton)
    expect(dobles.cambiarSeguimiento).toHaveBeenLastCalledWith({ tipo: 'lugar', id: TEATRO, seguir: false })
    expect(boton.textContent).toBe('+ Seguir')
  })

  it('arranca en «Siguiendo» si la página dice que ya lo sigue', () => {
    expect(dibujar({ siguiendoInicial: true }).textContent).toBe('✓ Siguiendo')
  })

  it('pesimista: mientras espera, queda deshabilitado y sin cambiar; un segundo toque no manda nada', async () => {
    let soltar: (v: unknown) => void = () => {}
    dobles.cambiarSeguimiento.mockReturnValue(new Promise((r) => (soltar = r)))
    const boton = dibujar()
    await tocar(boton)
    expect(boton.disabled).toBe(true)
    expect(boton.textContent).toBe('+ Seguir')
    await tocar(boton)
    expect(dobles.cambiarSeguimiento).toHaveBeenCalledTimes(1)
    await act(async () => soltar({ ok: true, siguiendo: true }))
    expect(boton.disabled).toBe(false)
    expect(boton.textContent).toBe('✓ Siguiendo')
  })

  it('sin sesión: abre el ingreso y no llama a la acción', async () => {
    await tocar(dibujar({ haySesion: false }))
    expect(dobles.abrirIngreso).toHaveBeenCalledTimes(1)
    expect(dobles.cambiarSeguimiento).not.toHaveBeenCalled()
  })

  it('la sesión venció (AUTH_REQUIRED): abre el ingreso y el botón no cambia', async () => {
    dobles.cambiarSeguimiento.mockResolvedValue({ ok: false, error: 'AUTH_REQUIRED' })
    const boton = dibujar()
    await tocar(boton)
    expect(dobles.abrirIngreso).toHaveBeenCalledTimes(1)
    expect(boton.textContent).toBe('+ Seguir')
  })

  it('error de la base: aviso y el botón no cambia; sin red: el aviso de conexión', async () => {
    dobles.cambiarSeguimiento.mockResolvedValue({ ok: false, error: 'DB_ERROR' })
    const boton = dibujar()
    await tocar(boton)
    expect(dobles.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'No pudimos guardar el seguimiento. Probá de nuevo.', variant: 'destructive' }))
    expect(boton.textContent).toBe('+ Seguir')
    dobles.cambiarSeguimiento.mockRejectedValue(new TypeError('Failed to fetch'))
    await tocar(boton)
    expect(dobles.toast).toHaveBeenCalledTimes(2)
    expect(boton.disabled).toBe(false)
  })

  it('en /en/place: «Follow» / «Following»', async () => {
    dobles.ruta = '/en/place/teatro-provincial'
    const boton = dibujar()
    expect(boton.textContent).toBe('+ Follow')
    await tocar(boton)
    expect(boton.textContent).toBe('✓ Following')
  })
})
