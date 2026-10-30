/**
 * "✓ Voy" en la ficha de la web (R38, tarea 38-b; reescrito en la R47,
 * tarea 47-b, QPS-197, al modelo de un solo tipo de asistencia): `lib/asistencia.ts`
 * y `components/botones-asistencia.tsx`. Sin red ni base: `@/lib/supabase/server`
 * va mockeado (mismo patrón que `tests/radar/update-settings-invalida.test.ts`).
 *
 * El modelo cambió de dos marcas ("Voy" / "Me interesa") a un solo tipo
 * (`'voy'`); "Me interesa" desapareció. El detalle del orden de escrituras
 * entre Guardar (♥) y Voy (que ahora están contenidos uno en el otro) está
 * en `tests/asistencia/guardar-voy.test.ts`: este archivo se queda con lo
 * que no cambió de la R38 (el invariante de "nunca ok:false si la
 * escritura salió bien", la visibilidad de los botones, los detectores de
 * "solo cantidades, nunca quién" y de "sin copia local").
 *
 * Bloques:
 *  1. Sin sesión no se escribe nada (ni se llama a `from()`), y un tipo
 *     inválido (incluido 'me_interesa', el valor viejo) ni siquiera crea el
 *     cliente de Supabase.
 *  2. El `user_id` del upsert siempre sale de `auth.getUser()`, nunca de un
 *     argumento.
 *  3. Si la escritura sale bien, `marcarAsistencia` nunca devuelve
 *     `ok: false` (bloqueante 1 de la R38, sigue vigente).
 *  4. Detector estático: ningún `select` sobre `event_attendance` pide
 *     `user_id` ni `*`, la única tabla/vista que expone cantidades es
 *     `event_attendance_counts`, y ningún `select` de todo `apps/web` pide
 *     la columna `me_interesa` (desapareció del modelo).
 *  5. Los botones solo se muestran para eventos PUBLISHED
 *     (`debenMostrarseBotonesAsistencia`).
 *  6. `lib/asistencia.ts` y `components/botones-asistencia.tsx` importan la
 *     lógica de `@qps/core/asistencia` y no tienen su propia copia.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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
// Doble de Supabase para `event_attendance` / `event_attendance_counts` /
// `user_favorites` (necesaria desde la R47: `marcarAsistencia` también lee
// y escribe el favorito cuando hace falta — el detalle de ESE orden está en
// `guardar-voy.test.ts`; acá alcanza con un doble simple que no falle).
// ---------------------------------------------------------------------------
interface RespuestaCounts {
  data?: { voy: number } | null
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
  countsData?: { voy: number } | null
  /**
   * Respuestas sucesivas para `event_attendance_counts`.select(...).maybeSingle():
   * la primera llamada usa `countsSecuencia[0]`, la segunda `countsSecuencia[1]`,
   * etc. (si se agotan, se repite la última). Si no se da, se usa siempre
   * `countsData`. Existe para el bloqueante 1: simular "la relectura de
   * DESPUÉS de escribir falla, pero la de ANTES de escribir anduvo bien".
   */
  countsSecuencia?: RespuestaCounts[]
  /** Si ya estaba guardado (♥) antes de tocar "voy". Por defecto, no. */
  guardadoData?: { id: string } | null
  guardadoError?: unknown
  insertFavoritoError?: unknown
  /**
   * El `status` que devuelve `events`.select("status").eq("id", ...).maybeSingle()
   * (QPS-195, tarea 56-a: `estadoPermiteAgregar` se consulta antes de
   * AGREGAR una marca). Por defecto 'PUBLISHED', así los escenarios de este
   * archivo (que no prueban ese chequeo) siguen escribiendo como antes.
   */
  eventsStatus?: string | null
  eventsError?: unknown
}

function construirCliente(config: ConfigDoble) {
  const llamadas = {
    tablas: [] as string[],
    selects: [] as Array<{ tabla: string; columnas: string }>,
    upserts: [] as unknown[],
    inserts: [] as unknown[],
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
                return { data: config.countsData ?? { voy: 0 }, error: null }
              },
            }),
          }
        },
      }
    }

    if (tabla === 'user_favorites') {
      return {
        select: (columnas: string) => {
          llamadas.selects.push({ tabla, columnas })
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: config.guardadoData ?? null, error: config.guardadoError ?? null }),
              }),
            }),
          }
        },
        insert: async (valores: unknown) => {
          llamadas.inserts.push(valores)
          return { error: config.insertFavoritoError ?? null }
        },
      }
    }

    // QPS-195 (56-a): `estadoPermiteAgregar` (lib/asistencia-lectura.ts) se
    // consulta antes del primer paso que AGREGUE una marca. Por defecto
    // 'PUBLISHED', para no tener que tocar cada escenario de este archivo
    // que no prueba ese chequeo (eso lo cubre tests/asistencia/estado-evento.test.ts).
    if (tabla === 'events') {
      return {
        select: (columnas: string) => {
          llamadas.selects.push({ tabla, columnas })
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: config.eventsError ? null : { status: config.eventsStatus ?? 'PUBLISHED' },
                error: config.eventsError ?? null,
              }),
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
// 1. Sin sesión no se escribe nada. Tipo inválido ni siquiera crea el cliente.
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

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

    expect(resultado).toEqual({ ok: false, error: 'AUTH_REQUIRED' })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('marcarAsistencia: un tipo que no es "voy" no escribe nada, y ni siquiera crea el cliente de Supabase', () => {
  it('"me_interesa" (el valor viejo, ya desaparecido del modelo): INVALID, sin llamar a createClient()', async () => {
    const resultado = await marcarAsistencia('evento-de-prueba-1', 'me_interesa' as unknown as 'voy')

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('"bailar" (cualquier otro string): INVALID, sin llamar a createClient()', async () => {
    const resultado = await marcarAsistencia('evento-de-prueba-1', 'bailar' as unknown as 'voy')

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('cadena vacía: INVALID, sin llamar a createClient()', async () => {
    const resultado = await marcarAsistencia('evento-de-prueba-1', '' as unknown as 'voy')

    expect(resultado).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('null/undefined: INVALID, sin llamar a createClient()', async () => {
    expect(await marcarAsistencia('evento-de-prueba-1', null as unknown as 'voy')).toEqual({ ok: false, error: 'INVALID' })
    expect(await marcarAsistencia('evento-de-prueba-1', undefined as unknown as 'voy')).toEqual({ ok: false, error: 'INVALID' })
    expect(createClient).not.toHaveBeenCalled()
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

  it('sin Voy ni Guardado previos: marcar "voy" hace upsert (y guarda el favorito) con el id de getUser()', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-1' },
      propiaData: null,
      guardadoData: null,
      countsData: { voy: 1 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 1 }, propia: 'voy', guardado: true })
    expect(llamadas.upserts).toEqual([{ user_id: 'usuario-sesion-1', event_id: 'evento-de-prueba-1', kind: 'voy' }])
    expect(llamadas.inserts).toEqual([{ user_id: 'usuario-sesion-1', event_id: 'evento-de-prueba-1' }])
    expect(llamadas.deletes).toBe(0)
  })

  it('pasar un tercer argumento ("otro user_id") no cambia nada: las escrituras siguen usando el id de la sesión', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-2' },
      propiaData: null,
      guardadoData: null,
      countsData: { voy: 1 },
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
    expect(llamadas.inserts).toEqual([{ user_id: 'usuario-sesion-2', event_id: 'evento-de-prueba-1' }])
  })

  it('ya tenía "voy": marcarAsistencia("voy") lo saca (delete), nunca upsert; el delete no filtra por user_id (lo acota la RLS)', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-3' },
      propiaData: { kind: 'voy' },
      guardadoData: { id: 'fav-1' },
      countsData: { voy: 0 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 0 }, propia: null, guardado: true })
    expect(llamadas.deletes).toBe(1)
    expect(llamadas.upserts).toHaveLength(0)
    expect(llamadas.inserts).toHaveLength(0)
  })

  it('la marca actual se lee de la base, no la decide el cliente: si la base dice "voy", tocar "voy" lo saca', async () => {
    // No hay ningún argumento de "marca previa" en marcarAsistencia(eventId,
    // tipo): la única fuente es la lectura a `event_attendance` que hace la
    // propia función.
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-sesion-5' },
      propiaData: { kind: 'voy' },
      guardadoData: { id: 'fav-1' },
      countsData: { voy: 0 },
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
    expect(llamadas.inserts).toHaveLength(0)
    expect(llamadas.deletes).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Bloqueante 1 (vuelta 1, revisor, R38; sigue vigente en la R47): si la
// escritura salió bien, la función NUNCA devuelve `ok: false`, aunque falle
// la relectura de cantidades de DESPUÉS de escribir.
// ---------------------------------------------------------------------------
describe('marcarAsistencia: si la escritura sale bien, nunca devuelve error (bloqueante 1)', () => {
  it(
    'primer select de cantidades (antes de escribir) anda, la escritura anda, el SEGUNDO select ' +
      '(después de escribir) falla: ok:true, con la marca recién escrita y las cantidades leídas ANTES de escribir',
    async () => {
      const { cliente, llamadas } = construirCliente({
        user: { id: 'usuario-sesion-7' },
        propiaData: null, // sin marca: "voy" -> guarda + upsert
        guardadoData: null,
        countsSecuencia: [
          { data: { voy: 5 } }, // antes de escribir: anda
          { error: { code: '42501', message: 'detalle interno de postgres (segundo select)' } }, // después: falla
        ],
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

      // Si este test falla con `{ ok: false, error: 'DB_ERROR' }`, es
      // exactamente el bug del revisor: la escritura quedó hecha (ver el
      // upsert más abajo) pero la función igual reporta error.
      expect(resultado).toEqual({ ok: true, cantidades: { voy: 5 }, propia: 'voy', guardado: true })
      expect(llamadas.upserts).toEqual([
        { user_id: 'usuario-sesion-7', event_id: 'evento-de-prueba-1', kind: 'voy' },
      ])
      // El error de la relectura se registra (no se pierde en silencio).
      expect(console.error).toHaveBeenCalled()
    },
  )

  it(
    'variante con delete: actual ya tenía "voy", se vuelve a tocar "voy" (lo saca); la relectura de ' +
      'después falla igual: ok:true, propia: null, con las cantidades de antes de escribir',
    async () => {
      const { cliente, llamadas } = construirCliente({
        user: { id: 'usuario-sesion-8' },
        propiaData: { kind: 'voy' },
        guardadoData: { id: 'fav-1' },
        countsSecuencia: [
          { data: { voy: 3 } },
          { error: { code: '42501', message: 'falla la segunda lectura' } },
        ],
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

      expect(resultado).toEqual({ ok: true, cantidades: { voy: 3 }, propia: null, guardado: true })
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
        guardadoData: null,
        countsSecuencia: [{ data: { voy: 1 } }, { lanzar: new Error('red caída') }],
      })
      createClient.mockResolvedValue(cliente)

      const resultado = await marcarAsistencia('evento-de-prueba-1', 'voy')

      expect(resultado).toEqual({ ok: true, cantidades: { voy: 1 }, propia: 'voy', guardado: true })
    },
  )

  it(
    'propiedad general: con la escritura exitosa, ningún camino de fallas en las lecturas de cantidades ' +
      '(antes, después, ambas, ninguna, o una excepción) devuelve `ok: false`',
    async () => {
      const escenarios: Array<{ etiqueta: string; countsSecuencia?: RespuestaCounts[] }> = [
        { etiqueta: 'las dos lecturas de cantidades andan', countsSecuencia: [{ data: { voy: 1 } }, { data: { voy: 1 } }] },
        { etiqueta: 'antes falla, después anda', countsSecuencia: [{ error: { code: '42501', message: 'x' } }, { data: { voy: 1 } }] },
        { etiqueta: 'antes anda, después falla', countsSecuencia: [{ data: { voy: 1 } }, { error: { code: '42501', message: 'x' } }] },
        { etiqueta: 'las dos lecturas de cantidades fallan', countsSecuencia: [{ error: { code: '42501', message: 'x' } }, { error: { code: '42501', message: 'y' } }] },
        { etiqueta: 'antes anda, después tira una excepción', countsSecuencia: [{ data: { voy: 1 } }, { lanzar: new Error('boom') }] },
        { etiqueta: 'sin countsSecuencia (comportamiento por defecto)' },
      ]

      for (const escenario of escenarios) {
        const { cliente } = construirCliente({
          user: { id: 'usuario-sesion-propiedad' },
          propiaData: null,
          guardadoData: null,
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
// obtenerAsistencia: sin sesión no consulta event_attendance ni user_favorites.
// ---------------------------------------------------------------------------
describe('obtenerAsistencia: sin sesión', () => {
  it('cantidades públicas, propia null, guardado false, y ni event_attendance ni user_favorites se consultan', async () => {
    const llamadasTabla: string[] = []
    const from = vi.fn((tabla: string) => {
      llamadasTabla.push(tabla)
      if (tabla === 'event_attendance_counts') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { voy: 4 }, error: null }) }),
          }),
        }
      }
      throw new Error(`no debería consultar "${tabla}" sin sesión`)
    })
    createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) }, from })

    const resultado = await obtenerAsistencia('evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 4 }, propia: null, guardado: false })
    expect(llamadasTabla).toEqual(['event_attendance_counts'])
  })
})

describe('obtenerAsistencia: con sesión', () => {
  it('lee la marca propia y si está guardado, en paralelo (las dos tablas se consultan)', async () => {
    const { cliente, llamadas } = construirCliente({
      user: { id: 'usuario-lectura-1' },
      propiaData: { kind: 'voy' },
      guardadoData: { id: 'fav-1' },
      countsData: { voy: 5 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerAsistencia('evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 5 }, propia: 'voy', guardado: true })
    expect(llamadas.tablas).toContain('event_attendance')
    expect(llamadas.tablas).toContain('user_favorites')
  })

  it('una fila vieja con kind "me_interesa" se lee como propia: null (ya no es un tipo válido)', async () => {
    const { cliente } = construirCliente({
      user: { id: 'usuario-lectura-2' },
      propiaData: { kind: 'me_interesa' },
      guardadoData: null,
      countsData: { voy: 0 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerAsistencia('evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 0 }, propia: null, guardado: false })
  })

  it('si falla SOLO la lectura de user_favorites, no es ok:false: guardado queda en false y el resto de la fila sigue andando', async () => {
    const { cliente } = construirCliente({
      user: { id: 'usuario-lectura-3' },
      propiaData: { kind: 'voy' },
      guardadoError: { code: '42501', message: 'detalle interno' },
      countsData: { voy: 2 },
    })
    createClient.mockResolvedValue(cliente)

    const resultado = await obtenerAsistencia('evento-de-prueba-1')

    expect(resultado).toEqual({ ok: true, cantidades: { voy: 2 }, propia: 'voy', guardado: false })
    expect(console.error).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Bloqueante 2 (vuelta 1, revisor, R38): los botones solo tienen sentido en
// eventos PUBLISHED, porque `event_attendance_counts` solo agrega votos de
// eventos PUBLISHED.
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

  // 47-c reemplazó los dos botones por una fila de acciones
  // (`<FilaAccionesEvento>`, QPS-199): la fila SIEMPRE se dibuja (♥ Guardar
  // y Compartir tienen que verse incluso fuera de PUBLISHED, o si falló la
  // lectura de la asistencia). Lo que sigue condicionado por
  // `debenMostrarseBotonesAsistencia` ya no es "toda la fila" sino SOLO el
  // botón de Voy, por la prop `mostrarVoy`. Lo que había que seguir
  // protegiendo (y lo que protegen los dos tests de abajo) es que esa
  // decisión pase por la función de core y no por una comparación de
  // `status` escrita a mano en el componente.
  it(
    'components/event-detail-page.tsx: el prop `mostrarVoy` de <FilaAccionesEvento> sale de ' +
      'debenMostrarseBotonesAsistencia (defensa en profundidad: ahora es el único botón que depende de ' +
      'PUBLISHED, Guardar y Compartir se dibujan siempre)',
    () => {
      expect(contenidoEventDetail).toMatch(
        /<FilaAccionesEvento\b[\s\S]{0,400}?mostrarVoy=\{[^}]*\bdebenMostrarseBotonesAsistencia\s*\([^)]*\)[^}]*\}/,
      )
    },
  )

  it(
    'components/event-detail-page.tsx: no decide por su cuenta con un `status === "PUBLISHED"` escrito a mano ' +
      '(si alguien reemplazara la llamada a debenMostrarseBotonesAsistencia por esa comparación suelta, este ' +
      'test lo marca: es exactamente el bug que esa función centraliza)',
    () => {
      expect(contenidoEventDetail).not.toMatch(/status\s*===\s*['"]PUBLISHED['"]/)
    },
  )

  it('components/event-detail-page.tsx: importa debenMostrarseBotonesAsistencia de "@/lib/asistencia-visibilidad"', () => {
    expect(contenidoEventDetail).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })

  // Vuelta 2 (R38): la función se mudó de `lib/asistencia.ts` a
  // `lib/asistencia-visibilidad.ts` porque el primero es un módulo
  // `"use server"` y ahí todos los exports tienen que ser `async` (Next hace
  // fallar el build, y ni `tsc` ni Vitest lo ven). Esta guarda deja en rojo
  // el día que alguien vuelva a exportar algo que no sea una función `async`
  // desde ese archivo. Ver `tests/lib/use-server.test.ts` (47-b) para el
  // detector general sobre TODOS los archivos "use server" de apps/web.
  it('lib/asistencia.ts ("use server"): todos sus exports de valor son funciones async (si no, falla el build de Next)', () => {
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
// 4. Detector estático: "solo cantidades, nunca quién", y "me_interesa"
// desapareció del modelo (ningún select de todo apps/web lo pide).
//
// Recorre el código real de apps/web (no los tests) y verifica que ningún
// `select` sobre `event_attendance` pida `user_id` (ni `*`), que la única
// tabla/vista de la que se lee "voy" sea `event_attendance_counts`, y que
// ningún `select` mencione la columna vieja "me_interesa".
// ===========================================================================

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

/** `true` si el string de columnas pide "voy". */
function tieneColumnaVoy(columnas: string): boolean {
  return /\bvoy\b/.test(columnas)
}

/** `true` si el string de columnas pide la columna vieja "me_interesa" (desapareció del modelo en la R47). */
function tieneColumnaMeInteresa(columnas: string): boolean {
  return /\bme_interesa\b/.test(columnas)
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

describe('extraerFromSelect / selectProblematicoSobreAsistencia / tieneColumnaVoy / tieneColumnaMeInteresa (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
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

  it('evasión: cantidades leídas de otra tabla (event_attendance_totals) con la misma columna: lo detecta tieneColumnaVoy, y la tabla no es la vista pública', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance_totals').select('voy').eq('event_id', id)`)
    expect(tieneColumnaVoy(r.columnas!)).toBe(true)
    expect(r.tabla).not.toBe('event_attendance_counts')
  })

  it('cantidades leídas de event_attendance_counts: la tabla es exactamente la vista pública', () => {
    const [r] = extraerFromSelect(
      `supabase.from('event_attendance_counts').select('voy').eq('event_id', id).maybeSingle()`,
    )
    expect(tieneColumnaVoy(r.columnas!)).toBe(true)
    expect(r.tabla).toBe('event_attendance_counts')
  })

  it('tieneColumnaMeInteresa detecta la columna vieja en cualquier tabla', () => {
    expect(tieneColumnaMeInteresa('voy, me_interesa')).toBe(true)
    expect(tieneColumnaMeInteresa('me_interesa')).toBe(true)
    expect(tieneColumnaMeInteresa('voy')).toBe(false)
  })

  it('dos .from() distintos en el mismo archivo no se confunden entre sí', () => {
    const fixture = `
      a.from('event_attendance').select('kind').eq('event_id', id).maybeSingle()
      b.from('event_attendance_counts').select('voy').eq('event_id', id).maybeSingle()
    `
    const resultados = extraerFromSelect(fixture)
    expect(resultados).toEqual([
      { tabla: 'event_attendance', columnas: 'kind' },
      { tabla: 'event_attendance_counts', columnas: 'voy' },
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

  // 15 s: recorre archivos del repo y con dos suites en paralelo pasa los 5 s por omisión (R64).
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
  }, 15_000)
})

describe('detector estático: la única tabla/vista de la que se lee "voy" es event_attendance_counts', () => {
  const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
  const archivos = listarArchivosDeCodigo(WEB_ROOT)

  // 15 s: recorre archivos del repo y con dos suites en paralelo pasa los 5 s por omisión (R64).
  it('ningún select de la columna voy aparece sobre otra tabla', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas === null) continue
        if (tieneColumnaVoy(columnas) && tabla !== 'event_attendance_counts') {
          violaciones.push(`${archivo}: select de "voy" sobre "${tabla}" (columnas: "${columnas}")`)
        }
      }
    }
    expect(violaciones).toEqual([])
  }, 15_000)

  // 15 s: recorre archivos del repo y con dos suites en paralelo pasa los 5 s por omisión (R64).
  it('al menos un archivo real sí lee "voy" de event_attendance_counts (si esto da 0, el detector de arriba pasaría por no mirar nada)', () => {
    let encontrado = false
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas && tieneColumnaVoy(columnas) && tabla === 'event_attendance_counts') {
          encontrado = true
        }
      }
    }
    expect(encontrado).toBe(true)
  }, 15_000)
})

describe('detector estático: "me_interesa" desapareció del modelo, ningún select de apps/web la pide', () => {
  const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
  const archivos = listarArchivosDeCodigo(WEB_ROOT)

  // 15 s: recorre archivos del repo y con dos suites en paralelo pasa los 5 s por omisión (R64).
  it('ningún select, en ninguna tabla, pide la columna "me_interesa"', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas === null) continue
        if (tieneColumnaMeInteresa(columnas)) {
          violaciones.push(`${archivo}: select de "me_interesa" sobre "${tabla}" (columnas: "${columnas}")`)
        }
      }
    }
    expect(violaciones).toEqual([])
  }, 15_000)
})

// ---------------------------------------------------------------------------
// No bloqueante (vuelta 1, revisor, R38): dos huecos conocidos del detector
// de arriba. Hoy ningún archivo real de apps/web usa este patrón (ni
// `const TABLA = 'event_attendance'; supabase.from(TABLA)…` ni
// `const COLUMNAS = 'user_id, kind'; …select(COLUMNAS)…`), así que no hay
// ningún falso negativo real ahora mismo — pero si algún día alguien
// escribe el código así, el detector de arriba NO lo va a agarrar.
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
// 5. Detector estático: lib/asistencia.ts y components/botones-asistencia.tsx
// importan la lógica de @qps/core/asistencia y no tienen su propia copia.
// Mismo criterio que apps/mobile/tests/asistencia.test.ts.
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
 * forma de `actual === tipo` decidiendo el borrado sin pasar por core, sea
 * cual sea el nombre de las variables.
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
 * señal de que un archivo tiene la lógica de asistencia copiada entera, y
 * no solo una coincidencia aislada de uno de los cuatro patrones. Mismo
 * criterio que `apps/mobile/tests/asistencia.test.ts`.
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
      expect(importaAsistenciaDeCore(`import { textoBotonVoy as calcular } from '@qps/core/asistencia'`)).toBe(true)
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

    it('el resultado de una llamada contra null (la forma correcta, pasando por core) no cuenta: false', () => {
      expect(tieneComparacionManualDeMarca(`if (siguienteEstado(actual, tipo) === null) { borrar() }`)).toBe(false)
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
    it('evasión c (bloqueante 3, R38): un TERCER archivo con la copia completa, con otros nombres de variable y de tipo, se marca', () => {
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
        import { textoBotonVoy, type TipoAsistencia } from '@qps/core/asistencia'
        export function usar(tipo: TipoAsistencia, cantidad: number) {
          return textoBotonVoy(cantidad)
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
    it('no decide el borrado comparando dos identificadores sueltos a mano (tiene que pasar por core)', () => {
      expect(tieneComparacionManualDeMarca(contenido)).toBe(false)
    })
  }
})

// ---------------------------------------------------------------------------
// Bloqueante 3 (vuelta 1, revisor, R38): la evasión real era poner la copia
// completa en un TERCER archivo y delegar ahí desde los dos archivos de
// ARCHIVOS_ASISTENCIA. El arreglo: barrer TODO el código de `apps/web`.
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
