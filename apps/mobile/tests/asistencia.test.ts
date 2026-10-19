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
//
// R47, tarea 47-e (QPS-197): el modelo cambió de "Voy"/"Me interesa" a un
// solo tipo ("Voy") más ♥ Guardar. Cambios en este archivo respecto de la
// versión de la R38 (38-a):
//   - BORRADOS los casos que dependían de `me_interesa` (ya no existe):
//     "actual !== tipo: upsert con el user_id de la sesión (nunca de la
//     pantalla)" usaba `tipo = 'me_interesa'`.
//   - BORRADA entera la sección "R38, tarea 38-a, punto 1: marcarAsistencia
//     es idempotente con la lógica de core (siguienteMarca), para las 6
//     combinaciones" (incluye el test "tocar lo mismo dos veces seguidas..."):
//     `siguienteMarca` ya no existe en `@qps/core/asistencia`, lo reemplaza
//     `pasosDeTocar`/`estadoTrasPasos`, y esa tabla de combinaciones (con
//     `me_interesa` entre los valores) ya no tiene sentido.
//   - BORRADA entera la sección "R38, tarea 38-a, punto 2: detector
//     estático" (de `importaAsistenciaDeCore` hasta el barrido recursivo y
//     `describe.each(ARCHIVOS_ASISTENCIA)`): toda esa batería de detectores
//     existía para blindar la copia local de la unión `'voy' | 'me_interesa'`,
//     el mapa de ETIQUETAS con esas dos claves, el umbral y la comparación
//     manual `actual === tipo`. Con un solo tipo (`'voy'`) y sin
//     `siguienteMarca`, esos cuatro patrones ya no describen ningún riesgo
//     real de copia: mantenerlos habría significado dejar fixtures con
//     `'me_interesa'` para siempre, en contra de que "me interesa"
//     desapareció de la interfaz.
//   - El resto se adapta a la firma nueva: `obtenerAsistencia` ahora puede
//     sumar `guardado` (vía `obtenerEsFavorito` de `lib/favoritos.ts`, en el
//     mismo `Promise.all` que la marca propia — el doble de Supabase
//     necesita un caso para `user_favorites`), y `marcarAsistencia` recibe
//     `actual: EstadoGuardarVoy` en vez de `TipoAsistencia | null`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MENSAJE_ERROR,
  MENSAJE_NO_DISPONIBLE,
  MENSAJE_SIN_CONFIGURACION,
  MENSAJE_TIPO_INVALIDO,
  clasificarErrorAsistencia,
  marcarAsistencia,
  obtenerAsistencia,
} from '../lib/asistencia'

const estado = vi.hoisted(() => ({
  cantidades: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  propia: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  esFavorito: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  delete: { error: null as unknown } as { error: unknown },
  upsert: { error: null as unknown } as { error: unknown },
  insertFavorito: { error: null as unknown } as { error: unknown },
  arrojarCantidades: null as unknown,
  arrojarPropia: null as unknown,
  arrojarEsFavorito: null as unknown,
  arrojarDelete: null as unknown,
  arrojarUpsert: null as unknown,
  arrojarInsertFavorito: null as unknown,
  llamadas: { counts: 0, propia: 0, esFavorito: 0, delete: 0, upsert: 0, insertFavorito: 0 },
  ultimoUpsert: null as unknown,
  ultimoInsertFavorito: null as unknown,
}))

// `vi.mock` se eleva por encima de los imports estáticos: `lib/asistencia` ya
// ve este doble al importar `@/lib/supabase` (directo, y también indirecto a
// través de `lib/favoritos.ts`, que `lib/asistencia.ts` usa para "guardar" y
// para "guardado"). Nunca el cliente real (ni red, ni .env, ni base).
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
      if (tabla === 'user_favorites') {
        return {
          // obtenerEsFavorito: select('event_id').eq('user_id', ...).eq('event_id', ...).maybeSingle()
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  estado.llamadas.esFavorito++
                  if (estado.arrojarEsFavorito) throw estado.arrojarEsFavorito
                  return estado.esFavorito
                },
              }),
            }),
          }),
          // marcarFavorito: insert({ user_id, event_id })
          insert: async (valores: unknown) => {
            estado.llamadas.insertFavorito++
            estado.ultimoInsertFavorito = valores
            if (estado.arrojarInsertFavorito) throw estado.arrojarInsertFavorito
            return estado.insertFavorito
          },
        }
      }
      throw new Error(`tabla inesperada en el doble de asistencia: ${tabla}`)
    },
  },
}))

beforeEach(() => {
  estado.cantidades = { data: { voy: 0 }, error: null }
  estado.propia = { data: null, error: null }
  estado.esFavorito = { data: null, error: null }
  estado.delete = { error: null }
  estado.upsert = { error: null }
  estado.insertFavorito = { error: null }
  estado.arrojarCantidades = null
  estado.arrojarPropia = null
  estado.arrojarEsFavorito = null
  estado.arrojarDelete = null
  estado.arrojarUpsert = null
  estado.arrojarInsertFavorito = null
  estado.llamadas = { counts: 0, propia: 0, esFavorito: 0, delete: 0, upsert: 0, insertFavorito: 0 }
  estado.ultimoUpsert = null
  estado.ultimoInsertFavorito = null
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
  it('sin userId: cantidad pública, propia null, guardado false, y nunca consulta event_attendance ni user_favorites', async () => {
    estado.cantidades = { data: { voy: 3 }, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', null)

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 3 }, propia: null, guardado: false })
    expect(estado.llamadas.propia).toBe(0)
    expect(estado.llamadas.esFavorito).toBe(0)
  })

  it('sin fila de cantidades (maybeSingle null): 0, no null/undefined', async () => {
    estado.cantidades = { data: null, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', null)

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 0 }, propia: null, guardado: false })
  })

  it('con userId, fila propia "voy" y favorito marcado: propia = "voy", guardado = true', async () => {
    estado.cantidades = { data: { voy: 1 }, error: null }
    estado.propia = { data: { kind: 'voy' }, error: null }
    estado.esFavorito = { data: { event_id: 'evento-de-prueba-1' }, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1')

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 1 }, propia: 'voy', guardado: true })
  })

  it('con userId, sin fila propia y sin favorito: propia = null, guardado = false', async () => {
    estado.propia = { data: null, error: null }
    estado.esFavorito = { data: null, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1')

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 0 }, propia: null, guardado: false })
  })

  it('una fila propia con un kind que no es "voy" (dato viejo, por ejemplo "me_interesa") se lee como sin marca propia', async () => {
    estado.propia = { data: { kind: 'me_interesa' }, error: null }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1')

    expect(resultado.tipo).toBe('ok')
    if (resultado.tipo !== 'ok') throw new Error('no debería fallar')
    expect(resultado.propia).toBeNull()
  })

  it('decisión de esta tarea: si obtenerEsFavorito falla pero las cantidades y la marca propia salieron bien, sigue "ok" con guardado=false (no "error")', async () => {
    estado.cantidades = { data: { voy: 5 }, error: null }
    estado.propia = { data: { kind: 'voy' }, error: null }
    estado.esFavorito = { data: null, error: { code: '42501', message: SECRETO } }

    const resultado = await obtenerAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1')

    expect(resultado).toEqual({ tipo: 'ok', cantidades: { voy: 5 }, propia: 'voy', guardado: false })
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

describe('marcarAsistencia: tipo inválido (nunca toca Supabase)', () => {
  it('tipo !== "voy": error, con el guardado de "actual", y cero llamadas a Supabase', async () => {
    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'me_interesa', {
      guardado: true,
      voy: false,
    })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_TIPO_INVALIDO, guardado: true })
    expect(estado.llamadas.upsert).toBe(0)
    expect(estado.llamadas.delete).toBe(0)
    expect(estado.llamadas.insertFavorito).toBe(0)
  })
})

describe('marcarAsistencia: camino feliz', () => {
  it('ya tenía Voy: solo borra la fila propia (nunca hace upsert ni toca favoritos)', async () => {
    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: true,
      voy: true,
    })

    expect(resultado).toEqual({ tipo: 'ok', guardado: true })
    expect(estado.llamadas.delete).toBe(1)
    expect(estado.llamadas.upsert).toBe(0)
    expect(estado.llamadas.insertFavorito).toBe(0)
  })

  it('sin Guardado ni Voy: primero marca favorito, después hace upsert con kind "voy"', async () => {
    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: false,
      voy: false,
    })

    expect(resultado).toEqual({ tipo: 'ok', guardado: true })
    expect(estado.llamadas.insertFavorito).toBe(1)
    expect(estado.llamadas.upsert).toBe(1)
    expect(estado.ultimoUpsert).toEqual({
      user_id: 'usuario-de-prueba-1',
      event_id: 'evento-de-prueba-1',
      kind: 'voy',
    })
    expect(estado.ultimoInsertFavorito).toEqual({ user_id: 'usuario-de-prueba-1', event_id: 'evento-de-prueba-1' })
  })

  it('ya Guardado pero sin Voy: igual pasa por "guardar" (idempotente) antes del upsert', async () => {
    await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', { guardado: true, voy: false })

    expect(estado.llamadas.insertFavorito).toBe(1)
    expect(estado.llamadas.upsert).toBe(1)
  })
})

describe('marcarAsistencia: errores (nunca el mensaje crudo)', () => {
  it('falla "quitar-voy": error, no cambia el guardado (nada se escribió)', async () => {
    estado.delete = { error: { code: '42501', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: true,
      voy: true,
    })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR, guardado: true })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })

  it('falla "quitar-voy" con error "no-disponible": tipo no-disponible, con el guardado de antes', async () => {
    estado.delete = { error: { code: 'PGRST205', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: true,
      voy: true,
    })

    expect(resultado).toEqual({ tipo: 'no-disponible', guardado: true })
  })

  it('falla el upsert de "marcar-voy": error con guardado=true (el paso "guardar" ya se escribió)', async () => {
    estado.upsert = { error: { code: '42501', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: false,
      voy: false,
    })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR, guardado: true })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })

  it('falla el upsert con error "no-disponible": tipo no-disponible, con guardado=true', async () => {
    estado.upsert = { error: { code: '42P01', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: false,
      voy: false,
    })

    expect(resultado).toEqual({ tipo: 'no-disponible', guardado: true })
  })

  it('upsert tira una excepción de red: MENSAJE_ERROR, nunca el detalle de la excepción', async () => {
    estado.arrojarUpsert = new Error(SECRETO)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: false,
      voy: false,
    })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR, guardado: true })
    expect(JSON.stringify(resultado)).not.toContain(SECRETO)
  })

  it('falla el paso "guardar" (marcarFavorito): error, no llega a hacer upsert, y el guardado que vuelve es el de antes', async () => {
    estado.insertFavorito = { error: { code: '42501', message: SECRETO } }

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: false,
      voy: false,
    })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_ERROR, guardado: false })
    expect(estado.llamadas.upsert).toBe(0)
  })
})

describe('marcarAsistencia: sin configuración de Supabase', () => {
  it('no llega ni a construir la consulta, y devuelve el guardado de "actual"', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const { marcarAsistencia: marcarSinConfig } = await import('../lib/asistencia')

    const resultado = await marcarSinConfig('evento-de-prueba-1', 'usuario-de-prueba-1', 'voy', {
      guardado: true,
      voy: false,
    })

    expect(resultado).toEqual({ tipo: 'error', error: MENSAJE_SIN_CONFIGURACION, guardado: true })
    expect(estado.llamadas.upsert).toBe(0)
    expect(estado.llamadas.delete).toBe(0)
  })
})

describe('MENSAJE_NO_DISPONIBLE: no es un mensaje de error crudo', () => {
  it('es una constante de la UI, no el texto de ningún error de Postgres', () => {
    expect(MENSAJE_NO_DISPONIBLE).toBe('Pronto vas a poder marcar si vas.')
  })
})
