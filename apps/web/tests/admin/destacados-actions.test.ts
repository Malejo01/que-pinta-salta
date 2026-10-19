// Sin red ni base. destacarEvento/quitarDestacado/obtenerDestacados
// (lib/admin/destacados-actions.ts, R50, QPS-239/-240) usan SIEMPRE el
// cliente del usuario (createClient() de '@/lib/supabase/server'), nunca el
// de service role: validarDestacado() de core ANTES de crear el cliente,
// sesión (auth.getUser), rol en `profiles`, y después el update/select sobre
// `events`. Se mockea next/cache (revalidatePath) y el módulo completo de
// lib/supabase/server (createClient + createAdminClient, esta última para
// comprobar que nunca se usa: si se llama, explota). Mismo patrón que
// tests/admin/duplicate-actions.test.ts y tests/admin/lugares.test.ts.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const createClient = vi.fn()
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma variádica es la que permite el spread de más abajo
const createAdminClient = vi.fn((..._args: unknown[]) => {
  throw new Error('destacados-actions.ts no debería usar el cliente admin')
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { destacarEvento, obtenerDestacados, quitarDestacado } from '@/lib/admin/destacados-actions'
import { finDeDiaSalta } from '@qps/core/events/destacados'

type Resultado = { data: unknown; error: { code?: string; message: string } | null }

const ADMIN_USER = { id: '99999999-9999-4999-8999-999999999999' }
const OTRO_ADMIN = { id: '88888888-8888-4888-8888-888888888888' }
const USER_USER = { id: 'usuario-de-prueba' }

const uid = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, '0')}`
const EVENT_ID = uid(1)

// Las fechas de los fixtures se calculan relativas al "ahora" real (las
// acciones usan new Date() de verdad, sin inyección de reloj desde los
// tests): una fecha fija como "2030-10-20" pasaba FECHA_LEJANA (más de
// MAXIMO_DIAS_DESTACADO desde hoy) apenas corriera este archivo en 2026 en
// adelante.
const diaFuturo = (dias: number) => new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const HASTA_VALIDO = diaFuturo(10)

/**
 * Cliente falso: auth.getUser() + profiles.role (sesión y rol, por
 * .select('role').eq().single()), events.update(...).eq('id', ...).select('id')
 * (destacar/quitar) y events.select(...).not().gte().order().limit()
 * (obtenerDestacados), más profiles.select('id, full_name, email').in(...)
 * (los nombres de quien destacó, en la misma función).
 */
function construirCliente(config: {
  user?: { id: string } | null
  role?: string | null
  updateEventsResult?: Resultado
  selectEventsResult?: Resultado
  selectPerfilesResult?: Resultado
}) {
  const updateCalls: Array<{ valores: Record<string, unknown>; filtroId: string }> = []
  const selectEventsCalls: string[] = []
  const inPerfilesCalls: string[][] = []

  const client = {
    auth: { getUser: async () => ({ data: { user: config.user ?? null } }) },
    from(tabla: string) {
      if (tabla === 'profiles') {
        return {
          select: (columnas: string) => {
            // Dos usos distintos de 'profiles': el chequeo de rol
            // (.select('role').eq().single()) y la consulta de nombres para
            // la lista (.select('id, full_name, email').in(...)).
            if (columnas === 'role') {
              return {
                eq: () => ({
                  single: async () => ({
                    data: config.role !== null && config.role !== undefined ? { role: config.role } : null,
                  }),
                }),
              }
            }
            return {
              in: async (_col: string, ids: string[]) => {
                inPerfilesCalls.push(ids)
                return config.selectPerfilesResult ?? { data: [], error: null }
              },
            }
          },
        }
      }

      if (tabla === 'events') {
        return {
          update: (valores: Record<string, unknown>) => ({
            eq: (columna: string, valor: string) => {
              if (columna !== 'id') throw new Error(`el update de events tiene que filtrar por "id", filtró por "${columna}"`)
              updateCalls.push({ valores, filtroId: valor })
              return {
                select: async (cols: string) => {
                  if (cols !== 'id') throw new Error(`select inesperado tras el update de events: "${cols}"`)
                  return config.updateEventsResult ?? { data: [{ id: valor }], error: null }
                },
              }
            },
          }),
          select: (columnas: string) => {
            selectEventsCalls.push(columnas)
            const builder = {
              not: () => builder,
              gte: () => builder,
              order: () => builder,
              limit: () => builder,
              then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve(config.selectEventsResult ?? { data: [], error: null }).then(resolve, reject),
            }
            return builder
          },
        }
      }

      throw new Error('tabla inesperada en el cliente falso: ' + tabla)
    },
  }

  return { client, updateCalls, selectEventsCalls, inPerfilesCalls }
}

function setup(config: Parameters<typeof construirCliente>[0] = {}) {
  const db = construirCliente(config)
  createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  createClient.mockReset()
  createAdminClient.mockClear()
  revalidatePath.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('destacarEvento: entrada inválida (ANTES de crear el cliente)', () => {
  it('eventId que no es uuid: INVALID, createClient no se llama', async () => {
    const res = await destacarEvento({ eventId: 'no-es-uuid', hasta: HASTA_VALIDO })
    expect(res).toEqual({ ok: false, error: 'INVALID', mensaje: 'El evento no es válido.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('fecha pasada: INVALID, createClient no se llama', async () => {
    const res = await destacarEvento({ eventId: EVENT_ID, hasta: '2000-01-01' })
    expect(res).toEqual({
      ok: false,
      error: 'INVALID',
      mensaje: 'La fecha tiene que ser posterior a hoy.',
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('400 días en el futuro (más de MAXIMO_DIAS_DESTACADO): INVALID, createClient no se llama', async () => {
    const dentroDe400Dias = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000)
    const hasta = dentroDe400Dias.toISOString().slice(0, 10)
    const res = await destacarEvento({ eventId: EVENT_ID, hasta })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('INVALID')
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('destacarEvento: sesión y rol', () => {
  it('sin sesión: AUTH_REQUIRED, no se llama a update', async () => {
    const db = setup({ user: null })
    const res = await destacarEvento({ eventId: EVENT_ID, hasta: HASTA_VALIDO })
    expect(res).toEqual({
      ok: false,
      error: 'AUTH_REQUIRED',
      mensaje: 'Necesitás iniciar sesión para hacer esto.',
    })
    expect(db.updateCalls).toHaveLength(0)
  })

  it('autenticado sin rol ADMIN: FORBIDDEN, no se llama a update', async () => {
    const db = setup({ user: USER_USER, role: 'USER' })
    const res = await destacarEvento({ eventId: EVENT_ID, hasta: HASTA_VALIDO })
    expect(res).toEqual({
      ok: false,
      error: 'FORBIDDEN',
      mensaje: 'No tenés permisos de administrador para hacer esto.',
    })
    expect(db.updateCalls).toHaveLength(0)
  })
})

describe('destacarEvento: admin', () => {
  it('el update recibe featured_set_by == user.id de getUser(), aunque la entrada traiga otro, y featured_until == finDeDiaSalta(hasta)', async () => {
    const db = setup({ user: ADMIN_USER, role: 'ADMIN' })

    // featured_set_by falso a propósito: tiene que ser ignorado.
    const res = await destacarEvento({
      eventId: EVENT_ID,
      hasta: HASTA_VALIDO,
      featured_set_by: OTRO_ADMIN.id,
    })

    const featuredUntilEsperado = finDeDiaSalta(HASTA_VALIDO)
    expect(res).toEqual({ ok: true, featuredUntil: featuredUntilEsperado })

    expect(db.updateCalls).toHaveLength(1)
    const [llamada] = db.updateCalls
    expect(llamada.filtroId).toBe(EVENT_ID)
    expect(llamada.valores.featured_set_by).toBe(ADMIN_USER.id)
    expect(llamada.valores.featured_set_by).not.toBe(OTRO_ADMIN.id)
    expect(llamada.valores.featured_until).toBe(featuredUntilEsperado)
    expect(llamada.valores.is_featured).toBe(true)
    expect(typeof llamada.valores.featured_set_at).toBe('string')

    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith(`/evento/${EVENT_ID}`)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/destacados')
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('update que devuelve 0 filas: NOT_FOUND', async () => {
    setup({ user: ADMIN_USER, role: 'ADMIN', updateEventsResult: { data: [], error: null } })
    const res = await destacarEvento({ eventId: EVENT_ID, hasta: HASTA_VALIDO })
    expect(res).toEqual({ ok: false, error: 'NOT_FOUND', mensaje: 'No se encontró el evento.' })
  })

  it('error de la base: DB_ERROR, con un mensaje genérico', async () => {
    setup({
      user: ADMIN_USER,
      role: 'ADMIN',
      updateEventsResult: { data: null, error: { code: 'XX000', message: 'detalle interno de postgres' } },
    })
    const res = await destacarEvento({ eventId: EVENT_ID, hasta: HASTA_VALIDO })
    expect(res).toEqual({
      ok: false,
      error: 'DB_ERROR',
      mensaje: 'No se pudo destacar el evento. Intentá de nuevo.',
    })
    expect(JSON.stringify(res)).not.toContain('detalle interno')
  })
})

describe('el archivo nunca usa el cliente de service role', () => {
  it('no importa createAdminClient, ni getPrivilegedClient, ni nombra SUPABASE_SERVICE_ROLE_KEY', () => {
    const ruta = fileURLToPath(new URL('../../lib/admin/destacados-actions.ts', import.meta.url))
    const fuente = readFileSync(ruta, 'utf8')
    expect(fuente).not.toMatch(/createAdminClient/)
    expect(fuente).not.toMatch(/getPrivilegedClient/)
    expect(fuente).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })
})

describe('quitarDestacado', () => {
  it('eventId inválido: INVALID, createClient no se llama', async () => {
    const res = await quitarDestacado({ eventId: 'no-es-uuid' })
    expect(res).toEqual({ ok: false, error: 'INVALID', mensaje: 'El evento no es válido.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('sin sesión: AUTH_REQUIRED, no se llama a update', async () => {
    const db = setup({ user: null })
    const res = await quitarDestacado({ eventId: EVENT_ID })
    expect(res).toEqual({
      ok: false,
      error: 'AUTH_REQUIRED',
      mensaje: 'Necesitás iniciar sesión para hacer esto.',
    })
    expect(db.updateCalls).toHaveLength(0)
  })

  it('autenticado sin rol ADMIN: FORBIDDEN, no se llama a update', async () => {
    const db = setup({ user: USER_USER, role: 'USER' })
    const res = await quitarDestacado({ eventId: EVENT_ID })
    expect(res).toEqual({
      ok: false,
      error: 'FORBIDDEN',
      mensaje: 'No tenés permisos de administrador para hacer esto.',
    })
    expect(db.updateCalls).toHaveLength(0)
  })

  it('admin: deja featured_until null, is_featured false, y featured_set_by con el admin que lo quitó', async () => {
    const db = setup({ user: ADMIN_USER, role: 'ADMIN' })
    const res = await quitarDestacado({ eventId: EVENT_ID })
    expect(res).toEqual({ ok: true })

    expect(db.updateCalls).toHaveLength(1)
    const [llamada] = db.updateCalls
    expect(llamada.valores).toMatchObject({
      featured_until: null,
      is_featured: false,
      featured_set_by: ADMIN_USER.id,
    })
    expect(typeof llamada.valores.featured_set_at).toBe('string')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/destacados')
  })

  it('update que devuelve 0 filas: NOT_FOUND', async () => {
    setup({ user: ADMIN_USER, role: 'ADMIN', updateEventsResult: { data: [], error: null } })
    const res = await quitarDestacado({ eventId: EVENT_ID })
    expect(res).toEqual({ ok: false, error: 'NOT_FOUND', mensaje: 'No se encontró el evento.' })
  })
})

describe('obtenerDestacados', () => {
  it('sin admin: null, y no llega a consultar events', async () => {
    const db = setup({ user: USER_USER, role: 'USER' })
    const res = await obtenerDestacados()
    expect(res).toBeNull()
    expect(db.selectEventsCalls).toHaveLength(0)
  })

  it('sin sesión: null', async () => {
    setup({ user: null })
    const res = await obtenerDestacados()
    expect(res).toBeNull()
  })

  it('el select de events no es "*" ni pide columnas fuera de la lista esperada', async () => {
    const db = setup({ user: ADMIN_USER, role: 'ADMIN', selectEventsResult: { data: [], error: null } })
    await obtenerDestacados()

    expect(db.selectEventsCalls).toHaveLength(1)
    const [columnas] = db.selectEventsCalls
    expect(columnas).not.toBe('*')
    expect(columnas).not.toContain('*')

    const esperadas = ['id', 'title', 'slug', 'start_date', 'featured_until', 'featured_set_by', 'featured_set_at']
    const pedidas = columnas.split(',').map((c) => c.trim())
    for (const col of pedidas) {
      expect(esperadas, `columna inesperada en el select de events: "${col}"`).toContain(col)
    }
  })

  it('arma destacadoPor a partir de la segunda consulta a profiles (no un embed por FK)', async () => {
    const ADMIN_ID = ADMIN_USER.id
    setup({
      user: ADMIN_USER,
      role: 'ADMIN',
      selectEventsResult: {
        data: [
          {
            id: EVENT_ID,
            title: 'Show de prueba',
            slug: 'show-de-prueba',
            start_date: '2030-10-20T20:00:00-03:00',
            featured_until: '2030-10-25T23:59:59-03:00',
            featured_set_by: ADMIN_ID,
            featured_set_at: '2030-10-10T12:00:00-03:00',
          },
        ],
        error: null,
      },
      selectPerfilesResult: {
        data: [{ id: ADMIN_ID, full_name: 'Admin de Prueba', email: 'admin@example.com' }],
        error: null,
      },
    })

    const res = await obtenerDestacados()
    expect(res).toEqual([
      {
        id: EVENT_ID,
        title: 'Show de prueba',
        slug: 'show-de-prueba',
        start_date: '2030-10-20T20:00:00-03:00',
        featured_until: '2030-10-25T23:59:59-03:00',
        featured_set_at: '2030-10-10T12:00:00-03:00',
        destacadoPor: { fullName: 'Admin de Prueba', email: 'admin@example.com' },
      },
    ])
  })
})
