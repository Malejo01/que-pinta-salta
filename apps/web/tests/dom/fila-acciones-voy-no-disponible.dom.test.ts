// @vitest-environment jsdom
//
// El toast del Voy cuando el servidor rechaza la marca (tarea 73-c): con
// `INVALID` (el evento ya no está disponible) el aviso dice
// `MENSAJE_EVENTO_NO_DISPONIBLE`; con `DB_ERROR`, el genérico; con
// `AUTH_REQUIRED`, se abre el modal y NO hay toast de error.
//
// Mismo armado que `fila-acciones-evento.dom.test.ts` (los `vi.mock` van acá,
// ver el comentario de `preparar-dom.ts`).
import * as React from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'

import { MENSAJE_EVENTO_NO_DISPONIBLE } from '@qps/core/asistencia'
import { FilaAccionesEvento } from '@/components/fila-acciones-evento'
import { marcarAsistencia } from '@/lib/asistencia'

import { propsBase, botonVoy } from './preparar-dom'

vi.mock('@/lib/asistencia', () => ({
  marcarAsistencia: vi.fn(),
}))

vi.mock('@/lib/actions/favorites', () => ({
  toggleFavorite: vi.fn(),
}))

const { mockOpenAuthModal, mockToast } = vi.hoisted(() => ({
  mockOpenAuthModal: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock('@/components/auth-modal', () => ({
  useAuthModal: () => ({ open: mockOpenAuthModal, close: vi.fn() }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

afterEach(() => {
  vi.clearAllMocks()
})

async function tocarVoy() {
  render(React.createElement(FilaAccionesEvento, propsBase()))
  await act(async () => {
    fireEvent.click(botonVoy())
  })
}

describe('FilaAccionesEvento: el aviso cuando falla el Voy', () => {
  it('INVALID: el toast recibe description === MENSAJE_EVENTO_NO_DISPONIBLE (destructive)', async () => {
    vi.mocked(marcarAsistencia).mockResolvedValueOnce({ ok: false, error: 'INVALID' })

    await tocarVoy()

    expect(mockToast).toHaveBeenCalledTimes(1)
    const arg = mockToast.mock.calls[0][0]
    expect(arg.description).toBe(MENSAJE_EVENTO_NO_DISPONIBLE)
    expect(arg.variant).toBe('destructive')
    expect(mockOpenAuthModal).not.toHaveBeenCalled()
  })

  it('DB_ERROR: el toast dice el genérico, no el de evento no disponible', async () => {
    vi.mocked(marcarAsistencia).mockResolvedValueOnce({ ok: false, error: 'DB_ERROR' })

    await tocarVoy()

    expect(mockToast).toHaveBeenCalledTimes(1)
    const arg = mockToast.mock.calls[0][0]
    expect(arg.description).toBe('No pudimos guardar tu marca. Probá de nuevo.')
    expect(arg.description).not.toBe(MENSAJE_EVENTO_NO_DISPONIBLE)
  })

  it('AUTH_REQUIRED: abre el modal de entrada y no hay toast de error', async () => {
    vi.mocked(marcarAsistencia).mockResolvedValueOnce({ ok: false, error: 'AUTH_REQUIRED' })

    await tocarVoy()

    expect(mockOpenAuthModal).toHaveBeenCalledTimes(1)
    expect(mockToast).not.toHaveBeenCalled()
  })
})
