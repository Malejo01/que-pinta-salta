// Ronda 27, tarea 27-c: `lib/radar.ts`.
//
// Punto 1: el `user_id` de cada escritura (`upsert` de `user_radar_settings`
// e `insert` de las tres tablas de seguidos) es siempre el de la sesión de
// prueba, nunca uno de los ids de categorías/lugares/cuentas (todos
// distintos entre sí a propósito). Ninguna escritura lleva `email_target`.
//
// Punto 2 (dedup v2 no aplica acá, pero sí "el mismo orden que la web"):
// `guardarRadar` escribe en el mismo orden que `updateRadarSettings` de
// `apps/web/lib/actions/radar.ts` — settings, categorías, lugares, cuentas
// de Instagram — y valida con `normalizarPreferenciasRadar` de core ANTES
// de escribir: una frecuencia inválida no llega a tocar la base.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID_SESION = 'usuario-de-sesion-1'
const CATEGORIA_ID = '11111111-1111-1111-1111-111111111111'
const VENUE_ID = '22222222-2222-2222-2222-222222222222'
const CUENTA_ID = '33333333-3333-3333-3333-333333333333'

type Escritura = { tabla: string; accion: 'upsert' | 'insert' | 'delete'; valores: unknown }

const estado = vi.hoisted(() => ({
  lecturas: {} as Record<string, { data: unknown; error: unknown }>,
  arrojarLectura: {} as Record<string, unknown>,
  resultadosEscritura: {} as Record<string, { error: unknown }>,
  arrojarEscritura: {} as Record<string, unknown>,
  escrituras: [] as Escritura[],
  llamadasLectura: {} as Record<string, number>,
}))

function construirTabla(tabla: string) {
  const builder: Record<string, unknown> = {}
  const metodosEncadenables = ['select', 'eq', 'is', 'order', 'not', 'in']
  for (const metodo of metodosEncadenables) {
    builder[metodo] = () => builder
  }
  builder.maybeSingle = async () => {
    estado.llamadasLectura[tabla] = (estado.llamadasLectura[tabla] ?? 0) + 1
    if (estado.arrojarLectura[tabla]) throw estado.arrojarLectura[tabla]
    return estado.lecturas[tabla] ?? { data: null, error: null }
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    estado.llamadasLectura[tabla] = (estado.llamadasLectura[tabla] ?? 0) + 1
    if (estado.arrojarLectura[tabla]) return Promise.reject(estado.arrojarLectura[tabla]).catch(reject)
    return Promise.resolve(estado.lecturas[tabla] ?? { data: [], error: null }).then(resolve, reject)
  }
  builder.upsert = async (valores: unknown) => {
    estado.escrituras.push({ tabla, accion: 'upsert', valores })
    if (estado.arrojarEscritura[tabla]) throw estado.arrojarEscritura[tabla]
    return estado.resultadosEscritura[tabla] ?? { error: null }
  }
  builder.insert = async (valores: unknown) => {
    estado.escrituras.push({ tabla, accion: 'insert', valores })
    if (estado.arrojarEscritura[`${tabla}:insert`]) throw estado.arrojarEscritura[`${tabla}:insert`]
    return estado.resultadosEscritura[`${tabla}:insert`] ?? { error: null }
  }
  builder.delete = () => ({
    eq: async (campo: string, valor: unknown) => {
      estado.escrituras.push({ tabla, accion: 'delete', valores: { [campo]: valor } })
      if (estado.arrojarEscritura[`${tabla}:delete`]) throw estado.arrojarEscritura[`${tabla}:delete`]
      return estado.resultadosEscritura[`${tabla}:delete`] ?? { error: null }
    },
  })
  return builder
}

// `vi.mock` se eleva por encima de los imports estáticos: `lib/radar` ya ve
// este doble al importar `@/lib/supabase`. Nunca el cliente real (ni red, ni
// .env, ni base).
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (tabla: string) => construirTabla(tabla) },
}))

import { MENSAJE_ERROR, MENSAJE_ERROR_GUARDAR, MENSAJE_SIN_CONFIGURACION, guardarRadar, obtenerRadar } from '../lib/radar'

const DATOS_VALIDOS = {
  email_frequency: 'biweekly',
  categoryIds: [CATEGORIA_ID],
  venueIds: [VENUE_ID],
  instagramAccountIds: [CUENTA_ID],
}

beforeEach(() => {
  estado.lecturas = {
    user_radar_settings: { data: null, error: null },
    user_followed_categories: { data: [], error: null },
    user_followed_venues: { data: [], error: null },
    user_followed_instagram_accounts: { data: [], error: null },
    categories: { data: [], error: null },
    venues: { data: [], error: null },
    instagram_accounts: { data: [], error: null },
  }
  estado.arrojarLectura = {}
  estado.resultadosEscritura = {}
  estado.arrojarEscritura = {}
  estado.escrituras = []
  estado.llamadasLectura = {}
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Punto 1: user_id de la sesión en cada escritura, nunca otro id.
// ---------------------------------------------------------------------------
describe('guardarRadar: user_id de la sesión en cada escritura', () => {
  it('el upsert de user_radar_settings lleva exactamente user_id + email_frequency, sin email_target', async () => {
    const resultado = await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    expect(resultado).toEqual({ ok: true })
    const upsertSettings = estado.escrituras.find((e) => e.tabla === 'user_radar_settings' && e.accion === 'upsert')
    expect(upsertSettings?.valores).toEqual({ user_id: USER_ID_SESION, email_frequency: 'biweekly' })
    expect(Object.keys(upsertSettings?.valores as object)).not.toContain('email_target')
  })

  it('el insert de categorías seguidas usa el user_id de la sesión, con category_id (no venue_id ni instagram_account_id)', async () => {
    await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    const insertCategorias = estado.escrituras.find(
      (e) => e.tabla === 'user_followed_categories' && e.accion === 'insert'
    )
    expect(insertCategorias?.valores).toEqual([{ user_id: USER_ID_SESION, category_id: CATEGORIA_ID }])
  })

  it('el insert de lugares seguidos usa el user_id de la sesión, con venue_id', async () => {
    await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    const insertLugares = estado.escrituras.find((e) => e.tabla === 'user_followed_venues' && e.accion === 'insert')
    expect(insertLugares?.valores).toEqual([{ user_id: USER_ID_SESION, venue_id: VENUE_ID }])
  })

  it('el insert de cuentas de Instagram seguidas usa el user_id de la sesión, con instagram_account_id', async () => {
    await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    const insertCuentas = estado.escrituras.find(
      (e) => e.tabla === 'user_followed_instagram_accounts' && e.accion === 'insert'
    )
    expect(insertCuentas?.valores).toEqual([{ user_id: USER_ID_SESION, instagram_account_id: CUENTA_ID }])
  })

  it('los 3 deletes de "borrar lo propio" filtran por el user_id de la sesión', async () => {
    await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    const deletes = estado.escrituras.filter((e) => e.accion === 'delete')
    expect(deletes).toHaveLength(3)
    for (const d of deletes) {
      expect(d.valores).toEqual({ user_id: USER_ID_SESION })
    }
  })

  it('ninguna escritura del Radar incluye la clave email_target', async () => {
    await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    for (const escritura of estado.escrituras) {
      const valores = Array.isArray(escritura.valores) ? escritura.valores : [escritura.valores]
      for (const v of valores) {
        if (v && typeof v === 'object') {
          expect(Object.keys(v)).not.toContain('email_target')
        }
      }
    }
  })
})

describe('guardarRadar: mismo orden de escritura que la web (updateRadarSettings)', () => {
  it('settings, después categorías (borrar+insertar), lugares (borrar+insertar), cuentas de Instagram (borrar+insertar)', async () => {
    await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    const orden = estado.escrituras.map((e) => `${e.tabla}:${e.accion}`)
    expect(orden).toEqual([
      'user_radar_settings:upsert',
      'user_followed_categories:delete',
      'user_followed_categories:insert',
      'user_followed_venues:delete',
      'user_followed_venues:insert',
      'user_followed_instagram_accounts:delete',
      'user_followed_instagram_accounts:insert',
    ])
  })

  it('con listas vacías: borra las 3 tablas pero no inserta nada (nunca un insert([]))', async () => {
    await guardarRadar(USER_ID_SESION, {
      email_frequency: 'disabled',
      categoryIds: [],
      venueIds: [],
      instagramAccountIds: [],
    })

    const orden = estado.escrituras.map((e) => `${e.tabla}:${e.accion}`)
    expect(orden).toEqual([
      'user_radar_settings:upsert',
      'user_followed_categories:delete',
      'user_followed_venues:delete',
      'user_followed_instagram_accounts:delete',
    ])
  })
})

// ---------------------------------------------------------------------------
// Punto 2: valida con core ANTES de escribir.
// ---------------------------------------------------------------------------
describe('guardarRadar: una frecuencia inválida no escribe nada', () => {
  it('frecuencia desconocida: error y cero escrituras', async () => {
    const resultado = await guardarRadar(USER_ID_SESION, { ...DATOS_VALIDOS, email_frequency: 'nunca-jamas' })

    expect(resultado).toEqual({ ok: false, error: 'La frecuencia del Radar no es válida.' })
    expect(estado.escrituras).toHaveLength(0)
  })

  it('frecuencia vacía: error y cero escrituras', async () => {
    const resultado = await guardarRadar(USER_ID_SESION, { ...DATOS_VALIDOS, email_frequency: '' })

    expect(resultado.ok).toBe(false)
    expect(estado.escrituras).toHaveLength(0)
  })
})

describe('guardarRadar: ids inválidos se limpian antes de insertar (core)', () => {
  it('ids que no son uuid se descartan; si queda la lista vacía, no inserta esa tabla', async () => {
    await guardarRadar(USER_ID_SESION, { ...DATOS_VALIDOS, categoryIds: ['no-es-un-uuid'] })

    const insertCategorias = estado.escrituras.find(
      (e) => e.tabla === 'user_followed_categories' && e.accion === 'insert'
    )
    expect(insertCategorias).toBeUndefined()
  })
})

describe('guardarRadar: errores (corta la cadena, no sigue escribiendo)', () => {
  it('si falla el upsert de settings, no llega a tocar las tablas de seguidos', async () => {
    estado.resultadosEscritura['user_radar_settings'] = { error: { message: 'boom' } }

    const resultado = await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    expect(estado.escrituras).toHaveLength(1)
    expect(estado.escrituras[0]).toMatchObject({ tabla: 'user_radar_settings', accion: 'upsert' })
  })

  it('si falla el delete de categorías, no llega a insertar categorías ni a tocar lugares', async () => {
    estado.resultadosEscritura['user_followed_categories:delete'] = { error: { message: 'boom' } }

    const resultado = await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
    const orden = estado.escrituras.map((e) => `${e.tabla}:${e.accion}`)
    expect(orden).toEqual(['user_radar_settings:upsert', 'user_followed_categories:delete'])
  })

  it('una excepción de red al escribir: MENSAJE_ERROR_GUARDAR, no explota', async () => {
    estado.arrojarEscritura['user_radar_settings'] = new Error('network request failed')

    const resultado = await guardarRadar(USER_ID_SESION, DATOS_VALIDOS)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR_GUARDAR })
  })
})

describe('guardarRadar: sin configuración de Supabase', () => {
  it('no llega ni a validar/escribir', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { guardarRadar: guardarSinConfig, MENSAJE_SIN_CONFIGURACION: MENSAJE } = await import('../lib/radar')

    const resultado = await guardarSinConfig(USER_ID_SESION, { ...DATOS_VALIDOS, email_frequency: 'nunca-jamas' })

    expect(resultado).toEqual({ ok: false, error: MENSAJE })
    expect(estado.escrituras).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// obtenerRadar: camino feliz y errores.
// ---------------------------------------------------------------------------
describe('obtenerRadar: camino feliz', () => {
  it('sin fila en user_radar_settings: frecuencia por defecto "weekly"', async () => {
    const resultado = await obtenerRadar(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.preferencias.email_frequency).toBe('weekly')
  })

  it('con una frecuencia guardada inválida (dato corrupto): cae al valor por defecto, no explota', async () => {
    estado.lecturas.user_radar_settings = { data: { email_frequency: 'algo-que-no-existe' }, error: null }

    const resultado = await obtenerRadar(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.preferencias.email_frequency).toBe('weekly')
  })

  it('con una frecuencia guardada válida: la respeta', async () => {
    estado.lecturas.user_radar_settings = { data: { email_frequency: 'monthly' }, error: null }

    const resultado = await obtenerRadar(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.preferencias.email_frequency).toBe('monthly')
  })

  it('mapea las listas de seguidos a arreglos de ids', async () => {
    estado.lecturas.user_followed_categories = { data: [{ category_id: CATEGORIA_ID }], error: null }
    estado.lecturas.user_followed_venues = { data: [{ venue_id: VENUE_ID }], error: null }
    estado.lecturas.user_followed_instagram_accounts = { data: [{ instagram_account_id: CUENTA_ID }], error: null }

    const resultado = await obtenerRadar(USER_ID_SESION)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería fallar')
    expect(resultado.preferencias.categoryIds).toEqual([CATEGORIA_ID])
    expect(resultado.preferencias.venueIds).toEqual([VENUE_ID])
    expect(resultado.preferencias.instagramAccountIds).toEqual([CUENTA_ID])
  })
})

describe('obtenerRadar: errores (nunca el mensaje crudo)', () => {
  it('cualquiera de las 7 consultas con error: MENSAJE_ERROR, no el detalle', async () => {
    estado.lecturas.venues = { data: null, error: { message: 'detalle interno que nunca debería salir' } }

    const resultado = await obtenerRadar(USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE_ERROR })
  })
})

describe('obtenerRadar: sin configuración de Supabase', () => {
  it('no llega ni a consultar', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerRadar: obtenerSinConfig, MENSAJE_SIN_CONFIGURACION: MENSAJE } = await import('../lib/radar')

    const resultado = await obtenerSinConfig(USER_ID_SESION)

    expect(resultado).toEqual({ ok: false, error: MENSAJE })
    expect(Object.keys(estado.llamadasLectura)).toHaveLength(0)
  })
})

describe('MENSAJE_SIN_CONFIGURACION: reexportado, mismo valor que lib/mensajes.ts', () => {
  it('coincide con el mensaje central', () => {
    expect(MENSAJE_SIN_CONFIGURACION).toBe('La app no tiene la configuración de datos: avisá al equipo.')
  })
})
