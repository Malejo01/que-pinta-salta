// QPS-155: ningún formulario de auth puede loguear el objeto de error
// crudo de Supabase (puede traer datos de la cuenta). Detector estático:
// lee el código fuente con `fs` (si la ruta no existe, `readFileSync` tira
// y el test falla ruidosamente, nunca un "no hay nada que revisar") y
// busca, dentro de cada bloque `catch` (de un try/catch o de un
// `.catch(...)` encadenado a una promesa), llamadas a `console.*` que pasen
// la variable del error (o un alias directo de ella) sin pasar por una
// propiedad segura (`.message`, `.code`, `typeof`, `instanceof`).
//
// El detector resiste las evasiones típicas: un alias (`const e = err`),
// una cadena de variables intermedias, la llamada partida en varias
// líneas, el error en cualquier posición de los argumentos (no solo el
// segundo), un `.catch(err => ...)` encadenado (con o sin paréntesis en el
// parámetro, con cuerpo de bloque o de una sola expresión), y un `catch`
// con destructuring en el parámetro (`catch ({ message, ...rest })`): ahí
// no se pierde el bloque en silencio, y loguear la variable de `...rest` o
// un objeto rearmado a partir de ella (`{ ...rest }`) sigue siendo
// violación, mientras que loguear una propiedad desestructurada segura
// (`message`) sin `rest` no lo es.
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
  /** Variables "semilla" que valen como el objeto de error crudo dentro de este bloque. Puede estar vacío (p. ej. `catch ({ message })` sin `...rest`): ahí no hay nada crudo que rastrear. */
  seeds: Set<string>
  cuerpo: string
}

/** Nombre de la variable de rest (`...rest`) dentro del contenido de un patrón de destructuring de objeto, si lo hay. */
function nombreRestDeDestructuring(contenidoLlaves: string): string | undefined {
  const m = /\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(contenidoLlaves)
  return m ? m[1] : undefined
}

/** `catch (err) { ... }` / `catch (err: unknown) { ... }`: identificador simple. */
function bloqueDesdeCatchIdentificador(fuente: string): BloqueCatch[] {
  const resultado: BloqueCatch[] = []
  const re = /catch\s*\(\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fuente))) {
    const catchVar = m[1]
    const desde = m.index + m[0].length
    const cuerpo = extraerBalanceado(fuente, desde, '{', '}')
    resultado.push({ seeds: new Set([catchVar]), cuerpo })
  }
  return resultado
}

/**
 * `catch ({ message, ...rest }) { ... }`: destructuring en el parámetro.
 * No hay una variable que sea "todo el error", así que no hay nada crudo
 * que rastrear salvo la variable de rest (si existe): ella sola puede
 * traer cualquier campo del objeto original. El bloque igual se analiza
 * (no se pierde en silencio), y si no hay `...rest`, el conjunto de
 * semillas queda vacío a propósito (una propiedad desestructurada como
 * `message` no es cruda).
 */
function bloqueDesdeCatchDestructuring(fuente: string): BloqueCatch[] {
  const resultado: BloqueCatch[] = []
  const re = /catch\s*\(\s*\{([^{}]*)\}\s*(?::[^)]*)?\)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fuente))) {
    const restVar = nombreRestDeDestructuring(m[1])
    const desde = m.index + m[0].length
    const cuerpo = extraerBalanceado(fuente, desde, '{', '}')
    const seeds = new Set<string>()
    if (restVar) seeds.add(restVar)
    resultado.push({ seeds, cuerpo })
  }
  return resultado
}

/** De la parte derecha de una arrow function (ya sin el parámetro ni el `=>`), el cuerpo "interior" tanto si es un bloque (`{ ... }`, se le quitan las llaves) como si es una sola expresión (se usa tal cual). */
function cuerpoDesdeBodyDeArrow(body: string): string {
  const recortado = body.trim()
  if (recortado.startsWith('{') && recortado.endsWith('}')) {
    return recortado.slice(1, -1)
  }
  return recortado
}

/** Dado el contenido de los paréntesis de un `.catch(...)` (ya balanceado), separa el parámetro (identificador simple o destructuring) del cuerpo de la arrow function. `null` si no es una arrow function con un parámetro reconocible (p. ej. `.catch(() => {})` sin variable de error, o `.catch(nombreDeFuncion)`). */
function extraerBloqueDeArrowCatch(contenido: string): BloqueCatch | null {
  // Destructuring, siempre con paréntesis alrededor: ({ message, ...rest }) => ...
  const mDestructuring = /^\s*\(\s*\{([^{}]*)\}\s*(?::[^)]*)?\)\s*=>\s*([\s\S]*)$/.exec(contenido)
  if (mDestructuring) {
    const restVar = nombreRestDeDestructuring(mDestructuring[1])
    const seeds = new Set<string>()
    if (restVar) seeds.add(restVar)
    return { seeds, cuerpo: cuerpoDesdeBodyDeArrow(mDestructuring[2]) }
  }
  // Identificador simple con paréntesis, con o sin anotación de tipo: (err) => ... / (err: unknown) => ...
  const mConParen = /^\s*\(\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)\s*=>\s*([\s\S]*)$/.exec(contenido)
  if (mConParen) {
    return { seeds: new Set([mConParen[1]]), cuerpo: cuerpoDesdeBodyDeArrow(mConParen[2]) }
  }
  // Identificador simple sin paréntesis: err => ...
  const mSinParen = /^\s*([A-Za-z_$][\w$]*)\s*=>\s*([\s\S]*)$/.exec(contenido)
  if (mSinParen) {
    return { seeds: new Set([mSinParen[1]]), cuerpo: cuerpoDesdeBodyDeArrow(mSinParen[2]) }
  }
  return null
}

/** `.catch(err => { ... })` / `.catch((err) => ...)` encadenado a una promesa: con y sin llaves en el cuerpo, con y sin paréntesis en el parámetro, incluido el destructuring. */
function bloqueDesdeCatchPromise(fuente: string): BloqueCatch[] {
  const resultado: BloqueCatch[] = []
  const re = /\.catch\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fuente))) {
    const desde = m.index + m[0].length
    const contenido = extraerBalanceado(fuente, desde, '(', ')')
    const bloque = extraerBloqueDeArrowCatch(contenido)
    if (bloque) resultado.push(bloque)
  }
  return resultado
}

/**
 * Variables que son "crudas" dentro de este bloque: las semillas (el
 * identificador del catch, o la variable de `...rest` en un destructuring)
 * más cualquier variable que sea copia directa de una ya conocida como
 * cruda (resuelve cadenas: `a = err; b = a`), que reconstruya un objeto a
 * partir de una de ellas con spread (`const original = { message, ...rest }`,
 * el "objeto rearmado"), o que destructure una variable ya cruda **en el
 * cuerpo** (no en el parámetro del catch): `const { message, ...rest } = err`
 * marca `rest` como crudo (el objeto de error menos unas pocas claves), pero
 * nunca una propiedad desestructurada suelta como `message` (loguearla es
 * justamente lo que el detector permite). Si `semillas` viene vacío (p. ej.
 * un destructuring sin `...rest`), no hay nada crudo que rastrear y el
 * resultado queda vacío.
 */
function construirAliasesCrudos(cuerpo: string, semillas: Set<string>): Set<string> {
  const aliases = new Set<string>(semillas)
  let cambiado = true
  while (cambiado) {
    cambiado = false
    const reDirecto = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g
    let m: RegExpExecArray | null
    while ((m = reDirecto.exec(cuerpo))) {
      const [, lhs, rhs] = m
      if (aliases.has(rhs) && !aliases.has(lhs)) {
        aliases.add(lhs)
        cambiado = true
      }
    }
    const reSpread = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{([^{}]*)\}/g
    while ((m = reSpread.exec(cuerpo))) {
      const [, lhs, contenidoObjeto] = m
      const spreadDe = nombreRestDeDestructuring(contenidoObjeto)
      if (spreadDe && aliases.has(spreadDe) && !aliases.has(lhs)) {
        aliases.add(lhs)
        cambiado = true
      }
    }
    // `const { message, ...rest } = err` (o `= <alias ya crudo>`): solo el
    // `...rest` es crudo, nunca una propiedad desestructurada suelta.
    const reDestructuringAsignacion = /\b(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*([A-Za-z_$][\w$]*)\b/g
    while ((m = reDestructuringAsignacion.exec(cuerpo))) {
      const [, contenidoLlaves, rhs] = m
      const restVar = nombreRestDeDestructuring(contenidoLlaves)
      if (restVar && aliases.has(rhs) && !aliases.has(restVar)) {
        aliases.add(restVar)
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

/** Detector principal: lista de violaciones ("" si no hay ninguna) sobre un código fuente. Analiza tanto `try { } catch (...) { }` (con identificador simple o destructuring) como `.catch(...)` encadenado a una promesa. */
function encontrarLogsDeErrorCrudo(fuente: string): string[] {
  const violaciones: string[] = []
  const bloques = [
    ...bloqueDesdeCatchIdentificador(fuente),
    ...bloqueDesdeCatchDestructuring(fuente),
    ...bloqueDesdeCatchPromise(fuente),
  ]
  for (const { seeds, cuerpo } of bloques) {
    const aliases = construirAliasesCrudos(cuerpo, seeds)
    if (aliases.size === 0) continue
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

  // -------------------------------------------------------------------------
  // Evasión nueva 1: `.catch(...)` encadenado a una promesa (QPS-155, hueco
  // encontrado por revisor y seguridad: la regex original exigía
  // `catch (ident) { ... }` y no reconocía nada de esto).
  // -------------------------------------------------------------------------

  it('evasión - .catch(err => console.error(err)) sin llaves (cuerpo de una sola expresión) -> violación', () => {
    const src = `fetch('/x').catch(err => console.error(err))`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - .catch((err) => { console.error(err) }) con paréntesis y llaves -> violación', () => {
    const src = `fetch('/x').catch((err) => { console.error(err) })`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - .catch(err => { console.error(err) }) sin paréntesis, con llaves -> violación', () => {
    const src = `fetch('/x').catch(err => { console.error(err) })`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - .catch((err) => console.error("x", err)) sin llaves, error no en primera posición -> violación', () => {
    const src = `fetch('/x').catch((err) => console.error('x', err))`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - .catch partido en varias líneas -> violación igual', () => {
    const src = `fetch('/x').catch(\n  (err) => {\n    console.error(err)\n  }\n)`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - alias dentro del cuerpo de un .catch(err => { ... }) -> violación', () => {
    const src = `fetch('/x').catch(err => { const e = err; console.error(e) })`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('seguro: .catch(err => console.error(err.message)) -> sin violación', () => {
    const src = `fetch('/x').catch(err => console.error(err.message))`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })

  it('seguro: .catch(() => {}) sin variable de error (como view-beacon.tsx) -> sin violación', () => {
    const src = `fetch('/x').catch(() => {})`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Evasión nueva 2: destructuring en el parámetro del catch (QPS-155,
  // mismo hueco: la regex original exigía un identificador simple y el
  // bloque entero quedaba sin analizar).
  // -------------------------------------------------------------------------

  it('evasión - catch ({ message, ...rest }) { console.error(rest) }: loguear el rest -> violación', () => {
    const src = `try {} catch ({ message, ...rest }) { console.error(rest) }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('evasión - catch ({ message, ...rest }) { ... }: loguear el objeto rearmado a partir del rest -> violación', () => {
    const src = `try {} catch ({ message, ...rest }) {
      const original = { message, ...rest }
      console.error('x', original)
    }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('seguro: catch ({ message }) { console.error(message) } sin rest -> sin violación', () => {
    const src = `try {} catch ({ message }) { console.error(message) }`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })

  it('seguro: catch ({ message, ...rest }) { console.error(message) }: loguear solo la propiedad segura, no el rest -> sin violación', () => {
    const src = `try {} catch ({ message, ...rest }) { console.error(message) }`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Evasión nueva 3: destructuring por asignación **dentro del cuerpo** del
  // catch (no en el parámetro): `catch (err) { const { message, ...rest } =
  // err; console.error(rest) }`. `construirAliasesCrudos` solo seguía alias
  // por copia directa (`const b = a`) y por objeto literal con spread
  // (`const b = { ...a }`); ninguno de los dos matchea un `{ ... }` del lado
  // izquierdo del `=`.
  // -------------------------------------------------------------------------

  it('evasión - catch (err) { const { message, ...rest } = err; console.error(rest) }: loguear el rest -> violación', () => {
    const src = `try {} catch (err) { const { message, ...rest } = err; console.error(rest) }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
  })

  it('seguro: catch (err) { const { message } = err; console.error(message) } sin rest -> sin violación', () => {
    const src = `try {} catch (err) { const { message } = err; console.error(message) }`
    expect(encontrarLogsDeErrorCrudo(src)).toEqual([])
  })

  it('evasión - variable intermedia: catch (err) { const e = err; const { ...r } = e; console.error(r) } -> violación', () => {
    const src = `try {} catch (err) { const e = err; const { ...r } = e; console.error(r) }`
    expect(encontrarLogsDeErrorCrudo(src).length).toBeGreaterThan(0)
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
