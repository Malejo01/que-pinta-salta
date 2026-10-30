/**
 * El detector de la convención de entorno de los tests de la app (R61, tarea
 * 56-q, QPS-199) — el gemelo de `apps/web/tests/dom/convencion-entorno.test.ts`.
 *
 * Son dos archivos y no uno porque cada app tiene su propio `vitest.config.ts`
 * y su propio alias `@` (apps/web/ apunta a `apps/web/`, apps/mobile/ apunta a
 * `apps/mobile/`): el mismo motivo por el que `estado-evento-paridad` son dos
 * archivos, uno por app (`tests/estado-evento-paridad.test.ts` acá,
 * `apps/web/tests/asistencia/estado-evento-paridad.test.ts` en la web).
 * La lógica común (buscar la directiva, `quitarComentarios` completo, fixtures y recorrido)
 * vive en un helper compartido, solo para tests, en
 * `packages/core/src/tests/convencion-entorno.ts` (R64 / QPS-319); cada archivo es un
 * envoltorio fino que lo aplica a su carpeta y a su regla.
 *
 * Qué pasó en la R61 que lo hizo necesario: al abrir `apps/web/tests/dom/`,
 * se descubrió que Vitest busca la directiva de entorno por archivo (la
 * palabra arroba seguida de "vitest-environment" y un valor) en el TEXTO del
 * archivo, sin que le importe si está dentro de un comentario que solo la
 * menciona para explicarla. Le cambió el entorno a dos archivos de
 * `apps/web/tests/`: uno se puso en rojo entero (18 tests) y el otro se pasó
 * a jsdom y siguió en verde — el caso peor, porque nada avisa.
 *
 * `apps/mobile` NO tiene ninguna carpeta con DOM (los tests de pantalla
 * necesitarían un runner de React Native, que no está aprobado — ver el
 * comentario de `apps/mobile/vitest.config.ts`). Así que la regla acá es más
 * simple y más fuerte que la de la web: NINGÚN archivo bajo `apps/mobile/tests/`
 * debe llevar la directiva, para ningún valor, ni en código ni en un
 * comentario. Sin excepciones.
 *
 * Este archivo corre en el entorno por omisión (`node`, `vitest.config.ts`):
 * tampoco lleva la directiva (ver el último `describe`, que lo comprueba).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  ENVIRONMENT_NODE,
  FIXTURE_COMENTARIO_BLOQUE_CON_DIRECTIVA,
  FIXTURE_CONFIG_BUENA,
  FIXTURE_CONFIG_FALSA_BLOQUE,
  FIXTURE_CONFIG_FALSA_COMENTARIO,
  FIXTURE_LINEA_OCHO_CON_DIRECTIVA,
  FIXTURE_PRIMERA_LINEA_CON_DIRECTIVA,
  FIXTURE_SIN_DIRECTIVA,
  PALABRA_DIRECTIVA,
  buscarDirectiva,
  configTieneEnvironmentNode,
  esValidoFueraDeTestsDom,
  esValidoParaTestsDom,
  listarArchivosRecursivo,
  quitarComentarios,
} from '@qps/core/tests/convencion-entorno'

// apps/mobile/tests -> apps/mobile
const APPS_MOBILE_ROOT = fileURLToPath(new URL('../', import.meta.url))
const TESTS_DIR = join(APPS_MOBILE_ROOT, 'tests')

/** Ruta de este mismo archivo, relativa a apps/mobile (con "/"). */
const RUTA_ESTE_ARCHIVO = 'tests/convencion-entorno.test.ts'

// Rutas relativas a apps/mobile, ej. "tests/env.test.ts".
const ARCHIVOS_DE_TESTS = listarArchivosRecursivo(TESTS_DIR, APPS_MOBILE_ROOT, { readdirSync, statSync, join, relative })

// ---------------------------------------------------------------------------
// Sanidad del recorrido: si esto da 0 o un número chico, el barrido está roto
// y el resto de los chequeos pasaría en verde sin haber mirado nada.
// ---------------------------------------------------------------------------
describe('sanidad del recorrido', () => {
  it('recorrió al menos 105 archivos de apps/mobile/tests/', () => {
    expect(ARCHIVOS_DE_TESTS.length).toBeGreaterThanOrEqual(105)
  })

  it('encontró archivos conocidos de apps/mobile/tests/ (si no, el recorrido no está mirando esa carpeta)', () => {
    expect(ARCHIVOS_DE_TESTS).toContain('tests/env.test.ts')
    expect(ARCHIVOS_DE_TESTS).toContain('tests/secure-storage.test.ts')
    expect(ARCHIVOS_DE_TESTS).toContain(RUTA_ESTE_ARCHIVO)
  })
})

// ---------------------------------------------------------------------------
// Regla 1: ningún archivo de apps/mobile/tests/ lleva la directiva de
// entorno, para ningún valor, ni en código ni en un comentario. Sin
// excepciones: apps/mobile no tiene ninguna carpeta con DOM (los tests de
// pantalla necesitarían un runner de React Native, no aprobado).
// ---------------------------------------------------------------------------
describe('Regla 1: ningún archivo de apps/mobile/tests/ lleva la directiva de entorno', () => {
  it.each(ARCHIVOS_DE_TESTS)('%s no contiene la directiva de entorno', (archivo) => {
    const contenido = readFileSync(join(APPS_MOBILE_ROOT, archivo), 'utf8')
    const hallazgo = buscarDirectiva(contenido)
    expect(
      hallazgo,
      hallazgo
        ? `${archivo}:${hallazgo.linea}: encontró la directiva pidiendo "${hallazgo.valor}" — el mismo bug que puso ` +
            `apps/web/tests/components/password-input.test.ts en rojo entero (18 tests, TypeError de import.meta.url) ` +
            'cuando un comentario que solo explicaba la directiva la reprodujo (R61, tarea 56-q); acá, además, no hay ' +
            'ninguna carpeta con DOM que la justifique'
        : undefined,
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Regla 2: apps/mobile/vitest.config.ts sigue con environment: 'node'. Si
// alguien lo pasa a otro valor, los 111 archivos que hoy corren en node
// cambiarían de entorno en silencio.
// ---------------------------------------------------------------------------
describe("Regla 2: apps/mobile/vitest.config.ts sigue con environment: 'node'", () => {
  it("el environment configurado es 'node', leído SIN las líneas de comentario del archivo", () => {
    const contenido = readFileSync(join(APPS_MOBILE_ROOT, 'vitest.config.ts'), 'utf8')
    expect(configTieneEnvironmentNode(contenido)).toBe(true)
  })

  it('un archivo con el environment en otro valor y un comentario que menciona "node" NO pasa la Regla 2', () => {
    expect(FIXTURE_CONFIG_FALSA_COMENTARIO).toMatch(ENVIRONMENT_NODE)
    expect(quitarComentarios(FIXTURE_CONFIG_FALSA_COMENTARIO)).not.toMatch(ENVIRONMENT_NODE)
  })

  it('un comentario de bloque que empieza a mitad de línea tampoco la salva (lo que el filtro por línea dejaba pasar)', () => {
    expect(FIXTURE_CONFIG_FALSA_BLOQUE).toMatch(ENVIRONMENT_NODE)
    expect(quitarComentarios(FIXTURE_CONFIG_FALSA_BLOQUE)).not.toMatch(ENVIRONMENT_NODE)
    expect(configTieneEnvironmentNode(FIXTURE_CONFIG_FALSA_BLOQUE)).toBe(false)
  })

  it('un archivo con el environment en node de verdad SÍ pasa la Regla 2 (el caso seguro, para que el chequeo no sea imposible)', () => {
    expect(quitarComentarios(FIXTURE_CONFIG_BUENA)).toMatch(ENVIRONMENT_NODE)
  })
})

// ---------------------------------------------------------------------------
// El literal armado en tiempo de ejecución es el que Vitest reconoce de
// verdad (no una invención del detector), y este archivo no lo escribe
// completo en ninguna parte de su propio texto fuente.
// ---------------------------------------------------------------------------
describe('El patrón armado en tiempo de ejecución no se escribe completo en este archivo', () => {
  it('este archivo, leído desde el disco con fs, NO contiene el literal contiguo (está armado en pedazos a propósito)', () => {
    const contenidoPropio = readFileSync(join(APPS_MOBILE_ROOT, RUTA_ESTE_ARCHIVO), 'utf8')
    expect(contenidoPropio).not.toContain(PALABRA_DIRECTIVA)
  })

  it('este archivo (este mismo archivo) sigue sin llevar la directiva de entorno', () => {
    const contenidoPropio = readFileSync(join(APPS_MOBILE_ROOT, RUTA_ESTE_ARCHIVO), 'utf8')
    expect(buscarDirectiva(contenidoPropio)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// El fixture que demuestra que el detector no es ciego: la MISMA función que
// se aplica al repo se prueba antes con contenido inventado en variables (no
// archivos), armado también en pedazos para no reproducir el literal acá.
// ---------------------------------------------------------------------------
describe('El detector funciona sobre fixtures en memoria antes de aplicarse al repo', () => {
  it('un comentario de BLOQUE (/* ... */) que la menciona: el detector la encuentra, igual que Vitest', () => {
    expect(buscarDirectiva(FIXTURE_COMENTARIO_BLOQUE_CON_DIRECTIVA)).toEqual({ valor: 'jsdom', linea: 1 })
  })

  it('en la primera línea: válido para una carpeta con DOM, e inválido fuera de ella', () => {
    expect(esValidoParaTestsDom(FIXTURE_PRIMERA_LINEA_CON_DIRECTIVA)).toBe(true)
    expect(esValidoFueraDeTestsDom(FIXTURE_PRIMERA_LINEA_CON_DIRECTIVA)).toBe(false)
  })

  it('en la línea 8 (no la primera): inválido para una carpeta con DOM, aunque la directiva esté presente', () => {
    expect(buscarDirectiva(FIXTURE_LINEA_OCHO_CON_DIRECTIVA)?.linea).toBe(8)
    expect(esValidoParaTestsDom(FIXTURE_LINEA_OCHO_CON_DIRECTIVA)).toBe(false)
  })

  it('un texto sin ninguna directiva: el detector no encuentra nada', () => {
    expect(buscarDirectiva(FIXTURE_SIN_DIRECTIVA)).toBeNull()
  })
})
