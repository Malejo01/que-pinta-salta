// Ronda 27, tarea 27-c: `lib/notificaciones.ts`.
//
// Punto 1: el `user_id` del upsert es siempre el de la sesión de prueba.
// Punto 5: si `notification_preferences` todavía no existe en este entorno
// (`PGRST205`/`42P01`), la pantalla no rompe (`tipo: 'no-disponible'`), y el
// upsert nunca manda `daily_cap` (no se edita desde la app — `validarPreferenciasNotificacion`
// de core ya lo excluye del tipo de entrada).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID_SESION = 'usuario-de-sesion-1'

const estado = vi.hoisted(() => ({
  lectura: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  arrojarLectura: null as unknown,
  escrituraResultado: { error: null as unknown } as { error: unknown },
  arrojarEscritura: null as unknown,
  llamadas: { select: 0, upsert: 0 },
  ultimoUpsert: null as unknown,
  ultimoEqUserId: null as unknown,
}))

// `vi.mock` se eleva por encima de los imports estáticos: `lib/notificaciones`
// ya ve este doble al importar `@/lib/supabase`. Nunca el cliente real (ni
// red, ni .env, ni base).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla !== 'notification_preferences') {
        throw new Error(`tabla inesperada en el doble de notificaciones: ${tabla}`)
      }
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = (campo: string, valor: unknown) => {
        if (campo === 'user_id') estado.ultimoEqUserId = valor
        return builder
      }
      builder.maybeSingle = async () => {
        estado.llamadas.select++
        if (estado.arrojarLectura) throw estado.arrojarLectura
        return estado.lectura
      }
      builder.upsert = async (valores: unknown) => {
        estado.llamadas.upsert++
        estado.ultimoUpsert = valores
        if (estado.arrojarEscritura) throw estado.arrojarEscritura
        return estado.escrituraResultado
      }
      return builder
    },
  },
}))

import {
  MENSAJE_ERROR,
  MENSAJE_ERROR_GUARDAR,
  MENSAJE_NO_DISPONIBLE,
  MENSAJE_SIN_CONFIGURACION,
  guardarNotificaciones,
  obtenerNotificaciones,
} from '../lib/notificaciones'

const PREFERENCIAS_VALIDAS = {
  radar_channel: 'push' as const,
  favorite_reminders: false,
  follow_news: true,
  announcements: true,
  quiet_start: '22:30',
  quiet_end: '08:15',
}

beforeEach(() => {
  estado.lectura = { data: null, error: null }
  estado.arrojarLectura = null
  estado.escrituraResultado = { error: null }
  estado.arrojarEscritura = null
  estado.llamadas = { select: 0, upsert: 0 }
  estado.ultimoUpsert = null
  estado.ultimoEqUserId = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Punto 1: user_id de la sesión.
// ---------------------------------------------------------------------------
describe('user_id: siempre el de la sesión', () => {
  it('obtenerNotificaciones filtra por el user_id de la sesión', async () => {
    await obtenerNotificaciones(USER_ID_SESION)
    expect(estado.ultimoEqUserId).toBe(USER_ID_SESION)
  })

  it('guardarNotificaciones hace upsert con el user_id de la sesión', async () => {
    await guardarNotificaciones(USER_ID_SESION, PREFERENCIAS_VALIDAS)
    expect((estado.ultimoUpsert as Record<string, unknown>).user_id).toBe(USER_ID_SESION)
  })
})

// ---------------------------------------------------------------------------
// Punto 5: el upsert nunca manda daily_cap.
// ---------------------------------------------------------------------------
describe('guardarNotificaciones: el upsert nunca manda daily_cap (no se edita desde la app)', () => {
  it('el payload del upsert no incluye la clave daily_cap', async () => {
    await guardarNotificaciones(USER_ID_SESION, PREFERENCIAS_VALIDAS)

    expect(estado.ultimoUpsert).not.toBeNull()
    expect(Object.keys(estado.ultimoUpsert as object)).not.toContain('daily_cap')
  })

  it('el payload del upsert es exactamente user_id + las 6 preferencias editables', async () => {
    await guardarNotificaciones(USER_ID_SESION, PREFERENCIAS_VALIDAS)

    expect(estado.ultimoUpsert).toEqual({
      user_id: USER_ID_SESION,
      radar_channel: 'push',
      favorite_reminders: false,
      follow_news: true,
      announcements: true,
      quiet_start: '22:30',
      quiet_end: '08:15',
    })
  })

  it('"daily_cap" en la entrada (por ejemplo un cliente viejo o manipulado) se ignora: no llega al upsert', async () => {
    await guardarNotificaciones(USER_ID_SESION, { ...PREFERENCIAS_VALIDAS, daily_cap: 999 } as never)

    expect(Object.keys(estado.ultimoUpsert as object)).not.toContain('daily_cap')
  })
})

// ---------------------------------------------------------------------------
// Validación: no escribe nada si los datos no son válidos.
// ---------------------------------------------------------------------------
describe('guardarNotificaciones: validación de core antes de escribir', () => {
  it('radar_channel inválido: error y cero upserts', async () => {
    const resultado = await guardarNotificaciones(USER_ID_SESION, {
      ...PREFERENCIAS_VALIDAS,
      radar_channel: 'telegram' as never,
    })

    expect(resultado).toEqual({ tipo: 'error', error: 'El canal del Radar no es válido.' })
    expect(estado.llamadas.upsert).toBe(0)
  })

  it('quiet_start con formato inválido: error y cero upserts', async () => {
    const resultado = await guardarNotificaciones(USER_ID_SESION, { ...PREFERENCIAS_VALIDAS, quiet_start: '25:99' })

    expect(resultado.tipo).toBe('error')
    expect(estado.llamadas.upsert).toBe(0)
  })

  it('favorite_reminders no booleano: error y cero upserts', async () => {
    const resultado = await guardarNotificaciones(USER_ID_SESION, {
      ...PREFERENCIAS_VALIDAS,
      favorite_reminders: 'si' as never,
    })

    expect(resultado.tipo).toBe('error')
    expect(estado.llamadas.upsert).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Punto 5: "la tabla no existe" no rompe, muestra el mensaje amable.
// ---------------------------------------------------------------------------
describe('obtenerNotificaciones: la tabla no existe todavía (no rompe)', () => {
  it('PGRST205: tipo no-disponible', async () => {
    estado.lectura = { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }

    const resultado = await obtenerNotificaciones(USER_ID_SESION)

    expect(resultado).toEqual({ tipo: 'no-disponible' })
  })

  it('42P01: tipo no-disponible', async () => {
    estado.lectura = { data: null, error: { code: '42P01', message: 'relation does not exist' } }

    const resultado = await obtenerNotificaciones(USER_ID_SESION)

    expect(resultado).toEqual({ tipo: 'no-disponible' })
  })

  it('excepción de red en vez de error de Postgrest: también no-disponible si clasifica así, sin romper', async () => {
    estado.arrojarLectura = { code: 'PGRST205', message: 'Could not find the table' }

    const resultado = await obtenerNotificaciones(USER_ID_SESION)

    expect(resultado).toEqual({ tipo: 'no-disponible' })
  })

  it('42501 (permisos): NO es no-disponible, es un error genérico', async () => {
    estado.lectura = { data: null, error: { code: '42501', message: 'permission denied' } }

    const resultado = await obtenerNotificaciones(USER_ID_SESION)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR })
  })
})

describe('guardarNotificaciones: la tabla no existe todavía (no rompe)', () => {
  it('upsert con PGRST205: tipo no-disponible', async () => {
    estado.escrituraResultado = { error: { code: 'PGRST205', message: 'Could not find the table' } }

    const resultado = await guardarNotificaciones(USER_ID_SESION, PREFERENCIAS_VALIDAS)

    expect(resultado).toEqual({ tipo: 'no-disponible' })
  })

  it('upsert con 42501 (permisos): error genérico, no no-disponible', async () => {
    estado.escrituraResultado = { error: { code: '42501', message: 'permission denied' } }

    const resultado = await guardarNotificaciones(USER_ID_SESION, PREFERENCIAS_VALIDAS)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR_GUARDAR })
  })
})

// ---------------------------------------------------------------------------
// Camino feliz de obtenerNotificaciones.
// ---------------------------------------------------------------------------
describe('obtenerNotificaciones: camino feliz', () => {
  it('sin fila (el usuario nunca guardó): las preferencias por defecto', async () => {
    estado.lectura = { data: null, error: null }

    const resultado = await obtenerNotificaciones(USER_ID_SESION)

    expect(resultado).toEqual({
      tipo: 'ok',
      preferencias: {
        radar_channel: 'email',
        favorite_reminders: true,
        follow_news: true,
        announcements: false,
        quiet_start: '23:00',
        quiet_end: '09:00',
        daily_cap: 4,
      },
    })
  })

  it('con fila guardada: usa esos valores', async () => {
    estado.lectura = {
      data: {
        radar_channel: 'ambos',
        favorite_reminders: false,
        follow_news: false,
        announcements: true,
        quiet_start: '00:00',
        quiet_end: '07:00',
      },
      error: null,
    }

    const resultado = await obtenerNotificaciones(USER_ID_SESION)

    expect(resultado.tipo).toBe('ok')
    if (resultado.tipo !== 'ok') throw new Error('no debería fallar')
    expect(resultado.preferencias.radar_channel).toBe('ambos')
    expect(resultado.preferencias.quiet_start).toBe('00:00')
  })
})

// ---------------------------------------------------------------------------
// Sin configuración de Supabase.
// ---------------------------------------------------------------------------
describe('sin configuración de Supabase: no se escribe ni se lee nada', () => {
  it('obtenerNotificaciones no llega ni a construir la consulta', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerNotificaciones: obtenerSinConfig } = await import('../lib/notificaciones')

    const resultado = await obtenerSinConfig(USER_ID_SESION)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.select).toBe(0)
  })

  it('guardarNotificaciones no hace ningún upsert', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { guardarNotificaciones: guardarSinConfig } = await import('../lib/notificaciones')

    const resultado = await guardarSinConfig(USER_ID_SESION, PREFERENCIAS_VALIDAS)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.upsert).toBe(0)
  })
})

describe('MENSAJE_NO_DISPONIBLE: no es un mensaje de error crudo', () => {
  it('es una constante de la UI amable', () => {
    expect(MENSAJE_NO_DISPONIBLE).toBe('Pronto vas a poder elegir tus notificaciones.')
  })
})
