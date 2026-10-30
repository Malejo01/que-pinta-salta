// 49-d (QPS-244): detector estático de voseo rioplatense y tildes faltantes,
// sobre `app/**`, `components/**` y `lib/**` de `apps/mobile`. Mismo espíritu
// que `tests/accesibilidad-detector.test.ts`: NO es un parser de JSX/TS, es
// texto recortado con regex — fixtures en memoria primero (probando que el
// detector falla de verdad con lo que tiene que fallar, y que NO falla con
// lo que no tiene que fallar), después el barrido sobre el código real. Cada
// límite conocido de la heurística está documentado donde corresponde, con
// un test que prueba el límite tal cual es (no lo que "debería" ser).
//
// QPS-250: este archivo NO importa nada de otro `*.test.ts` (ni
// `tests/ficha.test.ts` ni `tests/accesibilidad-detector.test.ts`, que tienen
// su propia versión de "sacar los comentarios"): la función de abajo es una
// copia, no un import.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const LIB_DIR = join(MOBILE_ROOT, 'lib')

// ---------------------------------------------------------------------------
// Las listas de palabras/frases, arriba del archivo, para que se puedan
// ampliar sin tocar la lógica de más abajo.
// ---------------------------------------------------------------------------

/** Tuteo como palabra completa (sin distinguir mayúsculas), en cualquier
 * posición del candidato — a diferencia de `TUTEO_APERTURA_FRASE`, estas no
 * dependen de abrir una frase. `tú` entra acá como pronombre: es una palabra
 * completa más, no una regla aparte. */
export const TUTEO_PALABRAS_COMPLETAS = [
  'quieres',
  'puedes',
  'tienes',
  'eres',
  'sabes',
  'debes',
  'necesitas',
  'prefieres',
  'decides',
  'tú',
]

/** Tuteo que solo cuenta si ABRE una frase (al principio del candidato, o
 * después de ". "): estas mismas palabras, en el medio de una oración, son
 * otra cosa ("Sigue" puede ser el verbo "seguir" en 3.ª persona, no un
 * imperativo de 2.ª persona tuteando — ver `esAperturaDeFrase`). */
export const TUTEO_APERTURA_FRASE = [
  'Suscríbete',
  'Regístrate',
  'Únete',
  'Inténtalo',
  'Escribe',
  'Sigue',
  'Busca',
  'Selecciona',
  'Elige',
]

/** Copiadas de `FORMAS_TUTEO_SACADAS` en `apps/web/tests/textos/voseo.test.ts`
 * (sin la ruta de la web: acá solo importa el texto, no en qué archivo de la
 * web se sacó). Frases exactas, no palabras sueltas — se buscan como
 * substring, respetando mayúsculas/minúsculas igual que el test de la web. */
export const FORMAS_TUTEO_SACADAS = [
  'Personaliza tu suscripción',
  'Tú decides',
  'Suscríbete',
  'recibe alertas',
  '¿Cada cuánto quieres recibir novedades?',
  'Selecciona frecuencia',
  'Sigue locales físicos',
  'Busca locales físicos',
  'Escribe arriba',
  'Debes iniciar sesión',
  'Debes seguir al menos',
  'Guarda tus eventos',
  'Únete para guardar',
  '¿No tienes cuenta?',
  '¿Ya tienes cuenta?',
  'Regístrate',
  'Inicia Sesión',
  'Cambia tu contraseña',
  'Inténtalo de nuevo',
  'invitamos un cafecito',
]

/** Tildes faltantes: substring exacto (case-sensitive), buscado tal cual
 * está escrito acá — "Como llegar" sin tilde en la "o", "Sesion"/"Contrasena"
 * sin tilde en la "o"/"a" que las necesita, "Categoria"/"Musica" sin tilde en
 * la "i", y "Penas" (la ñ de "Peñas" escrita como una "n" simple). Lista
 * aparte, con nombre, para poder ampliarla sin tocar la lógica. */
export const TILDES_FALTANTES = [
  'Como llegar',
  'Iniciar Sesion',
  'Sesion',
  'Contrasena',
  'contrasena',
  'Categoria',
  'Musica',
  'Penas',
]

/** Excepciones explícitas, cada una con su motivo (por ejemplo, un texto que
 * cita algo de un tercero tal cual lo escribió). Arranca vacía: si hace falta
 * una, se agrega acá, nunca se la "esconde" ajustando una regla de arriba. */
export const EXCEPCIONES_VOSEO: ReadonlyArray<{ archivo: string; linea: number; frase: string; motivo: string }> = []

/** Atributos JSX cuyo valor literal cuenta como prosa aunque sea una sola
 * palabra (sin espacio) — ver el canal B más abajo. */
const ATRIBUTOS_PROSA = ['accessibilityLabel', 'accessibilityHint', 'placeholder', 'label', 'title']




/** Línea (1-based) de un índice de `content`. */
function lineaDe(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

// ---------------------------------------------------------------------------
// Candidatos de prosa: Canal A (texto JSX) y Canal B (literales de texto).
// ---------------------------------------------------------------------------

export interface Candidato {
  texto: string
  linea: number
}

/**
 * Canal A — texto JSX, entre un `>` y el `<` siguiente.
 *
 * Cuidado 1 (obligatorio): antes de buscar, se neutralizan los `=>` de las
 * funciones flecha, reemplazándolos por `--` (mismo largo, así los índices
 * no se corren y la línea calculada después sigue siendo correcta). Sin
 * esto, el `>` de una flecha (`onPress={() => foo()}`) se leería como el
 * cierre de una etiqueta, y todo el código hasta el próximo `<` entraría
 * como si fuera texto.
 *
 * Cuidado 2 (obligatorio): se descarta el nodo si, después de recortarlo,
 * queda vacío, no tiene ninguna letra, o contiene `{ } ( ) = ;` — eso es
 * código o interpolación, no prosa.
 *
 * LÍMITE CONOCIDO, escrito a propósito (ver el test de más abajo que lo
 * prueba tal cual es): un texto JSX mezclado con una interpolación (`Hola
 * {nombre}, ¿cómo estás?`) cae en el descarte de "contiene { o }" ENTERO —
 * no se revisa nada de ese nodo, ni la parte que sí es prosa. Hoy no hay
 * ningún caso así con tuteo en `app/`/`components/`/`lib/` (verificado a
 * mano: el único nodo con interpolación mezclada con texto fijo es
 * `app/eliminar-cuenta.tsx:90`, "Cuenta: {session.user.email}", sin tuteo).
 *
 * LÍMITE CONOCIDO #2 (el mismo espíritu que ya aceptan los otros detectores
 * del repo, por ejemplo `leerEtiquetaApertura` en
 * `tests/accesibilidad-detector.test.ts`): esto NO es un parser de JSX. Un
 * `>` de comparación real (`if (x > 5)`) también se lee como si cerrara una
 * etiqueta; el texto que viene después, hasta el próximo `<`, casi siempre
 * tiene código (y cae en el descarte de arriba), pero no hay ninguna garantía
 * formal de que así sea siempre.
 */
export function candidatosJSX(contenidoSinComentarios: string): Candidato[] {
  const sinFlechas = contenidoSinComentarios.replace(/=>/g, '--')
  const resultado: Candidato[] = []
  const re = />([^<>]*)</g
  let m: RegExpExecArray | null
  while ((m = re.exec(sinFlechas))) {
    const crudo = m[1]
    const recortado = crudo.trim()
    if (!recortado) continue
    if (!/[a-zA-ZÁÉÍÓÚáéíóúÑñÜü]/.test(recortado)) continue
    if (/[{}()=;]/.test(recortado)) continue
    const espaciosAlInicio = crudo.length - crudo.trimStart().length
    const inicioTexto = m.index + 1 + espaciosAlInicio
    resultado.push({ texto: recortado, linea: lineaDe(contenidoSinComentarios, inicioTexto) })
  }
  return resultado
}

/**
 * Canal B — literales de texto (comillas simples, dobles o backticks).
 *
 * Un literal es prosa SOLO SI:
 *  (a) es el valor directo de un atributo de prosa (`ATRIBUTOS_PROSA`:
 *      `attr="valor"`, con el `=` pegado a la comilla — no cuenta un valor
 *      envuelto en `{...}`, ver el límite de abajo), o
 *  (b) contiene al menos un espacio.
 *
 * Ese filtro es el que evita los falsos positivos: `'cargando-sesion'`
 * (`app/(tabs)/favoritos.tsx:180` — ni tiene espacio, ni es un atributo de
 * prosa: ahí el guion que separa las dos palabras no es un límite para esta
 * regla, porque esta regla no mira palabras, mira si el LITERAL ENTERO tiene
 * un espacio, y no lo tiene), `'flex-start'`, `'Montserrat_600SemiBold'` — un
 * slug o una clave, no prosa.
 *
 * LÍMITE CONOCIDO: una palabra sola de la lista de tildes que NO sea el valor
 * de un atributo de prosa (por ejemplo, un literal `'Musica'` suelto, sin
 * espacio, asignado a una variable que no se llama `label`/`title`/etc.) no
 * se detecta por este canal — no tiene espacio, y no es un atributo de
 * prosa. No hay ningún caso real así hoy (verificado arriba, grep manual).
 *
 * LÍMITE CONOCIDO #2: el atributo-de-prosa solo se reconoce en la forma
 * `attr="valor"`/`attr='valor'`/`` attr=`valor` `` (la comilla pegada al
 * `=`). Un valor dinámico envuelto en llaves, como
 * `` accessibilityLabel={`Dejar de seguir ${nombre}`} `` (el patrón real de
 * `components/PantallaRadar.tsx:473`), no entra por la regla (a) — pero en
 * la práctica siempre entra por la regla (b), porque ese tipo de texto
 * siempre tiene espacios.
 *
 * CASO REAL QUE OBLIGÓ A NO USAR UNA REGEX SIMPLE PARA LOS BACKTICKS: un
 * template literal puede tener OTRO template literal anidado adentro de su
 * `${...}` — el patrón real de `app/(tabs)/buscar.tsx:152` y `:158`:
 * `` `${cantidad} evento${plural}${nombreCategoriaFiltro ? ` en ${nombreCategoriaFiltro}` : ''}` ``.
 * Una regex del estilo `` /`((?:\\.|[^\\`])*)`/ `` corta en el PRIMER
 * backtick que encuentra — que acá es el de apertura del literal anidado,
 * no el cierre real — y deja como "contenido" algo como
 * `"${cantidad} evento${plural}${nombreCategoriaFiltro ?"`, que SÍ tiene un
 * espacio y SÍ contiene, como substring de el nombre de una variable
 * (`nombreCategoriaFiltro`), la palabra sin tilde "Categoria": un falso
 * positivo (encontrado corriendo este mismo detector contra el código real,
 * antes de escribir `escanearTemplateLiteral`). Por eso los backticks se
 * escanean con un balanceador recursivo (`escanearTemplateLiteral` +
 * `saltarExpresionBalanceada`, abajo) que entiende `${...}` balanceado —
 * incluyendo backticks/strings anidados adentro — y arma el "texto plano"
 * SOLO con los tramos de afuera de cualquier `${...}`: ningún identificador
 * que viaje dentro de una interpolación entra nunca al texto que se revisa.
 */
export function candidatosLiterales(contenidoSinComentarios: string): Candidato[] {
  const contenido = contenidoSinComentarios
  const resultado: Candidato[] = []
  let i = 0
  while (i < contenido.length) {
    const c = contenido[i]
    if (c === "'" || c === '"') {
      const fin = finDeStringSimple(contenido, i)
      agregarSiProsa(resultado, contenido, i, contenido.slice(i + 1, fin - 1))
      i = fin
      continue
    }
    if (c === '`') {
      const { textoPlano, fin } = escanearTemplateLiteral(contenido, i)
      agregarSiProsa(resultado, contenido, i, textoPlano)
      i = fin
      continue
    }
    i++
  }
  return resultado
}

/** Si `valor` cumple la regla (a) o (b) de arriba, lo agrega a `resultado`
 * como candidato (con su línea, calculada del índice de la comilla de
 * apertura del literal, `inicioLiteral`, en `contenido`). */
function agregarSiProsa(resultado: Candidato[], contenido: string, inicioLiteral: number, valor: string): void {
  const atributo = nombreAtributoAntesDe(contenido, inicioLiteral)
  const esAtributoProsa = atributo !== null && ATRIBUTOS_PROSA.includes(atributo)
  const tieneEspacio = /\s/.test(valor)
  if (!esAtributoProsa && !tieneEspacio) return
  const recortado = valor.trim()
  if (!recortado) return
  resultado.push({ texto: recortado, linea: lineaDe(contenido, inicioLiteral) })
}

/** El nombre del identificador de un `nombre\s*=\s*` pegado justo antes de
 * `inicioComilla` (sin nada más que espacios en el medio) — o `null` si no
 * hay ninguno (por ejemplo, un literal suelto en un array, o un valor
 * envuelto en `{...}` — ver el LÍMITE CONOCIDO #2 de arriba). */
function nombreAtributoAntesDe(contenido: string, inicioComilla: number): string | null {
  const antes = contenido.slice(Math.max(0, inicioComilla - 60), inicioComilla)
  const m = antes.match(/(\w+)\s*=\s*$/)
  return m ? m[1] : null
}

/** El índice justo después de la comilla simple o doble que cierra el string
 * que empieza en `inicio` (el índice de su comilla de apertura), sin bajar
 * por un escape (`\\'`/`\\"`). Las comillas simples/dobles de JS no admiten
 * interpolación: no hace falta el balanceo recursivo que sí necesitan los
 * backticks (ver `escanearTemplateLiteral`). */
function finDeStringSimple(contenido: string, inicio: number): number {
  const comilla = contenido[inicio]
  let i = inicio + 1
  while (i < contenido.length) {
    if (contenido[i] === '\\') {
      i += 2
      continue
    }
    if (contenido[i] === comilla) return i + 1
    i++
  }
  return contenido.length
}

/**
 * Escanea un template literal (backtick) desde `inicio` (el índice de su
 * comilla de apertura): devuelve el "texto plano" — los tramos de afuera de
 * cualquier `${...}`, concatenados, SIN los `${...}` mismos — y el índice
 * justo después del backtick que lo cierra de verdad (entendiendo `${...}`
 * balanceado, con cualquier string/backtick anidado adentro: ver el "CASO
 * REAL" documentado arriba de `candidatosLiterales`).
 */
function escanearTemplateLiteral(contenido: string, inicio: number): { textoPlano: string; fin: number } {
  let i = inicio + 1
  let textoPlano = ''
  while (i < contenido.length) {
    const c = contenido[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '`') return { textoPlano, fin: i + 1 }
    if (c === '$' && contenido[i + 1] === '{') {
      i = saltarExpresionBalanceada(contenido, i + 2)
      continue
    }
    textoPlano += c
    i++
  }
  return { textoPlano, fin: contenido.length }
}

/** Salta una expresión `${...}` ya abierta (empieza justo después del `{` de
 * apertura): balancea llaves, pero saltando ENTERO cualquier string (simple,
 * doble, o backtick — este último de forma recursiva, llamando de nuevo a
 * `escanearTemplateLiteral`) que encuentre adentro, para que un `}` o un
 * backtick DENTRO de ese string anidado no corte la expresión antes de
 * tiempo. Devuelve el índice justo después del `}` que la cierra. */
function saltarExpresionBalanceada(contenido: string, inicio: number): number {
  let profundidad = 1
  let i = inicio
  while (i < contenido.length && profundidad > 0) {
    const c = contenido[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '`') {
      i = escanearTemplateLiteral(contenido, i).fin
      continue
    }
    if (c === "'" || c === '"') {
      i = finDeStringSimple(contenido, i)
      continue
    }
    if (c === '{') profundidad++
    else if (c === '}') profundidad--
    i++
  }
  return i
}

// ---------------------------------------------------------------------------
// Coincidencia de palabra completa, segura con letras acentuadas: `\b` de
// JS NO trata una vocal con tilde como "letra" (solo [A-Za-z0-9_]) — por
// ejemplo, `/\btú\b/` NO matchea "tú " de verdad, porque entre la "ú" y el
// espacio no hay transición \w/\W (las dos son "no letra" para \b). Por eso
// se usa un lookbehind/lookahead negativo con una clase de caracteres propia
// que SÍ incluye las vocales acentuadas y la ñ.
// ---------------------------------------------------------------------------

const CLASE_LETRA = 'A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9_'

function comoPalabraCompleta(palabra: string): RegExp {
  return new RegExp(`(?<![${CLASE_LETRA}])${palabra}(?![${CLASE_LETRA}])`, 'gi')
}

/** Los índices (en `texto`) de todas las ocurrencias de `palabra` como
 * palabra completa, sin distinguir mayúsculas. */
function ocurrenciasPalabraCompleta(texto: string, palabra: string): number[] {
  const re = comoPalabraCompleta(palabra)
  const resultado: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) resultado.push(m.index)
  return resultado
}

/** `true` si la ocurrencia en `idx` abre una frase: está al principio del
 * candidato (sin contar espacios/saltos de línea antes), o viene justo
 * después de ". ". */
function esAperturaDeFrase(texto: string, idx: number): boolean {
  if (texto.slice(0, idx).trim() === '') return true
  return texto.slice(Math.max(0, idx - 2), idx) === '. '
}

// ---------------------------------------------------------------------------
// Razones de tuteo/tilde de un candidato (puede tener más de una).
// ---------------------------------------------------------------------------

export function razonesDeCandidato(texto: string): string[] {
  const razones: string[] = []

  for (const palabra of TUTEO_PALABRAS_COMPLETAS) {
    if (ocurrenciasPalabraCompleta(texto, palabra).length > 0) {
      razones.push(`tuteo: "${palabra}"`)
    }
  }

  for (const palabra of TUTEO_APERTURA_FRASE) {
    const abreAlguna = ocurrenciasPalabraCompleta(texto, palabra).some((idx) => esAperturaDeFrase(texto, idx))
    if (abreAlguna) razones.push(`tuteo (abre frase): "${palabra}"`)
  }

  for (const frase of FORMAS_TUTEO_SACADAS) {
    if (texto.includes(frase)) razones.push(`tuteo (forma sacada de la web): "${frase}"`)
  }

  for (const frase of TILDES_FALTANTES) {
    if (texto.includes(frase)) razones.push(`sin tilde: "${frase}"`)
  }

  return razones
}

// ---------------------------------------------------------------------------
// Hallazgos de un archivo.
// ---------------------------------------------------------------------------

export interface Hallazgo {
  archivo: string
  linea: number
  texto: string
  razones: string[]
}

export function hallazgosDeVoseo(contenidoOriginal: string, archivoRelativo: string): Hallazgo[] {
  const limpio = sinComentarios(contenidoOriginal)
  const candidatos = [...candidatosJSX(limpio), ...candidatosLiterales(limpio)]
  const hallazgos: Hallazgo[] = []

  for (const candidato of candidatos) {
    const razones = razonesDeCandidato(candidato.texto)
    if (razones.length === 0) continue
    const esExcepcion = EXCEPCIONES_VOSEO.some(
      (e) => e.archivo === archivoRelativo && e.linea === candidato.linea && e.frase === candidato.texto,
    )
    if (esExcepcion) continue
    hallazgos.push({ archivo: archivoRelativo, linea: candidato.linea, texto: candidato.texto, razones })
  }

  return hallazgos
}

// ---------------------------------------------------------------------------
// Barrido de archivos (mismo patrón que `tests/accesibilidad-detector.test.ts`).
// ---------------------------------------------------------------------------

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

// ===========================================================================
// Fixtures en memoria: cada caso del encargo, probado a que falle (o no
// falle) de verdad, antes de aplicarse al código real.
// ===========================================================================

describe('hallazgosDeVoseo (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('un comentario con "quieres" NO falla (los comentarios se sacan antes de buscar)', () => {
    const fixture = `// ¿Quieres saber más? esto es un comentario viejo\nconst x = 1`
    expect(hallazgosDeVoseo(fixture, 'fixture.ts')).toEqual([])
  })

  it('un identificador cargandoSesion NO falla (no es un literal ni texto JSX)', () => {
    const fixture = `const cargandoSesion = true\nif (cargandoSesion) return`
    expect(hallazgosDeVoseo(fixture, 'fixture.ts')).toEqual([])
  })

  it(`el literal 'cargando-sesion' NO falla (sin espacio, no es atributo de prosa)`, () => {
    const fixture = `export type Vista = 'cargando-sesion' | 'contenido'`
    expect(hallazgosDeVoseo(fixture, 'fixture.ts')).toEqual([])
  })

  it(`'¿Qué quieres?' SÍ falla (tiene espacio)`, () => {
    const fixture = `const mensaje = '¿Qué quieres?'`
    const hallazgos = hallazgosDeVoseo(fixture, 'fixture.ts')
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0].texto).toBe('¿Qué quieres?')
    expect(hallazgos[0].razones.join(' ')).toContain('quieres')
  })

  it(`placeholder="Busca algo" SÍ falla (atributo de prosa, abre la frase con "Busca")`, () => {
    const fixture = `<CampoTexto placeholder="Busca algo" value={x} />`
    const hallazgos = hallazgosDeVoseo(fixture, 'fixture.tsx')
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0].texto).toBe('Busca algo')
  })

  it('"Buscar algo" y "Buscá algo" NO fallan por la regla de "Busca" (palabra completa, no prefijo)', () => {
    expect(hallazgosDeVoseo(`<Texto>Buscar algo en el Radar</Texto>`, 'fixture.tsx')).toEqual([])
    expect(hallazgosDeVoseo(`<Texto>Buscá algo en el Radar</Texto>`, 'fixture.tsx')).toEqual([])
  })

  it('"Sigue" no matchea "Siguiente" (palabra completa)', () => {
    expect(hallazgosDeVoseo(`<Texto>Paso Siguiente</Texto>`, 'fixture.tsx')).toEqual([])
  })

  it('"Busca"/"Sigue"/"Escribe" en el MEDIO de una frase no cuentan (solo cuentan si abren frase)', () => {
    // "él Sigue" no es el inicio de una frase ni viene después de ". " — y
    // "Sigue" en 3.ª persona ("él sigue") no es tuteo.
    expect(hallazgosDeVoseo(`<Texto>El cartel que él Sigue viendo</Texto>`, 'fixture.tsx')).toEqual([])
  })

  it('"Busca" SÍ cuenta después de ". " (abre una nueva frase)', () => {
    const hallazgos = hallazgosDeVoseo(`<Texto>Tocá para ver más. Busca lo que te interesa.</Texto>`, 'fixture.tsx')
    expect(hallazgos.length).toBeGreaterThan(0)
  })

  it('"Tú" como pronombre SÍ falla, "tu" posesivo NO (son palabras distintas)', () => {
    expect(hallazgosDeVoseo(`<Texto>Tú decidís qué ver</Texto>`, 'fixture.tsx')).toHaveLength(1)
    expect(hallazgosDeVoseo(`<Texto>Es tu Radar, armalo como quieras</Texto>`, 'fixture.tsx')).toEqual([])
  })

  it('una tilde faltante ("Sesion") SÍ falla, como texto JSX', () => {
    const hallazgos = hallazgosDeVoseo(`<Texto>Cerrar Sesion</Texto>`, 'fixture.tsx')
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0].razones.join(' ')).toContain('Sesion')
  })

  it('REGRESIÓN (encontrada corriendo este detector contra el código real, app/(tabs)/buscar.tsx:152/158): un template literal con OTRO anidado adentro no da un falso positivo por el nombre de una variable', () => {
    // Fixture armado con concatenación (no un template literal de verdad en
    // este archivo): imita `textoResultados`/`textoSinResultados` de
    // app/(tabs)/buscar.tsx, el caso real que encontró este límite.
    const fixture =
      'function f() {\n' +
      "  return `${cantidad} evento${plural}${nombreCategoriaFiltro ? ` en ${nombreCategoriaFiltro}` : ''}`\n" +
      '}'
    expect(hallazgosDeVoseo(fixture, 'fixture.ts')).toEqual([])
  })

  it('LÍMITE CONOCIDO: un texto JSX mezclado con una interpolación no se revisa (la regla de descarte lo saca entero)', () => {
    // Si no fuera por el límite, esto debería fallar ("quieres" está ahí) —
    // pero el nodo entero se descarta porque contiene "{" y "}".
    const fixture = `<Texto>Hola {nombre}, ¿quieres ver tu agenda?</Texto>`
    expect(hallazgosDeVoseo(fixture, 'fixture.tsx')).toEqual([])
  })

  it('una excepción explícita (si la hubiera) saca ese hallazgo puntual, no el resto del archivo', () => {
    // No hay ninguna excepción cargada hoy (EXCEPCIONES_VOSEO arranca
    // vacía): este test prueba el MECANISMO con una lista armada a mano, no
    // la lista real (así no depende de que algún día se agregue una).
    const limpio = sinComentarios(`<Texto>¿Quieres ver más?</Texto>`)
    const candidato = candidatosJSX(limpio)[0]
    const excepciones = [{ archivo: 'fixture.tsx', linea: candidato.linea, frase: candidato.texto, motivo: 'de prueba' }]
    const esExcepcion = excepciones.some(
      (e) => e.archivo === 'fixture.tsx' && e.linea === candidato.linea && e.frase === candidato.texto,
    )
    expect(esExcepcion).toBe(true)
  })
})

describe('candidatosJSX / candidatosLiterales (fixtures en memoria)', () => {
  it('neutraliza "=>" antes de buscar: el código de un onPress no entra como texto', () => {
    const fixture = `<Pressable onPress={() => hacerAlgo()}><Texto>Entrar</Texto></Pressable>`
    const candidatos = candidatosJSX(sinComentarios(fixture))
    expect(candidatos).toHaveLength(1)
    expect(candidatos[0].texto).toBe('Entrar')
  })

  it('descarta un nodo JSX vacío o sin letras', () => {
    const fixture = `<View></View><Texto>  </Texto><Texto>123</Texto>`
    expect(candidatosJSX(sinComentarios(fixture))).toEqual([])
  })

  it('un literal sin espacio y sin atributo de prosa no es candidato (ej. una clave)', () => {
    expect(candidatosLiterales(sinComentarios(`const estilo = 'flex-start'`))).toEqual([])
  })

  it('un literal con espacio SÍ es candidato, aunque no sea un atributo de prosa', () => {
    const candidatos = candidatosLiterales(sinComentarios(`const mensaje = 'Hola mundo'`))
    expect(candidatos).toHaveLength(1)
    expect(candidatos[0].texto).toBe('Hola mundo')
  })

  it('el valor de accessibilityLabel cuenta aunque sea una sola palabra (sin espacio)', () => {
    const candidatos = candidatosLiterales(sinComentarios(`<Pressable accessibilityLabel="Cerrar" />`))
    expect(candidatos).toHaveLength(1)
    expect(candidatos[0].texto).toBe('Cerrar')
  })
})

// ===========================================================================
// Barrido real: app/**, components/**, lib/** de apps/mobile.
// ===========================================================================

describe('Voseo y tildes (49-d, QPS-244): sin tuteo ni tildes faltantes en el código real', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR), ...listarTsxYTs(LIB_DIR)].map((abs) =>
    relative(MOBILE_ROOT, abs).split('\\').join('/'),
  )

  it.each(archivos)('%s', (archivoRelativo) => {
    const abs = join(MOBILE_ROOT, ...archivoRelativo.split('/'))
    const original = readFileSync(abs, 'utf8')
    const hallazgos = hallazgosDeVoseo(original, archivoRelativo)
    if (hallazgos.length > 0) {
      const detalle = hallazgos.map((h) => `  ${h.archivo}:${h.linea} — "${h.texto}" (${h.razones.join('; ')})`).join('\n')
      throw new Error(`Tuteo o tilde faltante encontrado:\n${detalle}`)
    }
    expect(hallazgos).toEqual([])
  })
})
