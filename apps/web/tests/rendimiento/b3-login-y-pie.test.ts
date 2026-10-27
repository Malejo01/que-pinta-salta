/**
 * B3 (rendimiento):
 *
 * - `/auth/login` ya no usa `useSearchParams` ni `<Suspense>`: el HTML que se
 *   prerenderiza trae la pantalla entera (<main>, <h1>, el formulario), no un
 *   fallback vacío. Se renderiza la página con `react-dom/server`, como la
 *   prerenderiza Next, con `useRouter` y el cliente de Supabase de mentira
 *   (solo se usan en los handlers, que acá no corren).
 * - El pie (`components/footer.tsx`) es un Server Component; lo interactivo
 *   (sesión para "Agregar Evento", cookies, aporte) vive en
 *   `components/footer-acciones.tsx`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/auth/login',
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    throw new Error('no se debería crear el cliente de Supabase al renderizar')
  },
  signInWithGoogle: async () => ({ error: null }),
}))
vi.mock('@/components/donation-context', () => ({ useDonation: () => ({ openDonationModal: () => {} }) }))

import LoginPage from '@/app/auth/login/page'
import { Footer } from '@/components/footer'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

function sinComentarios(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('/auth/login: el HTML del servidor trae el formulario completo', () => {
  const html = renderToStaticMarkup(React.createElement(LoginPage))

  it('tiene <main> y un único <h1> con "Iniciar sesión"', () => {
    expect(html).toMatch(/<main\b[^>]*class="relative flex min-h-svh/)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain('<h1>Iniciar sesión</h1>')
  })

  it('tiene el <form> con el email, la contraseña y el botón de enviar', () => {
    expect(html).toMatch(/<form\b/)
    expect(html).toMatch(/<input[^>]*type="email"[^>]*id="email"|<input[^>]*id="email"[^>]*type="email"/)
    expect(html).toMatch(/<input[^>]*id="password"/)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Iniciar sesión<\/button>/)
  })

  it('el <h1> conserva el aspecto del título de la tarjeta (sigue dentro de CardTitle con text-2xl)', () => {
    // (`leading-none` lo pisa `text-2xl` en el `cn` de CardTitle, igual que antes.)
    expect(html).toMatch(/<div data-slot="card-title" class="font-semibold text-2xl"><h1>Iniciar sesión<\/h1><\/div>/)
  })

  it('no hay fallback de Suspense ni useSearchParams en la página', () => {
    const src = sinComentarios(readSource('app/auth/login/page.tsx'))
    expect(src).not.toMatch(/useSearchParams/)
    expect(src).not.toMatch(/<Suspense\b/)
    expect(html).not.toContain('BAILOUT_TO_CLIENT_SIDE_RENDERING')
  })
})

describe('components/footer.tsx: Server Component con hojas de cliente', () => {
  it('footer.tsx no es cliente ni usa hooks; footer-acciones.tsx sí es cliente', () => {
    const pie = sinComentarios(readSource('components/footer.tsx'))
    expect(pie).not.toMatch(/["']use client["']/)
    expect(pie).not.toMatch(/\buse(State|Effect|Donation)\b/)
    expect(pie).not.toMatch(/@\/lib\/supabase\/client/)
    expect(readSource('components/footer-acciones.tsx')).toMatch(/^"use client"/)
  })

  it('el marcado sigue teniendo los links y los botones de siempre', () => {
    const html = renderToStaticMarkup(Footer())
    expect(html).toContain('href="/privacidad"')
    expect(html).toContain('href="/terminos"')
    // Sin sesión (en el servidor nunca hay): al ingreso con next, como antes.
    expect(html).toContain('href="/auth/login?next=/nuevo-evento"')
    expect(html).toContain('>Agregar Evento</a>')
    expect(html).toMatch(/<button type="button" class="text-left text-sm text-muted-foreground transition-colors hover:text-foreground">Preferencias de cookies<\/button>/)
    expect(html).toContain('Mauro Lizarraga')
  })
})
