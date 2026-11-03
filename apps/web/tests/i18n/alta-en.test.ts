// Q6-2: /en/auth/sign-up. La página es la misma que /auth/sign-up (cliente; el
// idioma sale de la URL, como en /en/auth/login), con sus textos en el
// diccionario `paginaAlta` (más lo que comparte con `paginaIngreso` y `auth`).
// Se renderiza con `react-dom/server` en los dos idiomas (mismo patrón que
// tests/rendimiento/b3-login.test.ts) y se prueba `signInWithGoogle` desde /en.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MENSAJE_ALTA_CON_SESION, MENSAJE_ALTA_GENERICO, mensajeErrorAlta } from '@qps/core/auth/mensajes'
import { validarContrasenaNueva } from '@qps/core/auth/cuenta'

const estado = vi.hoisted(() => ({ pathname: '/auth/sign-up' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => estado.pathname,
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: () => {} }) }))

import SignUpPage from '@/app/auth/sign-up/page'
import { en } from '@/lib/i18n/diccionarios/en'
import { es } from '@/lib/i18n/diccionarios/es'
import { RUTAS_EN_INGLES } from '@/lib/i18n/rutas'

const ROOT = process.cwd()
const pagina = readFileSync(join(ROOT, 'app', 'auth', 'sign-up', 'page.tsx'), 'utf8')
const paginaEn = readFileSync(join(ROOT, 'app', 'en', 'auth', 'sign-up', 'page.tsx'), 'utf8')

function render(pathname: string): string {
  estado.pathname = pathname
  return renderToStaticMarkup(React.createElement(SignUpPage))
}

describe('/en/auth/sign-up: la página', () => {
  it('renderiza la misma página, sin indexar, con canonical y alternos', () => {
    expect(paginaEn).toContain('import SignUpPage from "@/app/auth/sign-up/page"')
    expect(paginaEn).toContain('robots: { index: false, follow: true }')
    expect(paginaEn).toContain('canonical: "/en/auth/sign-up"')
    expect(paginaEn).toContain('idiomasAlternos("/auth/sign-up")')
    expect(RUTAS_EN_INGLES).toContain('/auth/sign-up')
  })

  it('los textos salen del diccionario (no quedan literales en castellano)', () => {
    for (const texto of ['Crear Cuenta', 'Registrate para publicar', 'Nombre completo', 'Repetir Contraseña', '¿Ya tenés cuenta?', 'O continuar con', 'Volver a inicio']) {
      expect(pagina, texto).not.toContain(texto)
    }
    expect(pagina).toContain('{t.titulo}')
    expect(pagina).toContain('{t.yaTenesCuenta}')
  })

  it('las dos versiones tienen las mismas claves y el inglés está traducido', () => {
    expect(Object.keys(en.paginaAlta)).toEqual(Object.keys(es.paginaAlta))
    expect(en.paginaAlta.titulo).toBe('Create an account')
    expect(es.paginaAlta.titulo).toBe('Crear Cuenta')
  })
})

describe('/en/auth/sign-up: el HTML', () => {
  it('en inglés: textos en inglés, links en inglés y legales avisados en castellano', () => {
    const html = render('/en/auth/sign-up')
    expect(html).toContain('Create an account')
    expect(html).toContain('Sign up to add events and save favorites')
    expect(html).toContain('<label data-slot="label" class')
    expect(html).toMatch(/<label[^>]*for="repeat-password"[^>]*>Repeat password \*<\/label>/)
    expect(html).toMatch(/<label[^>]*for="fullName"[^>]*>Full name<\/label>/)
    expect(html).toContain('placeholder="you@email.com"')
    expect(html).toContain('href="/en/auth/login"')
    expect(html).toContain('href="/en"')
    expect(html).toMatch(/<a hrefLang="es-AR"[^>]*href="\/terminos"/)
    expect(html).toMatch(/<a hrefLang="es-AR"[^>]*href="\/privacidad"/)
    expect(html).toContain(' (in Spanish).')
    expect(html).not.toContain('Crear Cuenta')
    expect(html).not.toContain('Contraseña')
  })

  it('en castellano: como siempre (mismos textos y links, sin hrefLang)', () => {
    const html = render('/auth/sign-up')
    expect(html).toContain('Crear Cuenta')
    expect(html).toContain('Registrate para publicar eventos y guardar favoritos')
    expect(html).toMatch(/<label[^>]*for="repeat-password"[^>]*>Repetir Contraseña \*<\/label>/)
    expect(html).toContain('placeholder="Juan Perez"')
    expect(html).toContain('href="/auth/login"')
    expect(html).toContain('Al crear tu cuenta aceptás los')
    expect(html).not.toContain('hrefLang')
  })
})

describe('/en/auth/sign-up: mensajes y destino', () => {
  it('los mensajes de core del alta tienen traducción (y en castellano quedan igual)', () => {
    const corta = validarContrasenaNueva('', '')
    const distinta = validarContrasenaNueva('aaaaaa', 'bbbbbb')
    expect(corta.ok || distinta.ok).toBe(false)
    const mensajes = [
      MENSAJE_ALTA_GENERICO,
      MENSAJE_ALTA_CON_SESION,
      mensajeErrorAlta({ code: 'weak_password' }),
      mensajeErrorAlta({ status: 429 }),
      corta.ok ? '' : corta.mensaje,
      distinta.ok ? '' : distinta.mensaje,
    ]
    for (const m of mensajes) {
      expect(es.auth.mensaje(m)).toBe(m)
      expect(en.auth.mensaje(m), m).not.toBe(m)
    }
    expect(en.auth.mensaje(distinta.ok ? '' : distinta.mensaje)).toBe('The passwords do not match.')
  })

  it('cada mensaje que llega a setError pasa por `mensaje(...)`', () => {
    expect(pagina).toContain('setError(mensaje(validacion.mensaje))')
    expect(pagina).toContain('setError(mensaje(resultado.mensaje))')
    expect(pagina).toContain('setError(mensaje(mensajeErrorAlta(error)))')
    expect(pagina).toContain('setError(t.errorGoogle)')
  })

  it('el ingreso enlaza al alta en el mismo idioma (antes, en inglés, al alta en castellano)', () => {
    const login = readFileSync(join(ROOT, 'app', 'auth', 'login', 'page.tsx'), 'utf8')
    expect(login).toContain("href={rutaEn(idioma, '/auth/sign-up')}")
    expect(login).not.toContain('href="/auth/sign-up"')
  })

  it('después del alta con sesión vuelve a la portada en el mismo idioma', () => {
    expect(pagina).toContain("router.push(rutaEn(idioma, '/'))")
  })
})

describe('signInWithGoogle desde /en (lib/supabase/client.ts)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('@supabase/ssr')
    vi.resetModules()
  })

  async function redirectDesde(pathname: string, search: string): Promise<string> {
    vi.resetModules()
    vi.doMock('@supabase/ssr', () => ({
      createBrowserClient: () => ({
        auth: { signInWithOAuth: async (o: { options: { redirectTo: string } }) => o },
      }),
    }))
    vi.stubGlobal('window', { location: { pathname, search, origin: 'https://qps.test' } })
    const { signInWithGoogle } = await import('@/lib/supabase/client')
    const r = (await signInWithGoogle()) as unknown as { options: { redirectTo: string } }
    return new URL(r.options.redirectTo).searchParams.get('next') ?? ''
  }

  it('desde /en/auth/sign-up y /en/auth/login vuelve al destino (en inglés si existe), no a la página de ingreso', async () => {
    expect(await redirectDesde('/en/auth/sign-up', '')).toBe('/en')
    expect(await redirectDesde('/en/auth/login', '?next=/nuevo-evento')).toBe('/en/nuevo-evento')
    expect(await redirectDesde('/en/auth/login', '?next=/en/perfil')).toBe('/en/perfil')
  })

  it('en castellano, igual que antes', async () => {
    expect(await redirectDesde('/auth/sign-up', '')).toBe('/')
    expect(await redirectDesde('/auth/login', '?next=/perfil')).toBe('/perfil')
    expect(await redirectDesde('/en/mapa', '?x=1')).toBe('/en/mapa?x=1')
  })
})
