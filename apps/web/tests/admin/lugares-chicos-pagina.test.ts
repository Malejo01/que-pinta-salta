// R-1 · /admin/lugares-chicos (Q5-1 / Q5-3) renderizado con Supabase de
// mentira: quién entra, en qué pestaña cae cada ficha (publicada con la
// verificación vencida → «Para volver a verificar»), el aviso de pedidos
// nuevos, la búsqueda de venues existentes para el alta (con el ILIKE
// escapado) y la edición. Antes había solo detectores de contraste/a11y y
// `pestañaDeLugar` no tenía ningún test.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Consulta = { tabla: string; filtros: [string, ...unknown[]][] }

const estado = vi.hoisted(() => ({
  user: { id: 'admin-1' } as { id: string } | null,
  rol: 'ADMIN',
  lugares: [] as Record<string, unknown>[],
  pedidos: [] as Record<string, unknown>[],
  venues: [] as Record<string, unknown>[],
  consultas: [] as Consulta[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('el panel lee con la sesión')
  }),
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.user } }) },
    from(tabla: string) {
      const c: Consulta = { tabla, filtros: [] }
      estado.consultas.push(c)
      const filas = () => {
        if (tabla === 'lugares_permanentes') return c.filtros.some(([m, d]) => m === 'range' && d !== 0) ? [] : estado.lugares
        if (tabla === 'lugares_chicos_pedidos') {
          const soloNuevos = c.filtros.some(([m, col, v]) => m === 'eq' && col === 'estado' && v === 'nuevo')
          return soloNuevos ? estado.pedidos.filter((p) => p.estado === 'nuevo') : estado.pedidos
        }
        if (tabla === 'venues') return estado.venues
        return []
      }
      const b: Record<string, unknown> = {
        select: () => b,
        returns: () => b,
        single: async () => ({ data: tabla === 'profiles' ? { role: estado.rol } : null, error: null }),
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: filas(), error: null }).then(res, rej),
      }
      for (const m of ['eq', 'is', 'ilike', 'order', 'limit', 'range']) b[m] = (...a: unknown[]) => (c.filtros.push([m, ...a]), b)
      return b
    },
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect: ' + url)
  },
  useRouter: () => ({ refresh() {}, push() {} }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import AdminLugaresChicosPage from '@/app/admin/lugares-chicos/page'
import { pestañaDeLugar } from '@/lib/lugares-chicos/pestanas'

const AHORA = new Date('2026-11-03T18:00:00Z')
const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`
const lugar = (n: number, nombre: string, extra: Record<string, unknown>) => ({
  id: id(n),
  venue_id: `v${n}`,
  tipo: 'pelotero',
  estado: 'borrador',
  descripcion_corta: null,
  edad_min: null,
  edad_max: null,
  horarios: { version: 1, semana: {} },
  acceso: 'pago',
  nota_precio: null,
  techado: null,
  tiene_rampa: null,
  tiene_bano_adaptado: null,
  tiene_cambiador: null,
  contacto_telefono: null,
  contacto_web: null,
  contacto_instagram: null,
  fuente: 'visita',
  fuente_detalle: null,
  osm_ref: null,
  verificado_at: null,
  motivo_archivo: null,
  venue: { name: nombre, address: 'Calle 1', latitude: -24.79, longitude: -65.41 },
  ...extra,
})

async function render(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await AdminLugaresChicosPage({ searchParams: Promise.resolve(params) }))
}
const pestaña = (html: string, etiqueta: string) => html.match(new RegExp(`>${etiqueta} \\((\\d+)\\)<`))?.[1]
const nombresDeLaLista = (html: string) => [...html.matchAll(/<span class="font-semibold">([^<]+)<\/span>/g)].map((m) => m[1])

beforeEach(() => {
  estado.user = { id: 'admin-1' }
  estado.rol = 'ADMIN'
  estado.lugares = [
    lugar(1, 'Pelotero Borrador', {}),
    lugar(2, 'Pelotero Al Día', { estado: 'publicado', verificado_at: '2026-10-20T12:00:00Z' }),
    // Publicado, pero verificado hace más de 90 días: va a «Para volver a verificar» (sigue visible en público).
    lugar(3, 'Pelotero Viejo', { estado: 'publicado', verificado_at: '2026-06-01T12:00:00Z' }),
    lugar(4, 'Salón Vencido', { estado: 'vencido', tipo: 'salon_juegos' }),
    lugar(5, 'Plaza Archivada', { estado: 'archivado', tipo: 'plaza_juegos', motivo_archivo: 'Cerró' }),
  ]
  estado.pedidos = [
    { id: id(8), nombre: 'Plaza Nueva', direccion: 'Caseros 1', tipo: null, comentario: null, link: null, contacto: 'persona@example.com', idioma: 'es', estado: 'nuevo', created_at: '2026-11-02T12:00:00Z' },
    { id: id(9), nombre: 'Pedido Viejo', direccion: 'Mitre 2', tipo: null, comentario: null, link: null, contacto: null, idioma: 'en', estado: 'descartado', created_at: '2026-10-02T12:00:00Z' },
  ]
  estado.venues = []
  estado.consultas = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('pestañaDeLugar', () => {
  it.each([
    ['borrador', 'sin_verificar', 'borradores'],
    ['borrador', 'al_dia', 'borradores'],
    ['publicado', 'al_dia', 'publicados'],
    ['publicado', 'para_revisar', 'vencidos'],
    ['publicado', 'puede_haber_cambiado', 'vencidos'],
    ['publicado', 'sin_verificar', 'vencidos'],
    ['vencido', 'al_dia', 'vencidos'],
    ['archivado', 'al_dia', 'archivados'],
    ['algo-raro', 'al_dia', 'borradores'],
  ] as const)('%s + %s → %s', (estadoFicha, revision, esperado) => {
    expect(pestañaDeLugar(estadoFicha, revision)).toBe(esperado)
  })
})

describe('/admin/lugares-chicos', () => {
  it('sin sesión al ingreso; sin rol ADMIN afuera; y no se lee ninguna ficha', async () => {
    estado.user = null
    await expect(render()).rejects.toThrow('redirect: /auth/login?redirect=/admin/lugares-chicos')
    estado.user = { id: 'u1' }
    estado.rol = 'USER'
    await expect(render()).rejects.toThrow('redirect: /?error=unauthorized')
    expect(estado.consultas.map((c) => c.tabla)).toEqual(['profiles'])
  })

  it('las pestañas cuentan bien: la publicada con la verificación vencida va a «Para volver a verificar»', async () => {
    const html = await render()
    expect(pestaña(html, 'Borradores')).toBe('1')
    expect(pestaña(html, 'Publicados')).toBe('1')
    expect(pestaña(html, 'Para volver a verificar')).toBe('2')
    expect(pestaña(html, 'Archivados')).toBe('1')
    expect(html).toContain('2 lugares para volver a verificar')
    // Por defecto, «Borradores».
    expect(html).toMatch(/aria-current="page"[^>]*>Borradores \(1\)</)
  })

  it('?ver=vencidos lista las dos, en orden alfabético, con su estado de revisión', async () => {
    const html = await render({ ver: 'vencidos' })
    expect(nombresDeLaLista(html)).toEqual(['Pelotero Viejo', 'Salón Vencido'])
    expect(html).toContain('Verificado el 01/06/2026')
    expect(html).toContain('Verificado el 01/06/2026 · Para volver a verificar')
    expect(html).toContain(`href="/admin/lugares-chicos?ver=vencidos&amp;editar=${id(3)}"`)
  })

  it('una pestaña inventada vuelve a «Borradores»', async () => {
    expect(nombresDeLaLista(await render({ ver: 'todo' }))).toEqual(['Pelotero Borrador'])
  })

  it('pedidos: por defecto solo los nuevos, con el aviso arriba; ?pedidos=todos trae también los revisados', async () => {
    const html = await render()
    expect(html).toContain('1 pedido nuevo del formulario público')
    expect(html).toContain('Plaza Nueva')
    expect(html).not.toContain('Pedido Viejo')
    const consulta = estado.consultas.find((c) => c.tabla === 'lugares_chicos_pedidos')!
    expect(consulta.filtros).toContainEqual(['eq', 'estado', 'nuevo'])
    const todos = await render({ pedidos: 'todos' })
    expect(todos).toContain('Pedido Viejo')
  })

  it('alta: busca entre los venues canónicos, con el texto escapado para ILIKE, y marca los que ya tienen ficha', async () => {
    estado.venues = [
      { id: 'v1', name: 'Pelotero Borrador', address: 'Calle 1' },
      { id: 'v77', name: 'Pelotero 100% Diversión', address: 'Calle 2' },
    ]
    const html = await render({ nuevo: '1', q: '100%_x' })
    const busqueda = estado.consultas.find((c) => c.tabla === 'venues')!
    expect(busqueda.filtros).toContainEqual(['is', 'canonical_venue_id', null])
    expect(busqueda.filtros).toContainEqual(['eq', 'is_placeholder', false])
    expect(busqueda.filtros).toContainEqual(['ilike', 'name', '%100\\%\\_x%'])
    expect(html).toContain('Ya tiene ficha')
    expect(html).toContain('href="/admin/lugares-chicos?nuevo=1&amp;venue=v77"')
  })

  it('alta con una búsqueda de 1 letra: no consulta venues', async () => {
    await render({ nuevo: '1', q: 'a' })
    expect(estado.consultas.some((c) => c.tabla === 'venues')).toBe(false)
  })

  it('?editar=<id> abre la ficha con sus acciones; un id que no es uuid no abre nada', async () => {
    const html = await render({ editar: id(5), ver: 'archivados' })
    expect(html).toContain('Plaza Archivada · ')
    expect(html).toContain('Cerró')
    const nada = await render({ editar: 'no-es-uuid' })
    expect(nada).not.toContain('Pelotero Borrador · ')
  })
})
