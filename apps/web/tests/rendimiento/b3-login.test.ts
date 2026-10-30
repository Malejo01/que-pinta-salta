/**
 * B3 (rendimiento): `/auth/login` ya no usa `useSearchParams` ni
 * `<Suspense>`: el HTML que se prerenderiza trae la pantalla entera (<main>,
 * <h1>, el formulario), no un fallback vacío. Se renderiza la página con
 * `react-dom/server`, como la prerenderiza Next, con `useRouter` y el cliente
 * de Supabase de mentira (solo se usan en los handlers, que acá no corren).
 * Que la ruta quede estática (○) solo lo prueba `next build`.
 */
import { readFileSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
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

import LoginPage from '@/app/auth/login/page'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
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
  })
})
