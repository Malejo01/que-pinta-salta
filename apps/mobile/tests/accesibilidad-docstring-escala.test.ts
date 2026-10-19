// 49-q (ronda 49): el docstring de `ESCALA_MAXIMA_COMPACTA` en
// `lib/accesibilidad.ts` enumera dónde el tope de escala está "Aplicado hoy
// en" o "Resuelto en", y cuáles quedan "a propósito, SIN tope". Nada
// verificaba que esa lista siguiera siendo cierta: en la R46 el mismo
// docstring prometía cinco lugares y el código lo cumplía en dos — es la
// familia de error más frecuente de este repo (un comentario que afirma más
// de lo que el código cumple). Este test lee el docstring como texto y, por
// cada archivo que nombra, exige (o prohíbe) `maxFontSizeMultiplier=
// {ESCALA_MAXIMA_COMPACTA}` en ese archivo de verdad — con los comentarios
// saneados antes de buscar, para que un comentario que solo menciona la
// prop no cuente como si el código la tuviera de verdad.
//
// Límite: la lista se extrae del texto del docstring con regexes puntuales
// (backticks envueltos en paréntesis para "Aplicado hoy en"/"SIN tope", el
// primer backtick después de "Resuelto en"). Si alguien reescribe esas
// frases con otra forma (otra puntuación, el nombre sin backticks), este
// test deja de ver ese archivo y no avisa nada: no hay forma de detectar
// "un lugar que el docstring debería nombrar y no nombra".
//
// No importa nada de otro `*.test.ts` (QPS-250): `quitarComentarios` es una
// copia local, mismo criterio que `tests/pestanas.test.ts`/`tests/ficha.test.ts`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUTA_ACCESIBILIDAD = join(MOBILE_ROOT, 'lib', 'accesibilidad.ts')
const FUENTE_ACCESIBILIDAD = readFileSync(RUTA_ACCESIBILIDAD, 'utf8')

/** Comentarios de línea y de bloque vaciados, conservando el resto del
 * texto (mismo criterio que `quitarComentarios` de `tests/pestanas.test.ts`
 * y `tests/ficha.test.ts`: copia local, QPS-250). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/** El bloque `/** ... *\/` que precede a `export const ESCALA_MAXIMA_COMPACTA`. */
function extraerDocstring(fuente: string): string {
  const marcador = 'export const ESCALA_MAXIMA_COMPACTA'
  const idxMarcador = fuente.indexOf(marcador)
  if (idxMarcador === -1) {
    throw new Error('no se encontró "export const ESCALA_MAXIMA_COMPACTA" en lib/accesibilidad.ts')
  }
  const antes = fuente.slice(0, idxMarcador)
  const inicio = antes.lastIndexOf('/**')
  const fin = antes.lastIndexOf('*/')
  if (inicio === -1 || fin === -1 || fin < inicio) {
    throw new Error('no se encontró el docstring de ESCALA_MAXIMA_COMPACTA (bloque /** */ previo)')
  }
  return antes.slice(inicio, fin + 2)
}

const DOCSTRING = extraerDocstring(FUENTE_ACCESIBILIDAD)

/** El texto entre dos marcas (incluida `desde`, excluida `hasta`). Con
 * `hasta: null`, hasta el final del docstring. */
function seccion(texto: string, desde: string, hasta: string | null): string {
  const i = texto.indexOf(desde)
  if (i === -1) return ''
  const j = hasta ? texto.indexOf(hasta, i) : -1
  return j === -1 ? texto.slice(i) : texto.slice(i, j)
}

const SECCION_APLICADO = seccion(DOCSTRING, 'Aplicado hoy en:', 'A propósito, SIN tope:')
const SECCION_SIN_TOPE = seccion(DOCSTRING, 'A propósito, SIN tope:', 'Resuelto en')

/** Los nombres entre backticks que están directamente envueltos en
 * paréntesis: `- texto (\`Nombre\`): ...` — la forma que usan las listas de
 * "Aplicado hoy en" y "SIN tope". No matchea un backtick suelto en medio de
 * una oración, como `\`onLayout\`` en la lista de "SIN tope". */
function nombresEntreParentesis(texto: string): string[] {
  const re = /\(`([^`]+)`\)/g
  const resultado: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) resultado.push(m[1])
  return resultado
}

/** El primer nombre entre backticks después de "Resuelto en". */
function nombreTrasResueltoEn(texto: string): string | null {
  const m = /Resuelto en `([^`]+)`/.exec(texto)
  return m ? m[1] : null
}

/**
 * Resuelve un nombre del docstring a una ruta de archivo bajo `apps/mobile`.
 * Si ya tiene `/` (una ruta, como `app/evento/[id].tsx` o
 * `components/EtiquetaPestana.tsx`), se usa tal cual. Si es un nombre de
 * componente sin ruta (`TarjetaEvento`, `Hero`, `PillsAtajos`), se asume
 * `components/<Nombre>.tsx` — el único patrón que usa hoy este docstring.
 * Límite: un nombre de componente que no viva en `components/` (por
 * ejemplo uno bajo `app/`) no se resolvería bien con esta función.
 */
function resolverArchivo(nombre: string): string {
  const relativo = nombre.includes('/') ? nombre : join('components', `${nombre}.tsx`)
  return join(MOBILE_ROOT, relativo)
}

const APLICADOS = nombresEntreParentesis(SECCION_APLICADO)
const EXCLUIDOS = nombresEntreParentesis(SECCION_SIN_TOPE)
const RESUELTO = nombreTrasResueltoEn(DOCSTRING)

describe('extracción del docstring (sanity: que las listas no estén vacías por un cambio de forma)', () => {
  it('encontró al menos un archivo en "Aplicado hoy en"', () => {
    expect(APLICADOS.length).toBeGreaterThan(0)
  })

  it('encontró al menos un archivo en "A propósito, SIN tope"', () => {
    expect(EXCLUIDOS.length).toBeGreaterThan(0)
  })

  it('encontró el archivo de "Resuelto en"', () => {
    expect(RESUELTO).not.toBeNull()
  })
})

describe('"Aplicado hoy en": cada archivo que el docstring nombra tiene de verdad maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}', () => {
  for (const nombre of APLICADOS) {
    const ruta = resolverArchivo(nombre)

    it(`${nombre} (${ruta.slice(MOBILE_ROOT.length)}): existe y tiene la prop en código real`, () => {
      const contenido = quitarComentarios(readFileSync(ruta, 'utf8'))
      expect(contenido).toMatch(/maxFontSizeMultiplier=\{\s*ESCALA_MAXIMA_COMPACTA\s*\}/)
    })
  }
})

describe('"Resuelto en": el archivo que el docstring marca como ya resuelto tiene de verdad la prop', () => {
  it('RESUELTO se extrajo (si no, las aserciones de abajo no dicen nada)', () => {
    expect(RESUELTO).not.toBeNull()
  })

  it(`${RESUELTO ?? '(no extraído)'}: existe y tiene la prop en código real`, () => {
    if (!RESUELTO) throw new Error('no se pudo extraer el archivo de "Resuelto en" del docstring')
    const ruta = resolverArchivo(RESUELTO)
    const contenido = quitarComentarios(readFileSync(ruta, 'utf8'))
    expect(contenido).toMatch(/maxFontSizeMultiplier=\{\s*ESCALA_MAXIMA_COMPACTA\s*\}/)
  })
})

describe('"A propósito, SIN tope": cada archivo que el docstring excluye NO tiene la prop en código real', () => {
  for (const nombre of EXCLUIDOS) {
    const ruta = resolverArchivo(nombre)

    it(`${nombre} (${ruta.slice(MOBILE_ROOT.length)}): existe y NO tiene la prop`, () => {
      const contenido = quitarComentarios(readFileSync(ruta, 'utf8'))
      expect(contenido).not.toMatch(/maxFontSizeMultiplier=\{\s*ESCALA_MAXIMA_COMPACTA\s*\}/)
    })
  }
})
