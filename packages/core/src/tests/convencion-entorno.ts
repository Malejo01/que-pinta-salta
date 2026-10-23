/**
 * SOLO PARA TESTS. Helper compartido de los dos detectores de la convención
 * de entorno de Vitest (`apps/web/tests/dom/convencion-entorno.test.ts` y
 * `apps/mobile/tests/convencion-entorno.test.ts`, R61/R64).
 *
 * Por qué no entra al bundle de la app: nada de producción lo importa (solo
 * archivos `*.test.ts` y `apps/web/lib/rondas/tests-que-leen.ts`, herramienta
 * de planificación de rondas), y Metro/Expo solo empaqueta lo alcanzable desde
 * el punto de entrada. Se comprueba con `npm --prefix apps/mobile run check:bundle`.
 *
 * Es PURO a propósito (texto entra, resultado sale): `packages/core` no tiene
 * tipos de node, así que el recorrido de carpetas (`node:fs`) vive en cada
 * envoltorio.
 *
 * Ojo: este archivo tampoco puede escribir contiguo el literal de la
 * directiva de entorno por archivo de Vitest (Vitest lo busca en el texto,
 * aunque esté en un comentario); se arma en pedazos.
 */

/**
 * La palabra de la directiva, armada en tiempo de ejecución con '@' + el
 * resto, para que ningún archivo que la use la escriba completa.
 */
export const PALABRA_DIRECTIVA = '@' + 'vitest-environment'
export const PATRON_DIRECTIVA = new RegExp(PALABRA_DIRECTIVA + '\\s+([A-Za-z0-9_-]+)')

/** El `environment: 'node'` de un `vitest.config.ts`. */
export const ENVIRONMENT_NODE = /environment:\s*'node'/

export interface Hallazgo {
  valor: string
  linea: number
}

/**
 * Busca la directiva en TODO el texto del archivo, igual que Vitest: no le
 * importa si está en código, en un comentario de línea o en uno de bloque.
 * Devuelve el valor pedido (por ejemplo "jsdom") y el número de línea (1 =
 * primera línea) de la primera ocurrencia, o null si no aparece.
 */
export function buscarDirectiva(contenido: string): Hallazgo | null {
  const coincidencia = PATRON_DIRECTIVA.exec(contenido)
  if (!coincidencia || coincidencia.index === undefined) return null
  const linea = contenido.slice(0, coincidencia.index).split('\n').length
  return { valor: coincidencia[1], linea }
}

/** Para tests con DOM: pide jsdom, y en la primera línea. */
export function esValidoParaTestsDom(contenido: string): boolean {
  const hallazgo = buscarDirectiva(contenido)
  return hallazgo !== null && hallazgo.valor === 'jsdom' && hallazgo.linea === 1
}

/** Para todo lo demás: no debe aparecer ninguna directiva, de ningún valor. */
export function esValidoFueraDeTestsDom(contenido: string): boolean {
  return buscarDirectiva(contenido) === null
}

/** `true` si el config (leído SIN sus comentarios) fija `environment: 'node'`. */
export function configTieneEnvironmentNode(contenidoConfig: string): boolean {
  return ENVIRONMENT_NODE.test(quitarComentarios(contenidoConfig))
}

// -----------------------------------------------------------------------
// Quitador de comentarios: conoce strings ('...', "...", `...`) para no
// confundir un "//" dentro de una URL con un comentario de línea, y para no
// borrar un literal que vive dentro de un comentario (que, en cambio, se
// descarta del todo). No evalúa expresiones `${...}` de un template, solo
// lleva la cuenta de las llaves para saber cuándo termina el template.
// -----------------------------------------------------------------------
export function quitarComentarios(texto: string): string {
  let resultado = ''
  let i = 0
  const n = texto.length

  while (i < n) {
    const c = texto[i]
    const sig = texto[i + 1]

    if (c === '/' && sig === '/') {
      i += 2
      while (i < n && texto[i] !== '\n') i++
      continue
    }

    if (c === '/' && sig === '*') {
      i += 2
      while (i < n && !(texto[i] === '*' && texto[i + 1] === '/')) i++
      i += 2
      continue
    }

    if (c === '"' || c === "'") {
      const comilla = c
      let str = c
      i++
      while (i < n && texto[i] !== comilla) {
        if (texto[i] === '\\' && i + 1 < n) {
          str += texto[i] + texto[i + 1]
          i += 2
          continue
        }
        str += texto[i]
        i++
      }
      str += texto[i] ?? ''
      i++
      resultado += str
      continue
    }

    if (c === '`') {
      let str = c
      i++
      let llaves = 0
      while (i < n) {
        if (texto[i] === '\\' && i + 1 < n) {
          str += texto[i] + texto[i + 1]
          i += 2
          continue
        }
        if (texto[i] === '`' && llaves === 0) {
          str += texto[i]
          i++
          break
        }
        if (texto[i] === '$' && texto[i + 1] === '{') {
          llaves++
          str += texto[i] + texto[i + 1]
          i += 2
          continue
        }
        if (texto[i] === '}' && llaves > 0) {
          llaves--
          str += texto[i]
          i++
          continue
        }
        str += texto[i]
        i++
      }
      resultado += str
      continue
    }

    resultado += c
    i++
  }

  return resultado
}
