// Q6-2: /en/perfil. El cuerpo es `PaginaPerfil` (app/perfil/pagina-perfil.tsx),
// compartido con /perfil: se renderiza en los dos idiomas con Supabase de
// mentira (sin red ni base), más el formulario de contraseña y «Lo que seguís».
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mensajeErrorContrasena } from '@qps/core/auth/mensajes'
import { textosContrasena, type ModoContrasena } from '@qps/core/auth/cuenta'

const estado = vi.hoisted(() => ({
  user: { id: 'u1', email: 'persona@example.com', identities: [{ provider: 'email' }] } as Record<string, unknown> | null,
  redirecciones: [] as string[],
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    estado.redirecciones.push(url)
    throw new Error('redirect: ' + url)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.user } }) },
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.order = () => b
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({
          data: [
            {
              id: 'e1',
              title: 'Peña de prueba',
              slug: 'pena-de-prueba',
              start_date: '2026-11-20T00:00:00Z',
              image_url: null,
              status: 'PENDING',
              created_at: '2026-11-01T15:00:00Z',
              venue: { name: 'La Casona' },
            },
          ],
          error: null,
        }).then(res, rej)
      return b
    },
  }),
}))
vi.mock('@/lib/actions/radar', () => ({
  obtenerLoQueSeguis: async () => ({
    lugares: [{ id: 'l1', nombre: 'Teatro Provincial', slug: 'teatro-provincial' }],
    cuentas: [{ id: 'c1', username: 'pena_salta' }],
    categorias: [{ id: 'k1', nombre: 'Peñas' }],
  }),
  cambiarSeguimiento: async () => ({ ok: true }),
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: () => {} }) }))

import { PaginaPerfil } from '@/app/perfil/pagina-perfil'
import { LoQueSeguisVista } from '@/app/perfil/lo-que-seguis'
import { ChangePasswordForm } from '@/components/change-password-form'
import { en } from '@/lib/i18n/diccionarios/en'
import { es } from '@/lib/i18n/diccionarios/es'
import { RUTAS_EN_INGLES, rutaEnOtroIdioma } from '@/lib/i18n/rutas'

const ROOT = process.cwd()
const leer = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

async function render(idioma: 'es' | 'en'): Promise<string> {
  return renderToStaticMarkup(await PaginaPerfil({ idioma }))
}

beforeEach(() => {
  estado.user = { id: 'u1', email: 'persona@example.com', identities: [{ provider: 'email' }] }
  estado.redirecciones = []
})

describe('/en/perfil: la página', () => {
  it('app/en/perfil/page.tsx usa PaginaPerfil en inglés, sin indexar', () => {
    const src = leer('app', 'en', 'perfil', 'page.tsx')
    expect(src).toContain('PaginaPerfil({ idioma: "en" })')
    expect(src).toContain('robots: { index: false, follow: true }')
    expect(src).toContain('export const revalidate = 0')
    expect(RUTAS_EN_INGLES).toContain('/perfil')
  })

  it('el selector de idioma lleva de /perfil a /en/perfil y de vuelta', () => {
    expect(rutaEnOtroIdioma('/perfil', 'en')).toBe('/en/perfil')
    expect(rutaEnOtroIdioma('/en/perfil', 'es')).toBe('/perfil')
  })

  it('sin sesión: al ingreso en el mismo idioma, con la vuelta a la misma página', async () => {
    estado.user = null
    await expect(PaginaPerfil({ idioma: 'en' })).rejects.toThrow('redirect: /en/auth/login?next=/en/perfil')
    await expect(PaginaPerfil({ idioma: 'es' })).rejects.toThrow('redirect: /auth/login?next=/perfil')
  })
})

describe('/en/perfil: el HTML', () => {
  it('en inglés: textos, fechas y links en inglés; lo que viene de la base, marcado en castellano', async () => {
    const html = await render('en')
    expect(html).toContain('>My profile</h1>')
    expect(html).toContain('1 event added')
    expect(html).toContain('Events you added')
    expect(html).toContain('Pending review')
    expect(html).toContain('Submitted for review on 11/1/2026')
    // Fecha y hora en inglés (Salta, UTC-3): jueves 19 a las 21:00.
    expect(html).toContain('Thu, Nov 19')
    expect(html).toContain('9:00 PM')
    expect(html).not.toContain(' hs<')
    expect(html).toContain('href="/en/nuevo-evento"')
    expect(html).toMatch(/<h3 lang="es-AR"[^>]*>Peña de prueba<\/h3>/)
    // «Lo que seguís» y la contraseña.
    expect(html).toContain('What you follow')
    expect(html).toContain('href="/en/place/teatro-provincial"')
    expect(html).toContain('aria-label="Unfollow @pena_salta"')
    expect(html).toContain('>Change password<')
    expect(html).toMatch(/<label[^>]*for="new-password"[^>]*>New password<\/label>/)
    // Eliminar la cuenta queda en castellano: el link lo avisa.
    const enlace = html.match(/<a[^>]*href="\/perfil\/eliminar-cuenta"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? ''
    expect(enlace).toContain('hrefLang="es-AR"')
    expect(enlace).toContain('Delete my account')
    expect(enlace).toContain('(in Spanish)')
    // R-2: «Mi perfil» ya en mayúscula de oración.
    for (const texto of ['Mi perfil', 'Pendiente de revisión', 'Lo que seguís', 'Contraseña nueva', 'Dejar de seguir']) {
      expect(html, texto).not.toContain(texto)
    }
  })

  it('en castellano: los mismos textos de siempre', async () => {
    const html = await render('es')
    // R-2: mayúscula de oración («Mi perfil»), «Eventos que cargaste» (como el
    // menú, antes «Mis Eventos Colaborados») y «Enviado a revisión» (antes «Sometido»).
    expect(html).toContain('>Mi perfil</h1>')
    expect(html).toContain('1 evento subido')
    expect(html).toContain('Eventos que cargaste')
    expect(html).not.toContain('Mis Eventos Colaborados')
    expect(html).toContain('Pendiente de revisión')
    expect(html).toContain('Enviado a revisión el ')
    // R-2: la hora en 12 horas («09:00 p. m.») ya no lleva «hs» al final.
    expect(html).toMatch(/<span>\d{2}:\d{2} [ap]\. m\.<\/span>/)
    expect(html).not.toContain(' hs</span>')
    expect(html).toContain('href="/nuevo-evento"')
    expect(html).toContain('href="/lugar/teatro-provincial"')
    expect(html).toContain('Lo que seguís')
    expect(html).toContain('Eliminar mi cuenta')
    expect(html).not.toContain('(en castellano)')
    expect(html).not.toContain('lang="es-AR"')
    expect(html).not.toContain('hrefLang')
  })
})

describe('/en/perfil: formulario de contraseña', () => {
  const modos: ModoContrasena[] = ['google', 'email', 'mixta', 'desconocida', 'restablecer']

  it.each(modos)('modo=%s: en inglés, la traducción; en castellano, textosContrasena (core)', (modo) => {
    expect(es.cambioContrasena.modos[modo]).toEqual(textosContrasena(modo))
    const htmlEn = renderToStaticMarkup(React.createElement(ChangePasswordForm, { modo, idioma: 'en' }))
    expect(htmlEn).toContain(en.cambioContrasena.modos[modo].titulo)
    expect(htmlEn).toContain(en.cambioContrasena.modos[modo].descripcion)
    expect(htmlEn).not.toContain(textosContrasena(modo).descripcion)
    const htmlEs = renderToStaticMarkup(React.createElement(ChangePasswordForm, { modo }))
    expect(htmlEs).toContain(textosContrasena(modo).descripcion)
  })

  it('los errores de core del cambio de contraseña tienen traducción', () => {
    for (const error of [{ code: 'same_password' }, { status: 401 }, {}, { code: 'weak_password' }]) {
      const m = mensajeErrorContrasena(error)
      expect(es.auth.mensaje(m)).toBe(m)
      expect(en.auth.mensaje(m), m).not.toBe(m)
    }
  })

  it('validación y errores pasan por `mensaje(...)`; avisos y textos, por el diccionario', () => {
    const src = leer('components', 'change-password-form.tsx')
    expect(src).toContain('setError(mensaje(validacion.mensaje))')
    expect(src).toContain('setError(mensaje(mensajeErrorContrasena(err)))')
    expect(src).toContain('notify.success(t.avisoGuardada)')
    expect(es.cambioContrasena.avisoGuardada).toBe('Contraseña guardada')
    expect(es.cambioContrasena.guardada).toBe('Contraseña guardada.')
  })
})

describe('/en/perfil: «Lo que seguís»', () => {
  it('vacío, en inglés: el texto y el link al Radar en inglés', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoQueSeguisVista, { lugares: [], cuentas: [], categorias: [], onDejarDeSeguir: () => {}, idioma: 'en' }),
    )
    expect(html).toContain('follow anything yet. Follow a place from an event page')
    expect(html).toContain('href="/en/radar"')
  })

  it('las categorías seguidas (nombre de la base) llevan lang="es-AR" en inglés', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoQueSeguisVista, {
        lugares: [],
        cuentas: [],
        categorias: [{ id: 'k1', nombre: 'Peñas' }],
        onDejarDeSeguir: () => {},
        idioma: 'en',
      }),
    )
    expect(html).toContain('<span lang="es-AR" class="truncate font-medium text-foreground">Peñas</span>')
    expect(html).toContain('aria-label="Unfollow Peñas"')
  })

  it('en castellano, los textos de siempre (ahora en el diccionario)', () => {
    expect(es.loQueSeguis.titulo).toBe('Lo que seguís')
    expect(es.loQueSeguis.dejarDeSeguirAria('Teatro')).toBe('Dejar de seguir Teatro')
    expect(Object.keys(en.loQueSeguis)).toEqual(Object.keys(es.loQueSeguis))
    expect(Object.keys(en.perfil)).toEqual(Object.keys(es.perfil))
  })
})
