/**
 * Ronda 41, tarea 41-q (QA, cierre). Dos detectores ESTÁTICOS nuevos sobre
 * el código real de `apps/mobile`, ninguno de los dos existía antes de esta
 * tarea (41-c solo tenía cobertura de COMPORTAMIENTO, con un doble que
 * tira si alguien llama `insert`/`upsert` sobre `push_tokens` —
 * `tests/push-registro.test.ts`, "nunca hace un insert ni un upsert directo
 * en push_tokens" — pero eso solo prueba el camino que `registro.ts` usa
 * HOY; un `insert` agregado en OTRO archivo del árbol no lo tocaría nunca
 * ese doble, porque ese test ni siquiera importa ese archivo nuevo).
 *
 * Mismo estilo que `tests/asistencia-umbral.test.ts` (`extraerFromSelect`,
 * `listarArchivosDeCodigo`): fixtures en memoria primero (probando que el
 * detector falla de verdad, en los dos sentidos), y después aplicado al
 * árbol real.
 *
 * Límites conocidos de los dos detectores (no cerrados, documentados):
 *   - push_tokens: una tabla armada en una variable (`const t = 'push_tokens'; ...from(t)...`)
 *     evade el detector (no resuelve el valor de variables). `registro.ts`
 *     y el resto del árbol real usan siempre el literal `'push_tokens'`.
 *   - console/Sentry + token: solo mira el TEXTO del argumento (tras sacar
 *     strings y comentarios); una variable renombrada para no contener la
 *     palabra "token" (p. ej. `const t = token; console.log(t)`) evade esto,
 *     igual que evadiría una revisión humana que buscara "token" a simple
 *     vista. No se resuelve con regex: haría falta un analizador de flujo de
 *     datos, fuera del alcance de esta tarea.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))


function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

/** Recorre recursivamente .ts/.tsx bajo `dir`, sin node_modules/dist/tests/.git/.expo. */
function listarArchivosDeCodigo(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'tests', '.git', '.expo'].includes(entrada.name)) continue
    const ruta = `${dir}/${entrada.name}`
    if (entrada.isDirectory()) {
      listarArchivosDeCodigo(ruta, acumulado)
    } else if (/\.(ts|tsx)$/.test(entrada.name) && !entrada.name.endsWith('.d.ts')) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

// ===========================================================================
// Detector 1: ningún `.from('push_tokens').insert(...)` ni `.upsert(...)`
// en todo el árbol de apps/mobile (el registro va SIEMPRE por la RPC
// `register_push_token`, nunca por un insert/upsert directo: RLS no lo
// dejaría de todas formas, pero el camino correcto tiene que ser el único).
// ===========================================================================

interface ViolacionPushTokens {
  line: number
  metodo: 'insert' | 'upsert'
}

/**
 * Para cada `.from('push_tokens')` (o con comillas dobles/backtick), mira el
 * resto de la CADENA (hasta el próximo `.from(` de cualquier tabla, o el fin
 * del archivo) buscando `.insert(`/`.upsert(`. Mismo criterio de "acotar por
 * el próximo .from()" que `extraerFromSelect` de `tests/asistencia-umbral.test.ts`.
 */
function violacionesPushTokensInsertUpsert(content: string): ViolacionPushTokens[] {
  const limpio = quitarComentarios(content)
  const violaciones: ViolacionPushTokens[] = []

  const fromPushTokensRegex = /\.from\(\s*(['"`])push_tokens\1\s*\)/g
  let m: RegExpExecArray | null
  const posicionesInicio: number[] = []
  while ((m = fromPushTokensRegex.exec(limpio))) {
    posicionesInicio.push(m.index + m[0].length)
  }

  const todosLosFrom = /\.from\(/g

  for (const inicio of posicionesInicio) {
    todosLosFrom.lastIndex = inicio
    const siguienteFrom = todosLosFrom.exec(limpio)
    const fin = siguienteFrom ? siguienteFrom.index : limpio.length
    const cadena = limpio.slice(inicio, fin)

    const reInsert = /\.\s*insert\s*\(/
    const reUpsert = /\.\s*upsert\s*\(/
    if (reInsert.test(cadena)) violaciones.push({ line: lineAt(limpio, inicio), metodo: 'insert' })
    if (reUpsert.test(cadena)) violaciones.push({ line: lineAt(limpio, inicio), metodo: 'upsert' })
  }

  return violaciones
}

describe('violacionesPushTokensInsertUpsert (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta un insert directo, comillas simples', () => {
    const v = violacionesPushTokensInsertUpsert(`supabase.from('push_tokens').insert({ token, user_id })`)
    expect(v).toHaveLength(1)
    expect(v[0].metodo).toBe('insert')
  })

  it('detecta un upsert directo, comillas dobles', () => {
    const v = violacionesPushTokensInsertUpsert(`supabase.from("push_tokens").upsert({ token })`)
    expect(v).toHaveLength(1)
    expect(v[0].metodo).toBe('upsert')
  })

  it('detecta un insert en una cadena multilínea', () => {
    const content = `await supabase\n  .from('push_tokens')\n  .insert({ token, platform })\n  .select()`
    expect(violacionesPushTokensInsertUpsert(content)).toHaveLength(1)
  })

  it('detecta con backticks', () => {
    expect(violacionesPushTokensInsertUpsert('supabase.from(`push_tokens`).upsert(fila)')).toHaveLength(1)
  })

  it('NO marca un delete sobre push_tokens (el camino legítimo de borrarTokenDeEsteTelefono)', () => {
    expect(violacionesPushTokensInsertUpsert(`supabase.from('push_tokens').delete().eq('token', t)`)).toEqual([])
  })

  it('NO marca un insert sobre OTRA tabla (notification_sends, por ejemplo)', () => {
    expect(violacionesPushTokensInsertUpsert(`supabase.from('notification_sends').insert(filas)`)).toEqual([])
  })

  it('el .from() de push_tokens NO se confunde con un insert de la cadena de otra tabla que viene DESPUÉS', () => {
    const content = `supabase.from('push_tokens').delete().eq('token', t)\nsupabase.from('otra_tabla').insert(x)`
    expect(violacionesPushTokensInsertUpsert(content)).toEqual([])
  })

  it('un comentario que menciona insert/upsert de push_tokens no cuenta (se descarta antes de buscar)', () => {
    const content = `// nunca un supabase.from('push_tokens').insert(...)\nsupabase.from('push_tokens').delete().eq('token', t)`
    expect(violacionesPushTokensInsertUpsert(content)).toEqual([])
  })

  it('reporta dos violaciones si hay dos .from(push_tokens) distintos, cada uno con su línea', () => {
    const content = `supabase.from('push_tokens').insert(a)\nsupabase.from('push_tokens').upsert(b)`
    const v = violacionesPushTokensInsertUpsert(content)
    expect(v.map((x) => x.line)).toEqual([1, 2])
  })

  it('un archivo sin push_tokens: sin violaciones', () => {
    expect(violacionesPushTokensInsertUpsert('export function Foo() { return null }')).toEqual([])
  })
})

describe('detector estático: ningún .from("push_tokens").insert/.upsert en apps/mobile (código real, sin tests/)', () => {
  const archivos = listarArchivosDeCodigo(MOBILE_ROOT)

  it('recorrió al menos un archivo (si esto da 0, el detector no está mirando nada)', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it('al menos un archivo real usa .from("push_tokens") (si esto da 0, el detector de abajo pasaría por no mirar nada)', () => {
    const algunoConPushTokens = archivos.some((archivo) => /\.from\(\s*['"`]push_tokens['"`]\s*\)/.test(readFileSync(archivo, 'utf8')))
    expect(algunoConPushTokens).toBe(true)
  })

  it('ningún archivo hace insert/upsert directo sobre push_tokens', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const v of violacionesPushTokensInsertUpsert(contenido)) {
        violaciones.push(`${archivo}:${v.line} — .from('push_tokens').${v.metodo}(...)`)
      }
    }
    if (violaciones.length > 0) {
      throw new Error(`insert/upsert directo sobre push_tokens:\n${violaciones.join('\n')}`)
    }
    expect(violaciones).toEqual([])
  })
})

// ===========================================================================
// Detector 2: en apps/mobile/lib/push/**, ninguna llamada a console.* ni a
// Sentry con una variable que se llame (o contenga) "token" entre sus
// argumentos. El token nunca sale por consola ni por Sentry (ver el
// comentario de arriba de registro.ts): a lo sumo `error.code`/`error.name`.
// ===========================================================================

const RUTA_LIB_PUSH = `${MOBILE_ROOT}/lib/push`

/** Reemplaza el contenido de cada string literal (comillas simples/dobles/backtick) por nada, conservando los delimitadores: así "token" dentro de un mensaje de texto no cuenta como una variable. */
function vaciarStrings(content: string): string {
  return content.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (s) => s[0] + s[0])
}

interface ViolacionTokenEnLog {
  line: number
  llamada: string
}

/** El argumento de una llamada `fn(...)`, balanceando paréntesis, desde justo después del "(" de apertura. */
function leerArgumentoBalanceado(content: string, desdeIndex: number): string {
  let profundidad = 1
  let j = desdeIndex
  for (; j < content.length; j++) {
    if (content[j] === '(') profundidad++
    else if (content[j] === ')') {
      profundidad--
      if (profundidad === 0) break
    }
  }
  return content.slice(desdeIndex, j)
}

/**
 * Violaciones de `console.*`/`Sentry.*` cuyos argumentos (una vez vaciados
 * los strings y los comentarios) mencionan un identificador que contiene
 * "token" (case-insensitive): `token`, `pushToken`, `error.token`, un objeto
 * `{ token }`, etc. Deliberadamente amplio (prefiere un falso positivo a
 * dejar pasar una evasión, mismo criterio que `encontrarEvasionesTapPush` de
 * `tests/push-tap.test.ts`).
 */
function violacionesTokenEnLog(content: string): ViolacionTokenEnLog[] {
  const sinComentarios = quitarComentarios(content)
  const limpio = vaciarStrings(sinComentarios)
  const violaciones: ViolacionTokenEnLog[] = []

  const re = /\b(console\s*\.\s*(?:log|warn|error|info|debug)|Sentry\s*\.\s*\w+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(limpio))) {
    const inicioArg = m.index + m[0].length
    const arg = leerArgumentoBalanceado(limpio, inicioArg)
    // Sin \b antes de "token": tiene que atrapar también un identificador en
    // camelCase como "pushToken" (el límite de palabra no separa "push" de
    // "Token", son los dos \w). Deliberadamente amplio (ver el límite
    // conocido documentado arriba del archivo).
    if (/token/i.test(arg)) {
      violaciones.push({ line: lineAt(limpio, m.index), llamada: m[1].replace(/\s+/g, '') })
    }
  }

  return violaciones
}

describe('violacionesTokenEnLog (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta console.log(token)', () => {
    expect(violacionesTokenEnLog('console.log(token)')).toHaveLength(1)
  })

  it('detecta console.warn con el token como segundo argumento', () => {
    expect(violacionesTokenEnLog(`console.warn('[push]', token)`)).toHaveLength(1)
  })

  it('detecta console.error(pushToken) (identificador que CONTIENE "token", no solo "token" exacto)', () => {
    expect(violacionesTokenEnLog('console.error(pushToken)')).toHaveLength(1)
  })

  it('detecta Sentry.captureException con el token en un objeto de extras', () => {
    expect(violacionesTokenEnLog('Sentry.captureException(error, { extra: { token } })')).toHaveLength(1)
  })

  it('detecta Sentry.captureMessage(token)', () => {
    expect(violacionesTokenEnLog('Sentry.captureMessage(token)')).toHaveLength(1)
  })

  it('NO marca console.warn(etiqueta, codigo ?? nombre ?? "desconocido") (el camino real, sin token)', () => {
    expect(violacionesTokenEnLog(`console.warn(etiqueta, codigo ?? nombre ?? 'desconocido')`)).toEqual([])
  })

  it('NO marca un console.log con la palabra "token" solo dentro de un string (no es una variable)', () => {
    expect(violacionesTokenEnLog(`console.log('no se pudo activar el token de push')`)).toEqual([])
  })

  it('NO marca un comentario que menciona "token" (se descarta antes de buscar)', () => {
    const content = '// nunca loguear el token\nconsole.warn(etiqueta, codigo)'
    expect(violacionesTokenEnLog(content)).toEqual([])
  })

  it('NO marca console.log de una variable sin relación a "token"', () => {
    expect(violacionesTokenEnLog('console.log(cantidadDeIntentos)')).toEqual([])
  })

  it('reporta varias violaciones, cada una con su línea', () => {
    const content = 'console.log(token)\nSentry.captureException(err, { token })\n'
    const v = violacionesTokenEnLog(content)
    expect(v.map((x) => x.line)).toEqual([1, 2])
  })
})

describe('detector estático: apps/mobile/lib/push/** — ningún console.*/Sentry.* con una variable "token"', () => {
  const archivos = listarArchivosDeCodigo(RUTA_LIB_PUSH)

  it('recorrió al menos un archivo de lib/push (si esto da 0, el detector no está mirando nada)', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it('al menos un archivo real de lib/push usa console.* (si esto da 0, el detector de abajo pasaría por no mirar nada)', () => {
    const algunoConConsole = archivos.some((archivo) => /\bconsole\s*\.\s*\w+\s*\(/.test(readFileSync(archivo, 'utf8')))
    expect(algunoConConsole).toBe(true)
  })

  it('ningún console.*/Sentry.* de lib/push/** lleva una variable "token"', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const v of violacionesTokenEnLog(contenido)) {
        violaciones.push(`${archivo}:${v.line} — ${v.llamada}(...) con algo que contiene "token"`)
      }
    }
    if (violaciones.length > 0) {
      throw new Error(`console/Sentry con una variable "token" en lib/push:\n${violaciones.join('\n')}`)
    }
    expect(violaciones).toEqual([])
  })
})
