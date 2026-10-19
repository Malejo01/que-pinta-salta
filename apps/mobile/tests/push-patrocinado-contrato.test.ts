// Ronda 51, tarea 51-q (parte 2, QA): el contrato WEB ↔ APP del aviso push
// patrocinado. `armarTanda` (`@qps/core/notificaciones/tanda`, 51-a/51-b)
// arma el mensaje con datos reales (una campaña vigente de verdad, resuelta
// con `campaniaVigente`, no un literal escrito a mano); ese mensaje viaja por
// `MensajePush` (`apps/web/lib/notificaciones/expo-push.ts`, 51-b/51-c); del
// otro lado, `interpretarRespuestaPush` (`lib/push/tap.ts`, 51-e) es quien lo
// tiene que entender cuando la persona toca el aviso (o el botón de baja).
//
// Lo que este archivo NO duplica (y por qué):
//   - `tests/push-tap.test.ts` y `tests/push-patrocinado.test.ts` ya prueban
//     `interpretarRespuestaPush`/`decidirBajaPatrocinados` con respuestas
//     armadas a mano (fixtures, sin pasar por `armarTanda`): el valor de ESTE
//     archivo es, justamente, que las dos puntas (core y app) se toquen de
//     verdad, no repetir esos casos.
//   - `tests/push-tanda-tap.test.ts` (41-q) ya prueba que `armarTanda` +
//     `eventoIdDesdeDatosPush` dan el mismo `eventId` para favoritos y
//     novedades: acá se suma el camino que ESE archivo no cubre (el aviso
//     PATROCINADO, y pasar la respuesta completa por
//     `interpretarRespuestaPush`, no solo por `eventoIdDesdeDatosPush`, para
//     poder chequear el campo `patrocinado`).
//   - `tests/push-patrocinado.test.ts` (51-e) ya tiene un detector de UN SOLO
//     SALTO, con una regex fija, sobre `ManejadorTapPush.tsx` (el argumento
//     de `cambiarPatrocinados(` es, literalmente, el texto `"decision.userId"`)
//     y sobre `AvisoPatrocinado.tsx` (`userId` sale de `session.user.id`). Acá
//     abajo hay un resolutor GENÉRICO (basado en patrones de
//     asignación/parámetro/llamada, no en los nombres de variable de este
//     archivo en particular) que persigue la cadena COMPLETA de
//     `ManejadorTapPush.tsx`: `decision` ahí es un PARÁMETRO de
//     `aplicarDecisionBaja`, no una constante local — el detector de 51-e no
//     sigue de dónde sale ESE `decision` (el sitio donde se LLAMA a
//     `aplicarDecisionBaja`, la asignación `const decision = decidirBajaPatrocinados(...)`,
//     y de ahí a `estadoCuentaRef.current` y recién ahí a `session`). Eso es
//     lo que se cubre acá, con varios saltos reales, no uno solo.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { saltaWallClockToDate } from '@qps/core/date-format'
import { armarTanda, type DatosParaTanda, type MensajeDeTanda, type CampaniaParaTanda } from '@qps/core/notificaciones/tanda'
import { PREFERENCIAS_POR_DEFECTO } from '@qps/core/notificaciones/preferencias'
import {
  ACCION_BAJA_PATROCINADOS,
  CATEGORIA_PATROCINADO,
  ETIQUETA_PATROCINADO,
  LARGO_MAXIMO_TITULO,
  campaniaVigente,
  validarCampania,
  type VentanaCampania,
} from '@qps/core/notificaciones/patrocinados'
import { interpretarRespuestaPush, type RespuestaPushMinima } from '../lib/push/tap'
// Tipo del "cable" entre core y la app (51-b/51-c): no hay un alias de
// `apps/web` en `vitest.config.ts`/`tsconfig.json` de esta app (a propósito:
// `apps/mobile` no depende en runtime de `apps/web`), así que se importa por
// ruta relativa, SOLO el tipo (`import type`, nunca un valor): a `expo-push.ts`
// no le hace falta nada de React Native ni de Expo para que esto compile
// (el archivo no tiene ningún import propio, ver su cabecera).
import type { MensajePush } from '../../web/lib/notificaciones/expo-push'

const USER_ID = '10000000-0000-4000-8000-000000000051'
const EVENT_ID = '20000000-0000-4000-8000-000000000051'
const TOKEN = 'ExponentPushToken[contrato-51-q]'

// El identificador por defecto de Expo para un tap común (no un botón de
// acción), copiado de `expo-notifications` (`DEFAULT_ACTION_IDENTIFIER`),
// igual que en `tests/push-patrocinado.test.ts`: evita importar el módulo
// nativo en un test puro.
const TAP_COMUN = 'expo.modules.notifications.actions.DEFAULT'

/**
 * El mensaje tal como lo entrega `armarTanda` (`MensajeDeTanda`, con
 * `userId`/`kind`/`eventId`/`dedupeKey`/`campaignId` de más) reducido a
 * exactamente la forma de `MensajePush` — con el tipo de retorno anotado a
 * mano, para que TypeScript rechace esto si algún campo de los dos lados
 * dejara de ser compatible (es el "se tocan de verdad" del contrato, no un
 * `as` que lo esconda).
 */
function aMensajePush(m: MensajeDeTanda): MensajePush {
  return { to: m.to, title: m.title, body: m.body, data: m.data, categoryId: m.categoryId }
}

/** Arma la respuesta de push como la entregaría `expo-notifications`, a partir de un `MensajePush` ya armado por el lado del servidor. */
function respuestaDesdeMensaje(mensaje: MensajePush, actionIdentifier: string): RespuestaPushMinima {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: 'notif-contrato-51-q',
        content: {
          categoryIdentifier: mensaje.categoryId ?? null,
          data: mensaje.data,
        },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// El mensaje patrocinado de armarTanda (core) viaja por MensajePush (web) y
// lo entiende interpretarRespuestaPush (app).
// ---------------------------------------------------------------------------
describe('el mensaje patrocinado de armarTanda (core) viaja por MensajePush (web) y lo entiende interpretarRespuestaPush (app)', () => {
  const AHORA = saltaWallClockToDate('2030-11-05T20:00:00')
  const TITULO_CAMPANIA = 'Noche de Trivia en Bar de Prueba'
  const CUERPO_CAMPANIA = 'Vení con amigos, hay premios. Entrada libre.'

  // Se valida la campaña con las mismas reglas que el panel admin (51-a),
  // para no armar un fixture que ni siquiera podría haberse guardado.
  const validacion = validarCampania(
    {
      titulo: TITULO_CAMPANIA,
      cuerpo: CUERPO_CAMPANIA,
      eventId: EVENT_ID,
      startsAt: saltaWallClockToDate('2030-11-01T00:00:00'),
      endsAt: saltaWallClockToDate('2030-11-08T00:00:00'),
    },
    AHORA,
    [],
  )
  if (!validacion.ok) throw new Error('fixture mal armado: la campaña de prueba no pasa validarCampania')

  // Dos campañas, una ya terminada: `campaniaVigente` (51-a) es quien tiene
  // que elegir la segunda — no se le pasa la campaña ya resuelta a mano.
  const CAMPANIAS: (CampaniaParaTanda & VentanaCampania)[] = [
    {
      id: 'campania-vieja-de-prueba',
      titulo: 'Promo vieja (ya terminó, no debería aparecer)',
      cuerpo: 'Si este texto aparece en un mensaje, campaniaVigente tiene un bug.',
      eventId: EVENT_ID,
      startsAt: saltaWallClockToDate('2030-10-01T00:00:00'),
      endsAt: saltaWallClockToDate('2030-10-05T00:00:00'),
    },
    {
      id: 'campania-vigente-de-prueba',
      titulo: validacion.datos.titulo,
      cuerpo: validacion.datos.cuerpo,
      eventId: validacion.datos.eventId,
      startsAt: validacion.datos.startsAt,
      endsAt: validacion.datos.endsAt,
    },
  ]

  const campaniaElegida = campaniaVigente(CAMPANIAS, AHORA)
  if (!campaniaElegida) throw new Error('fixture mal armado: ninguna campaña está vigente en AHORA')

  const datos: DatosParaTanda = {
    usuarios: [
      {
        userId: USER_ID,
        preferencias: { ...PREFERENCIAS_POR_DEFECTO, sponsored: true },
        tokens: [TOKEN],
        favoritos: [],
        novedades: [],
        enviosRegistrados: [],
      },
    ],
    patrocinado: campaniaElegida,
  }

  const mensajes = armarTanda(datos, AHORA)

  it('armarTanda elige la campaña vigente (no la vieja) y arma exactamente un mensaje patrocinado, con categoryId de la constante de core', () => {
    expect(mensajes).toHaveLength(1)
    const [mensaje] = mensajes
    expect(mensaje.kind).toBe('patrocinado')
    expect(mensaje.eventId).toBe(EVENT_ID)
    expect(mensaje.campaignId).toBe('campania-vigente-de-prueba')
    expect(mensaje.categoryId).toBe(CATEGORIA_PATROCINADO)
    expect(mensaje.data).toMatchObject({ tipo: CATEGORIA_PATROCINADO })
    expect(mensaje.title).toBe(`${ETIQUETA_PATROCINADO} · ${TITULO_CAMPANIA}`)
  })

  it('ese mensaje, pasado por MensajePush y un tap común: abrir, con el mismo eventId de la campaña y patrocinado: true', () => {
    const mensajePush = aMensajePush(mensajes[0])
    const respuesta = respuestaDesdeMensaje(mensajePush, TAP_COMUN)
    expect(interpretarRespuestaPush(respuesta)).toEqual({ accion: 'abrir', id: EVENT_ID, patrocinado: true })
  })

  it('ese mismo mensaje, con el botón de baja rápida (ACCION_BAJA_PATROCINADOS, la misma constante que registra lib/push/categorias.ts): baja-patrocinados', () => {
    const mensajePush = aMensajePush(mensajes[0])
    const respuesta = respuestaDesdeMensaje(mensajePush, ACCION_BAJA_PATROCINADOS)
    expect(interpretarRespuestaPush(respuesta)).toEqual({ accion: 'baja-patrocinados' })
  })
})

// ---------------------------------------------------------------------------
// El contrato no es "todo es patrocinado": un favorito sin tipo sigue dando
// patrocinado: false.
// ---------------------------------------------------------------------------
describe('un favorito (sin tipo) sigue dando patrocinado: false: el contrato no es trivialmente "todo es patrocinado"', () => {
  const AHORA = saltaWallClockToDate('2030-11-05T20:00:00')

  const datos: DatosParaTanda = {
    usuarios: [
      {
        userId: USER_ID,
        preferencias: PREFERENCIAS_POR_DEFECTO,
        tokens: [TOKEN],
        favoritos: [
          {
            eventId: EVENT_ID,
            title: 'Show de Prueba (sin patrocinar)',
            start_date: saltaWallClockToDate('2030-11-05T21:00:00').toISOString(),
          },
        ],
        novedades: [],
        enviosRegistrados: [],
      },
    ],
  }

  it('el tap de ese favorito, pasado por el mismo camino (MensajePush → interpretarRespuestaPush): abrir, patrocinado: false', () => {
    const mensajes = armarTanda(datos, AHORA)
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0].kind).toBe('favorito')
    expect(mensajes[0].categoryId).toBeUndefined() // solo los patrocinados llevan categoryId (ver MensajeTanda, tanda.ts)

    const mensajePush = aMensajePush(mensajes[0])
    const respuesta = respuestaDesdeMensaje(mensajePush, TAP_COMUN)
    expect(interpretarRespuestaPush(respuesta)).toEqual({ accion: 'abrir', id: EVENT_ID, patrocinado: false })
  })
})

// ---------------------------------------------------------------------------
// categoryId / identifier salen de las MISMAS constantes de core, nunca de un
// string escrito a mano de cada lado.
// ---------------------------------------------------------------------------
describe('categoryId (core → mensaje) e identifier (app → categoría de Expo) salen de las mismas constantes, nunca de un string a mano', () => {
  const RUTA_TANDA = fileURLToPath(new URL('../../../packages/core/src/notificaciones/tanda.ts', import.meta.url))
  const srcTanda = readFileSync(RUTA_TANDA, 'utf8')
  const RUTA_CATEGORIAS = fileURLToPath(new URL('../lib/push/categorias.ts', import.meta.url))
  const srcCategorias = readFileSync(RUTA_CATEGORIAS, 'utf8')

  it('tanda.ts (core) importa CATEGORIA_PATROCINADO de ./patrocinados y lo usa como categoryId del candidato patrocinado', () => {
    expect(srcTanda).toMatch(/import\s*\{[^}]*\bCATEGORIA_PATROCINADO\b[^}]*\}\s*from\s*['"]\.\/patrocinados['"]/)
    expect(srcTanda).toMatch(/categoryId:\s*CATEGORIA_PATROCINADO\b/)
  })

  it('categorias.ts (app) importa CATEGORIA_PATROCINADO y ACCION_BAJA_PATROCINADOS de @qps/core/notificaciones/patrocinados (no un string a mano) y los usa al registrar la categoría', () => {
    expect(srcCategorias).toMatch(
      /import\s*\{[^}]*\bACCION_BAJA_PATROCINADOS\b[^}]*\bCATEGORIA_PATROCINADO\b[^}]*\}\s*from\s*['"]@qps\/core\/notificaciones\/patrocinados['"]/,
    )
    expect(srcCategorias).toMatch(/setNotificationCategoryAsync\(\s*CATEGORIA_PATROCINADO\s*,/)
    expect(srcCategorias).toMatch(/identifier:\s*ACCION_BAJA_PATROCINADOS\b/)
  })

  // Este tercer test nació de un hallazgo de 51-q: al buscar el VALOR
  // 'patrocinado' entre comillas fuera de los imports apareció que
  // `candidatoPatrocinado` armaba `data: { url, tipo: 'patrocinado' }` con
  // el STRING LITERAL, dos líneas debajo de un `categoryId:
  // CATEGORIA_PATROCINADO`. Coincidía por casualidad (el valor de la
  // constante ES `'patrocinado'`), así que nada estaba roto; pero
  // `esAvisoPatrocinado` (`lib/push/tap.ts`) usa `data.tipo` como respaldo
  // de `categoryIdentifier` cuando `registrarCategoriasPush` falla en
  // silencio, y el día que la constante cambiara de valor `categoryId` se
  // habría actualizado solo y `data.tipo` no: el respaldo habría dejado de
  // reconocer el aviso, en silencio y sin un test en rojo. Lo arregló el
  // lead en el mismo commit que este archivo; el test es lo que impide que
  // vuelva.
  it('el `data.tipo` del candidato patrocinado de core sale de la constante, no de un string a mano', () => {
    // El corte del final de la función, con `\r?\n` y no con `\n` a secas:
    // en Windows este archivo queda con CRLF en el disco y un `indexOf('\n}\n')`
    // devuelve -1, lo que dejaba un recorte de dos caracteres que hacía
    // fallar el test por el motivo equivocado.
    const cuerpoDelCandidato = srcTanda.slice(srcTanda.indexOf('function candidatoPatrocinado'))
    const finDeLaFuncion = /\r?\n\}\r?\n/.exec(cuerpoDelCandidato)
    expect(finDeLaFuncion).not.toBeNull()
    const hastaElFinalDeLaFuncion = cuerpoDelCandidato.slice(0, (finDeLaFuncion?.index ?? 0) + 1)

    expect(hastaElFinalDeLaFuncion).toMatch(/tipo:\s*CATEGORIA_PATROCINADO\b/)
    // Solo el `tipo` del `data`: el `kind: 'patrocinado'` de la misma
    // función es otra cosa (el valor de la columna
    // `notification_sends.kind`, que no tiene nada que ver con la categoría
    // de notificación de Expo) y ahí el literal es correcto.
    expect(hastaElFinalDeLaFuncion).not.toMatch(/tipo:\s*['"`]/)
  })
})

// ---------------------------------------------------------------------------
// Detector transitivo: ningún user_id que venga del push llega a una
// escritura en la app. Resolutor GENÉRICO sobre el texto (sin AST real: solo
// patrones de asignación, parámetro↔sitio-de-llamada, y destructuring de
// useSession()), para no limitarse a una regex fija de un solo salto.
// ---------------------------------------------------------------------------

const PALABRAS_CLAVE_JS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'null',
  'undefined',
  'true',
  'false',
  'new',
  'typeof',
  'await',
  'async',
  'void',
  'this',
])

/** Saca comentarios de línea y de bloque (bruto: alcanza para estos archivos, sin strings con "//" ni "/*" adentro). */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/**
 * Identificadores/paths "libres" de una expresión: une una cadena de accesos
 * a propiedad (`session?.user.id` queda como UN solo token), y descarta las
 * CLAVES de un objeto (`userId:` en `{ userId: session... }` no es una
 * referencia a una variable llamada `userId`, es el nombre del campo).
 */
function pathsEn(expr: string): string[] {
  const sinClaves = expr.replace(/\b[A-Za-z_$][\w$]*\s*:(?!:)/g, ' ')
  const tokens = sinClaves.match(/[A-Za-z_$][\w$]*(?:\?\.[A-Za-z_$][\w$]*|\.[A-Za-z_$][\w$]*)*/g) ?? []
  return [...new Set(tokens.filter((t) => !PALABRAS_CLAVE_JS.has(t.split(/\?\.|\./)[0])))]
}

/** Desde `desde`, corta la expresión hasta que paréntesis/llaves/corchetes vuelvan a profundidad 0 y venga un `;`, un salto de línea a profundidad 0, o se acabe el string. */
function extraerExpresionDesde(src: string, desde: number): string {
  let profundidad = 0
  let i = desde
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '(' || c === '{' || c === '[') profundidad++
    else if (c === ')' || c === '}' || c === ']') {
      if (profundidad === 0) break
      profundidad--
    } else if (c === ';' && profundidad === 0) break
    else if (c === '\n' && profundidad === 0) break
  }
  return src.slice(desde, i).trim()
}

/** Todas las expresiones asignadas a `path` (`const X = …`, `X = …`, con o sin un `.algo` en `path`), en orden de aparición. */
function expresionesAsignadasA(src: string, path: string): string[] {
  const escapado = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escapado}\\s*=(?!=)\\s*`, 'g')
  const resultados: string[] = []
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(src))) {
    resultados.push(extraerExpresionDesde(src, re.lastIndex))
  }
  return resultados
}

/**
 * Si `nombre` (sin path, un identificador suelto) es el PARÁMETRO en esa
 * posición de alguna `function NOMBRE(...)`, busca un sitio donde se LLAME a
 * esa función (que no sea la propia declaración) y devuelve el argumento real
 * que se le pasó ahí. `null` si no aplica.
 */
function argumentoDesdeLlamadaDeParametro(src: string, nombre: string): string | null {
  const reDecl = /function\s+(\w+)\s*\(([^)]*)\)/g
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = reDecl.exec(src))) {
    const nombreFuncion = m[1]
    const params = m[2]
      .split(',')
      .map((p) => p.trim().split(':')[0].trim())
      .filter(Boolean)
    const posicion = params.indexOf(nombre)
    if (posicion === -1) continue

    const reLlamada = new RegExp(`\\b${nombreFuncion}\\s*\\(([^)]*)\\)`, 'g')
    let llamada: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((llamada = reLlamada.exec(src))) {
      const antes = src.slice(Math.max(0, llamada.index - 20), llamada.index)
      if (/function\s+$/.test(antes)) continue // es la propia declaración, no un llamado real
      const args = llamada[1].split(',').map((a) => a.trim())
      if (args[posicion]) return args[posicion]
    }
  }
  return null
}

/** `true` si `nombre` sale de `const { ..., nombre, ... } = useSession()` (con o sin renombre `x: nombre`). */
function vieneDeUseSessionDestructurado(src: string, nombre: string): boolean {
  const re = /const\s*\{([^}]*)\}\s*=\s*useSession\s*\(\s*\)/g
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(src))) {
    const nombres = m[1].split(',').map((parte) => {
      const piezas = parte.trim().split(':').map((s) => s.trim())
      return piezas.length > 1 ? piezas[1] : piezas[0]
    })
    if (nombres.includes(nombre)) return true
  }
  return false
}

/** Fuentes posibles de `path`: asignación directa, o (si es un `.ref.current`) el valor inicial de `useRef(...)`, o (si es un identificador suelto sin ninguna asignación) el argumento real en el sitio donde se llama a la función de la que es parámetro. */
function fuentesDe(src: string, path: string): string[] {
  const fuentes = [...expresionesAsignadasA(src, path)]
  const base = path.split(/\?\.|\./)[0]

  if (path.includes('.')) {
    const reRef = new RegExp(`\\b${base}\\s*=\\s*useRef(?:<[^>]*>)?\\(`, 'g')
    const mRef = reRef.exec(src)
    if (mRef) fuentes.push(extraerExpresionDesde(src, reRef.lastIndex))
  }

  if (fuentes.length === 0) {
    if (base !== path) fuentes.push(...expresionesAsignadasA(src, base))
    const comoArgumento = argumentoDesdeLlamadaDeParametro(src, base)
    if (comoArgumento) fuentes.push(comoArgumento)
  }

  return fuentes
}

interface ResultadoTraza {
  useSessionAlcanzado: boolean
  prohibidasAlcanzadas: Set<string>
}

/** Las formas en las que el `data` externo y no confiable de un push podría colarse (ver la cabecera de `lib/push/tap.ts`). */
const PALABRAS_PROHIBIDAS_ORIGEN = ['data', 'respuesta', 'notification', 'content']

function resolverOrigen(src: string, path: string, visitados: Set<string>, profundidadRestante: number): ResultadoTraza {
  const vacio: ResultadoTraza = { useSessionAlcanzado: false, prohibidasAlcanzadas: new Set() }
  if (visitados.has(path) || profundidadRestante <= 0) return vacio
  visitados.add(path)

  const base = path.split(/\?\.|\./)[0]

  if (PALABRAS_PROHIBIDAS_ORIGEN.includes(base)) {
    return { useSessionAlcanzado: false, prohibidasAlcanzadas: new Set([base]) }
  }

  if (vieneDeUseSessionDestructurado(src, base)) {
    return { useSessionAlcanzado: true, prohibidasAlcanzadas: new Set() }
  }

  const resultado: ResultadoTraza = { useSessionAlcanzado: false, prohibidasAlcanzadas: new Set() }

  for (const fuente of fuentesDe(src, path)) {
    if (/^useSession\s*\(\s*\)$/.test(fuente.trim())) {
      resultado.useSessionAlcanzado = true
      continue
    }

    // Si la fuente es ENTERA una llamada a función (`decidirBajaPatrocinados(estadoCuentaRef.current)`),
    // se sigue por sus argumentos (es la provenance real: una función pura devuelve algo derivado de lo que recibió).
    const llamada = /^[A-Za-z_$][\w$]*\s*\(([\s\S]*)\)$/.exec(fuente.trim())
    const paraSeguir = llamada ? llamada[1] : fuente

    for (const siguiente of pathsEn(paraSeguir)) {
      const sub = resolverOrigen(src, siguiente, visitados, profundidadRestante - 1)
      if (sub.useSessionAlcanzado) resultado.useSessionAlcanzado = true
      for (const p of sub.prohibidasAlcanzadas) resultado.prohibidasAlcanzadas.add(p)
    }
  }

  return resultado
}

/** El punto de entrada: extrae el primer argumento de `cambiarPatrocinados(` y traza su origen. */
function trazarArgumentoDeCambiarPatrocinados(srcCrudo: string): ResultadoTraza {
  const src = sinComentarios(srcCrudo)
  const m = /cambiarPatrocinados\(\s*([^,]+?)\s*,/.exec(src)
  if (!m) throw new Error('no se encontró ninguna llamada a cambiarPatrocinados( en el archivo')

  const visitados = new Set<string>()
  const resultado: ResultadoTraza = { useSessionAlcanzado: false, prohibidasAlcanzadas: new Set() }
  for (const token of pathsEn(m[1].trim())) {
    const sub = resolverOrigen(src, token, visitados, 12)
    if (sub.useSessionAlcanzado) resultado.useSessionAlcanzado = true
    for (const p of sub.prohibidasAlcanzadas) resultado.prohibidasAlcanzadas.add(p)
  }
  return resultado
}

describe('detector transitivo: el argumento de cambiarPatrocinados( tiene que trazarse hasta useSession(), nunca hasta data/respuesta/notification/content', () => {
  const RUTA_MANEJADOR = fileURLToPath(new URL('../components/ManejadorTapPush.tsx', import.meta.url))
  const srcManejador = readFileSync(RUTA_MANEJADOR, 'utf8')

  it('ManejadorTapPush.tsx: decision.userId → decision (parámetro de aplicarDecisionBaja) → el sitio donde se lo llama → decidirBajaPatrocinados(estadoCuentaRef.current) → estadoCuentaRef.current → session/cargando → useSession() — ningún salto pasa por data/respuesta/notification/content', () => {
    const resultado = trazarArgumentoDeCambiarPatrocinados(srcManejador)
    expect([...resultado.prohibidasAlcanzadas]).toEqual([])
    expect(resultado.useSessionAlcanzado).toBe(true)
  })

  const RUTA_AVISO = fileURLToPath(new URL('../components/AvisoPatrocinado.tsx', import.meta.url))
  const srcAviso = readFileSync(RUTA_AVISO, 'utf8')

  // `tests/push-patrocinado.test.ts` (51-e) ya prueba, con una regex de un
  // solo salto, que acá `userId` sale de `session.user.id`. Esto es una
  // confirmación cruzada con el MISMO resolutor genérico de arriba (no una
  // regex nueva hardcodeada a los nombres de este archivo): no agrega un
  // caso nuevo de cobertura, así que no hace falta otro más allá de este.
  it('AvisoPatrocinado.tsx: confirmación cruzada con el resolutor genérico (lo que push-patrocinado.test.ts ya prueba con una regex fija)', () => {
    const resultado = trazarArgumentoDeCambiarPatrocinados(srcAviso)
    expect([...resultado.prohibidasAlcanzadas]).toEqual([])
    expect(resultado.useSessionAlcanzado).toBe(true)
  })

  // Fixtures de rotura: prueban que el resolutor de arriba de verdad detecta
  // lo malo (si no, las dos pruebas de arriba podrían estar pasando de
  // pedo, sin que el detector sirva para nada).
  it('fixture de rotura: cambiarPatrocinados(data.userId, false) → se detecta "data" como origen prohibido, useSession NO alcanzado', () => {
    const snippet = `
      function manejar(data) {
        cambiarPatrocinados(data.userId, false)
      }
    `
    const resultado = trazarArgumentoDeCambiarPatrocinados(snippet)
    expect(resultado.useSessionAlcanzado).toBe(false)
    expect([...resultado.prohibidasAlcanzadas]).toEqual(['data'])
  })

  it('fixture de rotura: una variable suelta sin ninguna relación con useSession() → useSession NO alcanzado (y sin prohibidas: no hay por qué fallar "para el otro lado")', () => {
    const snippet = `
      const otraCosa = 'texto cualquiera'
      cambiarPatrocinados(otraCosa, false)
    `
    const resultado = trazarArgumentoDeCambiarPatrocinados(snippet)
    expect(resultado.useSessionAlcanzado).toBe(false)
    expect([...resultado.prohibidasAlcanzadas]).toEqual([])
  })

  it('fixture bueno: una cadena de variables intermedias (parámetro de función + sitio de llamada + destructuring) que sí llega a useSession() → useSession alcanzado, sin prohibidas', () => {
    const snippet = `
      const { session, cargando } = useSession()
      function ayudante(decision) {
        cambiarPatrocinados(decision.userId, false)
      }
      function quienLlama() {
        const decision = decidirAlgo({ userId: session?.user.id, cargando })
        ayudante(decision)
      }
    `
    const resultado = trazarArgumentoDeCambiarPatrocinados(snippet)
    expect(resultado.useSessionAlcanzado).toBe(true)
    expect([...resultado.prohibidasAlcanzadas]).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Nada imita al sistema: ningún título que pase validarCampania puede dar un
// mensaje patrocinado cuyo title no empiece con "Patrocinado · ".
// ---------------------------------------------------------------------------
describe('ningún título que pase validarCampania puede dar un mensaje patrocinado con un title que no empiece con "Patrocinado · "', () => {
  const CUERPO_VALIDO = 'Entrada libre y gratuita, cupos limitados. Te esperamos.'
  const AHORA = saltaWallClockToDate('2030-11-05T12:00:00')
  const INICIO = saltaWallClockToDate('2030-11-06T00:00:00')
  const FIN = saltaWallClockToDate('2030-11-07T00:00:00')
  const PREFIJO_ESPERADO = `${ETIQUETA_PATROCINADO} · `

  // Títulos inventados, pensados para pasar validarCampania (ninguno pisa
  // PALABRAS_QUE_IMITAN_AL_SISTEMA, ninguno tiene caracteres de control,
  // ninguno supera LARGO_MAXIMO_TITULO) pero que intentan "parecerse" al
  // prefijo del sistema sin usar ninguna palabra prohibida.
  const TITULOS_CANDIDATOS = [
    'Noche de Trivia en Bar de Prueba',
    'PATROCINADO: descuento especial',
    'Patrocinado por Bar de Prueba (en serio)',
    '¡2x1 en cerveza artesanal!',
    'Aviso: función extra a las 23',
    'NOTIFICACIÓN: nuevo show confirmado', // "notificación" no está en PALABRAS_QUE_IMITAN_AL_SISTEMA (solo "actualización")
    '"Oficial" - Bar de Prueba',
    'á é í ó ú ñ — Peña de Prueba',
    'x'.repeat(LARGO_MAXIMO_TITULO), // exactamente al límite de largo
  ]

  it.each(TITULOS_CANDIDATOS)('título candidato: %s', (tituloCrudo) => {
    const validacion = validarCampania(
      { titulo: tituloCrudo, cuerpo: CUERPO_VALIDO, eventId: EVENT_ID, startsAt: INICIO, endsAt: FIN },
      AHORA,
      [],
    )
    if (!validacion.ok) {
      // No es un caso descartado en silencio: si algún título de la lista
      // dejara de pasar validarCampania (por ejemplo, porque alguien agrega
      // una palabra nueva a PALABRAS_QUE_IMITAN_AL_SISTEMA), esto avisa en
      // la salida del test en vez de "pasar" sin haber probado nada.
      console.warn(`título descartado por validarCampania, no aplica para esta prueba: "${tituloCrudo}"`)
      return
    }

    const datos: DatosParaTanda = {
      usuarios: [
        {
          userId: USER_ID,
          preferencias: PREFERENCIAS_POR_DEFECTO,
          tokens: [TOKEN],
          favoritos: [],
          novedades: [],
          enviosRegistrados: [],
        },
      ],
      patrocinado: {
        id: 'campania-titulo-candidato',
        titulo: validacion.datos.titulo,
        cuerpo: validacion.datos.cuerpo,
        eventId: EVENT_ID,
      },
    }

    const mensajes = armarTanda(datos, AHORA)
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0].title?.startsWith(PREFIJO_ESPERADO)).toBe(true)
  })
})
