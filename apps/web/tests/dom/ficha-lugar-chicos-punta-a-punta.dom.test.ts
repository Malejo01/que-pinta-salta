// @vitest-environment jsdom
//
// R-1 · El formulario de la ficha de /admin/lugares-chicos (Q5-1) con la
// server action REAL (`guardarLugarChicos`) y Supabase de mentira: lo que
// manda el formulario es lo que la acción sabe leer. El caso clave es la
// ida y vuelta: abrir una ficha existente y guardar sin tocar nada tiene que
// escribir exactamente lo mismo (horarios, edades, accesibilidad,
// contactos), sin borrar ni cambiar datos. Antes, el formulario y la acción
// no se habían probado juntos.
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const estado = vi.hoisted(() => ({ escrituras: [] as { tabla: string; op: string; valores: Record<string, unknown> }[] }))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from(tabla: string) {
      let op = 'select'
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        insert: (v: Record<string, unknown>) => ((op = 'insert'), estado.escrituras.push({ tabla, op, valores: v }), b),
        update: (v: Record<string, unknown>) => ((op = 'update'), estado.escrituras.push({ tabla, op, valores: v }), b),
        single: async () => (tabla === 'profiles' ? { data: { role: 'ADMIN' }, error: null } : { data: { id: 'nueva' }, error: null }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: op === 'update' ? [{ id: 'x' }] : null, error: null }).then(res, rej),
      }
      return b
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { FichaLugarChicosForm, type ValoresFicha } from '@/components/admin/lugares-chicos/ficha-form'

const ID = '11111111-1111-4111-8111-111111111111'
const VENUE = '22222222-2222-4222-8222-222222222222'

const EXISTENTE: ValoresFicha = {
  id: ID,
  tipo: 'pelotero',
  descripcion_corta: 'Pelotero con juegos para 2 a 8 años',
  edad_min: 2,
  edad_max: 8,
  horarios: {
    version: 1,
    semana: {
      lun: [],
      mar: [{ desde: '10:00', hasta: '13:00' }, { desde: '16:00', hasta: '20:00' }],
      sab: [{ desde: '15:00', hasta: '21:00' }],
    },
    nota: 'Feriados consultar',
  },
  acceso: 'pago',
  nota_precio: 'Entrada por hora',
  techado: 'techado',
  tiene_rampa: true,
  tiene_bano_adaptado: false,
  tiene_cambiador: null,
  contacto_telefono: '+54 387 1234567',
  contacto_web: 'https://pelotero.example.com/',
  contacto_instagram: 'https://www.instagram.com/pelotero_salta/',
  fuente: 'visita',
  fuente_detalle: 'Visita del 3/11',
}

async function guardar() {
  await act(async () => {
    fireEvent.submit(document.querySelector('form')!)
  })
}

beforeEach(() => {
  estado.escrituras = []
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Ficha de lugar para chicos: el formulario con la acción de verdad', () => {
  it('ida y vuelta: abrir una ficha y guardar sin tocar nada escribe exactamente los mismos datos', async () => {
    render(React.createElement(FichaLugarChicosForm, { valores: EXISTENTE, esAlta: false }))
    await guardar()
    expect(screen.getByRole('status').textContent).toBe('Ficha guardada.')
    expect(estado.escrituras).toHaveLength(1)
    const { tabla, op, valores } = estado.escrituras[0]!
    expect([tabla, op]).toEqual(['lugares_permanentes', 'update'])
    expect(valores).toEqual({
      tipo: 'pelotero',
      descripcion_corta: 'Pelotero con juegos para 2 a 8 años',
      edad_min: 2,
      edad_max: 8,
      horarios: EXISTENTE.horarios,
      acceso: 'pago',
      nota_precio: 'Entrada por hora',
      techado: 'techado',
      tiene_rampa: true,
      tiene_bano_adaptado: false,
      tiene_cambiador: null,
      contacto_telefono: '+54 387 1234567',
      contacto_web: 'https://pelotero.example.com/',
      contacto_instagram: 'https://www.instagram.com/pelotero_salta/',
      fuente_detalle: 'Visita del 3/11',
    })
    // «Fuente: sin cambios» no pisa la fuente (ni estado ni verificación).
    expect(valores).not.toHaveProperty('fuente')
  })

  it('una plaza siempre abierta conserva el «siempre abierto»', async () => {
    render(
      React.createElement(FichaLugarChicosForm, {
        valores: { id: ID, tipo: 'plaza_juegos', acceso: 'gratis', horarios: { version: 1, semana: {}, siempre_abierto: true }, fuente: 'visita' },
        esAlta: false,
      }),
    )
    await guardar()
    expect(estado.escrituras[0]!.valores.horarios).toMatchObject({ siempre_abierto: true })
  })

  it('alta sobre un venue existente: crea el borrador con la fuente elegida', async () => {
    render(React.createElement(FichaLugarChicosForm, { valores: {}, venueElegido: { id: VENUE, nombre: 'Museo' }, esAlta: true }))
    fireEvent.change(document.querySelector('select[name="tipo"]')!, { target: { value: 'espacio_cultural_infantil' } })
    fireEvent.change(document.querySelector('select[name="fuente"]')!, { target: { value: 'web_oficial' } })
    await guardar()
    expect(screen.getByRole('status').textContent).toBe('Ficha creada como borrador.')
    expect(estado.escrituras[0]).toMatchObject({
      tabla: 'lugares_permanentes',
      op: 'insert',
      valores: { venue_id: VENUE, tipo: 'espacio_cultural_infantil', fuente: 'web_oficial', estado: 'borrador', cargado_por: 'admin-1', acceso: 'consultar' },
    })
  })

  it('alta sin elegir de dónde salen los datos: el error se anuncia y no se escribe nada', async () => {
    render(React.createElement(FichaLugarChicosForm, { valores: {}, venueElegido: { id: VENUE, nombre: 'Museo' }, esAlta: true }))
    fireEvent.change(document.querySelector('select[name="tipo"]')!, { target: { value: 'pelotero' } })
    await guardar()
    expect(screen.getByRole('status').textContent).toMatch(/Elegí de dónde salen los datos/)
    expect(estado.escrituras).toEqual([])
  })
})
