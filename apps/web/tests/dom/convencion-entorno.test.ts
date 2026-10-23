/**
 * El detector de la convención de entorno de los tests con DOM (R61, tarea
 * 56-q, QPS-199).
 *
 * Esta ronda abrió el primer rincón del repo con DOM real (`tests/dom/`),
 * que pide jsdom con la directiva de entorno por archivo de Vitest en su
 * PRIMERA línea. Mientras se escribían los comentarios que explican esa
 * directiva en prosa, se descubrió esto: Vitest busca el literal en el TEXTO
 * del archivo, sin que le importe si está dentro de un comentario que solo
 * lo menciona. Pasó en dos archivos al escribir la explicación:
 *
 *  - `tests/components/password-input.test.ts` se puso en rojo entero (18
 *    tests, `TypeError: The URL must be of scheme file`): jsdom le cambió
 *    `import.meta.url` y el detector estático de ese archivo explotó.
 *  - `tests/asistencia/fila-render.test.ts` NO se puso en rojo — pasó a
 *    jsdom y siguió en verde. Es el caso peor: nada avisa, salvo que el
 *    tiempo de `environment` de la suite completa sube de ~3-4 s a ~19 s.
 *
 * Los dos comentarios ya se arreglaron (describen la directiva sin
 * reproducir el literal). Este archivo hace que el repo se defienda solo:
 * barre `apps/web/tests/` de forma recursiva y fija tres reglas (ver los
 * tres `describe` de más abajo) más las dos excepciones documentadas y la
 * verificación de que el detector no es ciego (se prueba con fixtures antes
 * de aplicarse al repo).
 *
 * Este archivo corre en el entorno por omisión (`node`, `vitest.config.ts`):
 * NO lleva la directiva de entorno (ver la excepción de más abajo, y el
 * último `describe`, que comprueba que sigue sin llevarla).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// La lógica del detector (buscar la directiva, quitar comentarios) vive en un
// helper compartido, solo para tests, con el gemelo de apps/mobile (R64).
import {
  ENVIRONMENT_NODE,
  PALABRA_DIRECTIVA,
  buscarDirectiva,
  configTieneEnvironmentNode,
  esValidoFueraDeTestsDom,
  esValidoParaTestsDom,
  quitarComentarios,
} from '@qps/core/tests/convencion-entorno'

// apps/web/tests/dom -> apps/web
const APPS_WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const TESTS_DIR = join(APPS_WEB_ROOT, 'tests')

/** Ruta de este mismo archivo, relativa a apps/web (con "/"). */
const RUTA_ESTE_ARCHIVO = 'tests/dom/convencion-entorno.test.ts'
/** El módulo de ayuda de los tests con DOM: no termina en .test.ts. */
const RUTA_PREPARAR_DOM = 'tests/dom/preparar-dom.ts'

/**
 * Recorre un directorio recursivamente y devuelve las rutas relativas (con
 * "/") a baseAbsoluta.
 *
 * SIN `try/catch`: si `readdirSync` falla, tiene que explotar. La primera
 * versión se tragaba el error y devolvía `[]`, y eso es justo lo que un
 * detector no puede hacer — una subcarpeta ilegible dejaba sus archivos
 * afuera del barrido y las Reglas 1 y 2 pasaban en verde sin haberlos
 * mirado. Con el error arriba, la rotura es ruidosa. (Lo encontró el revisor
 * de la R61.)
 */
function listarArchivosRecursivo(dirAbsoluto: string, baseAbsoluta: string): string[] {
  const entradas = readdirSync(dirAbsoluto)
  const resultado: string[] = []
  for (const entrada of entradas) {
    const rutaAbsoluta = join(dirAbsoluto, entrada)
    const info = statSync(rutaAbsoluta)
    if (info.isDirectory()) {
      resultado.push(...listarArchivosRecursivo(rutaAbsoluta, baseAbsoluta))
    } else if (info.isFile()) {
      resultado.push(relative(baseAbsoluta, rutaAbsoluta).split('\\').join('/'))
    }
  }
  return resultado
}

// Rutas relativas a apps/web, ej. "tests/dom/entorno.test.ts".
const ARCHIVOS_DE_TESTS = listarArchivosRecursivo(TESTS_DIR, APPS_WEB_ROOT)
const ARCHIVOS_FUERA_DE_DOM = ARCHIVOS_DE_TESTS.filter((f) => !f.startsWith('tests/dom/'))
const ARCHIVOS_DE_DOM = ARCHIVOS_DE_TESTS.filter((f) => f.startsWith('tests/dom/'))

/** Las dos únicas excepciones a "todo *.test.ts de tests/dom/ pide jsdom en la primera línea", con el motivo. */
const EXCEPCIONES_SIN_DIRECTIVA_EN_DOM = new Map<string, string>([
  [RUTA_PREPARAR_DOM, 'módulo de ayuda, no termina en .test.ts: Vitest no lo levanta como suite'],
  [RUTA_ESTE_ARCHIVO, 'este mismo detector: corre en node por diseño, y no puede llevar la directiva sin cambiarse el entorno a sí mismo'],
])

// ---------------------------------------------------------------------------
// Sanidad del recorrido: si esto da 0 o un número chico, el glob está roto y
// el resto de los chequeos pasaría en verde sin haber mirado nada.
// ---------------------------------------------------------------------------
describe('sanidad del recorrido', () => {
  // El umbral va pegado al número real (222 archivos al escribir esto) y no
  // 200: con un margen de 22 archivos, una subcarpeta chica que se cayera del
  // barrido no bajaba el conteo por debajo del umbral y nadie se enteraba.
  // Si la suite crece y esto molesta, se sube el número; lo que no se hace es
  // agrandar el margen. (Lo encontró el revisor de la R61.)
  it('recorrió al menos 215 archivos fuera de tests/dom/', () => {
    expect(ARCHIVOS_FUERA_DE_DOM.length).toBeGreaterThanOrEqual(215)
  })

  it('encontró los archivos conocidos de tests/dom/ (si no, el recorrido no está mirando esa carpeta)', () => {
    expect(ARCHIVOS_DE_DOM).toContain('tests/dom/entorno.test.ts')
    expect(ARCHIVOS_DE_DOM).toContain('tests/dom/fila-acciones-evento.dom.test.ts')
    expect(ARCHIVOS_DE_DOM).toContain(RUTA_PREPARAR_DOM)
    expect(ARCHIVOS_DE_DOM).toContain(RUTA_ESTE_ARCHIVO)
  })
})

// ---------------------------------------------------------------------------
// Regla 1: solo tests/dom/ pide jsdom. Ningún archivo FUERA de tests/dom/
// (código, comentario, da igual) contiene la directiva, para ningún valor.
// ---------------------------------------------------------------------------
describe('Regla 1: solo tests/dom/ pide jsdom (ningún otro archivo de apps/web/tests/ lleva la directiva, ni en código ni en un comentario)', () => {
  it.each(ARCHIVOS_FUERA_DE_DOM)('%s no contiene la directiva de entorno', (archivo) => {
    const contenido = readFileSync(join(APPS_WEB_ROOT, archivo), 'utf8')
    const hallazgo = buscarDirectiva(contenido)
    expect(
      hallazgo,
      hallazgo
        ? `${archivo}:${hallazgo.linea}: encontró la directiva pidiendo "${hallazgo.valor}" — el mismo bug que puso ` +
            `tests/components/password-input.test.ts en rojo entero (18 tests, TypeError de import.meta.url) cuando ` +
            'un comentario que solo explicaba la directiva la reprodujo (R61, tarea 56-q)'
        : undefined,
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Regla 2: todo *.test.ts de tests/dom/ (salvo las excepciones documentadas)
// pide jsdom, y en su primera línea.
// ---------------------------------------------------------------------------
describe('Regla 2: todo *.test.ts de tests/dom/ pide jsdom en su primera línea', () => {
  const archivosQueDebenLlevarla = ARCHIVOS_DE_DOM.filter(
    (f) => f.endsWith('.test.ts') && !EXCEPCIONES_SIN_DIRECTIVA_EN_DOM.has(f),
  )

  it('encontró al menos 2 archivos de test en tests/dom/ que deben llevar la directiva (si no, el filtro de excepciones se comió todo)', () => {
    expect(archivosQueDebenLlevarla.length).toBeGreaterThanOrEqual(2)
  })

  it.each(archivosQueDebenLlevarla)('%s pide jsdom en su primera línea', (archivo) => {
    const contenido = readFileSync(join(APPS_WEB_ROOT, archivo), 'utf8')
    const hallazgo = buscarDirectiva(contenido)
    expect(
      hallazgo,
      `${archivo}: no se encontró la directiva de entorno — correría en node y fallaría de forma confusa, o peor, pasaría sin probar nada`,
    ).not.toBeNull()
    expect(hallazgo!.valor, `${archivo}: la directiva pide "${hallazgo!.valor}", no "jsdom"`).toBe('jsdom')
    expect(hallazgo!.linea, `${archivo}: la directiva está en la línea ${hallazgo!.linea}, no en la primera`).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Regla 2, excepciones: las dos excepciones de la regla anterior siguen
// siendo ciertas. Sin esto, la lista de excepciones es un agujero que nadie
// revisa (alguien podría renombrar preparar-dom.ts a preparar-dom.test.ts, o
// agregarle la directiva a este archivo, y la regla 2 lo pasaría por alto en
// silencio).
// ---------------------------------------------------------------------------
describe('Las excepciones de la Regla 2 siguen siendo ciertas', () => {
  it.each([...EXCEPCIONES_SIN_DIRECTIVA_EN_DOM.entries()])('%s: %s', (archivo, motivo) => {
    expect(ARCHIVOS_DE_DOM, `${archivo} ya no aparece en el recorrido de tests/dom/`).toContain(archivo)
    expect(motivo.length, `${archivo} quedó sin motivo documentado para la excepción`).toBeGreaterThan(0)
  })

  it(`${RUTA_PREPARAR_DOM} sigue sin terminar en ".test.ts" (si terminara, Vitest lo levantaría como suite)`, () => {
    expect(RUTA_PREPARAR_DOM.endsWith('.test.ts')).toBe(false)
  })

  it(`${RUTA_ESTE_ARCHIVO} (este mismo archivo) sigue sin llevar la directiva de entorno`, () => {
    const contenidoPropio = readFileSync(join(APPS_WEB_ROOT, RUTA_ESTE_ARCHIVO), 'utf8')
    expect(buscarDirectiva(contenidoPropio)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Regla 3: apps/web/vitest.config.ts sigue en 'node'. Si alguien lo pasa a
// 'jsdom', los 222+ archivos que hoy corren en node cambiarían de entorno en
// silencio (y, de paso, dejarían de hacer falta las directivas de arriba).
//
// Cómo falla de verdad esa rotura, corrida y verificada (R61, lead): al pasar
// el `environment` global a 'jsdom', este archivo NO llega a correr la Regla
// 3 — falla antes, al cargar, con `TypeError: The URL must be of scheme file`
// en el `fileURLToPath(import.meta.url)` de la línea 36, que es el MISMO
// error que puso en rojo a `password-input.test.ts`. O sea: la rotura es
// ruidosa (es lo que importa), pero el mensaje que se ve no es el de acá
// abajo. Si algún día hay que mejorar eso, el camino es que la Regla 3 no
// dependa de `import.meta.url`; mientras tanto queda escrito para que nadie
// pierda el tiempo buscando un bug de rutas que no existe.
// ---------------------------------------------------------------------------
describe("Regla 3: apps/web/vitest.config.ts sigue con environment: 'node'", () => {
  it("el environment configurado es 'node', leído SIN los comentarios del archivo", () => {
    const contenido = readFileSync(join(APPS_WEB_ROOT, 'vitest.config.ts'), 'utf8')
    expect(configTieneEnvironmentNode(contenido)).toBe(true)
  })

  // Por qué se quitan los comentarios, y por qué esto es un caso y no una
  // nota: la primera versión hacía el `toMatch` sobre TODO el texto del
  // archivo. O sea que si alguien pasaba el `environment` a 'jsdom' y dejaba
  // dando vueltas un comentario que mencionara `environment: 'node'` —el
  // comentario que explica la convención es justamente el candidato— la
  // Regla 3 seguía en verde. Es la MISMA familia de bug que este archivo
  // existe para cazar, y el detector no se cubría a sí mismo. Lo encontró el
  // revisor de la R61.
  it('un archivo con el environment en jsdom y un comentario que menciona "node" NO pasa la Regla 3', () => {
    const configFalsa = [
      "// ojo: antes esto era environment: 'node', se cambió en la R999",
      'export default defineConfig({',
      '  test: {',
      "    environment: 'jsdom',",
      '  },',
      '})',
    ].join('\n')

    // Sobre el texto crudo pasaría (el comentario la salva): eso era el bug.
    expect(configFalsa).toMatch(ENVIRONMENT_NODE)
    // Sin los comentarios, no pasa.
    expect(quitarComentarios(configFalsa)).not.toMatch(ENVIRONMENT_NODE)
  })

  it('un archivo con el environment en node de verdad SÍ pasa la Regla 3 (el caso seguro, para que el chequeo no sea imposible)', () => {
    const configBuena = ['export default defineConfig({', '  test: {', "    environment: 'node',", '  },', '})'].join('\n')
    expect(quitarComentarios(configBuena)).toMatch(ENVIRONMENT_NODE)
  })
})

// ---------------------------------------------------------------------------
// El literal armado en tiempo de ejecución es el que Vitest reconoce de
// verdad (no una invención del detector), y este archivo no lo escribe
// completo en ninguna parte de su propio texto fuente.
// ---------------------------------------------------------------------------
describe('El patrón armado en tiempo de ejecución es el que Vitest usa de verdad', () => {
  it('aplicado a tests/dom/entorno.test.ts (que SABEMOS que Vitest trata como jsdom, porque sus tests con DOM pasan) encuentra "jsdom" en la línea 1', () => {
    const contenido = readFileSync(join(APPS_WEB_ROOT, 'tests/dom/entorno.test.ts'), 'utf8')
    expect(buscarDirectiva(contenido)).toEqual({ valor: 'jsdom', linea: 1 })
  })

  it('aplicado a tests/dom/fila-acciones-evento.dom.test.ts (mismo caso) también encuentra "jsdom" en la línea 1', () => {
    const contenido = readFileSync(join(APPS_WEB_ROOT, 'tests/dom/fila-acciones-evento.dom.test.ts'), 'utf8')
    expect(buscarDirectiva(contenido)).toEqual({ valor: 'jsdom', linea: 1 })
  })

  it('este archivo, leído desde el disco con fs, NO contiene el literal contiguo (está armado en pedazos a propósito)', () => {
    const contenidoPropio = readFileSync(join(APPS_WEB_ROOT, RUTA_ESTE_ARCHIVO), 'utf8')
    expect(contenidoPropio).not.toContain(PALABRA_DIRECTIVA)
  })

  it('el helper compartido de packages/core tampoco contiene el literal contiguo', () => {
    const helper = readFileSync(join(APPS_WEB_ROOT, '../../packages/core/src/tests/convencion-entorno.ts'), 'utf8')
    expect(helper).not.toContain(PALABRA_DIRECTIVA)
  })
})

// ---------------------------------------------------------------------------
// El fixture que demuestra que el detector no es ciego: la MISMA función que
// se aplica al repo se prueba antes con contenido inventado en variables (no
// archivos), armado también en pedazos para no reproducir el literal acá.
// ---------------------------------------------------------------------------
describe('El detector funciona sobre fixtures en memoria antes de aplicarse al repo', () => {
  const comentarioDeBloqueConDirectiva = `/* ${PALABRA_DIRECTIVA} jsdom */\nconst x = 1\n`
  const primeraLineaConDirectiva = `// ${PALABRA_DIRECTIVA} jsdom\nimport { describe } from 'vitest'\n`
  const lineaOchoConDirectiva =
    '// línea 1\n// línea 2\n// línea 3\n// línea 4\n// línea 5\n// línea 6\n// línea 7\n' + `// ${PALABRA_DIRECTIVA} jsdom\n`
  const sinDirectivaNinguna = '// un comentario cualquiera, sin ninguna directiva\nconst x = 1\n'

  it('un comentario de BLOQUE (/* ... */) que la menciona: el detector la encuentra, igual que Vitest', () => {
    expect(buscarDirectiva(comentarioDeBloqueConDirectiva)).toEqual({ valor: 'jsdom', linea: 1 })
  })

  it('en la primera línea: válido para tests/dom/, e inválido fuera de tests/dom/', () => {
    expect(esValidoParaTestsDom(primeraLineaConDirectiva)).toBe(true)
    expect(esValidoFueraDeTestsDom(primeraLineaConDirectiva)).toBe(false)
  })

  it('en la línea 8 (no la primera): inválido para tests/dom/, aunque la directiva esté presente', () => {
    const hallazgo = buscarDirectiva(lineaOchoConDirectiva)
    expect(hallazgo?.linea).toBe(8)
    expect(esValidoParaTestsDom(lineaOchoConDirectiva)).toBe(false)
  })

  it('sin ninguna directiva: inválido para tests/dom/, válido fuera de tests/dom/', () => {
    expect(buscarDirectiva(sinDirectivaNinguna)).toBeNull()
    expect(esValidoParaTestsDom(sinDirectivaNinguna)).toBe(false)
    expect(esValidoFueraDeTestsDom(sinDirectivaNinguna)).toBe(true)
  })
})
