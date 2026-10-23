/**
 * QPS-261 (Ronda 56, tarea 56-e): al planificar una ronda nadie lista los
 * tests AJENOS que leen o importan los archivos que esa ronda va a cambiar.
 * Cuando esos tests quedan en rojo, no son de ninguna tarea del plan y el
 * lead los termina arreglando a mano (pasó en la R47, la R48, la R49 y la
 * R50). Esta función, dados los "objetivos" (archivos que la ronda toca) y
 * el texto de los tests existentes, devuelve qué test lee a cuál y de qué
 * forma, para que el plan se los asigne a alguien desde el principio.
 *
 * Puro: no toca disco ni red. Recibe los textos ya leídos (eso lo hace
 * `scripts/tests-que-leen.ts`, que sí puede usar `node:fs`).
 */

export type Como = 'import' | 'ruta' | 'posible'

export interface TextoDeTest {
  /** Relativa a la raíz del repo, con '/' (p. ej. "apps/web/tests/x.test.ts"). */
  ruta: string
  texto: string
}

export interface Hallazgo {
  objetivo: string
  test: string
  como: Como
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

// -----------------------------------------------------------------------
// Utilidades de rutas (sin node:path: todo con '/', a propósito, para que
// el archivo siga siendo puro).
// -----------------------------------------------------------------------

function carpetaDe(ruta: string): string {
  const i = ruta.lastIndexOf('/')
  return i === -1 ? '' : ruta.slice(0, i)
}

function basenameDe(ruta: string): string {
  const i = ruta.lastIndexOf('/')
  return i === -1 ? ruta : ruta.slice(i + 1)
}

/** Colapsa '.' y '..' de una ruta tipo posix (puede llegar con segmentos vacíos). */
function normalizarRuta(ruta: string): string {
  const partes: string[] = []
  for (const seg of ruta.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      partes.pop()
      continue
    }
    partes.push(seg)
  }
  return partes.join('/')
}

function appDeRuta(ruta: string): 'web' | 'mobile' | null {
  if (ruta.startsWith('apps/web/')) return 'web'
  if (ruta.startsWith('apps/mobile/')) return 'mobile'
  return null
}

function raizDeApp(app: 'web' | 'mobile'): string {
  return app === 'web' ? 'apps/web' : 'apps/mobile'
}

/** Variantes de archivo que puede ser un `base` sin extensión (o un índice de carpeta). */
function variacionesDeArchivo(base: string): string[] {
  if (/\.(ts|tsx)$/.test(base)) return [base]
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
}

/**
 * Resuelve un especificador de import/`vi.mock`/`import()` a las rutas (desde
 * la raíz del repo) que podría designar, según desde qué test se lo usa.
 * Devuelve `[]` si el especificador no es resoluble dentro del repo (un
 * paquete de npm, por ejemplo).
 */
function resolverEspecificador(spec: string, testRuta: string): string[] {
  if (spec.startsWith('@qps/core/')) {
    const resto = spec.slice('@qps/core/'.length)
    return [normalizarRuta(`packages/core/src/${resto}`)]
  }

  if (spec.startsWith('@/')) {
    const app = appDeRuta(testRuta) ?? 'web'
    const resto = spec.slice(2)
    return [normalizarRuta(`${raizDeApp(app)}/${resto}`)]
  }

  if (spec.startsWith('./') || spec.startsWith('../')) {
    const dir = carpetaDe(testRuta)
    return [normalizarRuta(`${dir}/${spec}`)]
  }

  return []
}

interface Literal {
  valor: string
  inicio: number
  fin: number
}

/** Todos los literales de string ('...' o "...") del texto (sin comentarios), con su posición. */
function extraerLiterales(texto: string): Literal[] {
  const literales: Literal[] = []
  let i = 0
  const n = texto.length

  while (i < n) {
    const c = texto[i]
    if (c === '"' || c === "'") {
      const comilla = c
      const inicio = i
      let valor = ''
      i++
      while (i < n && texto[i] !== comilla) {
        if (texto[i] === '\\' && i + 1 < n) {
          valor += texto[i + 1]
          i += 2
          continue
        }
        valor += texto[i]
        i++
      }
      i++ // la comilla de cierre
      literales.push({ valor, inicio, fin: i })
      continue
    }
    if (c === '`') {
      // Los template literals no se tratan como literales de ruta (podrían
      // tener interpolación): se saltan tal cual, respetando `${...}`.
      i++
      let llaves = 0
      while (i < n) {
        if (texto[i] === '\\' && i + 1 < n) {
          i += 2
          continue
        }
        if (texto[i] === '`' && llaves === 0) {
          i++
          break
        }
        if (texto[i] === '$' && texto[i + 1] === '{') {
          llaves++
          i += 2
          continue
        }
        if (texto[i] === '}' && llaves > 0) {
          llaves--
          i++
          continue
        }
        i++
      }
      continue
    }
    i++
  }

  return literales
}

/** `true` si `literal` es exactamente `ruta`, o la contiene como segmento completo (con bordes de '/'). */
function contieneComoRuta(literal: string, ruta: string): boolean {
  if (!ruta) return false
  if (literal === ruta) return true
  const idx = literal.indexOf(ruta)
  if (idx === -1) return false
  const antes = literal[idx - 1]
  const despues = literal[idx + ruta.length]
  const bordeAntes = antes === undefined || antes === '/'
  const bordeDespues = despues === undefined || despues === '/' || despues === '?' || despues === '#'
  return bordeAntes && bordeDespues
}

/** Especificadores de `import ... from '...'`, `import '...'`, `import('...')` y `vi.mock('...')`. */
function extraerEspecificadores(texto: string): string[] {
  const specs: string[] = []

  const conFrom = /import\s+[\s\S]*?\sfrom\s*(['"])((?:\\.|(?!\1).)*)\1/g
  const soloEfecto = /import\s*(['"])((?:\\.|(?!\1).)*)\1/g
  const dinamico = /import\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g
  const viMock = /vi\.mock\(\s*(['"])((?:\\.|(?!\1).)*)\1/g

  for (const re of [conFrom, soloEfecto, dinamico, viMock]) {
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(texto))) {
      specs.push(m[2])
    }
  }

  return specs
}

/** Grupos de 2+ literales de string que son argumentos consecutivos de una misma llamada (separados solo por coma y espacios). */
function extraerCorridas(literales: Literal[], texto: string): string[][] {
  const corridas: string[][] = []
  let actual: Literal[] = []

  for (let idx = 0; idx < literales.length; idx++) {
    const lit = literales[idx]
    if (actual.length === 0) {
      actual.push(lit)
      continue
    }
    const previo = actual[actual.length - 1]
    const entre = texto.slice(previo.fin, lit.inicio)
    if (/^\s*,\s*$/.test(entre)) {
      actual.push(lit)
    } else {
      if (actual.length >= 2) corridas.push(actual.map((l) => l.valor))
      actual = [lit]
    }
  }
  if (actual.length >= 2) corridas.push(actual.map((l) => l.valor))

  return corridas
}

/** `new URL('<ruta relativa>', import.meta.url)`: la ruta se resuelve desde la carpeta del test. */
function extraerNewUrlConImportMeta(texto: string): string[] {
  const resultados: string[] = []
  const re = /new\s+URL\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*import\.meta\.url/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    resultados.push(m[2])
  }
  return resultados
}

const PRIORIDAD: Record<Como, number> = { import: 3, ruta: 2, posible: 1 }

export function testsQueLeen(
  objetivos: string[],
  tests: Array<{ ruta: string; texto: string }>,
): Hallazgo[] {
  const mejor = new Map<string, Como>()

  const marcar = (objetivo: string, test: string, como: Como) => {
    const clave = `${objetivo} ${test}`
    const actual = mejor.get(clave)
    if (!actual || PRIORIDAD[como] > PRIORIDAD[actual]) mejor.set(clave, como)
  }

  for (const t of tests) {
    const limpio = quitarComentarios(t.texto)
    const appTest = appDeRuta(t.ruta)
    const dirTest = carpetaDe(t.ruta)

    const specs = extraerEspecificadores(limpio)
    const literales = extraerLiterales(limpio)
    const corridas = extraerCorridas(literales, limpio)
    const newUrls = extraerNewUrlConImportMeta(limpio)

    // Candidatos de resolución de imports, calculados una vez por test.
    const candidatosImport = specs.flatMap((spec) => resolverEspecificador(spec, t.ruta))

    // Candidatos de "nueva URL relativa al archivo del test", resueltos como
    // una ruta de archivo completa (no como especificador de módulo).
    const candidatosNewUrl = newUrls.map((rel) => normalizarRuta(`${dirTest}/${rel}`))

    for (const objetivo of objetivos) {
      // --- import ---
      const variaciones = new Set<string>()
      for (const c of candidatosImport) for (const v of variacionesDeArchivo(c)) variaciones.add(v)
      if (variaciones.has(objetivo)) {
        marcar(objetivo, t.ruta, 'import')
        continue
      }

      // --- ruta: new URL(..., import.meta.url) resuelve a un archivo exacto ---
      if (candidatosNewUrl.includes(objetivo)) {
        marcar(objetivo, t.ruta, 'ruta')
        continue
      }

      const appObjetivo = appDeRuta(objetivo)
      const relDesdeApp =
        appObjetivo && appTest && appObjetivo === appTest ? objetivo.slice(raizDeApp(appTest).length + 1) : null

      let encontrado: Como | null = null

      // --- ruta: un literal que contiene la ruta completa o la ruta relativa a la app ---
      for (const lit of literales) {
        if (contieneComoRuta(lit.valor, objetivo) || (relDesdeApp && contieneComoRuta(lit.valor, relDesdeApp))) {
          encontrado = 'ruta'
          break
        }
      }

      // --- ruta: segmentos consecutivos (join(ROOT, 'a', 'b')) ---
      if (encontrado !== 'ruta' && relDesdeApp) {
        for (const corrida of corridas) {
          let coincide = false
          for (let i = 0; i < corrida.length && !coincide; i++) {
            let acumulado = corrida[i]
            if (acumulado === relDesdeApp) {
              coincide = true
              break
            }
            for (let j = i + 1; j < corrida.length; j++) {
              acumulado += `/${corrida[j]}`
              if (acumulado === relDesdeApp) {
                coincide = true
                break
              }
            }
          }
          if (coincide) {
            encontrado = 'ruta'
            break
          }
        }
      }

      if (encontrado === 'ruta') {
        marcar(objetivo, t.ruta, 'ruta')
        continue
      }

      // --- posible: solo el nombre del archivo, literal y sin carpeta ---
      const nombre = basenameDe(objetivo)
      for (const lit of literales) {
        if (lit.valor === nombre) {
          encontrado = 'posible'
          break
        }
      }
      if (encontrado === 'posible') marcar(objetivo, t.ruta, 'posible')
    }
  }

  const hallazgos: Hallazgo[] = []
  for (const objetivo of objetivos) {
    for (const t of tests) {
      const clave = `${objetivo} ${t.ruta}`
      const como = mejor.get(clave)
      if (como) hallazgos.push({ objetivo, test: t.ruta, como })
    }
  }
  return hallazgos
}
