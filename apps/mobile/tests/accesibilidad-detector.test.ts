// 46-b (Ronda 46, calidad de la app): detectores estáticos de accesibilidad
// para `app/**` y `components/**`, con línea de base. Mismo estilo de
// barrido que `tests/dimensions.test.ts` (recorte de comentarios, archivo +
// línea en cada hallazgo) y `tests/colores-texto.test.ts`/`tests/iconos.test.ts`
// (fixtures en memoria primero, `it.each` sobre los archivos reales después).
//
// Las reglas (ver el encargo, `ops/rondas/46-calidad-app/tareas/46-b-detectores.md`):
//   sin-rol       Un `Pressable`/`Touchable*` sin `accessibilityRole`.
//   sin-etiqueta  Un `Pressable`/`Touchable*` sin accessibilityLabel NI texto
//                 visible en el cuerpo (`<Texto`/`<Text`); un `Switch` sin
//                 accessibilityLabel.
//   link-externo  El `onPress` abre `Linking.openURL`/`abrirPostDeInstagram`
//                 (directo, o a través de una función del mismo archivo), con
//                 un accessibilityRole distinto de "link".
//   area-chica    Un `minHeight`/`minWidth`/`height`/`width` numérico < 48 en
//                 un estilo de `StyleSheet.create` que se usa en el `style`
//                 de un `Pressable` del mismo archivo (heurística por nombre
//                 de estilo, no por layout real).
//   sin-escalar   `allowFontScaling={false}`. Sin línea de base: 0 siempre.
//   escala-suelta `maxFontSizeMultiplier` con un número literal (en vez de
//                 `ESCALA_MAXIMA_COMPACTA` de `lib/accesibilidad.ts`, que esta
//                 tarea NO importa como valor — ver el comentario de más
//                 abajo). Sin línea de base: 0 siempre.
//
// IMPORTANTE: este archivo no es un parser de JSX/TS. Es texto recortado con
// regex y conteo de llaves — cada límite conocido de la heurística está
// documentado donde corresponde, con un test que prueba el límite tal cual
// es (no lo que "debería" ser), para que nadie lo lea como un parser de
// verdad.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolverHitSlop } from './a11y/hitslop-medidas'
import { PENDIENTES_COMPONENTES, type ReglaAccesibilidad } from './a11y/pendientes-componentes'
import { PENDIENTES_PANTALLAS } from './a11y/pendientes-pantallas'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')

// ---------------------------------------------------------------------------
// Barrido de archivos (mismo patrón que tests/dimensions.test.ts).
// ---------------------------------------------------------------------------

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Recorte de comentarios línea por línea (mismo criterio que
 * `quitarComentarios` de `tests/colores-texto.test.ts`): un comentario de
 * bloque deja la línea en blanco mientras dura, uno de línea corta desde el
 * `//`. Reconstruye con `join('\n')`, así que el NÚMERO de línea de cualquier
 * índice del resultado es el mismo que en el original (no así la columna:
 * no la necesitamos). Esto es lo que evita que un comentario que *menciona*
 * `<Pressable` o `allowFontScaling={false}` cuente como un uso real.
 */
export function quitarComentarios(content: string): string {
  const lineasDeTexto = content.split('\n')
  const resultado: string[] = []
  let dentroDeBloqueComentario = false

  for (let linea of lineasDeTexto) {
    if (dentroDeBloqueComentario) {
      const finBloque = linea.indexOf('*/')
      if (finBloque === -1) {
        resultado.push('')
        continue
      }
      linea = linea.slice(finBloque + 2)
      dentroDeBloqueComentario = false
    }

    const inicioBloque = linea.indexOf('/*')
    if (inicioBloque !== -1 && linea.indexOf('*/', inicioBloque + 2) === -1) {
      linea = linea.slice(0, inicioBloque)
      dentroDeBloqueComentario = true
    }

    const idxComentarioDeLinea = linea.search(/(^|\s)\/\//)
    resultado.push(idxComentarioDeLinea === -1 ? linea : linea.slice(0, idxComentarioDeLinea))
  }

  return resultado.join('\n')
}

/** Línea (1-based) de un índice de `content`. */
function lineaDe(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

// ---------------------------------------------------------------------------
// Lectura de un tocable: la etiqueta de apertura (contando llaves, no
// cortando en el primer ">") y, si no se cierra sola, el cuerpo hasta su
// cierre (contando los anidados del MISMO tag, recursivamente: así un
// `Pressable` anidado se extrae como su propio tocable, una sola vez, y el
// de afuera no lo vuelve a procesar como parte de su cuerpo).
// ---------------------------------------------------------------------------

export interface Tocable {
  tag: string
  linea: number
  apertura: string
  cuerpo: string
  selfClosing: boolean
}

const RE_TOCABLE = /<(Pressable|Switch|Touchable\w*)\b/

/**
 * Lee la etiqueta de apertura que empieza en `inicio` (el índice del "<"),
 * contando llaves: el primer ">" que aparece con profundidad de llaves 0 es
 * el que cierra la etiqueta. Esto es lo que hace que
 * `style={({ pressed }) => [...]}` no corte la apertura en el "=>" ni en
 * ningún ">" de adentro (están todos dentro de un "{" sin cerrar todavía).
 *
 * LÍMITE CONOCIDO (no es un parser de JSX): no se saltan los strings. Un
 * ">" suelto DENTRO de un atributo de texto, fuera de cualquier "{}"
 * (`title="a > b"`), sí corta la etiqueta ahí — ver el test de más abajo que
 * prueba este límite tal cual es. No es un caso real en `app/`/`components/`
 * hoy (ningún atributo de texto trae un "<" o ">" literal).
 */
export function leerEtiquetaApertura(content: string, inicio: number): { apertura: string; selfClosing: boolean; fin: number } {
  let profundidad = 0
  let i = inicio
  for (; i < content.length; i++) {
    const c = content[i]
    if (c === '{') profundidad++
    else if (c === '}') profundidad--
    else if (c === '>' && profundidad <= 0) {
      let j = i - 1
      while (j >= 0 && /\s/.test(content[j])) j--
      const selfClosing = content[j] === '/'
      return { apertura: content.slice(inicio, i + 1), selfClosing, fin: i + 1 }
    }
  }
  // Etiqueta sin cerrar (archivo roto, o se acabó el contenido): se toma
  // todo lo que queda, nunca se cuelga en un loop infinito.
  return { apertura: content.slice(inicio), selfClosing: true, fin: content.length }
}

/**
 * Lee un tocable completo a partir de `inicio` (el índice de su "<"): la
 * apertura, y si no se cierra sola, el cuerpo hasta su `</tag>` — saltando
 * (recursivamente) cualquier tocable del MISMO nombre anidado adentro, para
 * no volver a procesarlo como si fuera parte del texto del cuerpo. Cada
 * tocable que encuentra (el de afuera y los anidados) se agrega una sola vez
 * a `resultados`. Devuelve el índice justo después de todo el tocable
 * (apertura + cuerpo + cierre), para que quien llama siga buscando desde ahí.
 */
function leerTocable(content: string, inicio: number, resultados: Tocable[]): number {
  const m = RE_TOCABLE.exec(content.slice(inicio, inicio + 40))
  const tag = m ? m[1] : 'Pressable'
  const { apertura, selfClosing, fin } = leerEtiquetaApertura(content, inicio)

  if (selfClosing) {
    resultados.push({ tag, linea: lineaDe(content, inicio), apertura, cuerpo: '', selfClosing: true })
    return fin
  }

  const reAperturaAnidada = new RegExp(`<${tag}\\b`)
  const cierre = `</${tag}>`
  let pos = fin

  while (pos < content.length) {
    const idxCierre = content.indexOf(cierre, pos)
    const resto = content.slice(pos)
    const mAnidado = resto.match(reAperturaAnidada)
    const idxAnidado = mAnidado && mAnidado.index !== undefined ? pos + mAnidado.index : -1

    if (idxCierre === -1) {
      // Mal formado: se toma lo que queda, sin colgarse.
      resultados.push({ tag, linea: lineaDe(content, inicio), apertura, cuerpo: content.slice(fin), selfClosing: false })
      return content.length
    }

    if (idxAnidado !== -1 && idxAnidado < idxCierre) {
      // Un tocable del mismo nombre, anidado: se procesa aparte (se agrega
      // a `resultados` una sola vez, ahí adentro) y se sigue buscando el
      // cierre de ESTE tocable desde después de todo el anidado.
      pos = leerTocable(content, idxAnidado, resultados)
      continue
    }

    resultados.push({ tag, linea: lineaDe(content, inicio), apertura, cuerpo: content.slice(fin, idxCierre), selfClosing: false })
    return idxCierre + cierre.length
  }

  return content.length
}

/** Todos los tocables (`Pressable`, `Switch`, `Touchable*`) de `content`,
 * en el orden en que terminan de leerse (los anidados, antes que el que los
 * contiene). `content` tiene que venir ya sin comentarios
 * (`quitarComentarios`), para que un `<Pressable` adentro de un comentario
 * no cuente. */
export function tocablesDe(content: string): Tocable[] {
  const resultados: Tocable[] = []
  let pos = 0
  while (pos < content.length) {
    const resto = content.slice(pos)
    const m = resto.match(RE_TOCABLE)
    if (!m || m.index === undefined) break
    pos = leerTocable(content, pos + m.index, resultados)
  }
  return resultados
}

// ---------------------------------------------------------------------------
// Atributos de la etiqueta de apertura.
// ---------------------------------------------------------------------------

/** El valor de `accessibilityRole` (sin comillas), o `null` si el atributo
 * no está. */
export function valorAccessibilityRole(apertura: string): string | null {
  const m = apertura.match(/accessibilityRole\s*=\s*\{?\s*["'](\w+)["']\s*\}?/)
  return m ? m[1] : null
}

/** `true` si la etiqueta (o el texto que se le pase) tiene
 * `accessibilityLabel=`, sin importar su valor (literal, template o
 * variable). */
export function tieneAccessibilityLabel(texto: string): boolean {
  return /accessibilityLabel\s*=/.test(texto)
}

/** `true` si el cuerpo (no la apertura) tiene un `<Texto` o un `<Text` como
 * elemento (con límite de palabra: no confunde `<TextInput`). */
export function tieneTextoVisible(cuerpo: string): boolean {
  return /<Text(o)?\b/.test(cuerpo)
}

/**
 * El valor (balanceado por llaves) de un atributo `nombre={...}` dentro de
 * `apertura` — por ejemplo, el cuerpo de `onPress={...}` o de `style={...}`,
 * sin el `{`/`}` de afuera. `null` si el atributo no está, o si no viene
 * como `{...}` (un string plano como `accessibilityRole="button"` no pasa
 * por acá: se lee con `valorAccessibilityRole`).
 */
export function extraerAtributoBalanceado(apertura: string, nombre: string): string | null {
  const re = new RegExp(`\\b${nombre}\\s*=\\s*\\{`)
  const m = re.exec(apertura)
  if (!m) return null
  let profundidad = 1
  let i = m.index + m[0].length
  const inicio = i
  for (; i < apertura.length && profundidad > 0; i++) {
    if (apertura[i] === '{') profundidad++
    else if (apertura[i] === '}') profundidad--
  }
  return apertura.slice(inicio, i - 1)
}

// ---------------------------------------------------------------------------
// link-externo: ¿el `onPress` abre Linking.openURL/abrirPostDeInstagram,
// directo o a través de una función nombrada del mismo archivo?
// ---------------------------------------------------------------------------

function contieneAperturaExterna(texto: string): boolean {
  return /\bLinking\.openURL\s*\(/.test(texto) || /\babrirPostDeInstagram\s*\(/.test(texto)
}

/** El cuerpo (entre `{` y `}`, balanceado) de una función `nombre` declarada
 * en `contenido` como `function nombre(...) {...}`, `const nombre = (...) =>
 * {...}` o `const nombre = function(...) {...}`. `null` si no se encuentra
 * (incluye el caso de una función de una sola expresión sin `{}`: fuera de
 * alcance de esta heurística, no hay ningún caso así en `app/`/`components/`
 * hoy que haga falta cubrir). */
export function cuerpoDeFuncionNombrada(contenido: string, nombre: string): string | null {
  const re = new RegExp(
    `\\bfunction\\s+${nombre}\\s*\\([^)]*\\)\\s*\\{` +
      `|\\b(?:const|let)\\s+${nombre}\\s*=\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>\\s*\\{` +
      `|\\b(?:const|let)\\s+${nombre}\\s*=\\s*(?:async\\s+)?function\\s*\\([^)]*\\)\\s*\\{`,
  )
  const m = re.exec(contenido)
  if (!m) return null
  let profundidad = 1
  let i = m.index + m[0].length
  const inicio = i - 1
  for (; i < contenido.length && profundidad > 0; i++) {
    if (contenido[i] === '{') profundidad++
    else if (contenido[i] === '}') profundidad--
  }
  return contenido.slice(inicio, i)
}

/** `true` si la expresión de `onPress` abre un link externo: directo
 * (`Linking.openURL(...)`/`abrirPostDeInstagram(...)` en la propia
 * expresión) o a través de una función nombrada (`onPress={comprar}`, con
 * `comprar` declarada en `contenidoArchivo`). */
export function abreLinkExterno(expresionOnPress: string, contenidoArchivo: string): boolean {
  if (contieneAperturaExterna(expresionOnPress)) return true
  const m = expresionOnPress.trim().match(/^(\w+)$/)
  if (!m) return false
  const cuerpo = cuerpoDeFuncionNombrada(contenidoArchivo, m[1])
  return cuerpo !== null && contieneAperturaExterna(cuerpo)
}

// ---------------------------------------------------------------------------
// area-chica: estilos de StyleSheet.create con minHeight/minWidth/height/
// width numérico < 48, usados en el `style` de un Pressable del mismo
// archivo. Heurística por NOMBRE de estilo, no por layout real: no sabe
// nada de flex, de porcentajes, ni de un tamaño que llegue por prop (ver los
// casos documentados en el describe de más abajo).
// ---------------------------------------------------------------------------

/** Solo el texto que queda a profundidad 0 de llaves dentro de
 * `valorEstilo` (las propiedades DIRECTAS del estilo): descarta cualquier
 * objeto anidado (`shadowOffset: { width: 0, height: 2 }`, `transform: [{
 * rotate: '...' }]`) para que sus números no se confundan con una medida
 * propia del estilo de afuera. */
function soloPropiedadesDirectas(valorEstilo: string): string {
  let resultado = ''
  let profundidad = 0
  for (const c of valorEstilo) {
    if (c === '{') {
      profundidad++
      continue
    }
    if (c === '}') {
      profundidad--
      continue
    }
    if (profundidad === 0) resultado += c
  }
  return resultado
}

/** `true` si las propiedades DIRECTAS de un valor de estilo (no las de un
 * objeto anidado adentro, como `shadowOffset`) tienen un
 * `minHeight`/`minWidth`/`height`/`width` numérico menor que 48. No
 * confunde `height: '100%'` (string, no numérico). */
function tieneMedidaChica(valorEstilo: string): boolean {
  const directas = soloPropiedadesDirectas(valorEstilo)
  const re = /\b(?:minHeight|minWidth|height|width)\s*:\s*(-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(directas))) {
    if (Number(m[1]) < 48) return true
  }
  return false
}

/** Las claves `nombre: { ... }` de un objeto (el texto de adentro de sus
 * `{}` de afuera), sin bajar a los objetos anidados de cada valor (cada
 * clave se consume entera, balanceando llaves, antes de buscar la
 * siguiente) — así `shadowOffset: { width: 0, height: 2 }`, anidado dentro
 * de otra clave, no se lee como si fuera una clave de estilo propia. */
function clavesDelObjeto(texto: string): Map<string, string> {
  const resultado = new Map<string, string>()
  const re = /(\w+)\s*:\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const nombre = m[1]
    let profundidad = 1
    let i = m.index + m[0].length // justo después de la "{" de apertura de esta clave
    const inicio = i
    for (; i < texto.length && profundidad > 0; i++) {
      if (texto[i] === '{') profundidad++
      else if (texto[i] === '}') profundidad--
    }
    // `i - 1` es la posición de la "}" de cierre de ESTA clave (no se
    // incluye): el valor queda sin sus propias llaves de afuera, para que
    // `soloPropiedadesDirectas` arranque en profundidad 0 de verdad.
    resultado.set(nombre, texto.slice(inicio, i - 1))
    re.lastIndex = i
  }
  return resultado
}

/**
 * Las claves de estilo "chicas" (con un minHeight/minWidth/height/width
 * numérico < 48) de TODOS los `StyleSheet.create({...})` del archivo.
 *
 * LÍMITE CONOCIDO: solo mira `StyleSheet.create(...)`. Un estilo armado como
 * objeto plano (`const estilos = { boton: (x) => ({ minHeight: 44, ... }) }`,
 * el patrón de `app/eliminar-cuenta.tsx` y de la mitad de
 * `app/(tabs)/cuenta.tsx`) no pasa por acá — documentado en el reporte de la
 * tarea, con el archivo real donde pasa.
 */
export function clavesDeEstiloChicas(contenido: string): Set<string> {
  const resultado = new Set<string>()
  const re = /StyleSheet\.create\s*\(\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(contenido))) {
    let profundidad = 1
    let i = m.index + m[0].length
    const inicioCuerpo = i
    for (; i < contenido.length && profundidad > 0; i++) {
      if (contenido[i] === '{') profundidad++
      else if (contenido[i] === '}') profundidad--
    }
    const cuerpoObjeto = contenido.slice(inicioCuerpo, i - 1)
    for (const [clave, valor] of clavesDelObjeto(cuerpoObjeto)) {
      if (tieneMedidaChica(valor)) resultado.add(clave)
    }
    re.lastIndex = i
  }
  return resultado
}

/** `true` si el texto del atributo `style={...}` de un tocable usa alguna de
 * las `clavesChicas` (como `estilos.NOMBRE` o `estilosLoQueSea.NOMBRE`: se
 * busca el nombre de la clave precedido de un punto, sin importar el nombre
 * de la variable de estilos). */
export function styleUsaClaveChica(styleTexto: string, clavesChicas: Set<string>): boolean {
  for (const clave of clavesChicas) {
    if (new RegExp(`\\.${clave}\\b`).test(styleTexto)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// area-chica (QPS-245, 49-e): el agujero real era que un `Pressable` SIN
// `style` no entraba NUNCA a esta regla — más abajo, en `hallazgosDeTocables`,
// el chequeo viejo es `if (styleTexto && !excepcion && ...)`: sin `style`,
// ese `if` ya daba falso, cero evaluación, pase silencioso. El caso real que
// lo probó: `components/PantallaRadar.tsx:470`/`490`, un `Pressable` de
// "quitar lugar/cuenta" sin `style`, cuyo único hijo es un `<Icono
// tamanio={14}>` — el propio comentario de ese archivo ya dice "el detector
// estático no ve este caso".
//
// Esta sección cubre ESE caso puntual (único hijo = un `<Icono
// tamanio={N}>`), no cualquier `Pressable` sin `style`: uno sin `style` cuyo
// hijo es otra cosa (un `View`, un `Texto`, varios hijos — por ejemplo
// `components/Encabezado.tsx:39`, el logo, cuyo hijo es un `View`) sigue sin
// evaluarse. No es un pase silencioso NUEVO: ya lo era desde 46-b, esta
// sección no lo agrava ni lo arregla (documentado en el reporte de la
// tarea, para quien lo quiera cerrar después).
// ---------------------------------------------------------------------------

/** El texto de los atributos de un `<Icono .../>` que es el ÚNICO hijo de
 * `cuerpo` (nada de texto ni de otro elemento, antes o después): se exige
 * que el cuerpo recortado (`trim`) tenga un solo "<" en TODO su texto (el de
 * la apertura de `Icono`) — cualquier hermano (otro elemento, o un texto con
 * un "<" literal) deja más de uno y esta función da `null`. `null` también
 * si el único elemento no es un `Icono`, o no se cierra solo (un `Icono` con
 * hijos propios no es un caso real hoy). */
export function soloHijoIcono(cuerpo: string): string | null {
  const trimmed = cuerpo.trim()
  const aperturas = trimmed.match(/</g)
  if (!aperturas || aperturas.length !== 1) return null
  const m = trimmed.match(/^<Icono\b([\s\S]*)\/>$/)
  return m ? m[1] : null
}

/**
 * El valor numérico de `tamanio={N}` en los atributos de un `Icono` (lo que
 * da `soloHijoIcono`). `null` si no hay `tamanio=`, o si no es un número
 * literal.
 *
 * LÍMITE CONOCIDO (mismo espíritu que `clavesDeEstiloChicas` con los estilos
 * armados como objeto plano, líneas ~384-389 de más arriba): si `tamanio`
 * llega por una prop o por una expresión (`tamanio={tamanioIcono}`,
 * `tamanio={Math.round(x * 0.45)}` — el patrón real de
 * `components/BotonFavorito.tsx`/`BotonCompartir.tsx`, que además tienen
 * `style` y no entran a esta sección por eso), esta función no lo resuelve,
 * ni lo intenta: no tiene de dónde sacar el valor real (depende del padre, o
 * de un cálculo). Este caso NO es un hallazgo ni un "no se pudo medir": es
 * un silencio documentado — ver el test "LÍMITE CONOCIDO" más abajo, que
 * prueba esto tal cual es, no lo que "debería" ser.
 */
export function tamanioDeIconoUnicoHijo(atributosIcono: string): number | null {
  const m = atributosIcono.match(/\btamanio\s*=\s*\{\s*(-?\d+(?:\.\d+)?)\s*\}/)
  return m ? Number(m[1]) : null
}

/**
 * `true` si el eje (un par `ladoA`/`ladoB` — top/bottom o left/right, ya
 * resueltos a números) llega a 48 sumando `tamanio` (el `N` del Icono): la
 * medida es SIEMPRE `tamanio + ladoA + ladoB`, sin perdonar nada.
 *
 * LÍMITE AL REVÉS, A PROPÓSITO (vuelta 1 de 2 de 49-e: la primera versión de
 * esta función tenía un caso especial acá, y era un pase silencioso —
 * exactamente el agujero que QPS-245 vino a cerrar, ver el reporte): un
 * tocable SIN `style` no tiene ningún tamaño propio más allá del `tamanio`
 * del Icono — su layout ES el del hijo. `hitSlopPara(ancho, alto)` calcula
 * su compensación asumiendo que el elemento YA mide `ancho`/`alto`; si ese
 * argumento no coincide con `tamanio` (por ejemplo `hitSlopPara(48, 14)`
 * sobre un Icono de 14: el 48 describe un elemento que no existe, el
 * tocable real mide 14 de ancho, no 48), confiar en que ese eje "ya está
 * lleno" porque la compensación da 0 es exactamente el error: el eje
 * horizontal de ese caso mide 14 + 0 + 0 = 14, NO 48. Por eso esta función
 * no mira de dónde salió `ladoA`/`ladoB` (no sabe, ni le importa, si vino de
 * `hitSlopPara(...)`, de un objeto literal o de un número suelto): solo
 * confía en los CUATRO INSETS YA RESUELTOS, nunca en el argumento que los
 * produjo. La forma que sí funciona para un Icono sin `style` es
 * `hitSlopPara(N)` (el PROPIO tamaño del ícono, no 48) — el patrón real de
 * `components/PantallaRadar.tsx:470`/`490` y `app/cines.tsx:115`.
 */
function ejeDeIcono(tamanio: number, ladoA: number, ladoB: number): boolean {
  return tamanio + ladoA + ladoB >= 48
}

/** El hallazgo "area-chica" de un `Pressable` SIN `style` cuyo único hijo es
 * un `<Icono tamanio={N}>` — `null` si no corresponde (no es ese patrón, el
 * tamaño no se pudo leer como número literal — LÍMITE CONOCIDO, ver
 * `tamanioDeIconoUnicoHijo` — o el área alcanza). El `motivo` distingue "no
 * se pudo medir" (el `hitSlop` está, pero no se pudo resolver: NUNCA un pase
 * silencioso, ver el encargo de 49-e) de "no llega a 48" (se pudo medir,
 * pero no alcanza, con o sin `hitSlop`) — para este último, `vertical` y
 * `horizontal` llevan la medida real de cada eje, para que el mensaje diga
 * POR QUÉ no alcanza (el caso más engañoso: un `hitSlop` que a simple vista
 * parece correcto, como `hitSlopPara(48, 14)`, mide 14 en un eje porque el
 * 48 que declara no es el tamaño real del tocable). */
function hallazgoIconoSinStyle(
  tocable: Tocable,
  contenidoSinComentarios: string,
): { motivo: 'no-se-pudo-medir' } | { motivo: 'no-llega'; vertical: number; horizontal: number } | null {
  if (tocable.selfClosing) return null
  const atributosIcono = soloHijoIcono(tocable.cuerpo)
  if (atributosIcono === null) return null
  const tamanio = tamanioDeIconoUnicoHijo(atributosIcono)
  if (tamanio === null) return null // LÍMITE CONOCIDO: tamanio por prop, no se evalúa.

  const hitSlopTexto = extraerAtributoBalanceado(tocable.apertura, 'hitSlop')
  if (!hitSlopTexto) {
    return tamanio >= 48 ? null : { motivo: 'no-llega', vertical: tamanio, horizontal: tamanio }
  }

  let hitSlop: { top: number; bottom: number; left: number; right: number }
  try {
    hitSlop = resolverHitSlop(hitSlopTexto, contenidoSinComentarios)
  } catch {
    return { motivo: 'no-se-pudo-medir' }
  }

  const vertical = tamanio + hitSlop.top + hitSlop.bottom
  const horizontal = tamanio + hitSlop.left + hitSlop.right
  if (ejeDeIcono(tamanio, hitSlop.top, hitSlop.bottom) && ejeDeIcono(tamanio, hitSlop.left, hitSlop.right)) return null
  return { motivo: 'no-llega', vertical, horizontal }
}

// ---------------------------------------------------------------------------
// sin-escalar / escala-suelta: a nivel de archivo completo, no por tocable.
// ---------------------------------------------------------------------------

/** Líneas con `allowFontScaling={false}` (fuera de comentarios). */
export function lineasSinEscalar(contenidoSinComentarios: string): number[] {
  const resultado: number[] = []
  const re = /allowFontScaling\s*=\s*\{\s*false\s*\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(contenidoSinComentarios))) resultado.push(lineaDe(contenidoSinComentarios, m.index))
  return resultado
}

/** Líneas con `maxFontSizeMultiplier={<número literal>}` (fuera de
 * comentarios). Un identificador (`{ESCALA_MAXIMA_COMPACTA}`, de
 * `lib/accesibilidad.ts` — esta tarea no lo importa como valor, ver el
 * comentario de cabecera: solo necesita que NO sea un número suelto) no
 * matchea `-?\d+`, así que no cuenta. */
export function lineasEscalaSuelta(contenidoSinComentarios: string): number[] {
  const resultado: number[] = []
  const re = /maxFontSizeMultiplier\s*=\s*\{\s*(-?\d+(?:\.\d+)?)\s*\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(contenidoSinComentarios))) resultado.push(lineaDe(contenidoSinComentarios, m.index))
  return resultado
}

// ---------------------------------------------------------------------------
// Hallazgos: un tocable + el detalle de archivo/línea/regla/arreglo.
// ---------------------------------------------------------------------------

export interface Hallazgo {
  archivo: string
  linea: number
  regla: ReglaAccesibilidad
  arreglo: string
}

/** La línea real del tocable cuya apertura contiene el texto `ancla`, en
 * `archivoRelativo` — o `null` si no se encuentra. Resuelve
 * `EXCEPCIONES_AREA_CHICA` por ANCLA DE TEXTO en vez de por número de línea
 * (49-e, QPS-245): un número de línea se rompe en silencio apenas otra
 * ronda agrega o saca una línea arriba (sigue siendo un número válido, pero
 * ya no apunta al mismo tocable); un ancla de texto, no — si el texto deja
 * de estar donde estaba, esto da `null`, la excepción deja de aplicarse (el
 * hallazgo real vuelve a aparecer en el barrido general) y el test de más
 * abajo falla explícito. */
function lineaDeAncla(archivoRelativo: string, ancla: string): number | null {
  const file = join(MOBILE_ROOT, ...archivoRelativo.split('/'))
  const contenido = quitarComentarios(readFileSync(file, 'utf8'))
  const tocable = tocablesDe(contenido).find((t) => t.apertura.includes(ancla))
  return tocable ? tocable.linea : null
}

/** Excepciones documentadas a `area-chica` (archivo relativo + ANCLA DE
 * TEXTO del tocable + motivo): un hallazgo que caería en la lista de abajo,
 * pero que no cuenta porque ya está cubierto de otra forma. `linea` se
 * calcula sola, de `ancla` (nunca se escribe a mano: `?? -1` si el ancla no
 * se encuentra, un número que ningún tocable real tiene, así la excepción
 * simplemente deja de aplicar en vez de apuntar a la línea equivocada). Si
 * el motivo deja de valer (por ejemplo, alguien le baja el hitSlop), hay que
 * sacarlo de esta lista — el barrido real lo volvería a marcar solo. */
export const EXCEPCIONES_AREA_CHICA: ReadonlyArray<{ archivo: string; linea: number; ancla: string; motivo: string }> = [
  {
    archivo: 'app/(tabs)/buscar.tsx',
    ancla: 'accessibilityLabel="Limpiar búsqueda"',
    motivo:
      'hitSlop={8} en los dos ejes: 44 (estilos.botonLimpiar, minWidth/minHeight) + 2×8 = 60 ≥ 48 — llega, aunque el estilo por sí solo no.',
  },
].map((e) => ({ ...e, linea: lineaDeAncla(e.archivo, e.ancla) ?? -1 }))

/** Todos los hallazgos de un archivo, sobre su contenido YA sin comentarios
 * (`quitarComentarios`): recorre sus tocables y aplica las cuatro reglas que
 * dependen de un tocable puntual (`sin-rol`, `sin-etiqueta`, `link-externo`,
 * `area-chica`, esta última ya sin las excepciones de arriba) — las otras
 * dos (`sin-escalar`, `escala-suelta`) se agregan aparte, en
 * `hallazgosDeArchivo`, porque no dependen de ningún tocable. */
function hallazgosDeTocables(contenidoSinComentarios: string, archivoRelativo: string): Hallazgo[] {
  const clavesChicas = clavesDeEstiloChicas(contenidoSinComentarios)
  const hallazgos: Hallazgo[] = []

  for (const tocable of tocablesDe(contenidoSinComentarios)) {
    const esPressableLike = tocable.tag !== 'Switch'
    const rol = valorAccessibilityRole(tocable.apertura)
    const tieneLabel = tieneAccessibilityLabel(tocable.apertura)

    if (esPressableLike) {
      if (rol === null) {
        hallazgos.push({
          archivo: archivoRelativo,
          linea: tocable.linea,
          regla: 'sin-rol',
          arreglo: `sumá accessibilityRole="button" (o el rol que corresponda) a este <${tocable.tag}`,
        })
      }

      const tieneTexto = !tocable.selfClosing && tieneTextoVisible(tocable.cuerpo)
      if (!tieneTexto && !tieneLabel) {
        hallazgos.push({
          archivo: archivoRelativo,
          linea: tocable.linea,
          regla: 'sin-etiqueta',
          arreglo: `sumá accessibilityLabel a este <${tocable.tag} (su cuerpo no tiene <Texto/<Text visible)`,
        })
      }

      const onPress = extraerAtributoBalanceado(tocable.apertura, 'onPress')
      if (onPress && abreLinkExterno(onPress, contenidoSinComentarios) && rol !== 'link') {
        hallazgos.push({
          archivo: archivoRelativo,
          linea: tocable.linea,
          regla: 'link-externo',
          arreglo: 'sumá accessibilityRole="link" (abre Linking.openURL/abrirPostDeInstagram)',
        })
      }

      const styleTexto = extraerAtributoBalanceado(tocable.apertura, 'style')
      const excepcion = EXCEPCIONES_AREA_CHICA.find((e) => e.archivo === archivoRelativo && e.linea === tocable.linea)
      if (styleTexto && !excepcion && styleUsaClaveChica(styleTexto, clavesChicas)) {
        hallazgos.push({
          archivo: archivoRelativo,
          linea: tocable.linea,
          regla: 'area-chica',
          arreglo: 'usá hitSlopPara(...) de lib/accesibilidad.ts, o subí el tamaño mínimo a 48',
        })
      } else if (!styleTexto && !excepcion) {
        // QPS-245: el caso que el `if` de arriba nunca veía (sin `style`,
        // daba falso) — ver la sección "area-chica (QPS-245, 49-e)" más
        // arriba en este archivo.
        const hallazgo = hallazgoIconoSinStyle(tocable, contenidoSinComentarios)
        if (hallazgo) {
          hallazgos.push({
            archivo: archivoRelativo,
            linea: tocable.linea,
            regla: 'area-chica',
            arreglo:
              hallazgo.motivo === 'no-se-pudo-medir'
                ? 'el hitSlop de este <Pressable> no se pudo medir (nunca un pase silencioso): resolvelo a mano, o si es un caso nuevo, sumalo a tests/a11y/hitslop-medidas.ts'
                : `el <Icono> solo (sin style) no llega a 48: vertical ${hallazgo.vertical}, horizontal ${hallazgo.horizontal} — usá hitSlopPara(N) con el PROPIO tamaño del ícono, no con 48`,
          })
        }
      }
    } else {
      // Switch: solo importa accessibilityLabel.
      if (!tieneLabel) {
        hallazgos.push({
          archivo: archivoRelativo,
          linea: tocable.linea,
          regla: 'sin-etiqueta',
          arreglo: 'sumá accessibilityLabel a este <Switch',
        })
      }
    }
  }

  return hallazgos
}

/** Todos los hallazgos de un archivo (contenido ORIGINAL, con comentarios:
 * el recorte lo hace esta función). */
export function hallazgosDeArchivo(contenidoOriginal: string, archivoRelativo: string): Hallazgo[] {
  const limpio = quitarComentarios(contenidoOriginal)
  const hallazgos = hallazgosDeTocables(limpio, archivoRelativo)

  for (const linea of lineasSinEscalar(limpio)) {
    hallazgos.push({
      archivo: archivoRelativo,
      linea,
      regla: 'sin-escalar',
      arreglo: 'sacá allowFontScaling={false} (o justificá el caso con 46-a antes de sumarlo)',
    })
  }
  for (const linea of lineasEscalaSuelta(limpio)) {
    hallazgos.push({
      archivo: archivoRelativo,
      linea,
      regla: 'escala-suelta',
      arreglo: 'usá ESCALA_MAXIMA_COMPACTA de lib/accesibilidad.ts en vez de un número suelto',
    })
  }

  return hallazgos
}

/** Agrupa hallazgos por regla, con el conteo de cada una (solo las reglas
 * con al menos un hallazgo). */
function contarPorRegla(hallazgos: Hallazgo[]): Partial<Record<ReglaAccesibilidad, number>> {
  const conteo: Partial<Record<ReglaAccesibilidad, number>> = {}
  for (const h of hallazgos) conteo[h.regla] = (conteo[h.regla] ?? 0) + 1
  return conteo
}

/**
 * Las diferencias entre lo que el barrido encuentra (`encontrado`) y la
 * línea de base (`esperado`) para un archivo: una por cada regla en la que
 * no coinciden, en cualquiera de las dos direcciones (más hallazgos que la
 * base — algo nuevo sin arreglar — o menos — la base quedó vieja, hay que
 * bajarla). Un archivo exactamente igual a su base da `[]`.
 */
export function discrepanciasDeArchivo(
  archivo: string,
  encontrado: Partial<Record<ReglaAccesibilidad, number>>,
  esperado: Partial<Record<ReglaAccesibilidad, number>>,
): string[] {
  const reglas = new Set<ReglaAccesibilidad>([
    ...(Object.keys(encontrado) as ReglaAccesibilidad[]),
    ...(Object.keys(esperado) as ReglaAccesibilidad[]),
  ])
  const mensajes: string[] = []
  for (const regla of reglas) {
    const real = encontrado[regla] ?? 0
    const base = esperado[regla] ?? 0
    if (real > base) {
      mensajes.push(
        `${archivo}: "${regla}" tiene ${real} hallazgo(s), la línea de base esperaba ${base} (¿se sumó un tocable nuevo sin arreglar?)`,
      )
    } else if (real < base) {
      mensajes.push(
        `${archivo}: "${regla}" tiene ${real} hallazgo(s), la línea de base esperaba ${base} (bajá el número en tests/a11y/pendientes-*.ts: se arregló algo)`,
      )
    }
  }
  return mensajes
}

// ===========================================================================
// Fixtures en memoria: cada función, probada a que "falle de verdad" antes
// de aplicarse a los archivos reales.
// ===========================================================================

describe('leerEtiquetaApertura (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('etiqueta simple, self-closing', () => {
    const r = leerEtiquetaApertura('<Switch value={x} />', 0)
    expect(r.apertura).toBe('<Switch value={x} />')
    expect(r.selfClosing).toBe(true)
  })

  it('etiqueta con cuerpo (no self-closing)', () => {
    const r = leerEtiquetaApertura('<Pressable onPress={f}>texto</Pressable>', 0)
    expect(r.apertura).toBe('<Pressable onPress={f}>')
    expect(r.selfClosing).toBe(false)
  })

  it('un style={({ pressed }) => [...]} NO corta la etiqueta en el primer ">" de adentro (el fixture que pide el encargo, 46-b)', () => {
    const fixture = `<Pressable onPress={f} style={({ pressed }) => [estilos.boton, { opacity: pressed ? 0.6 : 1 }]}>cuerpo</Pressable>`
    const r = leerEtiquetaApertura(fixture, 0)
    expect(r.apertura).toBe(
      `<Pressable onPress={f} style={({ pressed }) => [estilos.boton, { opacity: pressed ? 0.6 : 1 }]}>`,
    )
    expect(r.selfClosing).toBe(false)
  })

  it('el mismo caso, real: app/flyer/[id].tsx ("Ver en Instagram")', () => {
    const fixture = `<Pressable
          accessibilityRole="button"
          onPress={() => abrirPostDeInstagram(flyer.ig_post_url)}
          style={({ pressed }) => [estilos.boton, { borderColor: colores.primary, opacity: pressed ? 0.6 : 1 }]}
        >`
    const r = leerEtiquetaApertura(fixture, 0)
    expect(r.apertura.endsWith('}]}\n        >')).toBe(true)
    expect(r.selfClosing).toBe(false)
  })

  it('LÍMITE CONOCIDO: un ">" dentro de un string del atributo (fuera de cualquier "{}") SÍ corta la etiqueta antes de tiempo', () => {
    // No es un parser de JSX de verdad: el contador de llaves no protege un
    // ">" que viene dentro de un string plano (no dentro de un "{...}" —
    // dentro de un "{}" sí lo protege, porque la profundidad no vuelve a 0
    // hasta que ese "{}" cierra). No hay ningún atributo así, hoy, en
    // `app/`/`components/`.
    const fixture = `<Pressable title="a > b" onPress={f} accessibilityRole="button" />`
    const r = leerEtiquetaApertura(fixture, 0)
    expect(r.apertura).toBe('<Pressable title="a >')
  })
})

describe('tocablesDe (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('un Pressable con texto y sin etiqueta: 1 tocable, cuerpo con el texto', () => {
    const t = tocablesDe('<Pressable onPress={f}><Texto>Hola</Texto></Pressable>')
    expect(t).toHaveLength(1)
    expect(t[0].cuerpo).toContain('<Texto>Hola</Texto>')
    expect(t[0].selfClosing).toBe(false)
  })

  it('un Switch self-closing: 1 tocable, cuerpo vacío', () => {
    const t = tocablesDe('<Switch value={x} onValueChange={f} />')
    expect(t).toHaveLength(1)
    expect(t[0].tag).toBe('Switch')
    expect(t[0].selfClosing).toBe(true)
  })

  it('un Pressable anidado dentro de otro: 2 tocables (el de afuera y el de adentro), cada uno UNA sola vez', () => {
    const fixture = `<Pressable onPress={afuera} accessibilityRole="button">
      <Texto>Externo</Texto>
      <Pressable onPress={adentro} accessibilityRole="button" accessibilityLabel="Interno" />
    </Pressable>`
    const t = tocablesDe(fixture)
    expect(t).toHaveLength(2)
    // El anidado se lee primero (se resuelve adentro de la recursión, antes
    // de que el de afuera termine de leer su cuerpo).
    expect(t[0].selfClosing).toBe(true)
    expect(t[1].selfClosing).toBe(false)
    expect(t[1].cuerpo).toContain('Externo')
    // El cuerpo del de afuera NO vuelve a traer, sin cortar, el tocable
    // anidado entero como texto plano sin procesar: lo que importa es que
    // tocablesDe no lo haya agregado una segunda vez (longitud 2, no 3).
  })

  it('reconoce Touchable* (aunque hoy no se use en el código real)', () => {
    const t = tocablesDe('<TouchableOpacity onPress={f} accessibilityRole="button"><Texto>Hola</Texto></TouchableOpacity>')
    expect(t).toHaveLength(1)
    expect(t[0].tag).toBe('TouchableOpacity')
  })

  it('dos tocables al mismo nivel (no anidados): 2, cada uno con su línea', () => {
    const fixture = `<Pressable onPress={a} accessibilityRole="button"><Texto>A</Texto></Pressable>\n<Switch value={b} onValueChange={c} accessibilityLabel="B" />`
    const t = tocablesDe(fixture)
    expect(t).toHaveLength(2)
    expect(t[0].linea).toBe(1)
    expect(t[1].linea).toBe(2)
  })

  it('un comentario que menciona "<Pressable" no cuenta (hay que pasarle el contenido YA sin comentarios)', () => {
    const original = `// antes esto era <Pressable onPress={f}>, ahora es un botón de verdad\n<Switch value={x} onValueChange={y} accessibilityLabel="Z" />`
    const limpio = quitarComentarios(original)
    const t = tocablesDe(limpio)
    expect(t).toHaveLength(1)
    expect(t[0].tag).toBe('Switch')
  })
})

describe('tieneTextoVisible / tieneAccessibilityLabel (fixtures en memoria)', () => {
  it('un Pressable con texto y SIN accessibilityLabel: no marca sin-etiqueta (el texto alcanza)', () => {
    const t = tocablesDe('<Pressable onPress={f} accessibilityRole="button"><Texto>Entrar</Texto></Pressable>')[0]
    expect(tieneTextoVisible(t.cuerpo)).toBe(true)
    expect(tieneAccessibilityLabel(t.apertura)).toBe(false)
  })

  it('uno con solo <Icono (sin accessibilityLabel): el cuerpo no tiene texto visible, sí marca', () => {
    const t = tocablesDe('<Pressable onPress={f} accessibilityRole="button"><Icono nombre="X" /></Pressable>')[0]
    expect(tieneTextoVisible(t.cuerpo)).toBe(false)
    expect(tieneAccessibilityLabel(t.apertura)).toBe(false)
  })

  it('uno con solo <Icono pero CON accessibilityLabel: no marca (el label alcanza)', () => {
    const t = tocablesDe('<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="Cerrar"><Icono nombre="X" /></Pressable>')[0]
    expect(tieneTextoVisible(t.cuerpo)).toBe(false)
    expect(tieneAccessibilityLabel(t.apertura)).toBe(true)
  })

  it('no confunde <TextInput con <Text (límite de palabra)', () => {
    expect(tieneTextoVisible('<TextInput value={x} />')).toBe(false)
  })

  it('un comentario que menciona allowFontScaling={false} no cuenta (si se le pasa el contenido sin comentarios)', () => {
    const original = `// ojo, nunca pongas allowFontScaling={false} acá\n<Text>Hola</Text>`
    const limpio = quitarComentarios(original)
    expect(lineasSinEscalar(limpio)).toEqual([])
  })

  it('allowFontScaling={false} real: si cuenta', () => {
    expect(lineasSinEscalar('<Text allowFontScaling={false}>Hola</Text>')).toEqual([1])
  })
})

describe('extraerAtributoBalanceado (fixtures en memoria)', () => {
  it('extrae onPress={...} balanceando llaves (una función con cuerpo)', () => {
    const apertura = `<Pressable onPress={() => { Linking.openURL(x) }} accessibilityRole="button">`
    expect(extraerAtributoBalanceado(apertura, 'onPress')).toBe('() => { Linking.openURL(x) }')
  })

  it('extrae un onPress simple (un identificador)', () => {
    expect(extraerAtributoBalanceado(`<Pressable onPress={comprar} accessibilityRole="button">`, 'onPress')).toBe('comprar')
  })

  it('extrae style={[estilos.a, { b: 1 }]} entero, sin cortar en el primer "}"', () => {
    const apertura = `<Pressable style={[estilos.a, { b: 1 }]} onPress={f}>`
    expect(extraerAtributoBalanceado(apertura, 'style')).toBe('[estilos.a, { b: 1 }]')
  })

  it('null si el atributo no está', () => {
    expect(extraerAtributoBalanceado(`<Pressable onPress={f}>`, 'style')).toBeNull()
  })
})

describe('abreLinkExterno (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta Linking.openURL directo en la expresión de onPress', () => {
    expect(abreLinkExterno('() => Linking.openURL(x)', '')).toBe(true)
  })

  it('detecta abrirPostDeInstagram directo', () => {
    expect(abreLinkExterno('() => abrirPostDeInstagram(x)', '')).toBe(true)
  })

  it('detecta una función nombrada, del mismo archivo, que llama a Linking.openURL', () => {
    const archivo = `function comprar() {\n  if (urlCompra) Linking.openURL(urlCompra).catch(() => {})\n}`
    expect(abreLinkExterno('comprar', archivo)).toBe(true)
  })

  it('detecta una función nombrada declarada con const + arrow', () => {
    const archivo = `const abrirRecuperarContrasenia = () => {\n  Linking.openURL(url).catch(() => {})\n}`
    expect(abreLinkExterno('abrirRecuperarContrasenia', archivo)).toBe(true)
  })

  it('no confunde una función nombrada que NO abre un link externo', () => {
    const archivo = `function salir() {\n  supabase.auth.signOut()\n}`
    expect(abreLinkExterno('salir', archivo)).toBe(false)
  })

  it('no confunde una expresión que no es ni una llamada directa ni un identificador solo', () => {
    expect(abreLinkExterno('() => router.push("/cuenta")', '')).toBe(false)
  })
})

describe('clavesDeEstiloChicas / styleUsaClaveChica (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta minHeight: 44 en un StyleSheet.create', () => {
    const archivo = `const estilos = StyleSheet.create({ boton: { minHeight: 44, padding: 8 } })`
    expect(clavesDeEstiloChicas(archivo)).toEqual(new Set(['boton']))
  })

  it('no confunde height: "100%" (string, no numérico)', () => {
    const archivo = `const estilos = StyleSheet.create({ marca: { height: '100%', width: '100%' } })`
    expect(clavesDeEstiloChicas(archivo)).toEqual(new Set())
  })

  it('no confunde un objeto anidado (shadowOffset) con una clave de estilo propia', () => {
    const archivo = `const estilos = StyleSheet.create({
      contenedor: { flex: 1, shadowOffset: { width: 0, height: 2 } },
    })`
    // shadowOffset NO es una clave de nivel superior del StyleSheet: no
    // tiene que aparecer como clave "chica" propia (aunque sus números sean
    // < 48) — lo que importa es que `contenedor` tampoco, porque su propio
    // nivel no tiene minHeight/minWidth/height/width numérico (shadowOffset
    // queda adentro, ya consumido como parte del valor de `contenedor`).
    expect(clavesDeEstiloChicas(archivo)).toEqual(new Set())
  })

  it('un StyleSheet.create con minHeight: 48 (el límite, no "chico") no cuenta', () => {
    const archivo = `const estilos = StyleSheet.create({ boton: { minHeight: 48 } })`
    expect(clavesDeEstiloChicas(archivo)).toEqual(new Set())
  })

  it('LÍMITE CONOCIDO: un estilo armado como objeto plano (no StyleSheet.create) no se ve, aunque tenga minHeight chico', () => {
    // El patrón real de app/eliminar-cuenta.tsx y la mitad de
    // app/(tabs)/cuenta.tsx: `const estilos = { boton: (x) => ({ minHeight: 44, ... }) }`.
    const archivo = `const estilos = { boton: (x) => ({ minHeight: 44, padding: 12 }) }`
    expect(clavesDeEstiloChicas(archivo)).toEqual(new Set())
  })

  it('styleUsaClaveChica: encuentra estilos.boton (o cualquier.boton) como clave chica', () => {
    const chicas = new Set(['boton'])
    expect(styleUsaClaveChica('estilos.boton', chicas)).toBe(true)
    expect(styleUsaClaveChica('[estilosFila.boton, { opacity: 1 }]', chicas)).toBe(true)
    expect(styleUsaClaveChica('estilos.botonGrande', chicas)).toBe(false)
  })
})

describe('soloHijoIcono / tamanioDeIconoUnicoHijo (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('un Icono solo, self-closing: devuelve sus atributos', () => {
    expect(soloHijoIcono('<Icono nombre="X" tamanio={14} />')).toBe(' nombre="X" tamanio={14} ')
  })

  it('con espacio/salto de línea alrededor: igual lo encuentra (se recorta antes con trim)', () => {
    expect(soloHijoIcono('\n  <Icono tamanio={14} />\n  ')).not.toBeNull()
  })

  it('null si hay otro elemento hermano (no es "único hijo")', () => {
    expect(soloHijoIcono('<Icono tamanio={14} /><Texto>Hola</Texto>')).toBeNull()
  })

  it('null si el único hijo no es un Icono', () => {
    expect(soloHijoIcono('<View style={{ width: 10 }} />')).toBeNull()
  })

  it('tamanioDeIconoUnicoHijo: número literal', () => {
    expect(tamanioDeIconoUnicoHijo(' nombre="X" tamanio={14} ')).toBe(14)
  })

  it('tamanioDeIconoUnicoHijo: LÍMITE CONOCIDO, una prop no se resuelve (null, nunca un número adivinado)', () => {
    expect(tamanioDeIconoUnicoHijo(' nombre="X" tamanio={tamanioIcono} ')).toBeNull()
  })
})

describe('area-chica (QPS-245, 49-e): un Pressable SIN style cuyo único hijo es un <Icono tamanio={N}> — antes de esta ronda, nunca se evaluaba (ver la cabecera de la sección, más arriba en este archivo)', () => {
  function areaChicaDe(jsx: string): Hallazgo[] {
    return hallazgosDeArchivo(jsx, 'fixture.tsx').filter((h) => h.regla === 'area-chica')
  }

  it('<Icono tamanio={14}/> SIN hitSlop: 14 no llega a 48 en ningún eje → hallazgo', () => {
    const jsx = `<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X"><Icono nombre="X" tamanio={14} /></Pressable>`
    expect(areaChicaDe(jsx)).toHaveLength(1)
  })

  it('EL CASO MÁS ENGAÑOSO: con hitSlop={hitSlopPara(48, 14)} → SIGUE SIENDO hallazgo. hitSlopPara(48, 14) da {left:0, right:0, top:17, bottom:17} (lib/accesibilidad.ts:39-45) — el 0 horizontal sale de que el PRIMER argumento ya es 48, pero ese 48 describe un elemento que no existe: el tocable, sin style, mide 14 de ancho (el del Icono), no 48. El área real es horizontal=14+0+0=14, vertical=14+17+17=48: el eje horizontal no llega. Confiar en el 0 era el pase silencioso que QPS-245 vino a cerrar (ver ejeDeIcono, más arriba en este archivo)', () => {
    const jsx = `<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X" hitSlop={hitSlopPara(48, 14)}><Icono nombre="X" tamanio={14} /></Pressable>`
    const hallazgos = areaChicaDe(jsx)
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0].arreglo).toMatch(/vertical 48, horizontal 14/)
  })

  it('la forma que SÍ pasa: hitSlop={hitSlopPara(14)} (el PROPIO tamaño del ícono, no 48) — los cuatro lados en 17, 14+17+17=48 en los dos ejes. Es el patrón real de components/PantallaRadar.tsx:470/490 y app/cines.tsx:115', () => {
    const jsx = `<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X" hitSlop={hitSlopPara(14)}><Icono nombre="X" tamanio={14} /></Pressable>`
    expect(areaChicaDe(jsx)).toEqual([])
  })

  it('el mismo, con hitSlop={10}: 14+10+10=34 en los dos ejes → hallazgo', () => {
    const jsx = `<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X" hitSlop={10}><Icono nombre="X" tamanio={14} /></Pressable>`
    expect(areaChicaDe(jsx)).toHaveLength(1)
  })

  it('el mismo, con hitSlop={variable} (un identificador que el detector no puede resolver): hallazgo con motivo "no se pudo medir" — nunca un pase silencioso', () => {
    const jsx = `<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X" hitSlop={variable}><Icono nombre="X" tamanio={14} /></Pressable>`
    const hallazgos = areaChicaDe(jsx)
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0].arreglo).toMatch(/no se pudo medir/)
  })

  it('con style={estilos.boton} y minHeight: 48: la mide la regla VIEJA (basada en estilo); esta sección no se activa porque SÍ hay style', () => {
    const jsx = `const estilos = StyleSheet.create({ boton: { minHeight: 48 } })
function X() {
  return <Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X" style={estilos.boton}><Icono nombre="X" tamanio={14} /></Pressable>
}`
    expect(areaChicaDe(jsx)).toEqual([])
  })

  it('LÍMITE CONOCIDO: tamanio por PROP (no un número literal) no se evalúa — ni hallazgo, ni "no se pudo medir" (ver tamanioDeIconoUnicoHijo)', () => {
    const jsx = `<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X"><Icono nombre="X" tamanio={tamanioIcono} /></Pressable>`
    expect(areaChicaDe(jsx)).toEqual([])
  })

  it('un Pressable sin style cuyo único hijo NO es un Icono (por ejemplo un View): fuera del alcance de esta sección, sigue sin evaluarse — no es un pase silencioso NUEVO (ya lo era desde 46-b)', () => {
    const jsx = `<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X"><View style={{ width: 10 }} /></Pressable>`
    expect(areaChicaDe(jsx)).toEqual([])
  })

  it('un Pressable sin style con el Icono Y OTRO hermano (por ejemplo un Texto): no es "único hijo", fuera del alcance de esta sección', () => {
    const jsx = `<Pressable onPress={f} accessibilityRole="button" accessibilityLabel="X"><Icono nombre="X" tamanio={14} /><Texto>Hola</Texto></Pressable>`
    expect(areaChicaDe(jsx)).toEqual([])
  })
})

describe('discrepanciasDeArchivo: la línea de base tiene que fallar en las DOS direcciones (con un objeto inventado, no el real)', () => {
  it('sin diferencia: []', () => {
    expect(discrepanciasDeArchivo('x.tsx', { 'sin-rol': 1 }, { 'sin-rol': 1 })).toEqual([])
    expect(discrepanciasDeArchivo('x.tsx', {}, {})).toEqual([])
  })

  it('MÁS hallazgos que la línea de base (alguien sumó un tocable sin arreglar): falla', () => {
    const d = discrepanciasDeArchivo('x.tsx', { 'sin-rol': 2 }, { 'sin-rol': 1 })
    expect(d).toHaveLength(1)
    expect(d[0]).toMatch(/tiene 2 hallazgo\(s\), la línea de base esperaba 1/)
  })

  it('MENOS hallazgos que la línea de base (se arregló algo, hay que bajar la base): también falla', () => {
    const d = discrepanciasDeArchivo('x.tsx', { 'sin-rol': 0 }, { 'sin-rol': 1 })
    expect(d).toHaveLength(1)
    expect(d[0]).toMatch(/tiene 0 hallazgo\(s\), la línea de base esperaba 1/)
  })

  it('un archivo con hallazgo pero sin entrada en la línea de base (línea de base 0 implícita): falla como "más"', () => {
    const d = discrepanciasDeArchivo('nuevo.tsx', { 'area-chica': 1 }, {})
    expect(d).toHaveLength(1)
    expect(d[0]).toMatch(/esperaba 0/)
  })

  it('varias reglas: una diferencia por cada regla que no coincide, las que coinciden no aparecen', () => {
    const d = discrepanciasDeArchivo(
      'x.tsx',
      { 'sin-rol': 1, 'area-chica': 2 },
      { 'sin-rol': 1, 'area-chica': 1, 'link-externo': 1 },
    )
    // area-chica (2 vs 1, "más") y link-externo (0 vs 1, "menos"): 2
    // diferencias. sin-rol coincide (1 vs 1): no aparece.
    expect(d).toHaveLength(2)
  })
})

// ===========================================================================
// app/ y components/ reales, con la línea de base de hoy.
// ===========================================================================

const LINEA_BASE = { ...PENDIENTES_COMPONENTES, ...PENDIENTES_PANTALLAS }

function archivoRelativo(file: string): string {
  return relative(MOBILE_ROOT, file).replace(/\\/g, '/')
}

describe('app/ y components/: el detector en verde contra la línea de base de hoy (46-b)', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra archivos para analizar, incluidos los que tienen línea de base', () => {
    expect(archivos.length).toBeGreaterThan(0)
    const relativos = archivos.map(archivoRelativo)
    for (const esperado of Object.keys(LINEA_BASE)) {
      expect(relativos).toContain(esperado)
    }
  })

  it.each(archivos.map((file) => [archivoRelativo(file), file] as const))('%s', (label, file) => {
    const contenido = readFileSync(file, 'utf8')
    const hallazgos = hallazgosDeArchivo(contenido, label)
    const encontrado = contarPorRegla(hallazgos)
    const esperado = LINEA_BASE[label] ?? {}

    const discrepancias = discrepanciasDeArchivo(label, encontrado, esperado)
    if (discrepancias.length > 0) {
      const detalleHallazgos = hallazgos
        .map((h) => `  ${h.archivo}:${h.linea} — ${h.regla} — ${h.arreglo}`)
        .join('\n')
      throw new Error(`${discrepancias.join('\n')}\n\nHallazgos de este archivo:\n${detalleHallazgos || '  (ninguno)'}`)
    }
    expect(discrepancias).toEqual([])
  })
})

describe('sin-escalar / escala-suelta: 0 en TODA la app, sin línea de base (46-b, punto 10 del encargo)', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it.each(archivos.map((file) => [archivoRelativo(file), file] as const))('%s: sin allowFontScaling={false} ni maxFontSizeMultiplier suelto', (label, file) => {
    const contenido = readFileSync(file, 'utf8')
    const hallazgos = hallazgosDeArchivo(contenido, label).filter((h) => h.regla === 'sin-escalar' || h.regla === 'escala-suelta')
    if (hallazgos.length > 0) {
      const detalle = hallazgos.map((h) => `  ${h.archivo}:${h.linea} — ${h.regla}`).join('\n')
      throw new Error(`se esperaba 0, hay ${hallazgos.length}:\n${detalle}`)
    }
    expect(hallazgos).toEqual([])
  })
})

describe('EXCEPCIONES_AREA_CHICA: cada excepción tiene que caer justo sobre un tocable real (ancla de texto, no número de línea — si el ancla ya no está en el archivo, esto falla)', () => {
  it.each(EXCEPCIONES_AREA_CHICA.map((e) => [e.archivo, e] as const))('%s', (_label, excepcion) => {
    const file = join(MOBILE_ROOT, ...excepcion.archivo.split('/'))
    const contenido = quitarComentarios(readFileSync(file, 'utf8'))
    const aperturas = tocablesDe(contenido).map((t) => t.apertura)
    expect(
      aperturas.some((a) => a.includes(excepcion.ancla)),
      `no se encontró el ancla "${excepcion.ancla}" en ningún tocable de ${excepcion.archivo} (la excepción no protege nada)`,
    ).toBe(true)
    // La misma comprobación, del otro lado: la línea ya quedó resuelta (no
    // en -1, el valor de "ancla no encontrada") al cargar el módulo.
    expect(excepcion.linea).toBeGreaterThan(0)
  })
})
