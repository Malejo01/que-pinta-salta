// @vitest-environment jsdom
//
// B4: los errores de los formularios de ingreso, alta y recuperar quedan
// asociados a sus campos (lib/accesibilidad/formularios.ts):
//
// - el mensaje lleva `id` y `role="alert"`;
// - los campos relacionados llevan `aria-describedby` con ese id mientras el
//   error está a la vista;
// - `aria-invalid` solo cuando el error es sobre lo escrito (email o
//   contraseña incorrectos; contraseñas que no coinciden), no cuando falla
//   Google, la red o el límite de envíos.
//
// Se monta cada página (y el formulario de contraseña de /perfil y
// /auth/restablecer) con Supabase falso y se envía el formulario.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import LoginPage from '@/app/auth/login/page'
import SignUpPage from '@/app/auth/sign-up/page'
import RecuperarPage from '@/app/auth/recuperar/page'
import { ChangePasswordForm } from '@/components/change-password-form'

const { supabase, google } = vi.hoisted(() => ({
  supabase: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  google: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: supabase }),
  signInWithGoogle: () => google(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch: _prefetch,
    children,
    ...resto
  }: { href: string; prefetch?: boolean; children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...resto }, children),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, priority: _p, preload: _pl, ...resto }: Record<string, unknown>) =>
    React.createElement('img', { src: String(src), alt: String(alt ?? ''), ...resto }),
}))

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/hooks/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function enviar(boton: HTMLElement) {
  await act(async () => {
    fireEvent.submit(boton.closest('form')!)
  })
}

async function tocar(boton: HTMLElement) {
  await act(async () => {
    fireEvent.click(boton)
  })
}

function campo(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`falta #${id}`)
  return el
}

describe('ingreso (/auth/login)', () => {
  it('sin error, los campos no llevan aria-invalid ni aria-describedby', () => {
    render(React.createElement(LoginPage))
    for (const id of ['email', 'password']) {
      expect(campo(id).hasAttribute('aria-invalid')).toBe(false)
      expect(campo(id).hasAttribute('aria-describedby')).toBe(false)
    }
  })

  it('email o contraseña incorrectos: alerta con id, y los dos campos inválidos y descritos por ella', async () => {
    supabase.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } })
    render(React.createElement(LoginPage))
    fireEvent.change(campo('email'), { target: { value: 'a@b.com' } })
    fireEvent.change(campo('password'), { target: { value: 'x' } })
    await enviar(screen.getByRole('button', { name: 'Iniciar sesión' }))

    const alerta = screen.getByRole('alert')
    expect(alerta.id).toBe('error-ingreso')
    expect(alerta.textContent).toMatch(/no son correctos/)
    for (const id of ['email', 'password']) {
      expect(campo(id).getAttribute('aria-invalid')).toBe('true')
      expect(campo(id).getAttribute('aria-describedby')).toBe('error-ingreso')
    }
  })

  it('error de Google: se anuncia y se asocia, pero no marca los campos como inválidos', async () => {
    google.mockRejectedValue(new Error('red'))
    render(React.createElement(LoginPage))
    await tocar(screen.getByRole('button', { name: 'Google' }))

    expect(screen.getByRole('alert').id).toBe('error-ingreso')
    for (const id of ['email', 'password']) {
      expect(campo(id).hasAttribute('aria-invalid')).toBe(false)
      expect(campo(id).getAttribute('aria-describedby')).toBe('error-ingreso')
    }
  })

  it('cada campo tiene su <label for>', () => {
    const { container } = render(React.createElement(LoginPage))
    for (const id of ['email', 'password']) {
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull()
    }
  })
})

describe('alta (/auth/sign-up)', () => {
  it('contraseñas que no coinciden: las dos inválidas; el email solo descrito', async () => {
    render(React.createElement(SignUpPage))
    fireEvent.change(campo('email'), { target: { value: 'a@b.com' } })
    fireEvent.change(campo('password'), { target: { value: 'secreto123' } })
    fireEvent.change(campo('repeat-password'), { target: { value: 'otra-cosa' } })
    await enviar(screen.getByRole('button', { name: 'Crear cuenta' }))

    const alerta = screen.getByRole('alert')
    expect(alerta.id).toBe('error-alta')
    expect(alerta.textContent).toBe('Las contraseñas no coinciden.')
    for (const id of ['password', 'repeat-password']) {
      expect(campo(id).getAttribute('aria-invalid')).toBe('true')
      expect(campo(id).getAttribute('aria-describedby')).toBe('error-alta')
    }
    expect(campo('email').hasAttribute('aria-invalid')).toBe(false)
    expect(campo('email').getAttribute('aria-describedby')).toBe('error-alta')
    expect(supabase.signUp).not.toHaveBeenCalled()
  })

  it('error de Supabase (límite de envíos): se anuncia, sin marcar campos inválidos', async () => {
    supabase.signUp.mockResolvedValue({ data: {}, error: { code: 'over_email_send_rate_limit', status: 429 } })
    render(React.createElement(SignUpPage))
    fireEvent.change(campo('email'), { target: { value: 'a@b.com' } })
    fireEvent.change(campo('password'), { target: { value: 'secreto123' } })
    fireEvent.change(campo('repeat-password'), { target: { value: 'secreto123' } })
    await enviar(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(screen.getByRole('alert').id).toBe('error-alta')
    for (const id of ['email', 'password', 'repeat-password']) {
      expect(campo(id).hasAttribute('aria-invalid')).toBe(false)
    }
  })

  it('la pantalla tiene <main> y cada campo su <label for>', () => {
    const { container } = render(React.createElement(SignUpPage))
    expect(container.querySelectorAll('main')).toHaveLength(1)
    for (const id of ['fullName', 'email', 'password', 'repeat-password']) {
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull()
    }
  })
})

describe('recuperar (/auth/recuperar)', () => {
  it('límite de envíos: alerta asociada al email, sin marcarlo inválido', async () => {
    supabase.resetPasswordForEmail.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429 } })
    render(React.createElement(RecuperarPage))
    fireEvent.change(campo('email'), { target: { value: 'a@b.com' } })
    await enviar(screen.getByRole('button', { name: 'Mandar link' }))

    expect(screen.getByRole('alert').id).toBe('error-recuperar')
    expect(campo('email').getAttribute('aria-describedby')).toBe('error-recuperar')
    expect(campo('email').hasAttribute('aria-invalid')).toBe(false)
  })

  it('tiene <main> y un <h1> con el título', () => {
    const { container } = render(React.createElement(RecuperarPage))
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Recuperar contraseña')
  })
})

describe('cambiar contraseña (ChangePasswordForm, /perfil y /auth/restablecer)', () => {
  it('contraseñas que no coinciden: alerta con id y las dos inválidas y descritas por ella', async () => {
    render(React.createElement(ChangePasswordForm, { modo: 'email' }))
    fireEvent.change(campo('new-password'), { target: { value: 'secreto123' } })
    fireEvent.change(campo('confirm-password'), { target: { value: 'otra-cosa' } })
    await enviar(campo('new-password'))

    const alerta = screen.getByRole('alert')
    expect(alerta.id).toBe('error-contrasena')
    for (const id of ['new-password', 'confirm-password']) {
      expect(campo(id).getAttribute('aria-invalid')).toBe('true')
      expect(campo(id).getAttribute('aria-describedby')).toBe('error-contrasena')
    }
  })
})
