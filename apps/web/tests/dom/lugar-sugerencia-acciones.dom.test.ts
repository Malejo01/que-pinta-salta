// @vitest-environment jsdom
//
// R-1 · «Confirmar» / «Descartar» de la ubicación sugerida por Nominatim en
// /admin/lugares (Q5-16, decisión nº7), en un DOM real. Las acciones de
// servidor ya tenían tests (admin/lugares-sugerencia.test.ts); el componente
// que las llama, no: qué acción y con qué id, la confirmación antes de
// descartar, el mensaje en vivo y el refresh solo si salió bien.
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const { confirmar, descartar, refresh } = vi.hoisted(() => ({ confirmar: vi.fn(), descartar: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/admin/lugares-actions', () => ({
  confirmarSugerenciaUbicacion: confirmar,
  descartarSugerenciaUbicacion: descartar,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { LugarSugerenciaAcciones } from '@/components/admin/lugar-sugerencia-acciones'

const ID = '11111111-1111-4111-8111-111111111111'

function dibujar() {
  render(React.createElement(LugarSugerenciaAcciones, { venueId: ID, nombre: 'Teatro Provincial' }))
}
const vivo = () => document.querySelector('[aria-live="polite"]')!

beforeEach(() => {
  confirmar.mockResolvedValue({ ok: true })
  descartar.mockResolvedValue({ ok: true })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('LugarSugerenciaAcciones', () => {
  it('cada botón dice de qué lugar es (se repiten en la lista)', () => {
    dibujar()
    expect(screen.getByRole('button', { name: 'Confirmar la ubicación sugerida para Teatro Provincial' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descartar la ubicación sugerida para Teatro Provincial' })).toBeTruthy()
  })

  it('Confirmar: llama a la acción con el id, anuncia y refresca la página', async () => {
    dibujar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    })
    expect(confirmar).toHaveBeenCalledWith(ID)
    expect(vivo().textContent).toBe('Ubicación confirmada')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('Confirmar con error: muestra el error de la acción y no refresca', async () => {
    confirmar.mockResolvedValue({ ok: false, error: 'Este lugar ya tiene una ubicación cargada a mano.' })
    dibujar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    })
    expect(vivo().textContent).toBe('Este lugar ya tiene una ubicación cargada a mano.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('Descartar pide confirmación con el nombre; si se cancela, no llama a nada', async () => {
    const pregunta = vi.spyOn(window, 'confirm').mockReturnValue(false)
    dibujar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Descartar/ }))
    })
    expect(pregunta).toHaveBeenCalledWith('¿Descartar la ubicación sugerida para Teatro Provincial?')
    expect(descartar).not.toHaveBeenCalled()
    expect(vivo().textContent).toBe('')
  })

  it('Descartar confirmado: llama con el id, anuncia y refresca', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    dibujar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Descartar/ }))
    })
    expect(descartar).toHaveBeenCalledWith(ID)
    expect(vivo().textContent).toBe('Sugerencia descartada')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('mientras espera la respuesta, los dos botones quedan deshabilitados (no hay doble envío)', async () => {
    let soltar: (v: { ok: boolean }) => void = () => {}
    confirmar.mockReturnValue(new Promise((r) => (soltar = r)))
    dibujar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    })
    const botones = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(botones.every((b) => b.disabled)).toBe(true)
    fireEvent.click(botones[0]!)
    expect(confirmar).toHaveBeenCalledTimes(1)
    await act(async () => soltar({ ok: true }))
    expect(botones.every((b) => !b.disabled)).toBe(true)
  })
})
