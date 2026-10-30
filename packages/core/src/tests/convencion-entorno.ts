/**
 * SOLO PARA TESTS. Helper compartido de los dos detectores de la convención
 * de entorno de Vitest (`apps/web/tests/dom/convencion-entorno.test.ts` y
 * `apps/mobile/tests/convencion-entorno.test.ts`, R61/R64 / QPS-319).
 *
 * Por qué no entra al bundle de la app: nada de producción lo importa (solo
 * archivos `*.test.ts` y `apps/web/lib/rondas/tests-que-leen.ts`, herramienta
 * de planificación de rondas), y Metro/Expo solo empaqueta lo alcanzable desde
 * el punto de entrada. Se comprueba con `npm --prefix apps/mobile run check:bundle`.
 *
 * Es PURO a propósito (texto entra, resultado sale): `packages/core` no puede
 * importar módulos `node:*` (regla de frontera arquitectónica verificada en
 * `apps/web/tests/core/frontera.test.ts`). Por eso las operaciones de sistema
 * de archivos se reciben como adaptador desde el runner de tests.
 *
 * Ojo: este archivo tampoco puede escribir contiguo el literal de la
 * directiva de entorno por archivo de Vitest (Vitest lo busca en el texto,
 * aunque esté en un comentario); se arma en pedazos.
 */

export interface AdaptadorArchivos {
  readdirSync: (dir: string) => string[]
  statSync: (ruta: string) => { isDirectory: () => boolean; isFile: () => boolean }
  join: (...partes: string[]) => string
  relative: (desde: string, hacia: string) => string
}

/**
 * Recorre un directorio recursivamente y devuelve las rutas relativas (con
 * "/") a baseAbsoluta.
 *
 * SIN `try/catch`: si `readdirSync` falla, tiene que explotar para que la
 * rotura sea ruidosa y ningún directorio quede sin revisar.
 */
export function listarArchivosRecursivo(
  dirAbsoluto: string,
  baseAbsoluta: string,
  fs: AdaptadorArchivos,
): string[] {
  const entradas = fs.readdirSync(dirAbsoluto)
  const resultado: string[] = []
  for (const entrada of entradas) {
    const rutaAbsoluta = fs.join(dirAbsoluto, entrada)
    const info = fs.statSync(rutaAbsoluta)
    if (info.isDirectory()) {
      resultado.push(...listarArchivosRecursivo(rutaAbsoluta, baseAbsoluta, fs))
    } else if (info.isFile()) {
      resultado.push(fs.relative(baseAbsoluta, rutaAbsoluta).split('\\').join('/'))
    }
  }
  return resultado
}

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
// descarta del todo). Preserva los saltos de línea (\n) dentro de bloques
// multilínea para mantener intactos los números de línea del archivo original.
// -----------------------------------------------------------------------
export function quitarComentarios(texto: string): string {
  let resultado = ''
  let i = 0
  const n = texto.length

  while (i < n) {
    const c = texto[i]
    const sig = texto[i + 1]

    if (c === '/' && sig === '/') {
      while (resultado.length > 0 && (resultado.endsWith(' ') || resultado.endsWith('\t'))) {
        resultado = resultado.slice(0, -1)
      }
      i += 2
      while (i < n && texto[i] !== '\n') i++
      continue
    }

    if (c === '/' && sig === '*') {
      i += 2
      while (i < n && !(texto[i] === '*' && texto[i + 1] === '/')) {
        if (texto[i] === '\n') {
          resultado += '\n'
        }
        i++
      }
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

// ---------------------------------------------------------------------------
// Fixtures en memoria para comprobar que los detectores no son ciegos.
// Compartidos entre apps/web y apps/mobile (QPS-319).
// ---------------------------------------------------------------------------
export const FIXTURE_COMENTARIO_BLOQUE_CON_DIRECTIVA = `/* ${PALABRA_DIRECTIVA} jsdom */\nconst x = 1\n`
export const FIXTURE_PRIMERA_LINEA_CON_DIRECTIVA = `// ${PALABRA_DIRECTIVA} jsdom\nimport { describe } from 'vitest'\n`
export const FIXTURE_LINEA_OCHO_CON_DIRECTIVA =
  '// línea 1\n// línea 2\n// línea 3\n// línea 4\n// línea 5\n// línea 6\n// línea 7\n' + `// ${PALABRA_DIRECTIVA} jsdom\n`
export const FIXTURE_SIN_DIRECTIVA = '// un comentario cualquiera, sin ninguna directiva\nconst x = 1\n'

export const FIXTURE_CONFIG_FALSA_COMENTARIO = [
  "// ojo: antes esto era environment: 'node', se cambió en la R999",
  'export default defineConfig({',
  '  test: {',
  "    environment: 'jsdom',",
  '  },',
  '})',
].join('\n')

export const FIXTURE_CONFIG_FALSA_BLOQUE = [
  "const a = 1 /* environment: 'node' */",
  "export default { test: { environment: 'jsdom' } }",
].join('\n')

export const FIXTURE_CONFIG_BUENA = [
  'export default defineConfig({',
  '  test: {',
  "    environment: 'node',",
  '  },',
  '})',
].join('\n')
