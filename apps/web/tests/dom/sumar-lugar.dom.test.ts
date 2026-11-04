// @vitest-environment jsdom
//
// Q5-3 · El formulario «Sumá un lugar para chicos» en un DOM real: campos con
// etiqueta, honeypot fuera del alcance, error con foco en el campo, gracias
// con foco en el mensaje, y la versión en inglés. La server action es un doble.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const { accion } = vi.hoisted(() => ({ accion: vi.fn() }))
vi.mock('@/lib/actions/sumar-lugar-chicos', () => ({ sumarLugarChicos: accion }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children?: React.ReactNode }) => React.createElement('a', { href, ...resto }, children),
}))

import { FormularioSumarLugar } from '@/components/lugares-chicos/formulario-sumar'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function enviar() {
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: /Enviar|Send/ }).closest('form')!)
  })
}

describe('FormularioSumarLugar', () => {
  it('campos con etiqueta; el contacto opcional explica para qué se usa; el honeypot no tiene foco', () => {
    render(React.createElement(FormularioSumarLugar, { idioma: 'es', iniciado: 1 }))
    expect(screen.getByLabelText('Nombre del lugar')).toBeTruthy()
    expect(screen.getByLabelText('Dirección o esquina')).toBeTruthy()
    const contacto = screen.getByLabelText(/Tu email o teléfono/)
    expect(contacto.hasAttribute('required')).toBe(false)
    expect(contacto.getAttribute('aria-describedby')).toContain('ayuda-contacto')
    expect(document.getElementById('ayuda-contacto')!.textContent).toMatch(/No lo publicamos/)
    const trampa = document.querySelector('input[name="sitio"]') as HTMLInputElement
    expect(trampa.tabIndex).toBe(-1)
    expect(trampa.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('un error lleva el foco al campo y lo marca inválido', async () => {
    accion.mockResolvedValue({ estado: 'error', codigo: 'direccion' })
    render(React.createElement(FormularioSumarLugar, { idioma: 'es', iniciado: 1 }))
    await enviar()
    const campo = screen.getByLabelText('Dirección o esquina')
    expect(document.activeElement).toBe(campo)
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(/dirección/)
  })

  // Q6-7: con `action={…}` React 19 vaciaba el formulario también cuando la
  // respuesta era un error: la persona perdía todo lo escrito. Este caso
  // fallaba antes del arreglo (el nombre volvía vacío).
  it('un error no borra lo que la persona escribió, y la acción corre una sola vez', async () => {
    accion.mockResolvedValue({ estado: 'error', codigo: 'link' })
    render(React.createElement(FormularioSumarLugar, { idioma: 'es', iniciado: 1 }))
    fireEvent.change(screen.getByLabelText('Nombre del lugar'), { target: { value: 'Plaza QA' } })
    fireEvent.change(screen.getByLabelText('Dirección o esquina'), { target: { value: 'Calle QA 1' } })
    fireEvent.change(screen.getByLabelText(/Web o Instagram/), { target: { value: 'no es un link' } })
    await enviar()
    expect(accion).toHaveBeenCalledTimes(1)
    const enviado = accion.mock.calls[0]![1] as FormData
    expect(enviado.get('nombre')).toBe('Plaza QA')
    expect(enviado.get('iniciado')).toBe('1')
    expect((screen.getByLabelText('Nombre del lugar') as HTMLInputElement).value).toBe('Plaza QA')
    expect((screen.getByLabelText('Dirección o esquina') as HTMLInputElement).value).toBe('Calle QA 1')
    const link = screen.getByLabelText(/Web o Instagram/) as HTMLInputElement
    expect(link.value).toBe('no es un link')
    expect(document.activeElement).toBe(link)
  })

  it('enviado: gracias con el foco en el mensaje y links para seguir', async () => {
    accion.mockResolvedValue({ estado: 'enviado' })
    render(React.createElement(FormularioSumarLugar, { idioma: 'es', iniciado: 1 }))
    await enviar()
    const gracias = screen.getByRole('status')
    expect(gracias.textContent).toBe('¡Gracias! Lo vamos a verificar antes de publicarlo.')
    expect(document.activeElement).toBe(gracias)
    expect(screen.getByRole('link', { name: 'Ver los lugares para chicos en el mapa' }).getAttribute('href')).toBe('/mapa?cuando=hoy&chicos=1&capa=chicos')
  })

  it('en inglés', async () => {
    accion.mockResolvedValue({ estado: 'error', codigo: 'limite' })
    render(React.createElement(FormularioSumarLugar, { idioma: 'en', iniciado: 1 }))
    expect(screen.getByLabelText('Name of the place')).toBeTruthy()
    await enviar()
    expect(screen.getByRole('alert').textContent).toMatch(/several suggestions/)
    expect((document.querySelector('input[name="idioma"]') as HTMLInputElement).value).toBe('en')
  })
})
