/**
 * QPS-261 (Ronda 56, tarea 56-e): lista los tests AJENOS (de cualquiera de
 * las tres carpetas de tests del repo) que leen o importan los archivos que
 * una ronda va a tocar, para que el plan se los asigne a alguien desde el
 * principio y no queden rotos sin dueño (como pasó en la R47, la R48, la
 * R49 y la R50).
 *
 * Uso (desde apps/web):
 *   npx tsx scripts/tests-que-leen.ts <archivo> [<archivo>...]
 *   npx tsx scripts/tests-que-leen.ts --diff <rama>
 *
 * Los <archivo> son rutas relativas a la raíz del repo, con '/' (las mismas
 * que imprime `git diff --name-only`, que es justo lo que arma `--diff`).
 *
 * Solo lee archivos (este script, no la librería pura que hace el análisis).
 * No escribe nada, no usa red.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testsQueLeen, type Como, type Hallazgo } from '../lib/rondas/tests-que-leen'

const CARPETAS_DE_TESTS = ['apps/web/tests', 'apps/mobile/tests', 'supabase/tests']

function encontrarRaiz(desde: string): string {
  let dir = desde
  while (true) {
    if (existsSync(join(dir, 'apps')) && existsSync(join(dir, 'supabase'))) return dir
    const padre = dirname(dir)
    if (padre === dir) {
      throw new Error('No se encontró la raíz del repo (subiendo desde este script no aparece apps/ + supabase/).')
    }
    dir = padre
  }
}

/** Recorre una carpeta y devuelve las rutas de todos los archivos (sin entrar en node_modules). */
function listarArchivos(carpetaAbsoluta: string): string[] {
  if (!existsSync(carpetaAbsoluta)) return []
  const resultado: string[] = []
  const pila = [carpetaAbsoluta]
  while (pila.length > 0) {
    const actual = pila.pop()!
    for (const nombre of readdirSync(actual)) {
      if (nombre === 'node_modules') continue
      const ruta = join(actual, nombre)
      const info = statSync(ruta)
      if (info.isDirectory()) {
        pila.push(ruta)
      } else if (info.isFile()) {
        resultado.push(ruta)
      }
    }
  }
  return resultado
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/')
}

function cargarTests(raiz: string): Array<{ ruta: string; texto: string }> {
  const tests: Array<{ ruta: string; texto: string }> = []
  for (const carpeta of CARPETAS_DE_TESTS) {
    const absoluta = join(raiz, ...carpeta.split('/'))
    for (const archivoAbsoluto of listarArchivos(absoluta)) {
      const relativaARaiz = aPosix(archivoAbsoluto.slice(raiz.length + 1))
      const texto = readFileSync(archivoAbsoluto, 'utf8')
      tests.push({ ruta: relativaARaiz, texto })
    }
  }
  return tests
}

function objetivosDesdeDiff(raiz: string, rama: string): string[] {
  const salida = execSync(`git diff --name-only ${rama}...HEAD`, { cwd: raiz, encoding: 'utf8' })
  return salida
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

function imprimirUso() {
  console.log('Uso (desde apps/web):')
  console.log('  npx tsx scripts/tests-que-leen.ts <archivo> [<archivo>...]')
  console.log('  npx tsx scripts/tests-que-leen.ts --diff <rama>')
  console.log('')
  console.log('Los <archivo> son rutas relativas a la raíz del repo, con "/" (p. ej. apps/web/components/event-modal.tsx).')
}

function agruparPorComo(hallazgos: Hallazgo[]): Map<string, Map<Como, string[]>> {
  const porObjetivo = new Map<string, Map<Como, string[]>>()
  for (const h of hallazgos) {
    if (!porObjetivo.has(h.objetivo)) porObjetivo.set(h.objetivo, new Map())
    const porComo = porObjetivo.get(h.objetivo)!
    if (!porComo.has(h.como)) porComo.set(h.como, [])
    porComo.get(h.como)!.push(h.test)
  }
  return porObjetivo
}

function main() {
  const argv = process.argv.slice(2)

  if (argv.length === 0) {
    imprimirUso()
    process.exit(1)
  }

  const raiz = encontrarRaiz(dirname(fileURLToPath(import.meta.url)))

  let objetivos: string[]
  if (argv[0] === '--diff') {
    const rama = argv[1]
    if (!rama) {
      console.error('Falta la rama: npx tsx scripts/tests-que-leen.ts --diff <rama>')
      imprimirUso()
      process.exit(1)
    }
    objetivos = objetivosDesdeDiff(raiz, rama)
  } else {
    objetivos = argv
  }

  if (objetivos.length === 0) {
    console.log('No hay archivos para analizar (el diff vino vacío).')
    return
  }

  const tests = cargarTests(raiz)
  const hallazgos = testsQueLeen(objetivos, tests)
  const porObjetivo = agruparPorComo(hallazgos)

  const ordenComo: Como[] = ['import', 'ruta', 'posible']
  const etiquetas: Record<Como, string> = {
    import: 'import',
    ruta: 'ruta',
    posible: 'posible (solo el nombre del archivo, revisar a mano)',
  }

  for (const objetivo of objetivos) {
    console.log(`\n== ${objetivo} ==`)
    const porComo = porObjetivo.get(objetivo)
    if (!porComo) {
      console.log('  (ningún test lo nombra)')
      continue
    }
    for (const como of ordenComo) {
      const testsDeEsteComo = porComo.get(como)
      if (!testsDeEsteComo || testsDeEsteComo.length === 0) continue
      console.log(`  ${etiquetas[como]}:`)
      for (const test of testsDeEsteComo) console.log(`    - ${test}`)
    }
  }

  const seguros = new Set<string>()
  for (const h of hallazgos) {
    if (h.como === 'import' || h.como === 'ruta') seguros.add(h.test)
  }

  console.log('\n== Tests "seguros" (import + ruta), para pegar en el plan.md ==')
  if (seguros.size === 0) {
    console.log('  (ninguno)')
  } else {
    for (const test of [...seguros].sort()) console.log(`  - ${test}`)
  }
}

main()
