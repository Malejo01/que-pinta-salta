// /admin/destacados (R50, QPS-239/-240, tarea 50-b): la protección de la
// página (sin usuario -> /auth/login, sin rol ADMIN -> /?error=unauthorized,
// copiada de app/admin/page.tsx) y que su lista no se arme con select('*').
// Sin red ni base: se mockea next/navigation (redirect) y
// @/lib/supabase/server (createClient), mismo patrón que
// tests/admin/borradores-fusionados.test.ts (AdminRevisionPage() se llama
// directo, como función async de servidor, sin montarla con React
// Testing Library: no hace falta renderizar el DOM para esta aserción).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect: ' + url)
  },
}))

type Resultado = { data: unknown; error: { code?: string; message: string } | null }

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
  eventsSelectCalls: [] as string[],
  eventsSelectResult: { data: [], error: null } as Resultado,
  perfilesResult: { data: [], error: null } as Resultado,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: (columnas: string) => {
            if (columnas === 'role') {
              return {
                eq: () => ({
                  single: async () => ({ data: state.role ? { role: state.role } : null }),
                }),
              }
            }
            return { in: async () => state.perfilesResult }
          },
        }
      }

      if (table === 'events') {
        return {
          select: (columnas: string) => {
            state.eventsSelectCalls.push(columnas)
            const builder = {
              not: () => builder,
              gte: () => builder,
              order: () => builder,
              limit: () => builder,
              then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve(state.eventsSelectResult).then(resolve, reject),
            }
            return builder
          },
        }
      }

      throw new Error('tabla inesperada en el doble de /admin/destacados: ' + table)
    },
  }),
}))

import AdminDestacadosPage from '@/app/admin/destacados/page'

beforeEach(() => {
  state.user = { id: 'admin-de-prueba' }
  state.role = 'ADMIN'
  state.eventsSelectCalls = []
  state.eventsSelectResult = { data: [], error: null }
  state.perfilesResult = { data: [], error: null }
})

describe('/admin/destacados: protección (el middleware no cubre /admin)', () => {
  it('sin usuario: redirige a /auth/login?redirect=/admin/destacados', async () => {
    state.user = null
    await expect(AdminDestacadosPage()).rejects.toThrow('redirect: /auth/login?redirect=/admin/destacados')
  })

  it('autenticado sin rol ADMIN: redirige a /?error=unauthorized', async () => {
    state.role = 'USER'
    await expect(AdminDestacadosPage()).rejects.toThrow('redirect: /?error=unauthorized')
  })
})

describe('/admin/destacados: la lista no se arma con select("*")', () => {
  it('el select de events pide columnas explícitas', async () => {
    await AdminDestacadosPage()
    expect(state.eventsSelectCalls).toHaveLength(1)
    const [columnas] = state.eventsSelectCalls
    expect(columnas).not.toBe('*')
    expect(columnas).not.toContain('*')
  })
})

describe('el menú de /admin tiene la entrada de Destacados', () => {
  it('navItems de app/admin/layout.tsx incluye href "/admin/destacados" y label "Destacados"', () => {
    const ruta = fileURLToPath(new URL('../../app/admin/layout.tsx', import.meta.url))
    const fuente = readFileSync(ruta, 'utf8')
    expect(fuente).toMatch(/href:\s*["']\/admin\/destacados["']/)
    expect(fuente).toMatch(/label:\s*["']Destacados["']/)
  })

  it('adminSections de app/admin/page.tsx incluye href "/admin/destacados" y title "Destacados"', () => {
    const ruta = fileURLToPath(new URL('../../app/admin/page.tsx', import.meta.url))
    const fuente = readFileSync(ruta, 'utf8')
    expect(fuente).toMatch(/href:\s*["']\/admin\/destacados["']/)
    expect(fuente).toMatch(/title:\s*["']Destacados["']/)
  })
})
