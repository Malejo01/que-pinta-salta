// @vitest-environment jsdom
//
// R75-q (QPS-349): comportamiento de `LugarMapaUbicar` en un DOM real, con
// `guardarUbicacionManual`, `buscarDireccionLugar`, `next/navigation` y el
// `import()` del mapa reemplazados por dobles. Sin red ni base.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LugarMapaUbicar } from '@/components/admin/lugar-mapa-ubicar'
import { buscarDireccionLugar, guardarUbicacionManual } from '@/lib/admin/lugares-actions'
import { deferred } from './preparar-dom'

const { replace, refresh, mapa } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  mapa: { onMover: null as null | ((p: { lat: number; lng: number }) => void) },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}))

vi.mock('@/lib/admin/lugares-actions', () => ({
  guardarUbicacionManual: vi.fn(),
  buscarDireccionLugar: vi.fn(),
}))

vi.mock('@/components/mapa/mapa-pin-maplibre', async () => {
  const { createElement } = await import('react')
  return {
    default: (props: { onMover: (p: { lat: number; lng: number }) => void }) => {
      mapa.onMover = props.onMover
      return createElement('div', { 'data-testid': 'mapa-doble' })
    },
  }
})

const VENUE_ID = '11111111-1111-4111-8111-111111111111'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mapa.onMover = null
})

async function montar() {
  render(
    React.createElement(LugarMapaUbicar, {
      venueId: VENUE_ID,
      nombre: 'Venue de Prueba',
      latitude: -24.78,
      longitude: -65.41,
      ver: 'sin-ubicacion',
    })
  )
  await waitFor(() => expect(screen.getByTestId('mapa-doble')).toBeTruthy())
}

function mover(lat: number, lng: number) {
  act(() => mapa.onMover!({ lat, lng }))
}

const botonGuardar = () => screen.getByRole('button', { name: 'Guardar ubicación' }) as HTMLButtonElement

describe('LugarMapaUbicar: guardar', () => {
  it('guardar sin mover durante el guardado: replace con guardado= y refresh', async () => {
    vi.mocked(guardarUbicacionManual).mockResolvedValue({ ok: true } as never)
    await montar()
    mover(-24.79, -65.42)
    await act(async () => {
      fireEvent.click(botonGuardar())
    })
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
    expect(replace.mock.calls[0][0]).toBe(`/admin/lugares?ver=sin-ubicacion&guardado=${VENUE_ID}`)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(guardarUbicacionManual).toHaveBeenCalledWith(VENUE_ID, '-24.79, -65.42')
  })

  it('mover el pin durante el guardado: sin replace ni refresh, el panel sigue y avisa', async () => {
    const d = deferred<{ ok: true }>()
    vi.mocked(guardarUbicacionManual).mockReturnValue(d.promesa as never)
    await montar()
    mover(-24.79, -65.42)
    await act(async () => {
      fireEvent.click(botonGuardar())
    })
    mover(-24.8, -65.5)
    await act(async () => {
      d.resolver({ ok: true })
    })
    await waitFor(() =>
      expect(screen.getByText('Guardado. Moviste el pin mientras se guardaba: guardá de nuevo.')).toBeTruthy()
    )
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    // `movido` sigue en true: se puede volver a guardar.
    expect(botonGuardar().disabled).toBe(false)
  })
})

describe('LugarMapaUbicar: búsqueda en vuelo', () => {
  it('si se arrastra el pin mientras busca, los resultados no reaparecen', async () => {
    const d = deferred<{ ok: true; resultados: { lat: number; lng: number; etiqueta: string }[] }>()
    vi.mocked(buscarDireccionLugar).mockReturnValue(d.promesa as never)
    await montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Calle de Prueba 123' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('textbox').closest('form')!)
    })
    expect(buscarDireccionLugar).toHaveBeenCalledTimes(1)
    mover(-24.79, -65.42)
    await act(async () => {
      d.resolver({ ok: true, resultados: [{ lat: -24.7, lng: -65.4, etiqueta: 'Resultado de Prueba' }] })
    })
    expect(screen.queryByText('Resultado de Prueba')).toBeNull()
  })

  it('sin arrastre, los resultados sí aparecen (control)', async () => {
    const d = deferred<{ ok: true; resultados: { lat: number; lng: number; etiqueta: string }[] }>()
    vi.mocked(buscarDireccionLugar).mockReturnValue(d.promesa as never)
    await montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Calle de Prueba 123' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('textbox').closest('form')!)
    })
    await act(async () => {
      d.resolver({ ok: true, resultados: [{ lat: -24.7, lng: -65.4, etiqueta: 'Resultado de Prueba' }] })
    })
    expect(screen.getByText('Resultado de Prueba')).toBeTruthy()
  })
})
