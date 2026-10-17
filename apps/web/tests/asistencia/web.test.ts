/**
 * "Voy" / "Me interesa" en la ficha de la web (R38, tarea 38-b):
 * `lib/asistencia.ts` y `components/botones-asistencia.tsx`. Sin red ni
 * base: `@/lib/supabase/server` va mockeado (mismo patrón que
 * `tests/radar/update-settings-invalida.test.ts`).
 *
 * Cuatro bloques:
 *  1. Sin sesión no se escribe nada (ni se llama a `from()`).
 *  2. El `user_id` del upsert siempre sale de `auth.getUser()`, nunca de un
 *     argumento (la firma de `marcarAsistencia` no tiene un tercer
 *     parámetro; aunque se lo pase, JS lo ignora).
 *  3. Detector estático, recorriendo el código real de `apps/web`: ningún
 *     `select` sobre `event_attendance` pide `user_id` ni `*`, y la única
 *     tabla/vista que expone "voy"/"me_interesa" es
 *     `event_attendance_counts`.
 *  4. Detector estático: `lib/asistencia.ts` y
 *     `components/botones-asistencia.tsx` importan la lógica de
 *     `@qps/core/asistencia` y no tienen su propia copia (mismo criterio
 *     que `apps/mobile/tests/asistencia.test.ts`).
 *
 * Vuelta 1 (dos revisores, tres bloqueantes sobre 76cd928):
 *  - Bloqueante 1: si la escritura (upsert/delete) sale bien, `marcarAsistencia`
 *    nunca devuelve `ok: false`, aunque falle la relectura de cantidades de
 *    DESPUÉS de escribir (ver el describe "si la escritura sale bien...").
 *  - Bloqueante 2: los botones solo se muestran para eventos PUBLISHED
 *    (`debenMostrarseBotonesAsistencia`, ver el describe de ese nombre).
 *  - Bloqueante 3: el barrido de "copia local" ahora recorre TODO el código
 *    de `apps/web` (no solo los dos archivos vigilados), con el mismo
 *    criterio que `apps/mobile/tests/asistencia.test.ts` después de
 *    `e73e0f2` (ver el describe "barrido recursivo...").
 */
import { readFileSync, readdirSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))

import { marcarAsistencia, obtenerAsistencia } from '../../lib/asistencia'
import { debenMostrarseBotonesAsistencia } from '../../lib/asistencia-visibilidad'

beforeEach(() => {
  createClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Doble de Supabase para `event_attendance` / `event_attendance_counts`.
// ---------------------------------------------------------------------------
interface RespuestaCounts {
  data?: { voy: number; me_interesa: number } | null
  error?: unknown
  /** Si es `true`, el `maybeSingle()` tira una excepción en vez de devolver `{ data, error }`. */
  lanzar?: unknown
}

interface ConfigDoble {
  user: { id: string } | null
  propiaData?: { kind: string } | null
  propiaError?: unknown
  upsertError?: unknown
  deleteError?: unknown
  countsData?: { voy: number; me_interesa: number } | null
  /**
   * Respuestas sucesivas para `event_attendance_counts`.select(...).maybeSingle():
   * la primera llamada usa `countsSecuencia[0]`, la segunda `countsSecuencia[1]`,
   * etc. (si se agotan, se repite la última). Si no se da, se usa siempre
   * `countsData` (comportamiento previo, sin distinguir llamadas).
   * Existe para el bloqueante 1: simular "la relectura de DESPUÉS de
   * escribir falla, pero la de ANTES de escribir anduvo bien".
   */
  countsSecuencia?: RespuestaCounts[]
}

function construirCliente(config: ConfigDoble) {
  const llamadas = {
    tablas: [] as string[],
    selects: [] as Array<{ tabla: string; columnas: string }>,
    upserts: [] as unknown[],
    deletes: 0,
  }

  let llamadasCounts = 0

  const from = vi.fn((tabla: string) => {
    llamadas.tablas.push(tabla)

    if (tabla === 'event_attendance') {
      return {
        select: (columnas: string) => {
          llamadas.selects.push({ tabla, columnas })
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: config.propiaData ?? null,
                error: config.propiaError ?? null,
              }),
            }),
          }
        },
        delete: () => ({
          eq: async () => {
            llamadas.deletes++
            return { error: config.deleteError ?? null }
          },
        }),
        upsert: async (valores: unknown) => {
          llamadas.upserts.push(valores)
          return { error: config.upsertError ?? null }
        },
      }
    }

    if (tabla === 'event_attendance_counts') {
      return {
        select: (columnas: string) => {
          llamadas.selects.push({ tabla, columnas })
          return {
            eq: () => ({
              maybeSingle: async () => {
                const indice = llamadasCounts
                llamadasCounts++
                if (config.countsSecuencia && config.countsSecuencia.length > 0) {
                  const respuesta = config.countsSecuencia[Math.min(indice, config.countsSecuencia.length - 1)]
                  if (respuesta.lanzar) throw respuesta.lanzar
                  return { data: respuesta.data ?? null, error: respuesta.error ?? null }
                }
                return { data: config.countsData ?? { voy: 0, me_interesa: 0 }, error: null }
              },
            }),
          }
        },
      }
    }

    throw new Error(`tabla inesperada en el doble de asistencia (web): ${tabla}`)
  })

  return {
    cliente: {
      auth: { getUser: async () => ({ data: { user: config.user }, error: null }) },
      from,
    },
    llamadas,
  }
}

/** Un `from()` que revienta el test si se llama: para probar "no escribe nada". */
function clienteQueNuncaDeberiaLlamarFrom(user: { id: string } | null) {
  const from = vi.fn((tabla: string) => {
    throw new Error(`no debería llamar a from("${tabla}"): no tiene que tocar la base`)
  })
  return {
    cliente: { auth: { getUser: async () => ({ data: { user }, error: null }) }, from },
    from,
  }
}

// ---------------------------------------------------------------------------
// 1. Sin sesión no se escribe nada.
// ---------------------------------------------------------------------------
describe('marcarAsistencia: sin sesión no se escribe nada', () => {
  it('AUTH_REQUIRED, y from() no se llama ni una vez', async () => {
    const { cliente, from } = clienteQueNuncaDeberiaLlamarFrom(null)
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'AUTH_REQUIRED' })
    expect(from).not.toHaveBeenCalled()
  })

  it('con auth.getUser() devolviendo un error (sin user): también AUTH_REQUIRED, sin tocar from()', async () => {
    const from = vi.fn((tabla: string) => {
      throw new Error(`no debería llamar a from("${tabla}")`)
    })
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: { message: 'sin sesión' } }) },
      from,
    })

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'me_interesa')

    expect(resultado).toEqual({ ok: false, error: 'AUTH_REQUIRED' })
    expect(from).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// tipo inválido: no escribe nada, ni siquiera llega a pedir sesión.
// ---------------------------------------------------------------------------
describe('marcarAsistencia: un tipo que no es de core no escribe nada', () => {
  it('"bailar" (no es "voy" ni "me_interesa"): INVALID, sin llamar a from()', async () => {
    const { cliente, from } = clienteQueNuncaDeberiaLlamarFrom({ id: 'usuario-de-prueba' })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'bailar' as unknown as 'voy')

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(from).not.toHaveBeenCalled()
  })

  it('cadena vacía: INVALID', async () => {
    const { cliente, from } = clienteQueNuncaDeberiaLlamarFrom({ id: 'usuario-de-prueba' })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', '' as unknown as 'voy')

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(from).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2. El user_id siempre sale de la sesión, nunca de un argumento.
// ---------------------------------------------------------------------------
describe('marcarAsistencia: el user_id siempre sale de auth.getUser()', () => {
  it('no hay un tercer parámetro en la firma (aridad 2: eventId, tipo)', () => {
    expect(marcarAsistencia.length).toBe(2)
  })

  it('la firma declarada en el archivo no tiene ningún parámetro de user_id/userId', () => {
    const contenido = readFileSync(new URL('../../lib/asistencia.ts', import.meta.url), 'utf8')
    const firma = /export\s+async\s+function\s+marcarAsistencia\s*\(([^)]*)\)/.exec(contenido)
    expect(firma, 'no se encontró la firma de marcarAsistencia en lib/asistencia.ts').not.toBeNull()
    expect(firma![1]).not.toMatch(/user_?id/i)
  })

  it('primera marca (actual null): el upsert usa el id de getUser(), con el kind pedido', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-1' },
      propiaData: null,
      countsData: { voy: 1, me_interesa: 0 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 1, meInteresa: 0 }, propia: 'voy' })
    expect(llamadas.upserts).toEqual([{ user_id: 'usuario-sesion-1', event_id: 'evento-de-prueba-1', kind: 'voy' }])
    expect(llamadas.deletes).toBe(0)
  })

  it('pasar un tercer argumento ("otro user_id") no cambia nada: el upsert sigue usando el id de la sesión', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-2' },
      propiaData: null,
      countsData: { voy: 1, me_interesa: 0 },
    })
    createClient.mockResolvedValue(cliente)

    // La firma real es (eventId, tipo): este tercer argumento no existe en
    // el tipo, pero JS lo ignora en tiempo de ejecución — justamente lo que
    // se quiere demostrar (nunca se usa como user_id).
    const marcarConArgumentoExtra = marcarAsistencia as unknown as (
      eventId: string,
      tipo: 'voy',
      userIdFalso: string,
    ) => Promise<unknown>
    await marcarConArgumentoExtra('evento-de-prueba-1', 'voy', 'usuario-hackeado')

    expect(llamadas.upserts).toEqual([
      { user_id: 'usuario-sesion-2', event_id: 'evento-de-prueba-1', kind: 'voy' },
    ])
  })

  it('actual === tipo: borra la fila propia (nunca upsert), y el delete no filtra por user_id (lo acota la RLS)', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-3' },
      propiaData: { kind: 'voy' },
      countsData: { voy: 0, me_interesa: 0 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 0, meInteresa: 0 }, propia: null })
    expect(llamadas.deletes).toBe(1)
    expect(llamadas.upserts).toHaveLength(0)
  })

  it('actual !== tipo: upsert cambia el kind (no hace delete)', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-4' },
      propiaData: { kind: 'voy' },
      countsData: { voy: 0, me_interesa: 1 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'me_interesa')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 0, meInteresa: 1 }, propia: 'me_interesa' })
    expect(llamadas.upserts).toEqual([
      { user_id: 'usuario-sesion-4', event_id: 'evento-de-prueba-1', kind: 'me_interesa' },
    ])
    expect(llamadas.deletes).toBe(0)
  })

  it('la marca actual se lee de la base, no la decide el cliente: si la base dice "voy" y se toca "voy", borra, aunque nadie le dijera la marca previa', async () => {
    // No hay ningún argumento de "marca previa" en marcarAsistencia(eventId,
    // tipo): la única fuente es la lectura a `event_attendance` que hace la
    // propia función.
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-5' },
      propiaData: { kind: 'voy' },
      countsData: { voy: 0, me_interesa: 0 },
    })
    createClient.mockResolvedValue(cliente)

    await marcarAsistencia('evento-de-prueba-1', 'voy')

    expect(llamadas.selects.some((s) => s.tabla === 'event_attendance')).toBe(true)
    expect(llamadas.deletes).toBe(1)
  })

  it('error de la base al leer la marca actual: DB_ERROR, sin escribir nada', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-6' },
      propiaError: { code: '42501', message: 'detalle interno de postgres' },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'DB_ERROR' })
    expect(JSON.stringify(resultado)).not.toContain('detalle interno de postgres')
    expect(llamadas.upserts).toHaveLength(0)
    expect(llamadas.deletes).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Bloqueante 1 (vuelta 1, revisor): si la escritura salió bien, la función
// NUNCA devuelve `ok: false`, aunque falle la relectura de cantidades de
// DESPUÉS de escribir. El bug original: el upsert/delete andaba, la
// relectura de después fallaba -> DB_ERROR con la marca ya guardada; la
// pantalla seguía mostrando "sin marca" y, al tocar otra vez, se borraba la
// marca que acababa de quedar sin que nadie se enterara.
// ---------------------------------------------------------------------------
describe('marcarAsistencia: si la escritura sale bien, nunca devuelve error (bloqueante 1)', () => {
  it(
    'primer select de cantidades (antes de escribir) anda, la escritura anda, el SEGUNDO select ' +
      '(después de escribir) falla: ok:true, con la marca recién escrita y las cantidades leídas ANTES de escribir',
    async () => {
      const { cliente, llamadas } = construirCliente({
        user: { id: 'usuario-sesion-7' },
        propiaData: null, // sin marca: "voy" -> upsert
        countsSecuencia: [
          { data: { voy: 5, me_interesa: 2 } }, // antes de escribir: anda
          { error: { code: '42501', message: 'detalle interno de postgres (segundo select)' } }, // después: falla
        ],
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

      // Si este test falla con `{ ok: false, error: 'DB_ERROR' }`, es
      // exactamente el bug del revisor: la escritura quedó hecha (ver el
      // upsert más abajo) pero la función igual reporta error.
      expect(resultado).toEqual({ ok: true, cantidades: { voy: 5, meInteresa: 2 }, propia: 'voy' })
      expect(llamadas.upserts).toEqual([
        { user_id: 'usuario-sesion-7', event_id: 'evento-de-prueba-1', kind: 'voy' },
      ])
      // El error de la relectura se registra (no se pierde en silencio).
      expect(console.error).toHaveBeenCalled()
    },
  )

  it(
    'variante con delete: actual ya era "voy", se vuelve a tocar "voy" (borra); la relectura de ' +
      'después falla igual: ok:true, propia: null, con las cantidades de antes de escribir',
    async () => {
      const { cliente, llamadas } = construirCliente({
        user: { id: 'usuario-sesion-8' },
        propiaData: { kind: 'voy' },
        countsSecuencia: [
          { data: { voy: 3, me_interesa: 1 } },
          { error: { code: '42501', message: 'falla la segunda lectura' } },
        ],
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

      expect(resultado).toEqual({ ok: true, cantidades: { voy: 3, meInteresa: 1 }, propia: null })
      expect(llamadas.deletes).toBe(1)
    },
  )

  it(
    'la segunda relectura tira una EXCEPCIÓN (no un error de Supabase) después de escribir bien: ' +
      'también ok:true con las cantidades de antes, nunca escapa como un error no controlado',
    async () => {
      const { cliente } = construirCliente({
        user: { id: 'usuario-sesion-9' },
        propiaData: null,
        countsSecuencia: [{ data: { voy: 1, me_interesa: 0 } }, { lanzar: new Error('red caída') }],
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

      expect(resultado).toEqual({ ok: true, cantidades: { voy: 1, meInteresa: 0 }, propia: 'voy' })
    },
  )

  it(
    'propiedad general: con la escritura exitosa (upsert o delete sin error), ningún camino de ' +
      'fallas en las lecturas de cantidades (antes, después, ambas, ninguna, o una excepción) ' +
      'devuelve `ok: false`',
    async () => {
      const escenarios: Array<{ etiqueta: string; countsSecuencia?: RespuestaCounts[] }> = [
        { etiqueta: 'las dos lecturas de cantidades andan', countsSecuencia: [{ data: { voy: 1, me_interesa: 0 } }, { data: { voy: 1, me_interesa: 0 } }] },
        { etiqueta: 'antes falla, después anda', countsSecuencia: [{ error: { code: '42501', message: 'x' } }, { data: { voy: 1, me_interesa: 0 } }] },
        { etiqueta: 'antes anda, después falla', countsSecuencia: [{ data: { voy: 1, me_interesa: 0 } }, { error: { code: '42501', message: 'x' } }] },
        { etiqueta: 'las dos lecturas de cantidades fallan', countsSecuencia: [{ error: { code: '42501', message: 'x' } }, { error: { code: '42501', message: 'y' } }] },
        { etiqueta: 'antes anda, después tira una excepción', countsSecuencia: [{ data: { voy: 1, me_interesa: 0 } }, { lanzar: new Error('boom') }] },
        { etiqueta: 'sin countsSecuencia (comportamiento por defecto)' },
      ]

      for (const escenario of escenarios) {
        const { cliente } = construirCliente({
          user: { id: 'usuario-sesion-propiedad' },
          propiaData: null,
          countsSecuencia: escenario.countsSecuencia,
        })
        createClient.mockResolvedValue(cliente)

        const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

        expect(resultado.ok, `escenario "${escenario.etiqueta}": se esperaba ok:true`).toBe(true)
      }
    },
  )
})

// ---------------------------------------------------------------------------
// obtenerAsistencia: sin sesión no consulta event_attendance.
// ---------------------------------------------------------------------------
describe('obtenerAsistencia: sin sesión', () => {
  it('cantidades públicas, propia null, y event_attendance nunca se consulta', async () => {
    const llamadasTabla: string[] = []
    const from = vi.fn((tabla: string) => {
      llamadasTabla.push(tabla)
      if (tabla === 'event_attendance_counts') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { voy: 4, me_interesa: 1 }, error: null }) }),
          }),
        }
      }
      throw new Error(`no debería consultar "${tabla}" sin sesión`)
    })
    createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) }, from })

    const resultado = await obtenerAsistencia('evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 4, meInteresa: 1 }, propia: null })
    expect(llamadasTabla).toEqual(['event_attendance_counts'])
  })
})

// ---------------------------------------------------------------------------
// Bloqueante 2 (vuelta 1, revisor): los botones solo tienen sentido en
// eventos PUBLISHED, porque `event_attendance_counts` solo agrega votos de
// eventos PUBLISHED. En CANCELLED/PAST el contador quedaba clavado en 0
// aunque los botones se mostraran y se pudieran tocar.
//
// No se puede renderizar `app/evento/[id]/page.tsx` ni
// `components/event-detail-page.tsx` en este test (no hay
// `@testing-library/react` en el proyecto y son Server/Client Components con
// Supabase, Next.js, etc. de por medio). En su lugar: (a) se prueba
// directamente la función pura `debenMostrarseBotonesAsistencia`, que es la
// ÚNICA fuente de verdad que deciden ambos archivos, y (b) un detector
// estático sobre el código fuente de esos dos archivos que confirma que
// efectivamente LLAMAN a esa función en el lugar que importa (si alguno de
// los dos dejara de llamarla, este detector lo marca en rojo, que es
// exactamente el bug original: contador clavado en 0 en eventos
// CANCELLED/PAST porque los botones se siguen mostrando).
// ---------------------------------------------------------------------------
describe('debenMostrarseBotonesAsistencia: solo PUBLISHED', () => {
  it('PUBLISHED: true', () => {
    expect(debenMostrarseBotonesAsistencia('PUBLISHED')).toBe(true)
  })

  it('CANCELLED: false', () => {
    expect(debenMostrarseBotonesAsistencia('CANCELLED')).toBe(false)
  })

  it('PAST: false', () => {
    expect(debenMostrarseBotonesAsistencia('PAST')).toBe(false)
  })

  it('DRAFT (u otro estado cualquiera): false', () => {
    expect(debenMostrarseBotonesAsistencia('DRAFT')).toBe(false)
    expect(debenMostrarseBotonesAsistencia('')).toBe(false)
  })
})

describe('detector estático: page.tsx y event-detail-page.tsx usan debenMostrarseBotonesAsistencia para gatear los botones', () => {
  const WEB_ROOT_LOCAL = fileURLToPath(new URL('../../', import.meta.url))
  const contenidoPage = readFileSync(`${WEB_ROOT_LOCAL}/app/evento/[id]/page.tsx`, 'utf8')
  const contenidoEventDetail = readFileSync(`${WEB_ROOT_LOCAL}/components/event-detail-page.tsx`, 'utf8')

  it(
    'app/evento/[id]/page.tsx: la asignación de `cantidadesAsistencia` llama a debenMostrarseBotonesAsistencia ' +
      '(si esto no matchea, alguien sacó el chequeo y volvió a pasar las cantidades siempre, aunque el evento ' +
      'no sea PUBLISHED: el bug original)',
    () => {
      expect(contenidoPage).toMatch(
        /const\s+cantidadesAsistencia\s*=\s*[\s\S]{0,120}?debenMostrarseBotonesAsistencia\s*\(/,
      )
    },
  )

  it('app/evento/[id]/page.tsx: importa debenMostrarseBotonesAsistencia de "@/lib/asistencia-visibilidad" (una sola fuente de verdad, no una copia)', () => {
    expect(contenidoPage).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })

  it(
    'components/event-detail-page.tsx: la condición que dibuja <BotonesAsistencia /> llama a ' +
      'debenMostrarseBotonesAsistencia (defensa en profundidad)',
    () => {
      expect(contenidoEventDetail).toMatch(
        /\{\s*cantidadesAsistencia\s*&&\s*debenMostrarseBotonesAsistencia\s*\([^)]*\)\s*&&[\s\S]{0,80}?<BotonesAsistencia/,
      )
    },
  )

  it('components/event-detail-page.tsx: importa debenMostrarseBotonesAsistencia de "@/lib/asistencia-visibilidad"', () => {
    expect(contenidoEventDetail).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })

  // Vuelta 2: la función se mudó de `lib/asistencia.ts` a
  // `lib/asistencia-visibilidad.ts` porque el primero es un módulo
  // `"use server"` y ahí todos los exports tienen que ser `async` (Next hace
  // fallar el build, y ni `tsc` ni Vitest lo ven). Esta guarda deja en rojo
  // el día que alguien vuelva a exportar algo que no sea una función `async`
  // desde ese archivo.
  it('lib/asistencia.ts ("use server"): todos sus exports son funciones async (si no, falla el build de Next)', () => {
    const contenidoLib = readFileSync(`${WEB_ROOT_LOCAL}/lib/asistencia.ts`, 'utf8')
    expect(contenidoLib.startsWith('"use server"')).toBe(true)

    const exportsDeValor = [...contenidoLib.matchAll(/^export\s+(?!type\b|interface\b)(\w+)/gm)].map((m) => m[1])
    expect(exportsDeValor.length).toBeGreaterThan(0)
    for (const palabra of exportsDeValor) {
      expect(palabra).toBe('async')
    }
  })
})

// ===========================================================================
// 3. Detector estático: "solo cantidades, nunca quién".
//
// Recorre el código real de apps/web (no los tests) y verifica que ningún
// `select` sobre `event_attendance` pida `user_id` (ni `*`), y que la única
// tabla/vista de la que se leen "voy"/"me_interesa" sea
// `event_attendance_counts`.
// ===========================================================================

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto. */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

interface FromSelect {
  tabla: string
  columnas: string | null
}

/**
 * Empareja cada `.from('tabla')` del archivo con el primer `.select(...)`
 * de su propia cadena (el texto hasta el siguiente `.from(...)`, o el final
 * del archivo). Si esa cadena no tiene `.select(...)` (por ejemplo, un
 * `.delete()`), `columnas` queda en `null`.
 */
function extraerFromSelect(contenido: string): FromSelect[] {
  const limpio = quitarComentarios(contenido)
  const fromRegex = /\.from\(\s*(['"`])([\w.]+)\1\s*\)/g
  const posiciones: Array<{ indexInicio: number; indexFin: number; tabla: string }> = []
  let m: RegExpExecArray | null
  while ((m = fromRegex.exec(limpio))) {
    posiciones.push({ indexInicio: m.index, indexFin: m.index + m[0].length, tabla: m[2] })
  }

  return posiciones.map((pos, i) => {
    const finDeCadena = i + 1 < posiciones.length ? posiciones[i + 1].indexInicio : limpio.length
    const cadena = limpio.slice(pos.indexFin, finDeCadena)
    const selectMatch = /\.select\(\s*(['"`])([\s\S]*?)\1\s*\)/.exec(cadena)
    return { tabla: pos.tabla, columnas: selectMatch ? selectMatch[2] : null }
  })
}

/** `null` si el select es legítimo; un mensaje si pide `user_id` o `*` sobre `event_attendance`. */
function selectProblematicoSobreAsistencia(tabla: string, columnas: string): string | null {
  if (tabla !== 'event_attendance') return null
  if (/\*/.test(columnas)) return `select con "*" sobre event_attendance (columnas: "${columnas}")`
  if (/\buser_id\b/.test(columnas)) return `select con "user_id" sobre event_attendance (columnas: "${columnas}")`
  return null
}

/** `true` si el string de columnas trae tanto "voy" como "me_interesa" (en cualquier orden/espaciado). */
function tieneColumnasDeCantidades(columnas: string): boolean {
  return /\bvoy\b/.test(columnas) && /\bme_interesa\b/.test(columnas)
}

/** Recorre recursivamente .ts/.tsx bajo `dir`, sin node_modules/.next/tests. */
function listarArchivosDeCodigo(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'tests', '.git'].includes(entrada.name)) continue
    const ruta = `${dir}/${entrada.name}`
    if (entrada.isDirectory()) {
      listarArchivosDeCodigo(ruta, acumulado)
    } else if (/\.(ts|tsx)$/.test(entrada.name) && !entrada.name.endsWith('.d.ts')) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

describe('extraerFromSelect / selectProblematicoSobreAsistencia / tieneColumnasDeCantidades (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
  it('detecta select("user_id, kind") sobre event_attendance', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance').select('user_id, kind').eq('event_id', id)`)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).not.toBeNull()
  })

  it('detecta select("*") sobre event_attendance, con comillas dobles', () => {
    const [r] = extraerFromSelect(`supabase.from("event_attendance").select("*")`)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).not.toBeNull()
  })

  it('un select("kind") legítimo sobre event_attendance no dispara nada', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance').select('kind').eq('event_id', id).maybeSingle()`)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).toBeNull()
  })

  it('un select sobre otra tabla con "user_id" no es un problema de event_attendance', () => {
    const [r] = extraerFromSelect(`supabase.from('user_favorites').select('user_id, event_id')`)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).toBeNull()
  })

  it('evasión: cantidades leídas de otra tabla (event_attendance_totals) con las mismas columnas: lo detecta tieneColumnasDeCantidades, y la tabla no es la vista pública', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance_totals').select('voy, me_interesa').eq('event_id', id)`)
    expect(tieneColumnasDeCantidades(r.columnas!)).toBe(true)
    expect(r.tabla).not.toBe('event_attendance_counts')
  })

  it('cantidades leídas de event_attendance_counts: la tabla es exactamente la vista pública', () => {
    const [r] = extraerFromSelect(
      `supabase.from('event_attendance_counts').select('voy, me_interesa').eq('event_id', id).maybeSingle()`,
    )
    expect(tieneColumnasDeCantidades(r.columnas!)).toBe(true)
    expect(r.tabla).toBe('event_attendance_counts')
  })

  it('evasión: orden invertido ("me_interesa, voy") sigue contando como columnas de cantidades', () => {
    const [r] = extraerFromSelect(`supabase.from('otratabla').select('me_interesa, voy')`)
    expect(tieneColumnasDeCantidades(r.columnas!)).toBe(true)
  })

  it('dos .from() distintos en el mismo archivo no se confunden entre sí', () => {
    const fixture = `
      a.from('event_attendance').select('kind').eq('event_id', id).maybeSingle()
      b.from('event_attendance_counts').select('voy, me_interesa').eq('event_id', id).maybeSingle()
    `
    const resultados = extraerFromSelect(fixture)
    expect(resultados).toEqual([
      { tabla: 'event_attendance', columnas: 'kind' },
      { tabla: 'event_attendance_counts', columnas: 'voy, me_interesa' },
    ])
  })

  it('un .from() sin .select() en su cadena (por ejemplo, un delete) da columnas null, no revienta', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance').delete().eq('event_id', id)`)
    expect(r.columnas).toBeNull()
  })

  it('un comentario que menciona "user_id" no cuenta (se descarta antes de buscar)', () => {
    const fixture = `// nunca se pide user_id\nsupabase.from('event_attendance').select('kind').eq('event_id', id)`
    const [r] = extraerFromSelect(fixture)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).toBeNull()
  })
})

describe('detector estático: ningún select sobre event_attendance pide user_id o "*" (código real de apps/web)', () => {
  const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
  const archivos = listarArchivosDeCodigo(WEB_ROOT)

  it('recorrió al menos un archivo (si esto da 0, el detector no está mirando nada)', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it('ningún select sobre event_attendance tiene user_id ni "*"', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas === null) continue
        const problema = selectProblematicoSobreAsistencia(tabla, columnas)
        if (problema) violaciones.push(`${archivo}: ${problema}`)
      }
    }
    expect(violaciones).toEqual([])
  })
})

describe('detector estático: la única tabla/vista de la que se leen "voy"/"me_interesa" es event_attendance_counts', () => {
  const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
  const archivos = listarArchivosDeCodigo(WEB_ROOT)

  it('ningún select de columnas de cantidades aparece sobre otra tabla', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas === null) continue
        if (tieneColumnasDeCantidades(columnas) && tabla !== 'event_attendance_counts') {
          violaciones.push(`${archivo}: select de cantidades sobre "${tabla}" (columnas: "${columnas}")`)
        }
      }
    }
    expect(violaciones).toEqual([])
  })

  it('al menos un archivo real sí lee cantidades de event_attendance_counts (si esto da 0, el detector de arriba pasaría por no mirar nada)', () => {
    let encontrado = false
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas && tieneColumnasDeCantidades(columnas) && tabla === 'event_attendance_counts') {
          encontrado = true
        }
      }
    }
    expect(encontrado).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// No bloqueante (vuelta 1, revisor): dos huecos conocidos del detector de
// arriba. Hoy ningún archivo real de apps/web usa este patrón (ni
// `const TABLA = 'event_attendance'; supabase.from(TABLA)…` ni
// `const COLUMNAS = 'user_id, kind'; …select(COLUMNAS)…`), así que no hay
// ningún falso negativo real ahora mismo — pero si algún día alguien
// escribe el código así, el detector de arriba NO lo va a agarrar.
//
// Estos dos tests documentan el límite a propósito: afirman que HOY no se
// detecta. El día que se cierre el hueco (resolviendo identificadores a su
// valor constante en `extraerFromSelect`), estos dos tests se van a romper
// a propósito — hay que ACTUALIZARLOS para que esperen la detección, no
// revertir el cierre del hueco.
// ---------------------------------------------------------------------------
describe('límite conocido del detector (no bloqueante): nombre de tabla en una constante', () => {
  it('"const TABLA = \'event_attendance\'; supabase.from(TABLA).select(\'user_id, kind\')" no se detecta hoy: el regex de .from() exige un literal entre comillas, así que ni siquiera genera una entrada', () => {
    const fixture = `const TABLA = 'event_attendance'\nsupabase.from(TABLA).select('user_id, kind').eq('event_id', id)`
    expect(extraerFromSelect(fixture)).toEqual([])
  })
})

describe('límite conocido del detector (no bloqueante): columnas en una constante', () => {
  it('"const COLUMNAS = \'user_id, kind\'; supabase.from(\'event_attendance\').select(COLUMNAS)" no se detecta hoy: el regex de .select() también exige un literal, así que las columnas quedan en null (y un `columnas === null` se descarta sin avisar)', () => {
    const fixture = `const COLUMNAS = 'user_id, kind'\nsupabase.from('event_attendance').select(COLUMNAS).eq('event_id', id)`
    const [r] = extraerFromSelect(fixture)
    expect(r.columnas).toBeNull()
  })
})

// ===========================================================================
// 4. Detector estático: lib/asistencia.ts y components/botones-asistencia.tsx
// importan la lógica de @qps/core/asistencia y no tienen su propia copia.
// Mismo criterio que apps/mobile/tests/asistencia.test.ts.
//
// Evasiones consideradas (y por qué este detector las agarra):
//   a) Alias de import: el regex de `importaAsistenciaDeCore` no depende de
//      los nombres importados, solo del origen del import — pero un import
//      correcto con una copia local al lado sigue fallando por los otros
//      chequeos.
//   b) Lógica escrita con otros nombres de variable: `tieneComparacionManualDeMarca`
//      busca la FORMA (dos identificadores sueltos comparados con
//      `===`/`!==`, ninguno literal ni resultado de llamada), no nombres
//      fijos; `tieneUnionTipoAsistenciaLocal` busca la forma del valor
//      ('voy' | 'me_interesa'), no el nombre del tipo.
// ===========================================================================

/** `true` si el contenido tiene un `import { ... } from '@qps/core/asistencia'` (cualquier nombre, con o sin alias). */
function importaAsistenciaDeCore(content: string): boolean {
  return /import\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"]@qps\/core\/asistencia['"]/.test(quitarComentarios(content))
}

/** `true` si hay una unión de tipo `'voy' | 'me_interesa'` (en cualquier orden, cualquier nombre de tipo). */
function tieneUnionTipoAsistenciaLocal(content: string): boolean {
  const limpio = quitarComentarios(content)
  const vdm = /(?:'voy'|"voy")\s*\|\s*(?:'me_interesa'|"me_interesa")/
  const mdv = /(?:'me_interesa'|"me_interesa")\s*\|\s*(?:'voy'|"voy")/
  return vdm.test(limpio) || mdv.test(limpio)
}

/** `true` si hay un mapa local con las dos claves del dominio (`voy`/`me_interesa`) a un string (un "ETIQUETAS" casero). */
function tieneEtiquetasLocal(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /\bvoy\s*:\s*['"]/.test(limpio) && /\bme_interesa\s*:\s*['"]/.test(limpio)
}

/** `true` si hay un umbral numérico escrito a mano (`>=`, `<=`, `>`, `<` o `===` contra un número literal). */
function tieneUmbralNumericoLocal(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /(>=|<=|>|<)\s*\d+/.test(limpio) || /===\s*\d+/.test(limpio)
}

/**
 * `true` si hay una comparación "a mano" de dos identificadores sueltos
 * (ninguno literal, ninguno resultado de una llamada) con `===`/`!==`: la
 * forma de `actual === tipo` decidiendo el borrado sin pasar por
 * `siguienteMarca`, sea cual sea el nombre de las variables.
 */
function tieneComparacionManualDeMarca(content: string): boolean {
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
 * fija `ARCHIVOS_ASISTENCIA`— tiene la lógica de asistencia copiada entera,
 * y no solo una coincidencia aislada de uno de los cuatro patrones (que por
 * separado puede aparecer en código sin ninguna relación con asistencia:
 * por ejemplo un `>= 3` de paginación, o un `===` cualquiera). Es el
 * chequeo que usa el barrido recursivo de más abajo (bloqueante 3, vuelta
 * 1), donde no hay una lista fija de archivos "sospechosos": tiene que
 * evitar falsos positivos en el resto del código de la app. Mismo criterio
 * que `apps/mobile/tests/asistencia.test.ts` después de `e73e0f2`.
 */
function tieneCopiaLocalCompleta(content: string): boolean {
  return (
    tieneUnionTipoAsistenciaLocal(content) &&
    tieneEtiquetasLocal(content) &&
    tieneUmbralNumericoLocal(content) &&
    tieneComparacionManualDeMarca(content)
  )
}

describe('detector de copia local (fixtures en memoria: tiene que fallar de verdad)', () => {
  describe('importaAsistenciaDeCore', () => {
    it('detecta el import real (con alias, evasión a)', () => {
      expect(importaAsistenciaDeCore(`import { siguienteMarca as calcular } from '@qps/core/asistencia'`)).toBe(true)
    })

    it('un comentario que menciona el módulo no cuenta como import real', () => {
      expect(importaAsistenciaDeCore(`// ver @qps/core/asistencia para la lógica`)).toBe(false)
    })
  })

  describe('tieneUnionTipoAsistenciaLocal', () => {
    it('evasión b: detecta la unión con otro nombre de tipo', () => {
      expect(tieneUnionTipoAsistenciaLocal(`type Marca = 'voy' | 'me_interesa'`)).toBe(true)
    })

    it('un uso normal de los dos valores en un || (no es una unión de tipo): false', () => {
      expect(
        tieneUnionTipoAsistenciaLocal(`x = filaPropia?.kind === 'voy' || filaPropia?.kind === 'me_interesa'`),
      ).toBe(false)
    })
  })

  describe('tieneComparacionManualDeMarca', () => {
    it('evasión b: detecta "previo === nuevo" (otros nombres de variable)', () => {
      expect(tieneComparacionManualDeMarca(`if (previo === nuevo) { borrar() } else { upsert() }`)).toBe(true)
    })

    it('el resultado de una llamada contra null (la forma correcta, con siguienteMarca) no cuenta: false', () => {
      expect(tieneComparacionManualDeMarca(`if (siguienteMarca(actual, tipo) === null) { borrar() }`)).toBe(false)
    })

    it('comparar un campo contra un literal de texto no cuenta: false', () => {
      expect(tieneComparacionManualDeMarca(`filaPropia?.kind === 'voy'`)).toBe(false)
    })

    it('"marcado === tipo" (resaltar el botón ya marcado) no es la decisión de borrar: por eso components/botones-asistencia.tsx no se chequea con este detector', () => {
      // Documenta por qué este archivo se excluye de chequearComparacionManual
      // más abajo: la forma sí matchea (y eso está bien, no es lo que decide
      // el borrado/upsert, que vive solo en lib/asistencia.ts).
      expect(tieneComparacionManualDeMarca(`const marcado = marca === tipo`)).toBe(true)
    })
  })

  describe('tieneCopiaLocalCompleta', () => {
    it('evasión c (bloqueante 3, vuelta 1): un TERCER archivo con la copia completa, con otros nombres de variable y de tipo, se marca', () => {
      // La forma que probó el revisor: `lib/asistencia-interno.ts` con el
      // mismo tipo, las mismas etiquetas, el mismo umbral `>= 3` y la misma
      // regla de marcar, con otros nombres, sin importar nada de
      // `@qps/core/asistencia` (aunque el import de core siga puesto en
      // `lib/asistencia.ts`, solo para el tipo).
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

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const ARCHIVOS_ASISTENCIA = [
  { etiqueta: 'lib/asistencia.ts', ruta: 'lib/asistencia.ts', chequearComparacionManual: true },
  {
    etiqueta: 'components/botones-asistencia.tsx',
    ruta: 'components/botones-asistencia.tsx',
    // No se chequea la comparación manual: `marca === tipo` es legítimo acá
    // (decide el resaltado del botón ya marcado), no la decisión de
    // borrar/upsert — eso vive en lib/asistencia.ts.
    chequearComparacionManual: false,
  },
] as const

describe.each(ARCHIVOS_ASISTENCIA)('$etiqueta: importa de @qps/core/asistencia y no tiene copia local', (caso) => {
  const contenido = readFileSync(`${WEB_ROOT}/${caso.ruta}`, 'utf8')

  it('importa la lógica de @qps/core/asistencia', () => {
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

// ---------------------------------------------------------------------------
// Bloqueante 3 (vuelta 1, revisor): la evasión real era poner la copia
// completa en un TERCER archivo (`lib/asistencia-interno.ts`) y delegar ahí
// desde los dos archivos de `ARCHIVOS_ASISTENCIA` — esos dos seguían "limpios"
// porque el detector de arriba solo miraba esos dos nombres fijos. El
// arreglo: barrer TODO el código de `apps/web` (reutilizando
// `listarArchivosDeCodigo`, ya definida arriba para el detector 3 — no se
// escribe una función nueva) y aplicar `tieneCopiaLocalCompleta` a cada
// archivo. `listarArchivosDeCodigo` ya excluye `tests/`, `node_modules`,
// `.next` y `.git` por nombre de directorio en cualquier profundidad, así
// que cubre `lib/`, `components/` y `app/` (y no da falsos positivos por
// mirar fixtures de los propios tests).
//
// Si alguien reintrodujera la evasión (un tercer archivo cualquiera con la
// copia completa), el `it.each` de abajo lo marca en rojo nombrando el
// archivo exacto.
// ---------------------------------------------------------------------------
describe('barrido recursivo de apps/web (sin tests/): ninguna copia local completa de asistencia fuera de core', () => {
  const archivos = listarArchivosDeCodigo(WEB_ROOT)

  it(
    'encuentra una cantidad razonable de archivos, incluidos los dos vigilados (si esto falla, el barrido ' +
      'se achicó y el resto de este describe no prueba nada)',
    () => {
      expect(archivos.length).toBeGreaterThan(30)
      expect(archivos).toContain(`${WEB_ROOT}/lib/asistencia.ts`)
      expect(archivos).toContain(`${WEB_ROOT}/components/botones-asistencia.tsx`)
    },
  )

  it.each(archivos.map((archivo) => [relative(WEB_ROOT, archivo), archivo] as const))('%s', (etiqueta, archivo) => {
    const contenido = readFileSync(archivo, 'utf8')
    if (tieneCopiaLocalCompleta(contenido)) {
      throw new Error(
        `${etiqueta}: tiene los cuatro patrones de una copia local completa de la lógica de asistencia ` +
          `(unión de tipo, etiquetas, umbral numérico y comparación manual) — tiene que usar ` +
          `@qps/core/asistencia en vez de reimplementarla`,
      )
    }
    expect(tieneCopiaLocalCompleta(contenido)).toBe(false)
  })
})
