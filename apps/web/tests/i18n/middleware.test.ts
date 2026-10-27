/**
 * El idioma del pedido (Q3): el middleware pone `x-qps-idioma` según la ruta
 * y lo pisa SIEMPRE, aunque el cliente lo mande falseado; `updateSession`
 * (lib/supabase/proxy.ts, real) lo reenvía a las páginas; y el layout lo lee
 * con `idiomaDelPedido`. Sin red: el cliente de Supabase es un doble.
 */
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))
// El chequeo de 410/308 no consulta nada fuera de /flyer/<uuid> y /evento/<uuid>.
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

const { encabezados } = vi.hoisted(() => ({ encabezados: { valor: null as string | null } }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(encabezados.valor === null ? {} : { 'x-qps-idioma': encabezados.valor }),
}))

import { middleware } from '@/middleware'
import { ENCABEZADO_IDIOMA } from '@/lib/i18n/idiomas'
import { idiomaDelPedido } from '@/lib/i18n/servidor'

const pedido = (ruta: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://www.quepintasalta.com.ar${ruta}`, { headers })

/** Lo que Next le va a pasar a la página: los headers del pedido reescritos por el middleware. */
function idiomaReenviado(res: Response): string | null {
  const reescritos = (res.headers.get('x-middleware-override-headers') ?? '').split(',')
  expect(reescritos).toContain(ENCABEZADO_IDIOMA)
  return res.headers.get(`x-middleware-request-${ENCABEZADO_IDIOMA}`)
}

describe('middleware: x-qps-idioma', () => {
  it.each([
    ['/', 'es'],
    ['/cines', 'es'],
    ['/entradas', 'es'],
    ['/en', 'en'],
    ['/en/cines', 'en'],
  ])('%s → %s', async (ruta, idioma) => {
    const res = await middleware(pedido(ruta))
    expect(res.status).toBe(200)
    expect(idiomaReenviado(res)).toBe(idioma)
  })

  it('pisa el valor que manda el cliente (en castellano aunque diga "en")', async () => {
    const res = await middleware(pedido('/cines', { [ENCABEZADO_IDIOMA]: 'en' }))
    expect(idiomaReenviado(res)).toBe('es')
  })

  it('pisa el valor que manda el cliente (en inglés aunque diga "es" o basura)', async () => {
    expect(idiomaReenviado(await middleware(pedido('/en', { [ENCABEZADO_IDIOMA]: 'es' })))).toBe('en')
    expect(idiomaReenviado(await middleware(pedido('/en/cines', { [ENCABEZADO_IDIOMA]: '<script>' })))).toBe('en')
  })

  it('las rutas protegidas siguen redirigiendo al login sin sesión', async () => {
    const res = await middleware(pedido('/perfil'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth/login')
  })
})

describe('idiomaDelPedido (layout raíz)', () => {
  it('lee el header que puso el middleware', async () => {
    encabezados.valor = 'en'
    expect(await idiomaDelPedido()).toBe('en')
    encabezados.valor = 'es'
    expect(await idiomaDelPedido()).toBe('es')
  })

  it('sin header, o con un valor que no es un idioma, cae en castellano', async () => {
    encabezados.valor = null
    expect(await idiomaDelPedido()).toBe('es')
    encabezados.valor = 'fr'
    expect(await idiomaDelPedido()).toBe('es')
  })
})
