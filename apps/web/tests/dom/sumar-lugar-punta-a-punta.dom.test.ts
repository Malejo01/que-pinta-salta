// @vitest-environment jsdom
//
// R-1 · «Sumá un lugar para chicos» (Q5-3) de punta a punta: la página real
// (`PaginaSumarLugar`, con la marca de inicio del servidor), el formulario
// real y la server action REAL (`sumarLugarChicos`), con solo la base y los
// headers de mentira. dom/sumar-lugar.dom.test.ts prueba el formulario con la
// acción como doble y lugares-chicos/sumar-accion.test.ts la acción sola: acá
// se prueba que lo que el formulario manda es lo que la acción espera.
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const estado = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[], error: null as unknown, ip: 0 }))

// Una IP por test: el límite por IP (5 por hora) vive en el módulo de la acción.
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': `200.9.9.${estado.ip}` }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createAdminClient: () => ({
    // Q6-7: el cupo diario en la base (acá, siempre hay cupo).
    rpc: async () => ({ data: true, error: null }),
    from: (tabla: string) => ({
      insert: async (fila: Record<string, unknown>) => {
        estado.inserts.push({ tabla, ...fila })
        return { error: estado.error }
      },
    }),
  }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children?: React.ReactNode }) => React.createElement('a', { href, ...resto }, children),
}))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

import { PaginaSumarLugar } from '@/components/lugares-chicos/pagina-sumar'

let ahora = new Date('2026-11-03T18:00:00Z').getTime()

function dibujar(idioma: 'es' | 'en' = 'es') {
  // La página pone `iniciado` con la hora del servidor al dibujar.
  render(React.createElement(PaginaSumarLugar, { idioma }))
}
function escribir(etiqueta: RegExp | string, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
}
async function enviar() {
  await act(async () => {
    fireEvent.submit(document.querySelector('form')!)
  })
}

beforeEach(() => {
  // Q6-7: la acción usa la service key como secreto del HMAC del cupo.
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secreto-de-prueba-qa')
  estado.inserts = []
  estado.error = null
  estado.ip++
  ahora = new Date('2026-11-03T18:00:00Z').getTime()
  vi.spyOn(Date, 'now').mockImplementation(() => ahora)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  cleanup()
  vi.restoreAllMocks()
})

describe('Sumá un lugar: la página, el formulario y la acción de verdad', () => {
  it('una persona que tarda en completar: se guarda el pedido y ve el «gracias»', async () => {
    dibujar()
    escribir('Nombre del lugar', 'Plaza Alvarado')
    escribir('Dirección o esquina', 'Alvarado y Córdoba')
    escribir(/Tu email o teléfono/, 'persona@example.com')
    ahora += 30_000 // medio minuto completando
    await enviar()
    expect(estado.inserts).toEqual([
      {
        tabla: 'lugares_chicos_pedidos',
        nombre: 'Plaza Alvarado',
        direccion: 'Alvarado y Córdoba',
        tipo: null,
        comentario: null,
        link: null,
        contacto: 'persona@example.com',
        idioma: 'es',
      },
    ])
    expect(screen.getByRole('status').textContent).toBe('¡Gracias! Lo vamos a verificar antes de publicarlo.')
  })

  it('enviado en menos de 4 segundos (un bot): ve el «gracias» igual, pero no se guarda nada', async () => {
    dibujar()
    escribir('Nombre del lugar', 'Spam')
    escribir('Dirección o esquina', 'Spam 123')
    ahora += 1_000
    await enviar()
    expect(estado.inserts).toEqual([])
    expect(screen.getByRole('status').textContent).toMatch(/Gracias/)
  })

  it('un dato que no valida vuelve al formulario con el error en el campo, sin guardar', async () => {
    dibujar()
    escribir('Nombre del lugar', 'ab')
    escribir('Dirección o esquina', 'Alvarado y Córdoba')
    ahora += 30_000
    await enviar()
    expect(estado.inserts).toEqual([])
    const campo = screen.getByLabelText('Nombre del lugar')
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(campo)
  })

  it('en /en: el pedido se guarda con idioma «en»', async () => {
    dibujar('en')
    escribir('Name of the place', 'Plaza Alvarado')
    escribir(/Address/, 'Alvarado y Córdoba')
    ahora += 30_000
    await enviar()
    expect(estado.inserts[0]).toMatchObject({ nombre: 'Plaza Alvarado', idioma: 'en' })
  })

  it('si la base falla, la persona ve el error del servidor y el formulario sigue ahí', async () => {
    estado.error = { code: '23514' }
    dibujar()
    escribir('Nombre del lugar', 'Plaza Alvarado')
    escribir('Dirección o esquina', 'Alvarado y Córdoba')
    ahora += 30_000
    await enviar()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByLabelText('Nombre del lugar')).toBeTruthy()
  })
})
