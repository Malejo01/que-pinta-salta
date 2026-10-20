/**
 * `leerAsistencia` (R56, tarea 56-a, QPS-196): la lectura de "Voy"/Guardados
 * partida de `lib/asistencia.ts` a `lib/asistencia-lectura.ts`, para que la
 * ficha y el modal interceptado la llamen con el MISMO cliente y el MISMO
 * `auth.getUser()` que ya usan para el resto de la página (sin crear un
 * segundo cliente ni volver a autenticar). Sin red ni base: el cliente de
 * Supabase es un doble en memoria, con el mismo estilo que
 * `tests/asistencia/web.test.ts` y `tests/asistencia/guardar-voy.test.ts`.
 *
 * Qué prueba este archivo:
 *  1. `userId: null` no consulta `event_attendance` ni `user_favorites`.
 *  2. Con usuario, las tres consultas con los `select` exactos
 *     (`"voy"`, `"kind"`, `"id"`), y ninguna pide `user_id`.
 *  3. `leerAsistencia` NUNCA llama a `auth.getUser()`: recibe el `userId` ya
 *     resuelto (el doble tira si alguien lo invoca).
 *  4. Una fila vieja `me_interesa` se lee como `propia: null`.
 *  5. Si falla SOLO la lectura de `user_favorites`, no es `ok: false`.
 *  6. Detector estático: la ficha y el modal interceptado importan
 *     `leerAsistencia` (no `obtenerAsistencia`), y `lib/asistencia-lectura.ts`
 *     no tiene `"use server"`, ni crea un cliente (`createClient(`), ni
 *     llama a `auth.getUser`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { leerAsistencia, type SupabaseServerClient } from '../../lib/asistencia-lectura'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Doble de Supabase: igual estilo que construirCliente() de web.test.ts,
// pero sin `auth.getUser` real (acá tira si alguien lo llama, porque
// `leerAsistencia` no tiene que invocarlo nunca: recibe el userId ya
// resuelto por quien la llama).
// ---------------------------------------------------------------------------
interface ConfigLectura {
  countsData?: { voy: number } | null
  countsError?: unknown
  propiaData?: { kind: string } | null
  propiaError?: unknown
  guardadoData?: { id: string } | null
  guardadoError?: unknown
}

function construirSupabaseLectura(config: ConfigLectura) {
  const tablasConsultadas: string[] = []
  const selects: Array<{ tabla: string; columnas: string }> = []

  const from = vi.fn((tabla: string) => {
    tablasConsultadas.push(tabla)

    if (tabla === 'event_attendance_counts') {
      return {
        select: (columnas: string) => {
          selects.push({ tabla, columnas })
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: config.countsData ?? { voy: 0 }, error: config.countsError ?? null }),
            }),
          }
        },
      }
    }

    if (tabla === 'event_attendance') {
      return {
        select: (columnas: string) => {
          selects.push({ tabla, columnas })
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: config.propiaData ?? null, error: config.propiaError ?? null }),
            }),
          }
        },
      }
    }

    if (tabla === 'user_favorites') {
      return {
        select: (columnas: string) => {
          selects.push({ tabla, columnas })
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: config.guardadoData ?? null, error: config.guardadoError ?? null }),
              }),
            }),
          }
        },
      }
    }

    throw new Error(`tabla inesperada en el doble de lectura: ${tabla}`)
  })

  const supabase = {
    auth: {
      getUser: () => {
        throw new Error('leerAsistencia no tiene que llamar a auth.getUser(): recibe el userId ya resuelto')
      },
    },
    from,
  } as unknown as SupabaseServerClient

  return { supabase, from, selects, tablasConsultadas }
}

// ---------------------------------------------------------------------------
// 1. userId: null no consulta event_attendance ni user_favorites.
// ---------------------------------------------------------------------------
describe('leerAsistencia: sin userId', () => {
  it('cantidades públicas, propia null, guardado false, y solo se consulta event_attendance_counts', async () => {
    const { supabase, tablasConsultadas } = construirSupabaseLectura({ countsData: { voy: 7 } })

    const resultado = await leerAsistencia(supabase, null, 'evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 7 }, propia: null, guardado: false })
    expect(tablasConsultadas).toEqual(['event_attendance_counts'])
  })
})

// ---------------------------------------------------------------------------
// 2. Con usuario: las tres consultas, con los select exactos, nunca user_id.
// ---------------------------------------------------------------------------
describe('leerAsistencia: con userId', () => {
  it('hace las tres consultas con los select exactos ("voy", "kind", "id"), y ninguna pide user_id', async () => {
    const { supabase, selects } = construirSupabaseLectura({
      countsData: { voy: 5 },
      propiaData: { kind: 'voy' },
      guardadoData: { id: 'fav-1' },
    })

    const resultado = await leerAsistencia(supabase, 'usuario-1', 'evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 5 }, propia: 'voy', guardado: true })
    expect(selects).toEqual([
      { tabla: 'event_attendance_counts', columnas: 'voy' },
      { tabla: 'event_attendance', columnas: 'kind' },
      { tabla: 'user_favorites', columnas: 'id' },
    ])
    for (const { columnas } of selects) {
      expect(columnas).not.toMatch(/\buser_id\b/)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Nunca llama a auth.getUser(): el doble tira si alguien lo invoca.
// ---------------------------------------------------------------------------
describe('leerAsistencia: nunca llama a auth.getUser()', () => {
  it('con userId, el resultado sale bien (si hubiera llamado a auth.getUser(), el doble habría tirado y esto no sería ok:true)', async () => {
    const { supabase } = construirSupabaseLectura({ countsData: { voy: 0 }, propiaData: null, guardadoData: null })

    const resultado = await leerAsistencia(supabase, 'usuario-2', 'evento-de-prueba-1')

    expect(resultado.ok).toBe(true)
  })

  it('sin userId, también sale bien sin llamar a auth.getUser()', async () => {
    const { supabase } = construirSupabaseLectura({ countsData: { voy: 0 } })

    const resultado = await leerAsistencia(supabase, null, 'evento-de-prueba-1')

    expect(resultado.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. Una fila vieja "me_interesa" se lee como propia: null.
// ---------------------------------------------------------------------------
describe('leerAsistencia: compatibilidad con filas viejas', () => {
  it('kind "me_interesa" (valor viejo, ya desaparecido del modelo) se lee como propia: null', async () => {
    const { supabase } = construirSupabaseLectura({
      propiaData: { kind: 'me_interesa' },
      guardadoData: null,
      countsData: { voy: 0 },
    })

    const resultado = await leerAsistencia(supabase, 'usuario-3', 'evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 0 }, propia: null, guardado: false })
  })
})

// ---------------------------------------------------------------------------
// 5. Si falla SOLO user_favorites, no es ok:false (errar del lado seguro).
// ---------------------------------------------------------------------------
describe('leerAsistencia: falla aislada de user_favorites', () => {
  it('guardado queda en false, pero el resto de la fila (incluido ok:true) sigue andando', async () => {
    const { supabase } = construirSupabaseLectura({
      propiaData: { kind: 'voy' },
      guardadoError: { code: '42501', message: 'detalle interno' },
      countsData: { voy: 2 },
    })

    const resultado = await leerAsistencia(supabase, 'usuario-4', 'evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 2 }, propia: 'voy', guardado: false })
    expect(console.error).toHaveBeenCalled()
  })
})

// ===========================================================================
// 6. Detector estático: la ficha y el modal interceptado leen con
// leerAsistencia (no obtenerAsistencia), y lib/asistencia-lectura.ts no es
// una server action ni crea su propio cliente/sesión.
//
// Importante: se afirma sobre el archivo SIN COMENTARIOS. Si un comentario
// que explica la regla nombrara justo lo prohibido (p. ej. "esto NO llama a
// auth.getUser"), un detector que mirara el texto crudo pasaría en verde con
// el código ya roto — es un error que ya pasó dos veces en esta ronda.
// ===========================================================================
const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** Comentarios de línea y de bloque (incluidos los JSDoc) vaciados. */
function quitarComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

describe('detector estático (sin comentarios): quitarComentarios de verdad vacía los JSDoc y los // de línea', () => {
  it('un bloque /** ... */ desaparece', () => {
    expect(quitarComentarios('/** auth.getUser mencionado en un comentario */\nconst x = 1')).not.toContain('auth.getUser')
  })

  it('un comentario // de línea desaparece', () => {
    expect(quitarComentarios('// createClient( mencionado en un comentario\nconst x = 1')).not.toContain('createClient(')
  })
})

describe('detector estático: la ficha y el modal interceptado importan leerAsistencia (no obtenerAsistencia)', () => {
  it.each([
    'app/evento/[id]/page.tsx',
    'app/@modal/(.)evento/[id]/page.tsx',
  ])('%s', (ruta) => {
    const contenido = quitarComentarios(readFileSync(`${WEB_ROOT}/${ruta}`, 'utf8'))

    expect(contenido).toMatch(
      /import\s*\{[^}]*\bleerAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-lectura['"]/,
    )
    expect(contenido).not.toMatch(/\bobtenerAsistencia\b/)
  })
})

describe('detector estático: lib/asistencia-lectura.ts no es una server action ni crea su propio cliente/sesión', () => {
  const contenido = quitarComentarios(readFileSync(`${WEB_ROOT}/lib/asistencia-lectura.ts`, 'utf8'))

  it('no tiene la directiva "use server"', () => {
    expect(contenido).not.toMatch(/use server/)
  })

  it('no crea un cliente (ningún "createClient(" como llamada)', () => {
    expect(contenido).not.toMatch(/createClient\(/)
  })

  it('no llama a auth.getUser', () => {
    expect(contenido).not.toMatch(/auth\.getUser/)
  })
})
