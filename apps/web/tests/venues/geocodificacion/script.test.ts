/**
 * Detector sobre el TEXTO de `scripts/geocodificar-lugares.ts` (R53, tarea
 * 53-b): no ejecuta el script (lee datos, va contra producción con la
 * service role y le pega a Nominatim), solo lee el archivo como texto y
 * busca patrones, igual que `tests/lib/use-server.test.ts` con
 * `quitarComentarios` (una mención en un comentario no debe hacer pasar ni
 * fallar un chequeo que busca código real).
 *
 * Limitaciones de este detector, documentadas en vez de dejar un chequeo que
 * no agarra nada:
 *
 *   - "el `update` lleva `.or(` con `geocode_source`": el script pasa el
 *     filtro como `filtro.or` (el valor que devuelve `filtroDeActualizacion`,
 *     de `lib/venues/geocodificacion/plan.ts`, ya commiteado en 53-a), no
 *     como un string literal con "geocode_source" adentro del propio
 *     `.or(...)`. Por eso ese término se busca en todo el archivo (no
 *     pegado al `.or(`): alcanza con que el script documente, cerca del uso
 *     del filtro, que cubre `geocode_source` — lo cual no prueba que el
 *     filtro usado sea el correcto (eso ya lo prueba `plan.test.ts` sobre
 *     `filtroDeActualizacion`), solo que no se perdió la referencia.
 *   - "ninguna forma de `process.env` adentro de un `console.*`": se extrae
 *     el argumento completo de cada llamada `console.algo(...)` contando
 *     paréntesis balanceados (`llamadasConsole`). Esto puede confundirse si
 *     algún argumento tuviera paréntesis desbalanceados dentro de un string
 *     (no es el caso de este script).
 *   - "`paraRevisarPrevios` alimenta lo que se escribe al reporte (no solo
 *     un `console.log`)": se busca la asignación `const <algo> =
 *     paraRevisarPrevios.map(...)` y se verifica que ese `<algo>` aparezca
 *     fuera de cualquier llamada a `console.*`. No prueba que ese valor
 *     efectivamente termine DENTRO del objeto que se serializa (eso lo
 *     cubre el test de `JSON.stringify(` por separado, buscando ese mismo
 *     nombre dentro de su argumento) ni que el CSV lo incluya de verdad
 *     (correr `aCsv` sobre datos reales sería ejecutar lógica, no leer
 *     texto): solo que la variable no se use únicamente para imprimir un
 *     número y se pierda.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RUTA_SCRIPT = fileURLToPath(new URL('../../../scripts/geocodificar-lugares.ts', import.meta.url))
const CONTENIDO_CRUDO = readFileSync(RUTA_SCRIPT, 'utf8')

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto (igual que use-server.test.ts). */
function quitarComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

const CONTENIDO = quitarComentarios(CONTENIDO_CRUDO)

/**
 * Extrae el argumento completo de cada llamada `console.algo(...)`,
 * contando paréntesis balanceados (así una `)` que cierra una sub-expresión
 * adentro del argumento no corta la extracción antes de tiempo).
 */
function llamadasConsole(texto: string): string[] {
  const llamadas: string[] = []
  const regex = /console\.\w+\(/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(texto))) {
    const inicio = m.index + m[0].length
    let i = inicio
    let profundidad = 1
    while (i < texto.length && profundidad > 0) {
      if (texto[i] === '(') profundidad++
      else if (texto[i] === ')') profundidad--
      i++
    }
    llamadas.push(texto.slice(inicio, i - 1))
  }
  return llamadas
}

/**
 * Extrae el argumento completo de la primera llamada que matchea
 * `prefijoRegex` (p. ej. `/JSON\.stringify\(/`), contando paréntesis
 * balanceados igual que `llamadasConsole`. `null` si no se encuentra.
 */
function argumentoDeLlamada(texto: string, prefijoRegex: RegExp): string | null {
  const m = prefijoRegex.exec(texto)
  if (!m) return null
  const inicio = m.index + m[0].length
  let i = inicio
  let profundidad = 1
  while (i < texto.length && profundidad > 0) {
    if (texto[i] === '(') profundidad++
    else if (texto[i] === ')') profundidad--
    i++
  }
  return texto.slice(inicio, i - 1)
}

/**
 * Extrae el cuerpo de `const <nombreVariable> = { ... }`, contando llaves
 * balanceadas (el objeto del reporte tiene objetos anidados, p. ej.
 * `resumen: resumen(filas)`). `null` si no se encuentra esa asignación.
 */
function bloqueDeAsignacionObjeto(texto: string, nombreVariable: string): string | null {
  const regex = new RegExp(`const\\s+${nombreVariable}\\s*=\\s*\\{`)
  const m = regex.exec(texto)
  if (!m) return null
  const inicio = m.index + m[0].length
  let i = inicio
  let profundidad = 1
  while (i < texto.length && profundidad > 0) {
    if (texto[i] === '{') profundidad++
    else if (texto[i] === '}') profundidad--
    i++
  }
  return texto.slice(inicio, i - 1)
}

describe('llamadasConsole (el propio detector, con un fixture en memoria)', () => {
  it('extrae el argumento completo aunque tenga paréntesis adentro', () => {
    const fixture = "console.log(`algo: ${a.join(', ')}`)\nconsole.error('otra', { x: 1 })"
    expect(llamadasConsole(fixture)).toEqual(["`algo: ${a.join(', ')}`", "'otra', { x: 1 }"])
  })

  it('sin llamadas a console: lista vacía', () => {
    expect(llamadasConsole('const x = 1')).toEqual([])
  })
})

describe('geocodificar-lugares.ts: cordura (cosas obvias del archivo real)', () => {
  it('el archivo existe y no está vacío', () => {
    expect(CONTENIDO_CRUDO.length).toBeGreaterThan(500)
  })
})

describe('geocodificar-lugares.ts: usa la lógica de 53-a, no la reimplementa', () => {
  it('importa crearClienteNominatim de lib/venues/geocodificacion/', () => {
    expect(CONTENIDO).toMatch(/import\s*\{[^}]*\bcrearClienteNominatim\b[^}]*\}\s*from\s*['"][^'"]*lib\/venues\/geocodificacion/)
  })

  it('importa geocodificarLugares de lib/venues/geocodificacion/', () => {
    expect(CONTENIDO).toMatch(/import\s*\{[^}]*\bgeocodificarLugares\b[^}]*\}\s*from\s*['"][^'"]*lib\/venues\/geocodificacion/)
  })

  it('no hay ninguna URL de nominatim.openstreetmap.org escrita en el código (la arma urlDeBusqueda, de consultas.ts)', () => {
    expect(CONTENIDO).not.toContain('nominatim.openstreetmap.org')
  })
})

describe('geocodificar-lugares.ts: el guardado toca solo venues, nunca borra nada', () => {
  it('hay exactamente un .update( en todo el archivo', () => {
    const cantidad = (CONTENIDO.match(/\.update\(/g) ?? []).length
    expect(cantidad).toBe(1)
  })

  it('ese único .update( es sobre la tabla venues (el .from(...) más cercano antes es .from(\'venues\'))', () => {
    const idx = CONTENIDO.indexOf('.update(')
    expect(idx).toBeGreaterThan(-1)
    const antes = CONTENIDO.slice(0, idx)
    const froms = [...antes.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)]
    expect(froms.length).toBeGreaterThan(0)
    expect(froms[froms.length - 1][1]).toBe('venues')
  })

  it('no hay ningún .upsert( en todo el archivo', () => {
    expect(CONTENIDO).not.toMatch(/\.upsert\(/)
  })

  it('no hay ningún .delete( en todo el archivo', () => {
    expect(CONTENIDO).not.toMatch(/\.delete\(/)
  })

  it('el bloque de guardado tiene .eq(\'id\' y .select( (extraído entre "async function guardar" y su cierre)', () => {
    const inicio = CONTENIDO.indexOf('async function guardar')
    expect(inicio).toBeGreaterThan(-1)
    // Corte simple: hasta el próximo "const filas" (lo que sigue después de
    // declarar `guardar`, ya fuera de su cuerpo) alcanza para esta prueba.
    const fin = CONTENIDO.indexOf('const filas', inicio)
    expect(fin).toBeGreaterThan(inicio)
    const bloque = CONTENIDO.slice(inicio, fin)
    expect(bloque).toMatch(/\.eq\(\s*['"]id['"]/)
    expect(bloque).toMatch(/\.or\(/)
    expect(bloque).toMatch(/\.select\(/)
  })

  it('el archivo menciona geocode_source cerca del filtro de guardado (ver limitación en el docstring)', () => {
    // A propósito sobre el texto CRUDO (con comentarios): el script pasa el
    // filtro como la variable opaca `filtro.or`, así que la única forma de
    // dejar constancia de qué cubre es un comentario junto a `filtroDeActualizacion`.
    expect(CONTENIDO_CRUDO).toContain('geocode_source')
  })
})

describe('geocodificar-lugares.ts: nunca imprime una variable de entorno', () => {
  const llamadas = llamadasConsole(CONTENIDO)

  it('hay al menos una llamada a console.* en el archivo (si esto da 0, el chequeo no agarra nada)', () => {
    expect(llamadas.length).toBeGreaterThan(0)
  })

  it('ninguna llamada a console.* incluye process.env', () => {
    const conProcessEnv = llamadas.filter((arg) => arg.includes('process.env'))
    expect(conProcessEnv, `console.* con process.env: ${JSON.stringify(conProcessEnv)}`).toEqual([])
  })
})

describe('geocodificar-lugares.ts: informa el modo y la política al arrancar', () => {
  const llamadas = llamadasConsole(CONTENIDO)

  it('alguna llamada a console.* menciona URL_POLITICA', () => {
    expect(llamadas.some((arg) => arg.includes('URL_POLITICA'))).toBe(true)
  })

  it('alguna llamada a console.* menciona USER_AGENT', () => {
    expect(llamadas.some((arg) => arg.includes('USER_AGENT'))).toBe(true)
  })
})

describe('geocodificar-lugares.ts: corte por bloqueado (403)', () => {
  it('compara la cantidad de filas devueltas contra la cantidad de lugares procesados con "<"', () => {
    // `geocodificarLugares` (53-a) corta la corrida entera sin agregar nada
    // al reporte en cuanto Nominatim devuelve 403: por eso "menos filas que
    // lugares procesados" (no un flag separado) es la señal de bloqueo.
    expect(CONTENIDO).toMatch(/filas\.length\s*<\s*\w+\.length/)
  })

  it('el mensaje exacto de corte por 403 está en el archivo', () => {
    expect(CONTENIDO_CRUDO).toContain('Nominatim respondió 403: pará y revisá la política antes de volver a correrlo')
  })

  it('process.exit(2) está en el archivo (el corte por bloqueado no puede salir con el mismo código que un éxito)', () => {
    expect(CONTENIDO).toContain('process.exit(2)')
  })

  it('el mensaje de 403 y el process.exit(2) están en el mismo bloque (a menos de 400 caracteres de distancia)', () => {
    const idxMensaje = CONTENIDO.indexOf('pará y revisá la política')
    const idxExit = CONTENIDO.indexOf('process.exit(2)')
    expect(idxMensaje).toBeGreaterThan(-1)
    expect(idxExit).toBeGreaterThan(-1)
    expect(Math.abs(idxExit - idxMensaje)).toBeLessThan(400)
  })
})

describe('geocodificar-lugares.ts: paraRevisarPrevios va al reporte, no solo a un console.log', () => {
  // El plan de la ronda dice, sobre los venues con coordenadas pero sin
  // geocode_source: "no se tocan: van al reporte como 'para revisar'". Un
  // console.log con el conteo no alcanza: Mauro lo pierde en cuanto cierra
  // la terminal.
  const asignacion = /const\s+(\w+)(?:\s*:\s*[^=]+)?=\s*paraRevisarPrevios\.map\(/.exec(CONTENIDO)

  it('hay un "const <algo> = paraRevisarPrevios.map(...)" en el archivo', () => {
    expect(asignacion, 'no se encontró ninguna asignación que mapee paraRevisarPrevios').not.toBeNull()
  })

  it('esa variable se usa fuera de cualquier console.* (no solo para imprimir un número)', () => {
    const variable = asignacion![1]
    const llamadas = llamadasConsole(CONTENIDO)
    const aparicionesEnConsole = llamadas.filter((arg) => new RegExp(`\\b${variable}\\b`).test(arg)).length
    const aparicionesTotales = (CONTENIDO.match(new RegExp(`\\b${variable}\\b`, 'g')) ?? []).length
    // -1 por la propia declaración ("const <variable> = ...").
    expect(aparicionesTotales - 1 - aparicionesEnConsole).toBeGreaterThan(0)
  })

  it('el objeto que se pasa a JSON.stringify( incluye "filas" y esa variable (el reporte lleva ambos conjuntos)', () => {
    // JSON.stringify( recibe una variable (p. ej. "reporte"), no un objeto
    // literal inline: primero se saca el nombre de esa variable del
    // argumento de la llamada, después se extrae su propia asignación
    // (`const reporte = { ... }`, llaves balanceadas) y se busca ahí.
    const variable = asignacion![1]
    const argumentoJson = argumentoDeLlamada(CONTENIDO, /JSON\.stringify\(/)
    expect(argumentoJson, 'no se encontró JSON.stringify( en el archivo').not.toBeNull()
    const nombreReporte = argumentoJson!.split(',')[0].trim()
    const bloqueReporte = bloqueDeAsignacionObjeto(CONTENIDO, nombreReporte)
    expect(bloqueReporte, `no se encontró "const ${nombreReporte} = { ... }"`).not.toBeNull()
    expect(bloqueReporte).toMatch(new RegExp(`\\b${variable}\\b`))
    expect(bloqueReporte).toMatch(/\bfilas\b/)
  })

  it('el archivo arma un array que junta "filas" con esa variable (para el CSV) con un spread', () => {
    const variable = asignacion![1]
    expect(CONTENIDO).toMatch(new RegExp(`\\[\\s*\\.\\.\\.filas\\s*,\\s*\\.\\.\\.${variable}\\s*\\]`))
  })
})

describe('geocodificar-lugares.ts: el corte por bloqueado se calcula antes de agregar los previos', () => {
  it('"filas.length < ...length" aparece ANTES de la asignación que mapea paraRevisarPrevios', () => {
    const idxBloqueado = CONTENIDO.search(/filas\.length\s*<\s*\w+\.length/)
    const idxAsignacion = CONTENIDO.search(/const\s+\w+(?:\s*:\s*[^=]+)?=\s*paraRevisarPrevios\.map\(/)
    expect(idxBloqueado).toBeGreaterThan(-1)
    expect(idxAsignacion).toBeGreaterThan(-1)
    expect(idxBloqueado).toBeLessThan(idxAsignacion)
  })
})

describe('geocodificar-lugares.ts: --apply no es el valor por defecto', () => {
  it('no hay "apply = true" ni "apply: true" sueltos en el código', () => {
    expect(CONTENIDO).not.toMatch(/\bapply\s*=\s*true\b/)
    expect(CONTENIDO).not.toMatch(/\bapply\s*:\s*true\b/)
  })

  it('leerOpciones (de lib/venues/geocodificacion/opciones.ts, 53-b) es quien decide apply: no hay un "apply" hardcodeado a mano antes de llamarla', () => {
    expect(CONTENIDO).toMatch(/import\s*\{[^}]*\bleerOpciones\b[^}]*\}\s*from/)
  })
})
