// @vitest-environment jsdom
//
// R-1 · «Verificar hoy» y los botones de estado de una ficha en
// /admin/lugares-chicos (Q5-1), con las server actions REALES y Supabase de
// mentira: la acción («publicar», «vencido», «archivar») viaja en el botón que
// se tocó (name="accion"), el motivo de archivo en su campo, y el mensaje de
// la acción se anuncia. Antes, el componente solo tenía tests de a11y con las
// acciones como dobles.
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const estado = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  fichaParaPublicar: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from(tabla: string) {
      let op = 'select'
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        update: (v: Record<string, unknown>) => ((op = 'update'), estado.updates.push(v), b),
        single: async () => ({ data: tabla === 'profiles' ? { role: 'ADMIN' } : null, error: null }),
        maybeSingle: async () => ({ data: estado.fichaParaPublicar, error: null }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: op === 'update' ? [{ id: 'x' }] : null, error: null }).then(res, rej),
      }
      return b
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { AccionesLugarChicos } from '@/components/admin/lugares-chicos/acciones'

const ID = '11111111-1111-4111-8111-111111111111'

async function tocar(nombre: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: nombre }))
  })
}
const mensajes = () => [...document.querySelectorAll('[role="status"]')].map((p) => p.textContent)

beforeEach(() => {
  estado.updates = []
  estado.fichaParaPublicar = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Acciones de una ficha: botones y acciones de verdad', () => {
  it('«Marcar vencido» de una publicada manda accion=vencido', async () => {
    render(React.createElement(AccionesLugarChicos, { id: ID, estadoActual: 'publicado' }))
    await tocar('Marcar vencido (deja de verse)')
    expect(estado.updates).toEqual([{ estado: 'vencido' }])
    expect(mensajes()).toContain('Marcado como vencido: ya no se ve en público.')
  })

  it('«Archivar» con un motivo: lo guarda; sin motivo: lo pide y no escribe', async () => {
    render(React.createElement(AccionesLugarChicos, { id: ID, estadoActual: 'borrador' }))
    await tocar('Archivar')
    expect(mensajes()).toContain('Para archivar, elegí o escribí el motivo.')
    expect(estado.updates).toEqual([])
    fireEvent.change(screen.getByLabelText('Motivo para archivar'), { target: { value: 'Cerró' } })
    await tocar('Archivar')
    expect(estado.updates).toEqual([{ estado: 'archivado', motivo_archivo: 'Cerró' }])
  })

  it('«Publicar» un borrador sin verificar: dice qué falta y no publica', async () => {
    estado.fichaParaPublicar = {
      tipo: 'pelotero',
      acceso: 'pago',
      fuente: 'openstreetmap',
      verificado_at: null,
      venue: { latitude: -24.79, longitude: -65.41, canonical_venue_id: null },
    }
    render(React.createElement(AccionesLugarChicos, { id: ID, estadoActual: 'borrador' }))
    await tocar('Publicar')
    expect(mensajes().join(' ')).toMatch(/^.*Para publicar falta: una fuente verificada.*la fecha de verificación/)
    expect(estado.updates).toEqual([])
  })

  it('«Marcar verificado hoy» con la fuente elegida', async () => {
    render(React.createElement(AccionesLugarChicos, { id: ID, estadoActual: 'borrador' }))
    fireEvent.change(screen.getByLabelText('Cómo lo confirmaste'), { target: { value: 'llamado' } })
    fireEvent.change(screen.getByLabelText('Detalle (link o nota)'), { target: { value: 'Llamé hoy' } })
    await tocar('Marcar verificado hoy')
    expect(estado.updates).toEqual([expect.objectContaining({ verificado_por: 'admin-1', fuente: 'llamado', fuente_detalle: 'Llamé hoy' })])
    expect(mensajes()).toContain('Marcado como verificado hoy.')
  })
})
