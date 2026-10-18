/**
 * 41-q (QA, cierre): ningún archivo del repo (sin `node_modules`) pone
 * `PUSH_ENVIO_REAL` en `"1"`. Esa variable prende el envío real de push
 * (`modoEnvioReal()` en `app/api/cron/notificaciones/route.ts`); solo Mauro
 * la prende en Vercel cuando corresponda — ningún archivo versionado puede
 * dejarla en "1" por su cuenta (un `vercel.json`, un workflow, o un script
 * que la fuerce).
 *
 * Detector de solo lectura: recorre el árbol del repo (sin `node_modules`,
 * `.git`, `.turbo`, `tests/`, build outputs) buscando una asignación REAL de
 * esa variable a "1" — nunca una MENCIÓN en prosa o en un comentario.
 *
 * Dos trampas reales que el detector tiene que esquivar (las dos existen
 * HOY en el repo, ninguna es una violación):
 *   1. `apps/web/tests/cron/notificaciones.test.ts` (y
 *      `tests/notificaciones/punta-a-punta.test.ts`) SÍ hacen
 *      `process.env.PUSH_ENVIO_REAL = '1'` a propósito, para ejercitar el
 *      camino de envío real con dobles. Legítimo: por eso el detector NO
 *      recorre `tests/` (mismo criterio que `listarArchivosDeCodigo` de
 *      `tests/asistencia-umbral.test.ts`, apps/mobile).
 *   2. `.github/workflows/notificaciones.yml` tiene, en el `name:` de un
 *      paso, el texto literal `PUSH_ENVIO_REAL=1` dentro de una frase
 *      ("Armar y mandar la tanda (dryRun salvo PUSH_ENVIO_REAL=1 en el
 *      servidor)") — es prosa, no una asignación: no hay un `env:` con esa
 *      clave en el archivo. El detector exige que la línea, una vez
 *      recortada, EMPIECE con la forma de asignación (la clave de YAML, el
 *      `export` de shell, o `process.env.PUSH_ENVIO_REAL =` de JS/TS): una
 *      mención en medio de una frase no matchea ninguna de esas formas.
 *
 * Verificado con las dos trampas de arriba como fixtures (ver el describe
 * de evasiones) y, antes de cerrar la tarea, con una evasión de verdad
 * creada a mano (un archivo suelto con una asignación real), confirmando
 * que el detector la agarra y borrándolo después.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

const DIRS_EXCLUIDOS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  '.expo',
  'dist',
  'build',
  'coverage',
  '.vercel',
  'tests', // ver la trampa 1 del comentario de arriba: los tests SÍ fijan esto a propósito.
])

const EXTENSIONES = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.yml', '.yaml', '.json'])

/** Nunca se lee un `.env*`: ni por la regla general del equipo, ni porque haga falta para este detector. */
function esArchivoDeEnv(nombre: string): boolean {
  return nombre.startsWith('.env')
}

function listarArchivosDelRepo(dir: string, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (DIRS_EXCLUIDOS.has(entrada.name)) continue
      listarArchivosDelRepo(`${dir}/${entrada.name}`, acumulado)
    } else {
      if (esArchivoDeEnv(entrada.name)) continue
      const punto = entrada.name.lastIndexOf('.')
      const ext = punto === -1 ? '' : entrada.name.slice(punto)
      if (EXTENSIONES.has(ext)) acumulado.push(`${dir}/${entrada.name}`)
    }
  }
  return acumulado
}

interface ViolacionEnvioReal {
  line: number
}

/**
 * `true` si la línea (recortada) es una asignación REAL de `PUSH_ENVIO_REAL`
 * a `"1"`, en cualquiera de estas formas:
 *   - YAML/shell: la línea EMPIEZA con la clave (`PUSH_ENVIO_REAL: "1"`,
 *     `PUSH_ENVIO_REAL=1`), con o sin `export` antes.
 *   - JSON: `"PUSH_ENVIO_REAL": "1"`.
 *   - JS/TS: `process.env.PUSH_ENVIO_REAL = '1'` (asignación real, nunca
 *     una comparación: `===`/`==` no matchea, porque después del primer
 *     "=" exige la comilla, no otro "=").
 * Una mención en medio de otro texto (una frase, un `name:` descriptivo)
 * nunca empieza la línea con esa forma, así que no matchea.
 */
function esAsignacionAUno(lineaCruda: string): boolean {
  const t = lineaCruda.trim().replace(/^-\s*/, '') // "- PUSH_ENVIO_REAL: '1'" (lista de YAML) también cuenta.
  if (/^(?:export\s+)?PUSH_ENVIO_REAL\s*[:=]\s*(['"]?)1\1\s*,?\s*$/.test(t)) return true
  if (/^["']PUSH_ENVIO_REAL["']\s*:\s*["']1["']\s*,?\s*$/.test(t)) return true
  if (/^process\.env\.PUSH_ENVIO_REAL\s*=\s*(['"])1\1/.test(t)) return true
  return false
}

function violacionesPushEnvioReal(contenido: string): ViolacionEnvioReal[] {
  const violaciones: ViolacionEnvioReal[] = []
  const lineas = contenido.split('\n')
  lineas.forEach((linea, i) => {
    if (esAsignacionAUno(linea)) violaciones.push({ line: i + 1 })
  })
  return violaciones
}

describe('esAsignacionAUno / violacionesPushEnvioReal (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta una clave YAML activa (env: PUSH_ENVIO_REAL: "1")', () => {
    expect(esAsignacionAUno('  PUSH_ENVIO_REAL: "1"')).toBe(true)
  })

  it('detecta una clave YAML con comillas simples', () => {
    expect(esAsignacionAUno("PUSH_ENVIO_REAL: '1'")).toBe(true)
  })

  it('detecta una entrada de lista de YAML ("- PUSH_ENVIO_REAL: \'1\'")', () => {
    expect(esAsignacionAUno("  - PUSH_ENVIO_REAL: '1'")).toBe(true)
  })

  it('detecta una asignación de shell (export PUSH_ENVIO_REAL=1)', () => {
    expect(esAsignacionAUno('export PUSH_ENVIO_REAL=1')).toBe(true)
  })

  it('detecta una asignación de shell sin export', () => {
    expect(esAsignacionAUno('PUSH_ENVIO_REAL=1')).toBe(true)
  })

  it('detecta una clave JSON ("PUSH_ENVIO_REAL": "1")', () => {
    expect(esAsignacionAUno('"PUSH_ENVIO_REAL": "1",')).toBe(true)
  })

  it('detecta una asignación real de JS/TS (process.env.PUSH_ENVIO_REAL = \'1\')', () => {
    expect(esAsignacionAUno("process.env.PUSH_ENVIO_REAL = '1'")).toBe(true)
  })

  it('NO marca la MENCIÓN en prosa del workflow real ("... PUSH_ENVIO_REAL=1 en el servidor)")', () => {
    expect(esAsignacionAUno('      - name: Armar y mandar la tanda (dryRun salvo PUSH_ENVIO_REAL=1 en el servidor)')).toBe(
      false,
    )
  })

  it('NO marca una comparación de JS/TS (return process.env.PUSH_ENVIO_REAL === \'1\')', () => {
    expect(esAsignacionAUno("  return process.env.PUSH_ENVIO_REAL === '1'")).toBe(false)
  })

  it('NO marca un comentario que menciona la variable', () => {
    expect(esAsignacionAUno('# PUSH_ENVIO_REAL=1 (todavía no, lo prende Mauro)')).toBe(false)
  })

  it('NO marca PUSH_ENVIO_REAL puesta en "0" ni en otro valor', () => {
    expect(esAsignacionAUno('PUSH_ENVIO_REAL=0')).toBe(false)
    expect(esAsignacionAUno('PUSH_ENVIO_REAL: "true"')).toBe(false)
  })

  it('NO marca una variable de nombre parecido, pero distinta', () => {
    expect(esAsignacionAUno('OTRA_PUSH_ENVIO_REAL=1')).toBe(false)
    expect(esAsignacionAUno('PUSH_ENVIO_REAL_2=1')).toBe(false)
  })

  it('violacionesPushEnvioReal reporta la línea exacta', () => {
    const contenido = 'a=1\nPUSH_ENVIO_REAL=1\nb=2\n'
    expect(violacionesPushEnvioReal(contenido)).toEqual([{ line: 2 }])
  })

  it('un archivo sin ninguna asignación: sin violaciones', () => {
    expect(violacionesPushEnvioReal('export function foo() {}\n')).toEqual([])
  })
})

describe('detector estático: ningún archivo del repo (sin node_modules/tests) pone PUSH_ENVIO_REAL en "1"', () => {
  const archivos = listarArchivosDelRepo(REPO_ROOT)

  it('recorrió una cantidad razonable de archivos (si esto da un número chico, el walker no está bajando a los subdirectorios)', () => {
    expect(archivos.length).toBeGreaterThan(50)
  })

  it('al menos un archivo real MENCIONA PUSH_ENVIO_REAL (si esto da 0, el detector de abajo pasaría por no mirar nada relevante)', () => {
    const algunaMencion = archivos.some((archivo) => readFileSync(archivo, 'utf8').includes('PUSH_ENVIO_REAL'))
    expect(algunaMencion).toBe(true)
  })

  it('ningún archivo del repo pone PUSH_ENVIO_REAL en "1"', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      if (!contenido.includes('PUSH_ENVIO_REAL')) continue // atajo: evita tokenizar línea por línea archivos que ni mencionan la variable.
      for (const v of violacionesPushEnvioReal(contenido)) {
        violaciones.push(`${archivo}:${v.line}`)
      }
    }
    if (violaciones.length > 0) {
      throw new Error(`PUSH_ENVIO_REAL puesta en "1" fuera de tests/:\n${violaciones.join('\n')}`)
    }
    expect(violaciones).toEqual([])
  })
})
