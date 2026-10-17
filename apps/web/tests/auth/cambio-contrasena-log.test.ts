// QPS-155: ningún formulario de auth puede loguear el objeto de error
// crudo de Supabase (puede traer datos de la cuenta). Detector estático:
// lee el código fuente con `fs` (si la ruta no existe, `readFileSync` tira
// y el test falla ruidosamente, nunca un "no hay nada que revisar") y
// busca, dentro de cada bloque `catch`, llamadas a `console.*` que pasen
// la variable del error (o un alias directo de ella) sin pasar por una
// propiedad segura (`.message`, `.code`, `typeof`, `instanceof`).
//
// El detector resiste las evasiones típicas: un alias (`const e = err`),
// una cadena de variables intermedias, la llamada partida en varias
// líneas, y el error en cualquier posición de los argumentos (no solo el
// segundo).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// apps/web/tests/auth -> apps/web/tests -> apps/web
const ROOT = join(__dirname, '..', '..')
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

/** Lista recursiva de archivos .tsx de un directorio, rutas relativas a ROOT (apps/web). */
function listarTsxRecursivo(dirRelPath: string): string[] {
  const dirAbs = join(ROOT, dirRelPath)
  const entradas = readdirSync(dirAbs, { withFileTypes: true })
  const resultado: string[] = []
  for (const entrada of entradas) {
    const relPath = `${dirRelPath}/${entrada.name}`
    if (entrada.isDirectory()) {
      resultado.push(...listarTsxRecursivo(relPath))
    } else if (entrada.isFile() && entrada.name.endsWith('.tsx')) {
      resultado.push(relPath)
    }
  }
  return resultado
}

// ---------------------------------------------------------------------------
// Parsing mínimo: balanceo de llaves/paréntesis respetando strings simples,
// para extraer el cuerpo de cada `catch` y los argumentos de cada llamada a
// `console.*` aunque estén partidos en varias líneas.
// ---------------------------------------------------------------------------

/** Desde `desde` (ya dentro del delimitador de apertura), devuelve el contenido hasta el cierre balanceado. */
function extraerBalanceado(texto: string, desde: number, abre: string, cierra: string): string {
  let profundidad = 1
  let i = desde
  let enString: string | null = null
  for (; i < texto.length; i++) {
    const c = texto[i]
    if (enString) {
      if (c === '\\') {
        i++
        continue
      }
      if (c === enString) enString = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      enString = c
      continue
    }
    if (c === abre) profundidad++
    else if (c === cierra) {
      profundidad--
      if (profundidad === 0) break
    }
  }
  return texto.slice(desde, i)
}

/** Divide el contenido de una lista de argumentos por comas de nivel 0 (respeta paréntesis/corchetes/llaves y strings). */
function dividirArgumentosTopLevel(contenido: string): string[] {
  const args: string[] = []
  let profundidad = 0
  let enString: string | null = null
  let actual = ''
  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i]
    if (enString) {
      actual += c
      if (c === '\\') {
        i++
        actual += contenido[i] ?? ''
        continue
      }
      if (c === enString) enString = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      enString = c
      actual += c
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      profundidad++
      actual += c
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      profundidad--
      actual += c
      continue
    }
    if (c === ',' && profundidad === 0) {
      args.push(actual)
      actual = ''
      continue
    }
    actual += c
  }
  if (actual.trim().length > 0 || args.length > 0) args.push(actual)
  return args
}

interface BloqueCatch {
  catchVar: string
  cuerpo: string
}

function encontrarBloquesCatch(fuente: string): BloqueCatch[] {
  const resultado: BloqueCatch[] = []
  const re = /catch\s*\(\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fuente))) {
    const catchVar = m[1]
    const desde = m.index + m[0].length
    const cuerpo = extraerBalanceado(fuente, desde, '{', '}')
    resultado.push({ catchVar, cuerpo })
  }
  return resultado
}

/** Variables que son copia directa (sin transformación) de alguna variable ya conocida como "cruda". Resuelve cadenas (a = err; b = a). */
function construirAliasesCrudos(cuerpo: string, catchVar: string): Set<string> {
  const aliases = new Set<string>([catchVar])
  let cambiado = true
  while (cambiado) {
    cambiado = false
    const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g
    let m: RegExpExecArray | null
    while ((m = re.exec(cuerpo))) {
      const [, lhs, rhs] = m
      if (aliases.has(rhs) && !aliases.has(lhs)) {
        aliases.add(lhs)
        cambiado = true
      }
    }
  }
  return aliases
}

/** Llamadas a console.error/warn/log dentro de un bloque: devuelve la lista de argumentos (ya separados) de cada llamada. */
function encontrarLlamadasConsole(cuerpo: string): string[][] {
  const resultado: string[][] = []
  const re = /console\.(?:error|warn|log)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cuerpo))) {
    const desde = m.index + m[0].length
    const contenido = extraerBalanceado(cuerpo, desde, '(', ')')
    resultado.push(dividirArgumentosTopLevel(contenido))
  }
  return resultado
}

/** `true` si el argumento pasa la variable `alias` "cruda": como identificador suelto, no accedida vía propiedad (`.message`, `?.code`, etc.), y no dentro de `typeof x` / `x instanceof Y` (chequeos de tipo, no logueo del objeto). */
function contieneAliasCrudo(arg: string, alias: string): boolean {
  const re = new RegExp(`\\b${alias}\\b(?!\\s*\\??\\.)`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(arg))) {
    const antes = arg.slice(0, m.index)
    if (/typeof\s*$/.test(antes)) continue
    const despues = arg.slice(m.index + alias.length)
    if (/^\s+instanceof\b/.test(despues)) continue
    return true
  }
  return false
}

/** Detector principal: lista de violaciones ("" si no hay ninguna) sobre un código fuente. */
function encontrarLogsDeErrorCrudo(fuente: string): string[] {
  const violaciones: string[] = []
  for (const { catchVar, cuerpo } of encontrarBloquesCatch(fuente)) {
    const aliases = construirAliasesCrudos(cuerpo, catchVar)
    for (const args of encontrarLlamadasConsole(cuerpo)) {
      for (const arg of args) {
        for (const alias of aliases) {
          if (contieneAliasCrudo(arg, alias)) {
            violaciones.push(`console.* pasa "${alias}" crudo en el argumento: ${arg.trim()}`)
          }
        }
      }
    }
  }
  return violaciones
}

// ---------------------------------------------------------------------------
// 1. El detector en sí: casos sintéticos, incluidas las evasiones típicas.
// ---------------------------------------------------------------------------

describe('encontrarLogsDeErrorCrudo: detecta el error crudo y resiste evasiones', () => {
  it('caso directo: console.error(msg, err) crudo -> violación', () => {
    const src = `try {} catch (err) { console.error('x', err) }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('seguro: err.message -> sin violación', () => {
    const src = `try {} catch (err) { console.error('x', err.message) }`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })

  it('seguro: err?.message (optional chaining) -> sin violación', () => {
    const src = `try {} catch (err) { console.error('x', err?.message) }`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })

  it('seguro: typeof err / err instanceof Error -> sin violación', () => {
    const src = `try {} catch (err) { console.error('x', typeof err, err instanceof Error ? err.message : 'generico') }`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })

  it('evasión - alias directo: const e = err; console.error(e) -> sigue siendo violación', () => {
    const src = `try {} catch (err) { const e = err; console.error('x', e) }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - cadena de variables intermedias: a = err; b = a; console.error(b) -> violación', () => {
    const src = `try {} catch (err) { const a = err; const b = a; console.error(b) }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - llamada partida en varias líneas -> violación igual', () => {
    const src = `try {} catch (err) {\n  console.error(\n    'x',\n    err\n  )\n}`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - el error en otra posición (primer argumento, no el segundo) -> violación', () => {
    const src = `try {} catch (err) { console.error(err, 'x') }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - rama "else" cruda de un ternario -> violación', () => {
    const src = `try {} catch (err) { console.error('x', err instanceof Error ? err.message : err) }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('seguro: extraer un código antes de loguear (patrón de este fix) -> sin violación', () => {
    const src = `try {} catch (err) {
      const codigo = typeof err?.code === "string" ? err.code : err instanceof Error ? err.name : "error_desconocido"
      console.error('x', codigo)
    }`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. Aplicado a los formularios de auth reales del repo.
// ---------------------------------------------------------------------------

const ARCHIVOS_AUTH = [
  'components/change-password-form.tsx',
  'components/auth-modal.tsx',
  ...listarTsxRecursivo('app/auth'),
]

describe('QPS-155: ningún formulario de auth loguea el objeto de error crudo', () => {
  it('la lista de archivos a revisar no está vacía (si esto da menos de lo esperado, el detector no está revisando nada)', () => {
    expect(ARCHIVOS_AUTH.length).toBeGreaterThanOrEqual(8)
  })

  for (const relPath of ARCHIVOS_AUTH) {
    it(`${relPath}: ningún console.error/warn/log pasa el error crudo (ni un alias directo) dentro de un catch`, () => {
      const violaciones = encontrarLogsDeErrorCrudo(read(relPath))
      expect(violaciones).toEqual([])
    })
  }
})
