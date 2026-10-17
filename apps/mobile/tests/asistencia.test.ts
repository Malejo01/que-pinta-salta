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
// R38, tarea 38-a: casos agregados al final del archivo (los de arriba no se
// tocan). Dos cosas nuevas: (1) un detector estático de que `lib/asistencia.ts`
// y `components/BotonesAsistencia.tsx` importan la lógica de "Voy / Me
// interesa" de `@qps/core/asistencia` en vez de tener su propia copia
// (mismo estilo que `tests/estado-carga-detector.test.ts`); (2) que
// `marcarAsistencia` sigue siendo idempotente con `siguienteMarca` de core,
// para las 6 combinaciones.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { siguienteMarca, type TipoAsistencia as TipoAsistenciaDeCore } from '@qps/core/asistencia'

import {
  MENSAJE_ERROR,
  MENSAJE_NO_DISPONIBLE,
  MENSAJE_SIN_CONFIGURACION,
  clasificarErrorAsistencia,
  marcarAsistencia,
  obtenerAsistencia,
} from '../lib/asistencia'

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

// ---------------------------------------------------------------------------
// R38, tarea 38-a, punto 1: marcarAsistencia es idempotente con la lógica de
// core (`siguienteMarca`), para las 6 combinaciones de actual x tocado.
// ---------------------------------------------------------------------------
describe('marcarAsistencia: la decisión de borrar/upsert coincide con siguienteMarca de core (6 combinaciones)', () => {
  const combinaciones: [TipoAsistenciaDeCore | null, TipoAsistenciaDeCore][] = [
    [null, 'voy'],
    [null, 'me_interesa'],
    ['voy', 'voy'],
    ['voy', 'me_interesa'],
    ['me_interesa', 'voy'],
    ['me_interesa', 'me_interesa'],
  ]

  it.each(combinaciones)('actual=%s, tocado=%s', async (actual, tocado) => {
    await marcarAsistencia('evento-de-prueba-idempotencia', 'usuario-de-prueba-idempotencia', tocado, actual)

    const borra = siguienteMarca(actual, tocado) === null
    expect(estado.llamadas.delete).toBe(borra ? 1 : 0)
    expect(estado.llamadas.upsert).toBe(borra ? 0 : 1)
  })

  it('tocar lo mismo dos veces seguidas vuelve al estado inicial (null -> voy -> null): no queda upsert residual', async () => {
    // Primer toque: sin marca -> "voy" (upsert).
    await marcarAsistencia('evento-de-prueba-idempotencia-2', 'usuario-de-prueba-idempotencia', 'voy', null)
    expect(estado.llamadas.upsert).toBe(1)
    expect(estado.llamadas.delete).toBe(0)

    // Segundo toque: ahora la marca propia es "voy" y se vuelve a tocar
    // "voy" -> siguienteMarca da null -> borra. El resultado neto es el
    // mismo que no haber tocado nada (idempotente).
    await marcarAsistencia('evento-de-prueba-idempotencia-2', 'usuario-de-prueba-idempotencia', 'voy', 'voy')
    expect(estado.llamadas.upsert).toBe(1)
    expect(estado.llamadas.delete).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// R38, tarea 38-a, punto 2: detector estático — `lib/asistencia.ts` y
// `components/BotonesAsistencia.tsx` importan la lógica de core y no tienen
// su propia copia.
//
// Vuelta 1 (revisor, bloqueante 1): los cuatro chequeos de "copia local" de
// abajo solo miraban esos dos archivos vigilados. La evasión concreta que el
// revisor probó: crear un TERCER archivo (`lib/asistencia-interno.ts`) con la
// copia completa (tipo con otro nombre, etiquetas, umbral `>= 3` y la
// comparación manual), usarlo desde los dos archivos vigilados, y dejar el
// `import ... from '@qps/core/asistencia'` puesto aunque sea solo para el
// tipo. Con eso los cuatro chequeos quedaban en verde sobre los dos archivos
// vigilados (no tienen la copia: la tiene el tercero) y el detector no
// miraba ningún otro archivo.
//
// El arreglo: además de seguir probando con precisión los dos archivos
// vigilados (abajo, con los cuatro chequeos por separado — eso no cambió),
// se agrega un BARRIDO recursivo de todo el código de la app (`lib/`,
// `components/` y `app/`) que busca los cuatro patrones A LA VEZ en un
// mismo archivo (`tieneCopiaLocalCompleta`): esa combinación completa es
// una señal mucho más específica que cualquiera de los cuatro por separado
// (un `>= 3` aislado, por ejemplo, aparece en código de paginación o de
// estilos sin ninguna relación con asistencia), así que barrerla en todo el
// árbol de la app no da falsos positivos — se verifica más abajo con
// fixtures y también corriendo el barrido sobre el código real.
//
// `tests/` queda AFUERA del barrido a propósito: ahí los literales
// `'voy'`/`'me_interesa'`, el mapa de etiquetas y los números (`>= 3`,
// `=== 3`) son fixtures legítimos de los propios tests — de este archivo, y
// también de `tests/asistencia-umbral.test.ts`, que otro teammate puede
// estar escribiendo en paralelo — no una copia de la lógica de producción.
//
// Evasiones consideradas (y por qué este detector las agarra):
//   a) Alias de import: `import { siguienteMarca as x } from '@qps/core/asistencia'`
//      sigue siendo detectado como "importa de core" (el regex no depende
//      de los nombres importados, solo del origen del import) — pero eso
//      por sí solo NO alcanza para pasar: los otros tres chequeos (unión de
//      tipo, mapa de etiquetas, comparación manual) corren sobre el
//      contenido completo del archivo, así que un import correcto con una
//      copia local al lado sigue fallando.
//   b) Lógica escrita con otros nombres: en vez de buscar literalmente
//      `actual === tipo` (que se evade renombrando variables), el chequeo
//      de comparación manual busca la FORMA ("un identificador suelto
//      comparado con === / !== contra otro identificador suelto, ninguno
//      literal ni resultado de una llamada") sin importar cómo se llamen
//      esos identificadores. Y en vez de buscar el nombre del tipo
//      `TipoAsistencia`, el chequeo de unión de tipo busca la FORMA del
//      valor ('voy' | 'me_interesa', en cualquier orden), que no cambia
//      aunque el tipo se declare con otro nombre.
//   c) Copia completa en un tercer archivo no vigilado (la evasión real del
//      revisor, bloqueante 1): el barrido recorre TODO `lib/`,
//      `components/` y `app/`, no solo los dos archivos de la lista fija,
//      así que el tercer archivo cae igual, tenga el nombre que tenga.
//   d) Que la función que lista los archivos del barrido se achique sola
//      (a mano, o por un cambio futuro que la rompa): el test "encuentra
//      archivos" afirma que el barrido tiene más de 30 elementos y que
//      incluye los dos archivos vigilados, así que un barrido roto (por
//      ejemplo, que solo mire un directorio, o que no recorra
//      subdirectorios) queda en rojo aunque nadie haya tocado el resto de
//      los tests.
// ---------------------------------------------------------------------------

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ARCHIVOS_ASISTENCIA = [
  { etiqueta: 'lib/asistencia.ts', ruta: 'lib/asistencia.ts', chequearComparacionManual: true },
  {
    etiqueta: 'components/BotonesAsistencia.tsx',
    ruta: 'components/BotonesAsistencia.tsx',
    // Acá NO se chequea la comparación manual: `propia === tipo` es
    // legítimo (decide el resaltado del botón ya marcado), no la decisión
    // de borrar/upsert — eso vive en lib/asistencia.ts.
    chequearComparacionManual: false,
  },
] as const

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto. */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/** `true` si el contenido tiene un `import { ... } from '@qps/core/asistencia'` (cualquier nombre, con o sin alias). */
export function importaAsistenciaDeCore(content: string): boolean {
  return /import\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"]@qps\/core\/asistencia['"]/.test(quitarComentarios(content))
}

/** `true` si hay una unión de tipo `'voy' | 'me_interesa'` (en cualquier orden, cualquier nombre de tipo). */
export function tieneUnionTipoAsistenciaLocal(content: string): boolean {
  const limpio = quitarComentarios(content)
  const vdm = /(?:'voy'|"voy")\s*\|\s*(?:'me_interesa'|"me_interesa")/
  const mdv = /(?:'me_interesa'|"me_interesa")\s*\|\s*(?:'voy'|"voy")/
  return vdm.test(limpio) || mdv.test(limpio)
}

/** `true` si hay un mapa local con las dos claves del dominio (`voy`/`me_interesa`) a un string (un "ETIQUETAS" casero). */
export function tieneEtiquetasLocal(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /\bvoy\s*:\s*['"]/.test(limpio) && /\bme_interesa\s*:\s*['"]/.test(limpio)
}

/** `true` si hay un umbral numérico escrito a mano (`>=`, `<=`, `>`, `<` o `===` contra un número literal). */
export function tieneUmbralNumericoLocal(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /(>=|<=|>|<)\s*\d+/.test(limpio) || /===\s*\d+/.test(limpio)
}

/**
 * `true` si hay una comparación "a mano" de dos identificadores sueltos
 * (ninguno literal, ninguno el resultado de una llamada como
 * `siguienteMarca(...) === null`) con `===`/`!==`: la forma de
 * `actual === tipo` decidiendo el borrado, sin pasar por `siguienteMarca`,
 * sea cual sea el nombre real de las variables.
 */
export function tieneComparacionManualDeMarca(content: string): boolean {
  const limpio = quitarComentarios(content)
  const PALABRAS_RESERVADAS = new Set(['null', 'undefined', 'true', 'false'])
  const regex = /\b([A-Za-z_$][\w$]*)\s*(===|!==)\s*([A-Za-z_$][\w$]*)\b/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(limpio))) {
    const [, izquierda, , derecha] = m
    if (PALABRAS_RESERVADAS.has(izquierda) || PALABRAS_RESERVADAS.has(derecha)) continue
    return true
  }
  return false
}

/**
 * `true` si `content` tiene los CUATRO patrones de "copia local" A LA VEZ
 * (unión de tipo, etiquetas, umbral numérico y comparación manual): la
 * señal de que un archivo —sea cual sea su nombre, y esté o no en la lista
 * fija de archivos vigilados— tiene la lógica de asistencia copiada
 * entera, y no solo una coincidencia aislada de uno de los cuatro patrones
 * (que por separado puede aparecer en código sin ninguna relación con
 * asistencia: por ejemplo un `>= 3` de paginación, o un `===` cualquiera).
 * Es el chequeo que se usa en el barrido recursivo de más abajo, donde no
 * hay una lista fija de archivos "sospechosos": tiene que evitar falsos
 * positivos en el resto del código de la app.
 */
export function tieneCopiaLocalCompleta(content: string): boolean {
  return (
    tieneUnionTipoAsistenciaLocal(content) &&
    tieneEtiquetasLocal(content) &&
    tieneUmbralNumericoLocal(content) &&
    tieneComparacionManualDeMarca(content)
  )
}

const DIRECTORIOS_BARRIDOS = ['lib', 'components', 'app'] as const

/**
 * Todos los `.ts`/`.tsx` bajo `lib/`, `components/` y `app/` (el código de
 * la app), recorridos recursivamente. A propósito NO incluye `tests/` (ver
 * la cabecera de esta sección): ahí los mismos literales son fixtures
 * legítimos de los tests, no una copia de la lógica de producción.
 */
function listarArchivosDeLaApp(): string[] {
  const out: string[] = []
  function recorrer(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) {
        recorrer(full)
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        out.push(full)
      }
    }
  }
  for (const d of DIRECTORIOS_BARRIDOS) {
    recorrer(join(MOBILE_ROOT, d))
  }
  return out
}

describe('detector de copia local (fixtures en memoria: tiene que fallar de verdad)', () => {
  describe('importaAsistenciaDeCore', () => {
    it('detecta el import real (varios nombres)', () => {
      expect(
        importaAsistenciaDeCore(`import { siguienteMarca, type TipoAsistencia } from '@qps/core/asistencia'`)
      ).toBe(true)
    })

    it('detecta el import con alias (evasión a): el alias no rompe la detección', () => {
      expect(importaAsistenciaDeCore(`import { siguienteMarca as calcular } from '@qps/core/asistencia'`)).toBe(
        true
      )
    })

    it('sin import de @qps/core/asistencia: false', () => {
      expect(importaAsistenciaDeCore(`import { algo } from './otro-lugar'`)).toBe(false)
    })

    it('un comentario que menciona el módulo no cuenta como import real', () => {
      expect(importaAsistenciaDeCore(`// ver @qps/core/asistencia para la lógica`)).toBe(false)
    })
  })

  describe('tieneUnionTipoAsistenciaLocal', () => {
    it('detecta la unión con el nombre de siempre (TipoAsistencia)', () => {
      expect(tieneUnionTipoAsistenciaLocal(`type TipoAsistencia = 'voy' | 'me_interesa'`)).toBe(true)
    })

    it('evasión b: detecta la misma unión con otro nombre de tipo', () => {
      expect(tieneUnionTipoAsistenciaLocal(`type Marca = 'voy' | 'me_interesa'`)).toBe(true)
    })

    it('detecta el orden invertido', () => {
      expect(tieneUnionTipoAsistenciaLocal(`type X = 'me_interesa' | 'voy'`)).toBe(true)
    })

    it('un uso normal de los dos valores en un || (no es una unión de tipo): false', () => {
      expect(
        tieneUnionTipoAsistenciaLocal(`x = filaPropia?.kind === 'voy' || filaPropia?.kind === 'me_interesa'`)
      ).toBe(false)
    })

    it('sin ninguno de los dos valores: false', () => {
      expect(tieneUnionTipoAsistenciaLocal(`type Y = 'a' | 'b'`)).toBe(false)
    })
  })

  describe('tieneEtiquetasLocal', () => {
    it('detecta un Record casero con las dos claves', () => {
      expect(tieneEtiquetasLocal(`const ETIQUETAS = { voy: 'Voy', me_interesa: 'Me interesa' }`)).toBe(true)
    })

    it('evasión b: detecta el mismo mapa con otro nombre de variable', () => {
      expect(tieneEtiquetasLocal(`const textos = { voy: 'Voy', me_interesa: 'Me interesa' }`)).toBe(true)
    })

    it('un campo "voy: number" (no string) no cuenta por sí solo: false', () => {
      expect(tieneEtiquetasLocal(`interface CantidadesAsistencia { voy: number; meInteresa: number }`)).toBe(false)
    })

    it('solo una de las dos claves: false', () => {
      expect(tieneEtiquetasLocal(`const x = { voy: 'Voy' }`)).toBe(false)
    })
  })

  describe('tieneUmbralNumericoLocal', () => {
    it('detecta >= con un número', () => {
      expect(tieneUmbralNumericoLocal(`if (cantidad >= 3) return cantidad`)).toBe(true)
    })

    it('detecta === con un número', () => {
      expect(tieneUmbralNumericoLocal(`if (cantidad === 3) return cantidad`)).toBe(true)
    })

    it('un genérico de TypeScript (sin número) no cuenta: false', () => {
      expect(tieneUmbralNumericoLocal(`const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })`)).toBe(
        false
      )
    })

    it('un valor de estilo (sin comparación) no cuenta: false', () => {
      expect(tieneUmbralNumericoLocal(`const estilos = { boton: { paddingHorizontal: 14 } }`)).toBe(false)
    })
  })

  describe('tieneComparacionManualDeMarca', () => {
    it('detecta "actual === tipo" tal cual', () => {
      expect(tieneComparacionManualDeMarca(`if (actual === tipo) { borrar() }`)).toBe(true)
    })

    it('evasión b: detecta la misma forma con otros nombres de variable', () => {
      expect(tieneComparacionManualDeMarca(`if (previo === nuevo) { borrar() } else { upsert() }`)).toBe(true)
    })

    it('detecta con !==', () => {
      expect(tieneComparacionManualDeMarca(`if (previo !== nuevo) { upsert() }`)).toBe(true)
    })

    it('el resultado de una llamada contra null (la forma correcta, con siguienteMarca) no cuenta: false', () => {
      expect(tieneComparacionManualDeMarca(`if (siguienteMarca(actual, tipo) === null) { borrar() }`)).toBe(false)
    })

    it('comparar contra un literal de texto (lectura del kind de la base) no cuenta: false', () => {
      expect(tieneComparacionManualDeMarca(`filaPropia?.kind === 'voy'`)).toBe(false)
    })

    it('comparar un campo de estado contra un literal (como en el componente) no cuenta: false', () => {
      expect(tieneComparacionManualDeMarca(`estado.tipo === 'cargando'`)).toBe(false)
    })
  })

  describe('tieneCopiaLocalCompleta', () => {
    it('evasión c (bloqueante 1 del revisor): un tercer archivo con la copia completa, con otros nombres de variable y de tipo, se marca', () => {
      // La forma de `lib/asistencia-interno.ts` que probó el revisor: el
      // mismo tipo, las mismas etiquetas, el mismo umbral y la misma regla
      // de marcar/desmarcar que core, pero con otros nombres y sin importar
      // nada de `@qps/core/asistencia`.
      const asistenciaInterno = `
        export type MarcaInterna = 'voy' | 'me_interesa'

        export const ETIQUETAS_INTERNAS: Record<MarcaInterna, string> = {
          voy: 'Voy',
          me_interesa: 'Me interesa',
        }

        export function cantidadVisibleInterna(n: number): number | null {
          return n >= 3 ? n : null
        }

        export function siguienteMarcaInterna(previo: MarcaInterna | null, nuevo: MarcaInterna): MarcaInterna | null {
          return previo === nuevo ? null : nuevo
        }
      `
      expect(tieneCopiaLocalCompleta(asistenciaInterno)).toBe(true)
    })

    it('un archivo que solo importa de core y lo usa, sin ninguno de los cuatro patrones: false', () => {
      const archivoLimpio = `
        import { siguienteMarca, textoBoton, type TipoAsistencia } from '@qps/core/asistencia'
        export function usar(tipo: TipoAsistencia, cantidad: number) {
          return textoBoton(tipo, cantidad)
        }
      `
      expect(tieneCopiaLocalCompleta(archivoLimpio)).toBe(false)
    })

    it('un solo patrón aislado, sin relación con asistencia (umbral de paginación): false (hace falta la combinación completa)', () => {
      const paginacion = `function hayMasPaginas(cantidadCargada: number) { return cantidadCargada >= 3 }`
      expect(tieneCopiaLocalCompleta(paginacion)).toBe(false)
    })

    it('tres de los cuatro patrones, sin el cuarto: false (hace falta la combinación completa, no una coincidencia parcial)', () => {
      const incompleto = `
        type Marca = 'voy' | 'me_interesa'
        const etiquetas = { voy: 'Voy', me_interesa: 'Me interesa' }
        function umbral(n: number) { return n >= 3 ? n : null }
      `
      expect(tieneCopiaLocalCompleta(incompleto)).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// R38, tarea 38-a, vuelta 1 (revisor, bloqueante 1): barrido recursivo de
// `lib/`, `components/` y `app/` (todo el código de la app, sin `tests/`;
// ver la cabecera de esta sección) buscando `tieneCopiaLocalCompleta` en
// cualquier archivo, no solo en los dos de `ARCHIVOS_ASISTENCIA`. Esto es lo
// que agarra un tercer archivo con la copia completa, dondequiera que lo
// pongan.
// ---------------------------------------------------------------------------
describe('barrido recursivo de lib/, components/ y app/: ninguna copia local completa de asistencia fuera de core', () => {
  const archivos = listarArchivosDeLaApp()
  const relativos = archivos.map((f) => relative(MOBILE_ROOT, f))

  it('encuentra una cantidad razonable de archivos, incluidos los dos vigilados (si esto falla, el barrido se achicó y el resto de este describe no prueba nada)', () => {
    expect(archivos.length).toBeGreaterThan(30)
    expect(relativos).toContain(join('lib', 'asistencia.ts'))
    expect(relativos).toContain(join('components', 'BotonesAsistencia.tsx'))
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))('%s', (label, file) => {
    const contenido = readFileSync(file, 'utf8')
    if (tieneCopiaLocalCompleta(contenido)) {
      throw new Error(
        `${label}: tiene los cuatro patrones de una copia local completa de la lógica de asistencia ` +
          `(unión de tipo, etiquetas, umbral numérico y comparación manual) — tiene que usar ` +
          `@qps/core/asistencia en vez de reimplementarla`
      )
    }
    expect(tieneCopiaLocalCompleta(contenido)).toBe(false)
  })
})

describe.each(ARCHIVOS_ASISTENCIA)('$etiqueta: importa de @qps/core/asistencia y no tiene copia local', (caso) => {
  const contenido = readFileSync(`${MOBILE_ROOT}/${caso.ruta}`, 'utf8')

  it('importa la lógica de @qps/core/asistencia', () => {
    if (!importaAsistenciaDeCore(contenido)) {
      throw new Error(`${caso.etiqueta}: no importa de '@qps/core/asistencia'`)
    }
    expect(importaAsistenciaDeCore(contenido)).toBe(true)
  })

  it('no redeclara el tipo TipoAsistencia como unión local (con cualquier nombre)', () => {
    expect(tieneUnionTipoAsistenciaLocal(contenido)).toBe(false)
  })

  it('no tiene un mapa de etiquetas casero (voy/me_interesa -> string)', () => {
    expect(tieneEtiquetasLocal(contenido)).toBe(false)
  })

  it('no tiene un umbral numérico escrito a mano', () => {
    expect(tieneUmbralNumericoLocal(contenido)).toBe(false)
  })

  if (caso.chequearComparacionManual) {
    it('no decide el borrado comparando dos identificadores sueltos a mano (tiene que pasar por siguienteMarca)', () => {
      expect(tieneComparacionManualDeMarca(contenido)).toBe(false)
    })
  }
})
