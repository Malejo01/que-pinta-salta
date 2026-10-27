// @vitest-environment jsdom
//
// B4 (accesibilidad): la Navbar y la barra inferior montadas en un DOM real.
// Cubre lo que marcó axe en la auditoría B1 (docs/auditoria-web-27-10.md):
//
// - button-name (crítica): el botón del menú de usuario no tenía nombre;
// - link-name: "Mis eventos" y "Radar Salteño" escondían el texto a 375 px
//   (`hidden sm:inline`) y el link quedaba sin nombre;
// - landmark-unique: dos <nav> sin nombre (Navbar y MobileNav);
// - el botón de tema decía "Toggle theme", en inglés;
// - no había link para saltar al contenido: ahora es el PRIMER elemento con
//   foco de la Navbar, va a `#contenido`, y en las páginas sin ese id
//   (mapa, buscar, legales) enfoca el primer <main>.
//
// Los `vi.mock` van en este archivo (se izan al principio de ESTE archivo);
// ver el comentario de `preparar-dom.ts`.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { Navbar } from '@/components/navbar'
import { MobileNav } from '@/components/mobile-nav'

const { usuario } = vi.hoisted(() => ({
  usuario: { actual: null as null | { id: string; email: string } },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}))

// `next/link` real necesita el router de la app: un <a> común alcanza para
// mirar atributos. `prefetch` se descarta para que no llegue al DOM.
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

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn() }),
}))

vi.mock('@/components/donation-context', () => ({
  useDonation: () => ({ openDonationModal: vi.fn() }),
}))

// Supabase falso: `getUser` devuelve el usuario que fije cada test; el perfil
// no es admin.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: usuario.actual } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({}),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'USER' } }) }) }),
    }),
  }),
}))

afterEach(() => {
  cleanup()
  usuario.actual = null
  document.body.innerHTML = ''
})

/** Monta la Navbar y espera a que termine el `getUser` del efecto. */
async function montarNavbar() {
  const resultado = render(React.createElement(Navbar))
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return resultado
}

const SELECTOR_ENFOCABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

describe('Navbar: saltar al contenido', () => {
  it('el link "Saltar al contenido" es el primer elemento con foco y va a #contenido', async () => {
    const { container } = await montarNavbar()
    const primero = container.querySelector(SELECTOR_ENFOCABLE)
    expect(primero?.tagName).toBe('A')
    expect(primero?.textContent).toBe('Saltar al contenido')
    expect(primero?.getAttribute('href')).toBe('#contenido')
  })

  it('está oculto (sr-only) hasta que recibe foco, y entonces se ve con anillo de foco', async () => {
    await montarNavbar()
    const link = screen.getByRole('link', { name: 'Saltar al contenido' })
    const clases = link.getAttribute('class') ?? ''
    expect(clases.split(/\s+/)).toContain('sr-only')
    expect(clases).toContain('focus:not-sr-only')
    expect(clases).toContain('focus:ring-2')
  })

  it('con #contenido en la página, el click sigue el ancla (no se cancela)', async () => {
    await montarNavbar()
    const main = document.createElement('main')
    main.id = 'contenido'
    document.body.appendChild(main)

    const link = screen.getByRole('link', { name: 'Saltar al contenido' })
    const siguio = fireEvent.click(link)
    expect(siguio).toBe(true) // fireEvent devuelve false si hubo preventDefault
  })

  it('al montarse, si el <main> de la página no trae id (mapa, buscar, legales), le pone id="contenido"', async () => {
    const main = document.createElement('main')
    document.body.appendChild(main)
    await montarNavbar()
    expect(main.id).toBe('contenido')
    expect(main.getAttribute('tabindex')).toBe('-1')
  })

  it('si el <main> aparece después del montaje y sin id, el click lo enfoca igual y cancela el ancla', async () => {
    await montarNavbar()
    const main = document.createElement('main')
    document.body.appendChild(main)

    const link = screen.getByRole('link', { name: 'Saltar al contenido' })
    const siguio = fireEvent.click(link)
    expect(siguio).toBe(false)
    expect(main.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(main)
  })
})

describe('Navbar: nombres accesibles', () => {
  it('el <nav> se llama "Principal"', async () => {
    await montarNavbar()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
  })

  it('el botón de tema tiene nombre en castellano', async () => {
    await montarNavbar()
    expect(screen.getByRole('button', { name: 'Cambiar tema' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toggle theme/i })).toBeNull()
  })

  it('con sesión: el menú de usuario tiene nombre y los links de ícono también (a cualquier ancho)', async () => {
    usuario.actual = { id: 'u1', email: 'persona@example.com' }
    await montarNavbar()

    expect(screen.getByRole('button', { name: 'Menú de tu cuenta' })).toBeTruthy()

    // jsdom no aplica CSS: el nombre sale del aria-label, que es lo que
    // queda cuando el texto visible está con `hidden` (display: none) a 375 px.
    const misEventos = screen.getByRole('link', { name: 'Mis eventos' })
    expect(misEventos.getAttribute('href')).toBe('/favoritos')
    expect(misEventos.getAttribute('aria-label')).toBe('Mis eventos')
    const radar = screen.getByRole('link', { name: 'Radar Salteño' })
    expect(radar.getAttribute('href')).toBe('/radar')
    expect(radar.getAttribute('aria-label')).toBe('Radar Salteño')
  })

  it('el aria-label de cada link de ícono es el mismo texto que se ve desde sm:', async () => {
    usuario.actual = { id: 'u1', email: 'persona@example.com' }
    await montarNavbar()
    for (const nombre of ['Mis eventos', 'Radar Salteño']) {
      const link = screen.getByRole('link', { name: nombre })
      expect(link.textContent).toBe(nombre)
    }
  })
})

describe('MobileNav: nombre propio para el <nav>', () => {
  it('se llama "Navegación inferior", distinto de "Principal"', () => {
    render(React.createElement(MobileNav))
    expect(screen.getByRole('navigation', { name: 'Navegación inferior' })).toBeTruthy()
  })
})
