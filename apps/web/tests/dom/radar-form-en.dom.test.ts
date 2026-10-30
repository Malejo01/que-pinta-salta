// @vitest-environment jsdom
//
// RadarForm en inglés (78-b): los textos de la interfaz salen del diccionario
// `radar`, y los nombres de lugares, direcciones y cuentas (dato de la base, en
// castellano) llevan lang="es". Por omisión, los textos de castellano de
// siempre y ningún lang. Las server actions, el router y los avisos van
// mockeados. Sin red ni base.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/donation-context', () => ({ useDonation: () => ({ openDonationModal: vi.fn() }) }))
vi.mock('@/lib/actions/radar', () => ({
  updateRadarSettings: vi.fn(),
  triggerTestRadarEmail: vi.fn(),
}))

import { RadarForm } from '@/components/radar-form'
import type { Category, Venue } from '@/lib/types'

afterEach(() => {
  cleanup()
})

const CATEGORIAS = [
  { id: 'cat-1', name: 'Teatro', slug: 'teatro' },
  { id: 'cat-2', name: 'Categoría Nueva', slug: 'categoria-nueva' },
] as unknown as Category[]

const LUGARES = [
  { id: 'lugar-1', name: 'Peña de Prueba', address: 'Calle de Prueba 123' },
  { id: 'lugar-2', name: 'Club de Prueba', address: null },
] as unknown as Venue[]

const CUENTAS = [{ id: 'cuenta-1', display_name: 'Productora de Prueba', username: 'productora_de_prueba' }]

function montar(idioma?: 'es' | 'en', extra: Partial<React.ComponentProps<typeof RadarForm>> = {}) {
  return render(
    React.createElement(RadarForm, {
      initialSettings: null,
      categories: CATEGORIAS,
      venues: LUGARES,
      instagramAccounts: CUENTAS,
      idioma,
      ...extra,
    }),
  )
}

function buscar(texto: string) {
  const input = document.querySelector('input[type="text"]') as HTMLInputElement
  fireEvent.change(input, { target: { value: texto } })
  fireEvent.focus(input)
  return input
}

describe('RadarForm en inglés', () => {
  it('encabezados, etiquetas, notas y botón de guardar en inglés', () => {
    const { container } = montar('en')
    expect(screen.getByText('Frequency and recipient')).toBeTruthy()
    expect(screen.getByText('How often do you want to get updates?')).toBeTruthy()
    expect(screen.getByText('Email address')).toBeTruthy()
    expect(screen.getByText('We send it to your account email.')).toBeTruthy()
    expect(screen.getByText('Categories you like')).toBeTruthy()
    expect(screen.getByText('Favorite venues and organizers')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Radar preferences' })).toBeTruthy()
    expect(screen.getByText(/You are not following any venue or Instagram account yet/)).toBeTruthy()
    expect((screen.getByPlaceholderText(/Search venues or Instagram accounts/) as HTMLInputElement).type).toBe('text')
    // Nada del castellano de siempre.
    for (const es of ['Frecuencia y Destinatario', 'Guardar Preferencias de Radar', 'Categorías que te interesan', 'Dirección de correo electrónico']) {
      expect(container.textContent).not.toContain(es)
    }
  })

  it('la nota de beta solo la ve el admin, en inglés', () => {
    const { unmount } = montar('en')
    expect(screen.queryByText(/During the beta/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send test email' })).toBeNull()
    unmount()
    montar('en', { isAdmin: true })
    expect(screen.getByText(/During the beta/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send test email' })).toBeTruthy()
  })

  it('categorías: el nombre se traduce por slug; una sin traducción queda en castellano con lang="es"', () => {
    montar('en')
    const teatro = screen.getByText('Theater')
    expect(teatro.hasAttribute('lang')).toBe(false)
    const nueva = screen.getByText('Categoría Nueva')
    expect(nueva.getAttribute('lang')).toBe('es')
  })

  it('al buscar: nombre y dirección del lugar con lang="es"; texto de respaldo y subtítulo de cuenta en inglés sin lang', () => {
    montar('en')
    buscar('de prueba')
    const nombre = screen.getByText('Peña de Prueba')
    expect(nombre.getAttribute('lang')).toBe('es')
    expect(screen.getByText('Calle de Prueba 123').getAttribute('lang')).toBe('es')
    // Un lugar sin dirección: el «Venue» de respaldo es de la interfaz, no dato.
    const respaldo = screen.getAllByText('Venue').find((el) => el.tagName === 'SPAN' && el.className.includes('truncate'))!
    expect(respaldo.hasAttribute('lang')).toBe(false)
    expect(screen.getByText('Productora de Prueba').getAttribute('lang')).toBe('es')
    const subtituloCuenta = screen.getByText('@productora_de_prueba (organizer / nightclub)')
    expect(subtituloCuenta.hasAttribute('lang')).toBe(false)
    expect(screen.getByText('Instagram')).toBeTruthy()
  })

  it('sin coincidencias: mensaje en inglés', () => {
    montar('en')
    buscar('zzzz sin resultados')
    expect(screen.getByText('No matches found.')).toBeTruthy()
  })

  it('un lugar ya seguido: nombre con lang="es" y botón «Unfollow …» en inglés', () => {
    montar('en', {
      initialSettings: {
        email_frequency: 'weekly',
        email_target: 'prueba@example.com',
        categoryIds: [],
        venueIds: ['lugar-1'],
        instagramAccountIds: [],
      } as never,
    })
    const nombre = screen.getByText('Peña de Prueba')
    expect(nombre.getAttribute('lang')).toBe('es')
    expect(screen.getByTitle('Unfollow Peña de Prueba')).toBeTruthy()
    expect(screen.queryByText(/You are not following any venue/)).toBeNull()
  })
})

describe('RadarForm por omisión es el de siempre', () => {
  it('sin idioma: textos de castellano y ningún lang', () => {
    const { container } = montar(undefined)
    expect(screen.getByText('Frecuencia y Destinatario')).toBeTruthy()
    expect(screen.getByText('¿Cada cuánto querés recibir novedades?')).toBeTruthy()
    expect(screen.getByText('Dirección de correo electrónico')).toBeTruthy()
    expect(screen.getByText('Categorías que te interesan')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar Preferencias de Radar' })).toBeTruthy()
    expect(screen.getByText('Teatro')).toBeTruthy()
    expect(container.querySelectorAll('[lang]')).toHaveLength(0)
  })

  it('sin idioma y con búsqueda: dirección y «Lugar» de siempre, sin lang', () => {
    const { container } = montar(undefined)
    buscar('de prueba')
    expect(screen.getByText('Calle de Prueba 123')).toBeTruthy()
    expect(screen.getByText('@productora_de_prueba (Organizador / Boliche)')).toBeTruthy()
    expect(screen.getAllByText('Lugar').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[lang]')).toHaveLength(0)
  })

  it('idioma="es" explícito es lo mismo que por omisión', () => {
    const { container } = montar('es')
    expect(screen.getByText('Frecuencia y Destinatario')).toBeTruthy()
    expect(container.querySelectorAll('[lang]')).toHaveLength(0)
  })
})
