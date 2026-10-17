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
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))

import { marcarAsistencia, obtenerAsistencia } from '../../lib/asistencia'

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
interface ConfigDoble {
  user: { id: string } | null
  propiaData?: { kind: string } | null
  propiaError?: unknown
  upsertError?: unknown
  deleteError?: unknown
  countsData?: { voy: number; me_interesa: number } | null
}

function construirCliente(config: ConfigDoble) {
  const llamadas = {
    tablas: [] as string[],
    selects: [] as Array<{ tabla: string; columnas: string }>,
    upserts: [] as unknown[],
    deletes: 0,
  }

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
              maybeSingle: async () => ({
                data: config.countsData ?? { voy: 0, me_interesa: 0 },
                error: null,
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
