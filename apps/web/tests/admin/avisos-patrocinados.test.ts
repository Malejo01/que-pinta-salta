/**
 * `lib/admin/avisos-patrocinados-actions.ts` (D2/Ronda 51, tarea 51-c):
 * cargar, editar y cancelar una campaña patrocinada desde /admin/avisos. Sin
 * red ni base: `@/lib/supabase/server` y `next/cache` van mockeados (mismo
 * patrón que `tests/admin/lugares.test.ts` y `tests/admin/duplicate-actions.test.ts`).
 * `validarCampania` (de `@qps/core/notificaciones/patrocinados`, tarea 51-a,
 * ya cerrada) SÍ corre real: estos tests comprueban el cableado con la base
 * (quién puede escribir, qué se guarda, qué se corta antes), no reimplementan
 * esa validación.
 *
 * El chequeo de que este archivo (módulo "use server") solo exporta
 * `async function` y tipos ya lo barre `tests/lib/use-server.test.ts` sobre
 * todo `apps/web`: no se duplica acá.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
const revalidatePath = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { cancelarCampania, guardarCampania } from '@/lib/admin/avisos-patrocinados-actions'

function leer(rutaRelativa: string): string {
  const contenido = readFileSync(join(process.cwd(), rutaRelativa), 'utf8')
  expect(contenido.trim().length).toBeGreaterThan(0)
  return contenido
}

const uid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
const EVENT_ID = uid(1)
const OTRA_CAMPANIA_ID = uid(2)
const CAMPANIA_ID = uid(3)

const AHORA_MS = Date.now()
const enDias = (dias: number) => new Date(AHORA_MS + dias * 24 * 60 * 60 * 1000).toISOString()

interface Campania {
  id: string
  starts_at: string
  ends_at: string
}

interface ConfigCliente {
  user: { id: string } | null
  role?: string | null
  campanias?: Campania[]
  eventStatus?: 'PUBLISHED' | 'DRAFT' | null
  insertError?: { code?: string; message: string } | null
  updateError?: { code?: string; message: string } | null
  deleteError?: { code?: string; message: string } | null
}

/**
 * Doble de createClient(): `profiles` resuelve el rol; `sponsored_campaigns`
 * sirve tanto la consulta "todas las ventanas" (select sin más chequeos,
 * awaited directo) como la fila de una campaña puntual
 * (`.eq('id', x).maybeSingle()`), más `insert`/`update`/`delete`; `events`
 * resuelve el status del evento.
 */
function construirCliente(config: ConfigCliente) {
  const inserts: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  const deletes: string[] = []
  const campanias = config.campanias ?? []

  const from = vi.fn((tabla: string) => {
    if (tabla === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: config.role ? { role: config.role } : null, error: null }),
          }),
        }),
      }
    }

    if (tabla === 'events') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (config.eventStatus === undefined || config.eventStatus === null) {
                return { data: null, error: null }
              }
              return { data: { status: config.eventStatus }, error: null }
            },
          }),
        }),
      }
    }

    if (tabla === 'sponsored_campaigns') {
      return {
        select: () => {
          const resultadoTodas = { data: campanias.map((c) => ({ ...c })), error: null }
          return {
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => {
                const fila = campanias.find((c) => c.id === id)
                return {
                  data: fila ? { starts_at: fila.starts_at, ends_at: fila.ends_at } : null,
                  error: null,
                }
              },
            }),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(resultadoTodas).then(resolve, reject),
          }
        },
        update: (valores: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(valores)
            return { error: config.updateError ?? null }
          },
        }),
        insert: async (valores: Record<string, unknown>) => {
          inserts.push(valores)
          return { error: config.insertError ?? null }
        },
        delete: () => ({
          eq: async (_col: string, id: string) => {
            deletes.push(id)
            return { error: config.deleteError ?? null }
          },
        }),
      }
    }

    throw new Error(`tabla inesperada en el doble de avisos-patrocinados: "${tabla}"`)
  })

  return {
    cliente: { auth: { getUser: async () => ({ data: { user: config.user }, error: null }) }, from },
    from,
    inserts,
    updates,
    deletes,
  }
}

beforeEach(() => {
  createClient.mockReset()
  revalidatePath.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

function entradaValida(extra: Record<string, unknown> = {}) {
  return {
    titulo: 'Entradas 2x1 esta semana',
    cuerpo: 'Llevá a un amigo gratis en la función de las 22hs.',
    eventId: EVENT_ID,
    url: null,
    startsAt: enDias(5),
    endsAt: enDias(6),
    ...extra,
  }
}

describe('guardarCampania: entrada con forma inválida, antes de crear el cliente', () => {
  it('null: error, createClient nunca se llama', async () => {
    const resultado = await guardarCampania(null)
    expect(resultado.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('un string: error, createClient nunca se llama', async () => {
    const resultado = await guardarCampania('no es un objeto')
    expect(resultado.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('un id que no es uuid: error, createClient nunca se llama', async () => {
    const resultado = await guardarCampania({ id: 'no-es-un-uuid', ...entradaValida() })
    expect(resultado.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('guardarCampania: entrada inválida para validarCampania (campos vacíos)', () => {
  it('error, y ninguna escritura', async () => {
    const db = construirCliente({ user: { id: 'admin-1' }, role: 'ADMIN', eventStatus: 'PUBLISHED' })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await guardarCampania({})

    expect(resultado.ok).toBe(false)
    expect(db.inserts).toHaveLength(0)
    expect(db.updates).toHaveLength(0)
  })
})

describe('guardarCampania: sin sesión', () => {
  it('error, ninguna escritura', async () => {
    const db = construirCliente({ user: null })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await guardarCampania(entradaValida())

    expect(resultado).toEqual({ ok: false, errores: [{ campo: 'general', mensaje: 'No autenticado' }] })
    expect(db.inserts).toHaveLength(0)
  })
})

describe('guardarCampania: con sesión pero sin rol ADMIN', () => {
  it('error, ninguna escritura', async () => {
    const db = construirCliente({ user: { id: 'usuario-1' }, role: 'USER' })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await guardarCampania(entradaValida())

    expect(resultado).toEqual({
      ok: false,
      errores: [{ campo: 'general', mensaje: 'No tenés permisos de administrador' }],
    })
    expect(db.inserts).toHaveLength(0)
  })
})

describe('guardarCampania: admin, campaña nueva', () => {
  it('inserta con created_by del getUser(), aunque la entrada traiga otro created_by', async () => {
    const db = construirCliente({ user: { id: 'admin-1' }, role: 'ADMIN', eventStatus: 'PUBLISHED' })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await guardarCampania(entradaValida({ created_by: 'usuario-ajeno' }))

    expect(resultado).toEqual({ ok: true })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0].created_by).toBe('admin-1')
    expect(db.inserts[0].created_by).not.toBe('usuario-ajeno')
    expect(db.updates).toHaveLength(0)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/avisos')
  })
})

describe('guardarCampania: ventana que se cruza con otra campaña', () => {
  it('error, sin escribir', async () => {
    const db = construirCliente({
      user: { id: 'admin-1' },
      role: 'ADMIN',
      eventStatus: 'PUBLISHED',
      campanias: [{ id: OTRA_CAMPANIA_ID, starts_at: enDias(5), ends_at: enDias(7) }],
    })
    createClient.mockResolvedValue(db.cliente)

    // Se cruza con la campaña existente (5 a 7 días): esta va de 6 a 8.
    const resultado = await guardarCampania(entradaValida({ startsAt: enDias(6), endsAt: enDias(8) }))

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.errores.some((e) => e.mensaje.includes('superpone'))).toBe(true)
    }
    expect(db.inserts).toHaveLength(0)
  })
})

describe('guardarCampania: título que imita una notificación del sistema', () => {
  it('"Actualización de seguridad": error, sin escribir', async () => {
    const db = construirCliente({ user: { id: 'admin-1' }, role: 'ADMIN', eventStatus: 'PUBLISHED' })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await guardarCampania(entradaValida({ titulo: 'Actualización de seguridad' }))

    expect(resultado.ok).toBe(false)
    expect(db.inserts).toHaveLength(0)
  })
})

describe('guardarCampania: el evento no está publicado', () => {
  it('evento en DRAFT: error, sin escribir', async () => {
    const db = construirCliente({ user: { id: 'admin-1' }, role: 'ADMIN', eventStatus: 'DRAFT' })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await guardarCampania(entradaValida())

    expect(resultado).toEqual({
      ok: false,
      errores: [{ campo: 'eventId', mensaje: 'El evento tiene que estar publicado.' }],
    })
    expect(db.inserts).toHaveLength(0)
  })

  it('evento que no existe: error, sin escribir', async () => {
    const db = construirCliente({ user: { id: 'admin-1' }, role: 'ADMIN', eventStatus: null })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await guardarCampania(entradaValida())

    expect(resultado.ok).toBe(false)
    expect(db.inserts).toHaveLength(0)
  })
})

describe('guardarCampania: editar una campaña que ya empezó', () => {
  it('error, sin actualizar', async () => {
    const db = construirCliente({
      user: { id: 'admin-1' },
      role: 'ADMIN',
      eventStatus: 'PUBLISHED',
      campanias: [{ id: CAMPANIA_ID, starts_at: enDias(-2), ends_at: enDias(2) }],
    })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await guardarCampania({ id: CAMPANIA_ID, ...entradaValida() })

    expect(resultado.ok).toBe(false)
    expect(db.updates).toHaveLength(0)
    expect(db.inserts).toHaveLength(0)
  })
})

describe('cancelarCampania', () => {
  it('id inválido: error, createClient nunca se llama', async () => {
    const resultado = await cancelarCampania('no-es-un-uuid')
    expect(resultado).toEqual({ ok: false, error: 'La campaña no es válida.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('sin sesión: error, ninguna escritura', async () => {
    const db = construirCliente({ user: null })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await cancelarCampania(CAMPANIA_ID)

    expect(resultado).toEqual({ ok: false, error: 'No autenticado' })
    expect(db.updates).toHaveLength(0)
    expect(db.deletes).toHaveLength(0)
  })

  it('una campaña que ya empezó y está vigente: update({ ends_at }), nunca delete', async () => {
    const db = construirCliente({
      user: { id: 'admin-1' },
      role: 'ADMIN',
      campanias: [{ id: CAMPANIA_ID, starts_at: enDias(-1), ends_at: enDias(1) }],
    })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await cancelarCampania(CAMPANIA_ID)

    expect(resultado).toEqual({ ok: true })
    expect(db.deletes).toHaveLength(0)
    expect(db.updates).toHaveLength(1)
    expect(Object.keys(db.updates[0])).toEqual(['ends_at'])
    expect(typeof db.updates[0].ends_at).toBe('string')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/avisos')
  })

  it('una campaña que nunca empezó: delete, nunca update', async () => {
    const db = construirCliente({
      user: { id: 'admin-1' },
      role: 'ADMIN',
      campanias: [{ id: CAMPANIA_ID, starts_at: enDias(3), ends_at: enDias(5) }],
    })
    createClient.mockResolvedValue(db.cliente)

    const resultado = await cancelarCampania(CAMPANIA_ID)

    expect(resultado).toEqual({ ok: true })
    expect(db.updates).toHaveLength(0)
    expect(db.deletes).toEqual([CAMPANIA_ID])
  })
})

describe('lib/admin/avisos-patrocinados-actions.ts: nunca usa el cliente admin', () => {
  it('no importa createAdminClient ni getPrivilegedClient', () => {
    const archivo = leer('lib/admin/avisos-patrocinados-actions.ts')
    expect(archivo).not.toContain('createAdminClient')
    expect(archivo).not.toContain('getPrivilegedClient')
  })
})

describe('/admin/avisos (page.tsx): redirige sin admin', () => {
  it('chequea sesión y rol ADMIN, y redirige si falta alguno', () => {
    const archivo = leer('app/admin/avisos/page.tsx')
    expect(archivo).toContain('getUser()')
    expect(archivo).toContain("role !== 'ADMIN'")
    // Dos redirect(: uno para "sin sesión", otro para "sin rol ADMIN".
    expect(archivo.split('redirect(').length - 1).toBeGreaterThanOrEqual(2)
  })
})

describe('menú de admin: la entrada nueva está en las dos listas', () => {
  it('navItems (layout.tsx) tiene "/admin/avisos"', () => {
    const archivo = leer('app/admin/layout.tsx')
    expect(archivo).toContain('/admin/avisos')
    expect(archivo).toContain('Avisos patrocinados')
  })

  it('adminSections (page.tsx) tiene "/admin/avisos"', () => {
    const archivo = leer('app/admin/page.tsx')
    expect(archivo).toContain('/admin/avisos')
    expect(archivo).toContain('Avisos patrocinados')
  })
})

describe('formulario-campania.tsx: la vista previa usa tituloAvisoPatrocinado de core', () => {
  it('importa tituloAvisoPatrocinado de @qps/core/notificaciones/patrocinados y lo usa', () => {
    const archivo = leer('app/admin/avisos/formulario-campania.tsx')
    expect(archivo).toContain("from '@qps/core/notificaciones/patrocinados'")
    expect(archivo).toContain('tituloAvisoPatrocinado')
    expect(archivo).toContain('tituloAvisoPatrocinado(')
  })

  it('no arma el prefijo "Patrocinado · " a mano', () => {
    const archivo = leer('app/admin/avisos/formulario-campania.tsx')
    expect(archivo).not.toContain("'Patrocinado · '")
    expect(archivo).not.toContain('"Patrocinado · "')
  })
})
