/**
 * 31-q — cierra el agujero que deja `tests/scraper/cinema-slug.test.ts` (31-b,
 * QPS-141): esos tests prueban `MOVIE_SLUG_ALIASES` y un ESPEJO de la línea
 * de producción (`resolveSlug`, escrito a mano dentro del test), porque
 * `addMovieShowing()` es una función interna de `runCinemaScrapeAndSync` y
 * esa función scrapea por red. Eso significa que si alguien saca la
 * aplicación del mapa de adentro de `addMovieShowing()` — y deja
 * `MOVIE_SLUG_ALIASES` intacto en el archivo — esos tests siguen en verde:
 * el mapa sigue existiendo y el espejo sigue andando solo.
 *
 * Es la misma brecha que `groupByCategory` en R29 y `normalizeFilterText` en
 * R30. Se cierra igual: un detector sobre el CÓDIGO FUENTE de
 * `lib/scraper/cinema-scraper.ts`, acotado al cuerpo de `addMovieShowing`,
 * que confirma que el slug pasa de verdad por `MOVIE_SLUG_ALIASES` antes de
 * usarse como clave de `consolidatedMovies`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// apps/web/tests/scraper -> apps/web/tests -> apps/web -> lib/scraper/cinema-scraper.ts
const CINEMA_SCRAPER_PATH = fileURLToPath(new URL('../../lib/scraper/cinema-scraper.ts', import.meta.url))

/**
 * Vuelta 1 de 31-q: los regex de más abajo matchean sobre texto crudo, así
 * que una línea comentada ("// const slug = MOVIE_SLUG_ALIASES[s] ?? s;" al
 * lado de la línea mala real) los engañaba — el patrón bueno "existía" en el
 * archivo, aunque fuera dentro de un comentario, nunca ejecutado. Se pelan
 * los comentarios de línea (`//`) y de bloque (`/* ... *\/`) antes de correr
 * cualquier regex, en los dos detectores de este archivo (`extractFunctionBody`
 * y `checkAliasAppliedBeforeConsolidation`): así una llave o un patrón dentro
 * de un comentario no cuenta ni para el balance de llaves ni para las
 * búsquedas de alias.
 *
 * No neutraliza llaves dentro de strings (ej. `"{"`) — caso que no aparece en
 * `addMovieShowing` hoy y que, de aparecer, requeriría un parser de verdad en
 * vez de un detector de test; queda anotado y no se persigue.
 */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/**
 * Extrae el cuerpo (entre llaves balanceadas) de una función declarada con
 * `function <nombre>(...) { ... }` dentro de `source`. Falla ruidosamente
 * (en vez de devolver una cadena vacía) si no encuentra la firma o si las
 * llaves no cierran: un detector que no encuentra su objetivo y pasa en
 * verde es peor que no tenerlo (lección R29/R30).
 *
 * Pela los comentarios de `source` antes de buscar la firma y de contar
 * llaves: una llave dentro de un comentario ya no puede desbalancear el
 * conteo ni correr el cierre de la función.
 */
function extractFunctionBody(rawSource: string, fnName: string): string {
  const source = stripComments(rawSource)
  const sigRe = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{`)
  const sigMatch = sigRe.exec(source)
  if (!sigMatch) {
    throw new Error(
      `No se encontró "function ${fnName}(...)" en el archivo. ¿Cambió de nombre, dejó de ser una ` +
        'function declaration, o el archivo se movió?'
    )
  }

  const bodyStart = sigMatch.index + sigMatch[0].length
  let depth = 1
  let i = bodyStart
  for (; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) {
    throw new Error(`No se encontró el cierre de llaves de "${fnName}" (archivo truncado o llaves desbalanceadas).`)
  }

  return source.slice(bodyStart, i)
}

/**
 * Confirma, dentro del cuerpo de `addMovieShowing`, que:
 *   1. hay una línea `const X = normalizeMovieTitle(rawTitle)`;
 *   2. justo sobre esa `X`, se aplica `const Y = MOVIE_SLUG_ALIASES[X] ?? X`
 *      (el alias puede no cambiar nada, pero tiene que estar en el camino);
 *   3. `consolidatedMovies` se indexa con `Y` (la variable que ya pasó por
 *      el alias), no con `X` (el slug crudo).
 *
 * Devuelve la lista de problemas encontrados (vacía = todo bien). No tira
 * `undefined` en silencio: cada rama que no encuentra lo que busca agrega un
 * mensaje explicando qué faltó.
 *
 * Pela los comentarios del cuerpo antes de buscar: la línea buena comentada
 * al lado de una línea mala real ("const slug = s; // const slug =
 * MOVIE_SLUG_ALIASES[s] ?? s;") ya no cuenta como si el alias se aplicara.
 */
function checkAliasAppliedBeforeConsolidation(rawBody: string): string[] {
  const body = stripComments(rawBody)
  const problems: string[] = []

  const normalizeMatch = /\bconst\s+(\w+)\s*=\s*normalizeMovieTitle\(\s*rawTitle\s*\)/.exec(body)
  if (!normalizeMatch) {
    problems.push('No se encontró "const X = normalizeMovieTitle(rawTitle)" en el cuerpo de addMovieShowing.')
    return problems
  }
  const rawVar = normalizeMatch[1]

  const aliasRe = new RegExp(
    `\\bconst\\s+(\\w+)\\s*=\\s*MOVIE_SLUG_ALIASES\\[\\s*${rawVar}\\s*\\]\\s*\\?\\?\\s*${rawVar}\\b`
  )
  const aliasMatch = aliasRe.exec(body)
  if (!aliasMatch) {
    problems.push(
      `No se encontró "MOVIE_SLUG_ALIASES[${rawVar}] ?? ${rawVar}" aplicado sobre el resultado de ` +
        'normalizeMovieTitle: el alias no se está aplicando antes de usarse como clave (o se borró la línea y ' +
        `volvió "${rawVar}" directo, o el mapa quedó importado pero sin usar).`
    )
    return problems
  }
  const aliasVar = aliasMatch[1]

  const keyRe = new RegExp(`consolidatedMovies\\[\\s*${aliasVar}\\s*\\]`)
  if (!keyRe.test(body)) {
    problems.push(`consolidatedMovies no se indexa con "${aliasVar}" (la variable que ya pasó por MOVIE_SLUG_ALIASES).`)
  }

  if (aliasVar !== rawVar) {
    const rawKeyRe = new RegExp(`consolidatedMovies\\[\\s*${rawVar}\\s*\\]`)
    if (rawKeyRe.test(body)) {
      problems.push(
        `consolidatedMovies también se indexa con "${rawVar}" (el slug SIN pasar por MOVIE_SLUG_ALIASES), ` +
          `en vez de usar siempre "${aliasVar}".`
      )
    }
  }

  return problems
}

// ---------------------------------------------------------------------------
// 1. El detector, probado con fixtures en memoria (sin tocar el repo real).
// ---------------------------------------------------------------------------
describe('extractFunctionBody (fixtures en memoria)', () => {
  it('extrae el cuerpo de una función simple', () => {
    const src = `function foo(a, b) {\n  return a + b;\n}\n`
    expect(extractFunctionBody(src, 'foo').trim()).toBe('return a + b;')
  })

  it('respeta llaves anidadas (objetos, ifs) para encontrar el cierre correcto', () => {
    const src = `function foo(a) {\n  if (a) {\n    const o = { x: 1 };\n    return o;\n  }\n  return null;\n}\n`
    const body = extractFunctionBody(src, 'foo')
    expect(body).toContain('const o = { x: 1 };')
    expect(body).toContain('return null;')
  })

  it('[rotura] rompe ruidosamente si la función no existe en el archivo', () => {
    const src = `function otraCosa() {}\n`
    expect(() => extractFunctionBody(src, 'addMovieShowing')).toThrow(/No se encontró/)
  })

  it('[rotura] rompe ruidosamente si las llaves no balancean (archivo truncado)', () => {
    const src = `function foo(a) {\n  if (a) {\n    return a;\n`
    expect(() => extractFunctionBody(src, 'foo')).toThrow(/desbalanceadas/)
  })

  it('[rotura] una llave dentro de un comentario de línea no rompe el conteo de llaves', () => {
    const src = `function foo(a) {\n  // if (a) { return null; }\n  return a;\n}\n`
    const body = extractFunctionBody(src, 'foo')
    expect(body.trim()).toBe('return a;')
  })

  it('[rotura] una llave dentro de un comentario de bloque no rompe el conteo de llaves', () => {
    const src = `function foo(a) {\n  /* nota: si hiciera falta { todo esto } quedaría acá */\n  return a;\n}\n`
    const body = extractFunctionBody(src, 'foo')
    expect(body.trim()).toBe('return a;')
  })
})

describe('stripComments (fixtures en memoria)', () => {
  it('saca un comentario de línea sin tocar el código de antes', () => {
    expect(stripComments('const x = 1; // nota\n')).toBe('const x = 1; \n')
  })

  it('saca un comentario de bloque, incluso multilínea', () => {
    expect(stripComments('const x = 1;\n/* nota\nmultilínea */\nconst y = 2;\n')).toBe(
      'const x = 1;\n\nconst y = 2;\n'
    )
  })

  it('no toca una URL con "//" dentro de un string (precedida por ":")', () => {
    const src = `const u = 'https://example.com/path';\n`
    expect(stripComments(src)).toBe(src)
  })
})

describe('checkAliasAppliedBeforeConsolidation (fixtures en memoria)', () => {
  const BIEN = `
    const s = normalizeMovieTitle(rawTitle);
    const slug = MOVIE_SLUG_ALIASES[s] ?? s;
    if (!slug) return;
    if (!consolidatedMovies[slug]) {
      consolidatedMovies[slug] = { title: rawTitle, poster_url: posterUrl, showings: {} };
    }
    const movie = consolidatedMovies[slug];
  `

  it('acepta el patrón correcto: el alias se aplica y consolidatedMovies usa esa variable', () => {
    expect(checkAliasAppliedBeforeConsolidation(BIEN)).toEqual([])
  })

  it('[rotura caso 1] detecta que se borró la línea del alias y volvió normalizeMovieTitle(rawTitle) directo', () => {
    const malo = `
      const slug = normalizeMovieTitle(rawTitle);
      if (!slug) return;
      if (!consolidatedMovies[slug]) {
        consolidatedMovies[slug] = { title: rawTitle, poster_url: posterUrl, showings: {} };
      }
    `
    const problems = checkAliasAppliedBeforeConsolidation(malo)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems[0]).toMatch(/MOVIE_SLUG_ALIASES/)
  })

  it('[rotura caso 2] detecta el refactor descuidado: el mapa queda sin aplicarse aunque siga existiendo en el archivo', () => {
    // MOVIE_SLUG_ALIASES sigue declarado en el archivo (fuera de este
    // fragmento), pero adentro de addMovieShowing ya no se lo usa: "slug"
    // se calcula sin pasar por el mapa.
    const malo = `
      const s = normalizeMovieTitle(rawTitle);
      const slug = s; // el alias ya no se aplica acá
      if (!slug) return;
      if (!consolidatedMovies[slug]) {
        consolidatedMovies[slug] = { title: rawTitle, poster_url: posterUrl, showings: {} };
      }
    `
    const problems = checkAliasAppliedBeforeConsolidation(malo)
    expect(problems.length).toBeGreaterThan(0)
  })

  it('[rotura caso 3] detecta que consolidatedMovies se indexa con el slug crudo, no con el que pasó por el alias', () => {
    const malo = `
      const s = normalizeMovieTitle(rawTitle);
      const slug = MOVIE_SLUG_ALIASES[s] ?? s;
      if (!slug) return;
      if (!consolidatedMovies[s]) {
        consolidatedMovies[s] = { title: rawTitle, poster_url: posterUrl, showings: {} };
      }
    `
    const problems = checkAliasAppliedBeforeConsolidation(malo)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems[0]).toMatch(/consolidatedMovies/)
  })

  it('[rotura caso 4] la línea buena queda comentada al lado de la mala: el regex no la puede confundir con código real', () => {
    // Variante del refactor descuidado que encontró el revisor: la línea que
    // aplica el alias no se borra, se comenta — y queda al lado de la línea
    // real que ya no lo aplica. Sin pelar comentarios, el regex encontraba
    // "MOVIE_SLUG_ALIASES[s] ?? s" DENTRO del comentario y daba verde.
    const malo = `
      const s = normalizeMovieTitle(rawTitle);
      const slug = s; // const slug = MOVIE_SLUG_ALIASES[s] ?? s;
      if (!slug) return;
      if (!consolidatedMovies[slug]) {
        consolidatedMovies[slug] = { title: rawTitle, poster_url: posterUrl, showings: {} };
      }
    `
    const problems = checkAliasAppliedBeforeConsolidation(malo)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems[0]).toMatch(/MOVIE_SLUG_ALIASES/)
  })
})

// ---------------------------------------------------------------------------
// 2. El barrido real sobre lib/scraper/cinema-scraper.ts.
// ---------------------------------------------------------------------------
describe('addMovieShowing (código real de lib/scraper/cinema-scraper.ts)', () => {
  function readSource(): string {
    try {
      return readFileSync(CINEMA_SCRAPER_PATH, 'utf8')
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`No se pudo leer "${CINEMA_SCRAPER_PATH}": ${reason}`)
    }
  }

  it('encuentra la función addMovieShowing y su cuerpo no está vacío', () => {
    const body = extractFunctionBody(readSource(), 'addMovieShowing')
    expect(body.trim().length).toBeGreaterThan(0)
    // Sanity check: el detector tiene que estar mirando donde dice que mira,
    // no pasando en verde porque el cuerpo está vacío o es otra función.
    expect(body).toContain('normalizeMovieTitle')
    expect(body).toContain('consolidatedMovies')
  })

  it('dentro de addMovieShowing, el slug pasa por MOVIE_SLUG_ALIASES antes de usarse como clave', () => {
    const body = extractFunctionBody(readSource(), 'addMovieShowing')
    const problems = checkAliasAppliedBeforeConsolidation(body)
    if (problems.length > 0) {
      throw new Error(`addMovieShowing no aplica MOVIE_SLUG_ALIASES correctamente:\n${problems.join('\n')}`)
    }
    expect(problems).toEqual([])
  })
})
