// 46-q (Ronda 46, calidad de la app): funciones puras para medir el área de
// toque REAL de un tocable (estilo + hitSlop resuelto a números), usadas por
// `tests/accesibilidad-hitslop-real.test.ts` y
// `tests/accesibilidad-hitslop-vecinos.test.ts`.
//
// Vive en un archivo SIN `.test.ts` (no lo recoge `vitest.config.ts`, que
// solo incluye `tests/**/*.test.ts`) a propósito: importar código desde OTRO
// archivo `*.test.ts` hace que Vitest vuelva a ejecutar (y a contar) todos
// sus `describe`/`it` dentro del archivo que importa — cada `*.test.ts` se
// recolecta con su propio contexto de módulos, así que un `import` de otro
// `*.test.ts` no comparte esa ejecución, la repite. Se comprobó corriendo
// `npm test` con las funciones de abajo declaradas directamente en
// `accesibilidad-hitslop-real.test.ts` (104 tests de más, exactamente los de
// `tests/accesibilidad-detector.test.ts`, aparecían duplicados ahí; con
// `accesibilidad-hitslop-vecinos.test.ts` importando DE ESE archivo, se
// duplicaban otra vez, en cascada). Las funciones que SÍ hay que reusar de
// `tests/accesibilidad-detector.test.ts` (no copiarlas: `tocablesDe`,
// `quitarComentarios`, `extraerAtributoBalanceado`, `clavesDeEstiloChicas`,
// `styleUsaClaveChica`) solo se importan desde UN archivo
// (`accesibilidad-hitslop-real.test.ts`), para no encadenar la duplicación —
// ver el reporte de la tarea.
import { AREA_TACTIL_MINIMA, hitSlopPara, type HitSlop } from '../../lib/accesibilidad'

// ---------------------------------------------------------------------------
// La MEDIDA real (dp) de un eje de un estilo: lo que `clavesDeEstiloChicas`
// del detector NO da (esa función solo dice si la clave es "chica", un
// booleano).
// ---------------------------------------------------------------------------

/** El texto (balanceado por llaves, sin sus propias `{}` de afuera) del
 * valor de `clave: { ... }` tal como aparece DIRECTAMENTE dentro de un
 * `StyleSheet.create({...})` de `contenidoSinComentarios` (sin bajar a un
 * objeto anidado de otra clave: cada clave de nivel superior consume
 * entero su valor balanceado antes de seguir buscando la siguiente, así
 * `shadowOffset` anidado dentro de `caja` nunca se confunde con una clave
 * propia del nivel de arriba). `null` si no se encuentra. */
export function valorDeClaveDeEstilo(contenidoSinComentarios: string, clave: string): string | null {
  const reCreate = /StyleSheet\.create\s*\(\s*\{/g
  let m: RegExpExecArray | null
  while ((m = reCreate.exec(contenidoSinComentarios))) {
    let profundidad = 1
    let i = m.index + m[0].length
    const inicioCuerpo = i
    for (; i < contenidoSinComentarios.length && profundidad > 0; i++) {
      if (contenidoSinComentarios[i] === '{') profundidad++
      else if (contenidoSinComentarios[i] === '}') profundidad--
    }
    const cuerpoObjeto = contenidoSinComentarios.slice(inicioCuerpo, i - 1)

    const reClave = /(\w+)\s*:\s*\{/g
    let mc: RegExpExecArray | null
    while ((mc = reClave.exec(cuerpoObjeto))) {
      const nombre = mc[1]
      let profundidad2 = 1
      let j = mc.index + mc[0].length
      const inicio2 = j
      for (; j < cuerpoObjeto.length && profundidad2 > 0; j++) {
        if (cuerpoObjeto[j] === '{') profundidad2++
        else if (cuerpoObjeto[j] === '}') profundidad2--
      }
      if (nombre === clave) return cuerpoObjeto.slice(inicio2, j - 1)
      reClave.lastIndex = j
    }
    reCreate.lastIndex = i
  }
  return null
}

/** Solo las propiedades DIRECTAS de `valorEstilo` (descarta cualquier objeto
 * anidado, como `shadowOffset: { width: 0, height: 2 }`). */
function soloDirectas(valorEstilo: string): string {
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

/**
 * La medida numérica real (dp) de un eje, de las propiedades DIRECTAS de un
 * valor de estilo: para `'horizontal'`, el primero de `width`/`minWidth`
 * que aparece numérico; para `'vertical'`, el primero de `height`/`minHeight`.
 * `undefined` si ninguna de las dos claves del eje aparece como número
 * (incluye el caso de que aparezca como string, `height: '100%'`, o solo
 * dentro de un objeto anidado).
 */
export function medidaDeEje(valorEstilo: string, eje: 'horizontal' | 'vertical'): number | undefined {
  const directas = soloDirectas(valorEstilo)
  const claves = eje === 'horizontal' ? ['width', 'minWidth'] : ['height', 'minHeight']
  for (const clave of claves) {
    const re = new RegExp(`\\b${clave}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`)
    const m = directas.match(re)
    if (m) return Number(m[1])
  }
  return undefined
}

// ---------------------------------------------------------------------------
// El `hitSlop` real, resuelto a números: número literal, llamada directa a
// `hitSlopPara(...)` (con argumentos numéricos o el identificador
// `AREA_TACTIL_MINIMA`, resuelto al valor REAL importado — no un número
// copiado), un identificador que referencia una `const` del mismo archivo
// (recursivo), o un objeto `{ ...hitSlopPara(...), left: N, right: N }`
// (spread + overrides literales, el caso de `HIT_SLOP_PUNTO` de Hero.tsx).
// ---------------------------------------------------------------------------

/** El cuerpo (balanceado, sin el `const NOMBRE =` ni el `;`/salto de línea
 * final) del VALOR de una constante `const NOMBRE = ...` en `contenido` —
 * corta en el primer `;` o salto de línea a profundidad 0 de `(){}[]`.
 * `null` si no se encuentra. */
export function valorDeConstante(contenido: string, nombre: string): string | null {
  const re = new RegExp(`\\bconst\\s+${nombre}\\s*=\\s*`)
  const m = re.exec(contenido)
  if (!m) return null
  let i = m.index + m[0].length
  let profundidad = 0
  const inicio = i
  for (; i < contenido.length; i++) {
    const c = contenido[i]
    if (c === '{' || c === '(' || c === '[') profundidad++
    else if (c === '}' || c === ')' || c === ']') profundidad--
    else if ((c === ';' || c === '\n') && profundidad <= 0) break
  }
  return contenido.slice(inicio, i).trim()
}

/** Separa los argumentos de nivel superior de una lista `a, b, c`
 * (balanceando `(){}[]`: una coma dentro de un paréntesis/llave/corchete no
 * corta). */
function separarArgumentos(texto: string): string[] {
  const args: string[] = []
  let profundidad = 0
  let actual = ''
  for (const c of texto) {
    if (c === '(' || c === '{' || c === '[') profundidad++
    else if (c === ')' || c === '}' || c === ']') profundidad--
    if (c === ',' && profundidad === 0) {
      args.push(actual)
      actual = ''
      continue
    }
    actual += c
  }
  if (actual.trim() !== '') args.push(actual)
  return args.map((a) => a.trim())
}

function resolverNumero(token: string, contenidoArchivo: string): number {
  const limpio = token.trim()
  if (/^-?\d+(?:\.\d+)?$/.test(limpio)) return Number(limpio)
  // AREA_TACTIL_MINIMA se resuelve al valor REAL importado de
  // lib/accesibilidad.ts (nunca a un número copiado).
  if (limpio === 'AREA_TACTIL_MINIMA') return AREA_TACTIL_MINIMA
  const valor = valorDeConstante(contenidoArchivo, limpio)
  if (valor !== null && /^-?\d+(?:\.\d+)?$/.test(valor)) return Number(valor)
  throw new Error(`resolverNumero: no se pudo resolver "${token}" a un número`)
}

/** El `HitSlop` real de una expresión de atributo `hitSlop={...}` (ya SIN el
 * `{`/`}` de afuera — el valor que da `extraerAtributoBalanceado` del
 * detector). Usa el `hitSlopPara` REAL de `lib/accesibilidad.ts` para
 * cualquier llamada que encuentre: nunca reimplementa la fórmula. Tira si
 * no reconoce la forma. */
export function resolverHitSlop(expresion: string, contenidoArchivo: string): HitSlop {
  const texto = expresion.trim()

  if (/^-?\d+(?:\.\d+)?$/.test(texto)) {
    const n = Number(texto)
    return { top: n, bottom: n, left: n, right: n }
  }

  const mCall = texto.match(/^hitSlopPara\s*\(([\s\S]*)\)$/)
  if (mCall) {
    const args = separarArgumentos(mCall[1]).map((a) => resolverNumero(a, contenidoArchivo))
    return hitSlopPara(args[0], args[1])
  }

  const mObjeto = texto.match(/^\{([\s\S]*)\}$/)
  if (mObjeto) {
    const cuerpo = mObjeto[1]
    const mSpread = cuerpo.match(/\.\.\.hitSlopPara\s*\(([\s\S]*?)\)/)
    let base: HitSlop = { top: 0, bottom: 0, left: 0, right: 0 }
    let resto = cuerpo
    if (mSpread && mSpread.index !== undefined) {
      const args = separarArgumentos(mSpread[1]).map((a) => resolverNumero(a, contenidoArchivo))
      base = hitSlopPara(args[0], args[1])
      resto = cuerpo.slice(mSpread.index + mSpread[0].length)
    }
    const resultado: HitSlop = { ...base }
    const reProp = /\b(top|bottom|left|right)\s*:\s*(-?\d+(?:\.\d+)?)/g
    let mp: RegExpExecArray | null
    while ((mp = reProp.exec(resto))) {
      resultado[mp[1] as keyof HitSlop] = Number(mp[2])
    }
    return resultado
  }

  if (/^\w+$/.test(texto)) {
    const valor = valorDeConstante(contenidoArchivo, texto)
    if (valor !== null) return resolverHitSlop(valor, contenidoArchivo)
  }

  throw new Error(`resolverHitSlop: no reconozco la forma "${texto}"`)
}
