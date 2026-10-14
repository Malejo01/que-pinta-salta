// 26-c, punto 1 y 2: `lib/asistencia.ts`.
//
// Punto 1: `clasificarErrorAsistencia` es pura (sin red, sin Supabase) — se
// prueba directo, sin mocks.
//
// Punto 2: `obtenerAsistencia`/`marcarAsistencia` con un doble de
// `@/lib/supabase` (mismo patrón que `tests/datos-eventos.test.ts` y
// `tests/datos-cines.test.ts`), para probar que el mensaje crudo de la base
// (`error.message`) nunca llega a la pantalla: lo que devuelven siempre es
// una de las constantes del módulo (`MENSAJE_ERROR`, `MENSAJE_NO_DISPONIBLE`,
// `MENSAJE_SIN_CONFIGURACION`), nunca el texto original del error.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  cantidades: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  propia: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  delete: { error: null as unknown } as { error: unknown },
  upsert: { error: null as unknown } as { error: unknown },
  arrojarCantidades: null as unknown,
  arrojarPropia: null as unknown,
  arrojarDelete: null as unknown,
  arrojarUpsert: null as unknown,
  llamadas: { counts: 0, propia: 0, delete: 0, upsert: 0 },
  ultimoUpsert: null as unknown,
}))

// `vi.mock` se eleva por encima de los imports estáticos: `lib/asistencia` ya
// ve este doble al importar `@/lib/supabase`. Nunca el cliente real (ni red,
// ni .env, ni base).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'event_attendance_counts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                estado.llamadas.counts++
                if (estado.arrojarCantidades) throw estado.arrojarCantidades
                return estado.cantidades
              },
            }),
          }),
        }
      }
      if (tabla === 'event_attendance') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                estado.llamadas.propia++
                if (estado.arrojarPropia) throw estado.arrojarPropia
                return estado.propia
              },
            }),
          }),
          delete: () => ({
            eq: async () => {
              estado.llamadas.delete++
              if (estado.arrojarDelete) throw estado.arrojarDelete
              return estado.delete
            },
          }),
          upsert: async (valores: unknown) => {
            estado.llamadas.upsert++
            estado.ultimoUpsert = valores
            if (estado.arrojarUpsert) throw estado.arrojarUpsert
            return estado.upsert
          },
        }
      }
      throw new Error(`tabla inesperada en el doble de asistencia: ${tabla}`)
    },
  },
}))

import {
  MENSAJE_ERROR,
  MENSAJE_NO_DISPONIBLE,
  MENSAJE_SIN_CONFIGURACION,
  clasificarErrorAsistencia,
  marcarAsistencia,
  obtenerAsistencia,
} from '../lib/asistencia'

beforeEach(() => {
  estado.cantidades = { data: { voy: 0, me_interesa: 0 }, error: null }
  estado.propia = { data: null, error: null }
  estado.delete = { error: null }
  estado.upsert = { error: null }
  estado.arrojarCantidades = null
  estado.arrojarPropia = null
  estado.arrojarDelete = null
  estado.arrojarUpsert = null
  estado.llamadas = { counts: 0, propia: 0, delete: 0, upsert: 0 }
  estado.ultimoUpsert = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Punto 1: clasificarErrorAsistencia (pura)
// ---------------------------------------------------------------------------
describe('clasificarErrorAsistencia', () => {
  it('PGRST205 ("la tabla no existe"): no-disponible, incluso sin "schema cache" en el mensaje', () => {
    expect(
      clasificarErrorAsistencia({ code: 'PGRST205', message: 'Could not find the table "public.event_attendance"' })
    ).toBe('no-disponible')
  })

  it('42P01 ("relation ... does not exist"): no-disponible', () => {
    expect(clasificarErrorAsistencia({ code: '42P01', message: 'relation "event_attendance" does not exist' })).toBe(
      'no-disponible'
    )
  })

  it('PGRST200 con "schema cache" en el mensaje: no-disponible', () => {
    expect(
      clasificarErrorAsistencia({ code: 'PGRST200', message: 'Could not find a relation in the schema cache' })
    ).toBe('no-disponible')
  })

  it('PGRST202 con "schema cache" en el mensaje: no-disponible', () => {
    expect(
      clasificarErrorAsistencia({ code: 'PGRST202', message: 'Could not find a relation in the schema cache' })
    ).toBe('no-disponible')
  })

  it('PGRST2xx con "Schema Cache" en otra capitalización: no-disponible (la regex del mensaje es insensible a mayúsculas)', () => {
    expect(clasificarErrorAsistencia({ code: 'PGRST204', message: 'Not found in the Schema Cache' })).toBe(
      'no-disponible'
    )
  })

  it('PGRST2xx SIN "schema cache" en el mensaje: error', () => {
    expect(clasificarErrorAsistencia({ code: 'PGRST204', message: 'Column "kind" not found' })).toBe('error')
  })

  it('42501 ("permission denied"): error', () => {
    expect(
      clasificarErrorAsistencia({ code: '42501', message: 'permission denied for table event_attendance' })
    ).toBe('error')
  })

  it('error de red sin "code": error', () => {
    expect(clasificarErrorAsistencia({ message: 'network request failed' })).toBe('error')
    expect(clasificarErrorAsistencia(new Error('network request failed'))).toBe('error')
  })

  it('null, undefined, string y número: error', () => {
    expect(clasificarErrorAsistencia(null)).toBe('error')
    expect(clasificarErrorAsistencia(undefined)).toBe('error')
    expect(clasificarErrorAsistencia('algo salió mal')).toBe('error')
    expect(clasificarErrorAsistencia(42)).toBe('error')
  })

  it('PGRST3xx: error (la regex del código solo cubre PGRST2xx)', () => {
    expect(clasificarErrorAsistencia({ code: 'PGRST301', message: 'JWT expired, in the schema cache' })).toBe(
      'error'
    )
  })

  it('PGRST20 (corto, le falta un dígito): error (la regex está anclada)', () => {
    expect(clasificarErrorAsistencia({ code: 'PGRST20', message: 'algo en la schema cache' })).toBe('error')
  })

  it('pgrst205 en minúscula: error (sensible a mayúsculas)', () => {
    expect(clasificarErrorAsistencia({ code: 'pgrst205', message: 'Could not find the table' })).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Punto 2: el mensaje crudo de la base nunca llega a la pantalla.
// ---------------------------------------------------------------------------
const SECRETO = 'detalle interno de postgres, nunca debería salir a pantalla'

describe('obtenerAsistencia: camino feliz', () => {
  it('sin userId: cantidades públicas, propia null, y nunca consulta event_attendance', async () => {
    estado.cantidades = { data: { voy: 3, me_interesa: 5 }, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', null)

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 3, meInteresa: 5 }, propia: null })
    expect(estado.llamadas.propia).toBe(0)
  })

  it('sin fila de cantidades (maybeSingle null): 0 y 0, no null/undefined', async () => {
    estado.cantidades = { data: null, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', null)

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 0, meInteresa: 0 }, propia: null })
  })

  it('con userId y fila propia "voy": propia = "voy"', async () => {
    estado.cantidades = { data: { voy: 1, me_interesa: 0 }, error: null }
    estado.propia = { data: { kind: 'voy' }, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1')

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 1, meInteresa: 0 }, propia: 'voy' })
  })

  it('con userId y sin fila propia: propia = null', async () => {
    estado.propia = { data: null, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1')

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 0, meInteresa: 0 }, propia: null })
  })
})

describe('obtenerAsistencia: errores (nunca el mensaje crudo)', () => {
  it('cantidades con error "no-disponible" (PGRST205): tipo no-disponible, sin campo error', async () => {
    estado.cantidades = { data: null, error: { code: 'PGRST205', message: SECRETO } }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', null)

    expect(resultado).toEqual({ tipo: 'no-disponible' })
  })

  it('cantidades con error genérico (42501): MENSAJE_ERROR, nunca el mensaje crudo', async () => {
    estado.cantidades = { data: null, error: { code: '42501', message: SECRETO } }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', null)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })

  it('cantidades tira una excepción de red: MENSAJE_ERROR, nunca el detalle de la excepción', async () => {
    estado.arrojarCantidades = new Error(SECRETO)

    const resultado = await obtenerAsistencia('evento-de-prueba-1', null)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })

  it('propia con error "no-disponible" (42P01): tipo no-disponible', async () => {
    estado.propia = { data: null, error: { code: '42P01', message: SECRETO } }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1')

    expect(resultado).toEqual({ tipo: 'no-disponible' })
  })

  it('propia con error genérico: MENSAJE_ERROR, nunca el mensaje crudo', async () => {
    estado.propia = { data: null, error: { code: '42501', message: SECRETO } }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1')

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })
})

describe('obtenerAsistencia: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { obtenerAsistencia: obtenerSinConfig } = await import('../lib/asistencia')

    const resultado = await obtenerSinConfig('evento-de-prueba-1', null)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.counts).toBe(0)
  })
})

describe('marcarAsistencia: camino feliz', () => {
  it('actual === tipo: borra la fila propia (nunca hace upsert)', async () => {
    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', 'voy')

    expect(resultado).toEqual({ tipo: 'ok' })
    expect(estado.llamadas.delete).toBe(1)
    expect(estado.llamadas.upsert).toBe(0)
  })

  it('actual !== tipo: upsert con el user_id de la sesión (nunca de la pantalla)', async () => {
    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'me_interesa', 'voy')

    expect(resultado).toEqual({ tipo: 'ok' })
    expect(estado.llamadas.upsert).toBe(1)
    expect(estado.ultimoUpsert).toEqual({
      user_id: 'usuario-de-prueba-1',
      event_id: 'evento-de-prueba-1',
      kind: 'me_interesa',
    })
  })

  it('actual null: upsert (primera marca)', async () => {
    await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', null)
    expect(estado.llamadas.upsert).toBe(1)
    expect(estado.llamadas.delete).toBe(0)
  })
})

describe('marcarAsistencia: errores (nunca el mensaje crudo)', () => {
  it('borrar con error "no-disponible": tipo no-disponible', async () => {
    estado.delete = { error: { code: 'PGRST205', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', 'voy')

    expect(resultado).toEqual({ tipo: 'no-disponible' })
  })

  it('borrar con error genérico: MENSAJE_ERROR, nunca el mensaje crudo', async () => {
    estado.delete = { error: { code: '42501', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', 'voy')

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })

  it('upsert con error "no-disponible": tipo no-disponible', async () => {
    estado.upsert = { error: { code: '42P01', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', null)

    expect(resultado).toEqual({ tipo: 'no-disponible' })
  })

  it('upsert con error genérico: MENSAJE_ERROR, nunca el mensaje crudo', async () => {
    estado.upsert = { error: { code: '42501', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', null)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })

  it('upsert tira una excepción de red: MENSAJE_ERROR, nunca el detalle de la excepción', async () => {
    estado.arrojarUpsert = new Error(SECRETO)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', null)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })
})

describe('marcarAsistencia: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { marcarAsistencia: marcarSinConfig } = await import('../lib/asistencia')

    const resultado = await marcarSinConfig('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', null)

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_SIN_CONFIGURACION })
    expect(estado.llamadas.upsert).toBe(0)
    expect(estado.llamadas.delete).toBe(0)
  })
})

describe('MENSAJE_NO_DISPONIBLE: no es un mensaje de error crudo', () => {
  it('es una constante de la UI, no el texto de ningún error de Postgres', () => {
    expect(MENSAJE_NO_DISPONIBLE).toBe('Pronto vas a poder marcar si vas.')
  })
})
