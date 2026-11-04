// @vitest-environment jsdom
//
// Q6-6 · Accesibilidad de piezas nuevas del admin en un DOM real: el gráfico
// de /admin/uso (alternativa textual con caption y encabezados de tabla) y los
// pedidos de «Sumá un lugar» en /admin/lugares-chicos (botones con nombre que
// dice de qué pedido son, y el link externo avisando que abre otra pestaña).
// Las server actions son dobles.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('@/lib/admin/lugares-chicos-actions', () => ({
  pasarPedidoABorrador: vi.fn(),
  descartarPedido: vi.fn(),
  borrarContactoPedido: vi.fn(),
}))

import { GraficoBarras } from '@/components/admin/grafico-barras'
import { PedidoLugarChicos, type PedidoAdmin } from '@/components/admin/lugares-chicos/pedidos'

afterEach(() => cleanup())

describe('GraficoBarras', () => {
  const serie = [
    { clave: '2026-11-01', valor: 3 },
    { clave: '2026-11-02', valor: 5 },
  ]

  it('el SVG es una imagen con resumen; la tabla tiene caption y encabezados de columna', () => {
    render(React.createElement(GraficoBarras, { titulo: 'Personas activas por día (app)', serie }))
    const img = screen.getByRole('img')
    expect(img.getAttribute('aria-label')).toBe('Personas activas por día (app): 2 puntos, máximo 5, total 8, último 5.')
    const tabla = screen.getByRole('table', { name: 'Personas activas por día (app)' })
    const encabezados = within(tabla).getAllByRole('columnheader')
    expect(encabezados.map((th) => th.textContent)).toEqual(['Período', 'Valor'])
    expect(encabezados.every((th) => th.getAttribute('scope') === 'col')).toBe(true)
  })

  it('«Ver los datos» dice de qué gráfico es (hay cinco en la página)', () => {
    render(React.createElement(GraficoBarras, { titulo: 'Vistas de eventos en la web por día', serie }))
    expect(document.querySelector('summary')!.textContent).toBe('Ver los datos en una tabla: Vistas de eventos en la web por día')
  })

  it('los números del eje no usan transparencia (contraste: ver tests/a11y/q6-6-contraste.test.ts)', () => {
    render(React.createElement(GraficoBarras, { titulo: 'x', serie }))
    for (const t of Array.from(document.querySelectorAll('svg text'))) {
      expect(t.getAttribute('fill-opacity')).toBeNull()
      expect(t.getAttribute('class')).toContain('fill-muted-foreground')
    }
  })
})

describe('PedidoLugarChicos', () => {
  const pedido: PedidoAdmin = {
    id: '11111111-1111-4111-8111-111111111111',
    nombre: 'Pelotero Chiquilandia',
    direccion: 'Av. Siempreviva 742',
    tipo: 'pelotero',
    comentario: null,
    link: 'https://example.org/chiquilandia',
    contacto: 'alguien@example.org',
    idioma: 'es',
    estado: 'nuevo',
    created_at: '2026-11-03T12:00:00Z',
  }

  it('cada botón y el desplegable nombran el pedido (en una lista de varios, «Descartar» solo era ambiguo)', () => {
    render(React.createElement('ul', null, React.createElement(PedidoLugarChicos, { pedido })))
    expect(screen.getByRole('button', { name: 'Pasar a borrador: Pelotero Chiquilandia' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descartar: Pelotero Chiquilandia' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Borrar contacto: Pelotero Chiquilandia' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Tipo: Pelotero Chiquilandia' })).toBeTruthy()
  })

  it('el link que mandó la persona avisa que abre otra pestaña', () => {
    render(React.createElement('ul', null, React.createElement(PedidoLugarChicos, { pedido })))
    const link = screen.getByRole('link', { name: 'https://example.org/chiquilandia, se abre en otra pestaña' })
    expect(link.getAttribute('target')).toBe('_blank')
  })
})
