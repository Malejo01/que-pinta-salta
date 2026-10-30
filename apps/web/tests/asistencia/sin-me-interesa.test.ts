/**
 * "Me interesa" desapareció de la interfaz con la R47 (QPS-197): ningún
 * camino de código la escribe. Este test recorre el código de producción
 * (web, app y core) buscando el literal viejo como CÓDIGO (no como prosa de
 * comentario) y el texto visible "Me interesa" en los componentes.
 *
 * No se puede escribir literal "cero menciones en todo el repo" (así lo pide
 * el plan original) porque ya se verificó que hay menciones legítimas que
 * esta ronda no podía sacar — están en archivos que ninguna tarea de la R47
 * tenía permiso de tocar, o significan otra cosa:
 *
 *  - Comentarios de cabecera histórica ("Voy / Me interesa", contando qué
 *    cambió): se descartan ANTES de buscar, con la misma técnica que usa
 *    `tests/asistencia/paridad.test.ts` (vaciar bloques `/* *\/` y líneas
 *    `//`). Ahí vive, por ejemplo, la referencia legítima al nombre de la
 *    migración `20261013120100_voy_me_interesa.sql` en
 *    `apps/web/lib/asistencia-visibilidad.ts`.
 *  - (Hasta el #77) las tres páginas de borrado de cuenta y el inventario de
 *    `lib/cuenta/tablas-personales.ts` decían "Me interesa" porque esas
 *    filas existían. El #77 (migración de la R47) las borró y cambió los
 *    textos a "Tus marcas de "Voy"": ya no son excepción, y el último test
 *    de abajo verifica que no vuelvan. Queda `tablas-personales.ts`, cuyo
 *    campo `comentario` (un string, no un comentario de código) dice
 *    justamente que desde la R47 no hay "Me interesa".
 *  - `lib/contacto.ts` (`TEXTO_ANUNCIAR`) y `app/anunciantes/page.tsx`:
 *    "Me interesa anunciar…" no tiene nada que ver con la asistencia a un
 *    evento.
 *  - `packages/db/src/database.types.ts`: tipos generados, nunca se tocan a
 *    mano — queda fuera del recorrido por completo.
 *
 * Lo que SÍ se prohíbe, con los comentarios ya quitados: el literal como
 * código (`'me_interesa'` / `"me_interesa"`, un acceso `.me_interesa` /
 * `.meInteresa`) y el texto visible "Me interesa" fuera de las excepciones
 * de arriba.
 *
 * El test afirma cuántos archivos recorrió y que encontró las excepciones
 * esperadas: así no puede pasar en verde por un glob roto que no recorra
 * nada.
 *
 * ## El punto ciego cerrado (R56, QPS-253): el identificador armado en pedazos
 *
 * Hasta la R54 la búsqueda del identificador viejo (`PATRON_CODIGO` más
 * abajo) corría directo sobre el texto sin comentarios, así que una
 * concatenación de literales (`'me' + '_interesa'`) o un template con el
 * identificador repartido en interpolaciones literales
 * (`` `me${'_'}interesa` ``, `` `me_${'interesa'}` ``) no formaban la
 * substring contigua `me_interesa` y esquivaban el regex. `normalizarParaIdentificador`
 * (solo para ESTA búsqueda, nunca para la del texto visible "Me interesa" de
 * más abajo) junta esos dos casos antes de buscar: (a) literales de cadena
 * pegados con `+` —con espacios o saltos de línea en el medio, y aunque se
 * mezclen comillas simples y dobles— y (b) una interpolación `${'...'}`
 * dentro de un template que es ella misma un literal simple, reemplazada
 * por su contenido sin comillas. No se aplica a la búsqueda de "Me
 * interesa" como prosa: ahí generaría falsos positivos uniendo frases sin
 * relación entre sí, y la prosa legítima (`TEXTO_ANUNCIAR`, "Me interesa
 * anunciar…") tiene que seguir pasando tal cual está declarada.
 *
 * Evasión que sigue abierta: un identificador armado con una variable en
 * tiempo de ejecución (`const a = 'me'; const b = '_interesa'; const k = a + b`)
 * no es un literal de cadena y esta normalización no lo alcanza — haría
 * falta evaluar el código, no solo leer su texto.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url)) // apps/web/tests/asistencia -> repo root

const DIRECTORIOS_A_RECORRER = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'apps/mobile/app',
  'apps/mobile/components',
  'apps/mobile/lib',
  'packages/core/src',
]

/** Archivos excluidos del recorrido por completo (tipos generados). */
const ARCHIVOS_FUERA_DE_ALCANCE = new Set(['packages/db/src/database.types.ts'])

function esArchivoDeCodigo(nombre: string): boolean {
  return (nombre.endsWith('.ts') || nombre.endsWith('.tsx')) && !nombre.endsWith('.test.ts') && !nombre.endsWith('.test.tsx')
}

/** Recorre un directorio recursivamente y devuelve las rutas relativas (con "/") de los archivos .ts/.tsx. */
function listarArchivos(dirAbsoluto: string, baseAbsoluta: string): string[] {
  const resultado: string[] = []
  let entradas: string[] = []
  try {
    entradas = readdirSync(dirAbsoluto)
  } catch {
    return resultado
  }
  for (const entrada of entradas) {
    const rutaAbsoluta = join(dirAbsoluto, entrada)
    const info = statSync(rutaAbsoluta)
    if (info.isDirectory()) {
      resultado.push(...listarArchivos(rutaAbsoluta, baseAbsoluta))
    } else if (esArchivoDeCodigo(entrada)) {
      const rel = relative(baseAbsoluta, rutaAbsoluta).split('\\').join('/')
      if (!ARCHIVOS_FUERA_DE_ALCANCE.has(rel)) resultado.push(rel)
    }
  }
  return resultado
}

const ARCHIVOS: string[] = DIRECTORIOS_A_RECORRER.flatMap((dir) => listarArchivos(join(REPO_ROOT, dir), REPO_ROOT))

/**
 * SOLO para la búsqueda del identificador `me_interesa` (ver el comentario
 * de cabecera, "El punto ciego cerrado"): junta literales de cadena
 * concatenados con `+` y las interpolaciones `${'...'}`/`${"..."}` de un
 * template que son ellas mismas un literal simple, para que un
 * identificador repartido en pedazos quede como substring contigua. No se
 * usa para la búsqueda de "Me interesa" como texto visible.
 */
function normalizarParaIdentificador(contenido: string): string {
  const conservarSaltos = (coincidencia: string, reemplazo: string): string => {
    const saltos = (coincidencia.match(/\n/g) || []).length
    return reemplazo + '\n'.repeat(saltos) // conserva el número de línea de lo que viene después
  }

  let resultado = contenido
  let anterior: string
  do {
    anterior = resultado
    // 'a' + 'b' | "a" + "b" | 'a' + "b" | "a" + 'b', con espacios o saltos de línea alrededor del +.
    resultado = resultado.replace(
      /(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*\+\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3/g,
      (coincidencia: string, _q1: string, a: string, _q3: string, b: string) => conservarSaltos(coincidencia, `'${a}${b}'`),
    )
    // ${'a'} o ${"a"} dentro de un template: su contenido, sin comillas ni ${}.
    resultado = resultado.replace(
      /\$\{\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*\}/g,
      (coincidencia: string, _q: string, a: string) => conservarSaltos(coincidencia, a),
    )
  } while (resultado !== anterior)
  return resultado
}

// ---------------------------------------------------------------------------
// Sanidad del recorrido: si esto da 0 o un número chico, el glob está roto y
// el resto de los chequeos pasaría en verde sin haber mirado nada.
// ---------------------------------------------------------------------------
describe('sanidad del recorrido', () => {
  it('recorrió al menos 300 archivos .ts/.tsx de producción', () => {
    expect(ARCHIVOS.length).toBeGreaterThanOrEqual(300)
  })

  it('incluyó los directorios de los tres paquetes (web, app, core)', () => {
    expect(ARCHIVOS.some((f) => f.startsWith('apps/web/'))).toBe(true)
    expect(ARCHIVOS.some((f) => f.startsWith('apps/mobile/'))).toBe(true)
    expect(ARCHIVOS.some((f) => f.startsWith('packages/core/src/'))).toBe(true)
  })

  it('database.types.ts quedó explícitamente fuera (si apareciera, no es un error: hay que revisar la exclusión)', () => {
    expect(ARCHIVOS).not.toContain('packages/db/src/database.types.ts')
  })
})

// ---------------------------------------------------------------------------
// El literal viejo como código: 'me_interesa' / "me_interesa" / .me_interesa
// / .meInteresa, con los comentarios ya vaciados. Hoy no debería quedar
// ninguno (el modelo nuevo no tiene ningún camino de compatibilidad con el
// valor viejo); si aparece alguno, el test lo señala con archivo y línea.
// ---------------------------------------------------------------------------
describe('"me_interesa" / "meInteresa" como código (sin comentarios, con literales partidos reunidos): ninguna ocurrencia', () => {
  const PATRON_CODIGO = /\bme_interesa\b|\bmeInteresa\b/

  it('ningún archivo recorrido tiene el literal como código, armado de una sola vez o en pedazos', () => {
    const hallazgos: string[] = []
    for (const archivo of ARCHIVOS) {
      const contenido = readFileSync(join(REPO_ROOT, archivo), 'utf8')
      const limpio = normalizarParaIdentificador(quitarComentarios(contenido))
      const lineas = limpio.split('\n')
      lineas.forEach((linea, indice) => {
        if (PATRON_CODIGO.test(linea)) {
          hallazgos.push(`${archivo}:${indice + 1}: ${linea.trim()}`)
        }
      })
    }
    expect(hallazgos, hallazgos.join('\n')).toEqual([])
  })

  it('el detector de verdad encuentra el literal en un fixture en memoria (no es un regex roto)', () => {
    const limpio = normalizarParaIdentificador(quitarComentarios("if (kind === 'me_interesa') return"))
    expect(PATRON_CODIGO.test(limpio)).toBe(true)
  })

  it('un comentario con el literal se descarta antes de buscar (no cuenta)', () => {
    const limpio = normalizarParaIdentificador(quitarComentarios("// antes existía 'me_interesa', ya no\nconst x = 1"))
    expect(PATRON_CODIGO.test(limpio)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // El punto ciego cerrado (R56, QPS-253): el identificador armado en pedazos.
  // -------------------------------------------------------------------------
  it("'me' + '_interesa' (literales concatenados): ahora SÍ se detecta", () => {
    const limpio = normalizarParaIdentificador(quitarComentarios("const kind = 'me' + '_interesa'"))
    expect(PATRON_CODIGO.test(limpio)).toBe(true)
  })

  it('"me" + "_interesa" (comillas dobles, con saltos de línea alrededor del +): también se detecta', () => {
    const limpio = normalizarParaIdentificador(quitarComentarios('const kind =\n  "me" +\n  "_interesa"'))
    expect(PATRON_CODIGO.test(limpio)).toBe(true)
  })

  it('`me_${\'interesa\'}` (template con la segunda mitad interpolada): se detecta', () => {
    const limpio = normalizarParaIdentificador(quitarComentarios("const kind = `me_${'interesa'}`"))
    expect(PATRON_CODIGO.test(limpio)).toBe(true)
  })

  it('`me${\'_\'}interesa` (template con el medio interpolado): se detecta', () => {
    const limpio = normalizarParaIdentificador(quitarComentarios("const kind = `me${'_'}interesa`"))
    expect(PATRON_CODIGO.test(limpio)).toBe(true)
  })

  it('falso positivo evitado: concatenar dos literales SIN relación no arma el identificador', () => {
    const limpio = normalizarParaIdentificador(quitarComentarios("const saludo = 'hola' + 'mundo'"))
    expect(PATRON_CODIGO.test(limpio)).toBe(false)
  })

  it('"Me interesa anunciar" (TEXTO_ANUNCIAR, prosa de cara al usuario) sigue sin matchear el identificador: no es meInteresa/me_interesa', () => {
    const limpio = normalizarParaIdentificador(quitarComentarios(`export const TEXTO_ANUNCIAR = "Hola! Me interesa anunciar mi negocio o evento en Que Pinta Salta."`))
    expect(PATRON_CODIGO.test(limpio)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// El texto visible "Me interesa", con los comentarios ya vaciados. Las
// excepciones de arriba (contacto/anunciantes, otro sentido, y la nota de tablas-personales) son
// las ÚNICAS permitidas; cualquier otra es un bug (alguien reescribió el
// texto a mano en vez de usar ETIQUETAS_ASISTENCIA/textoBotonVoy).
// ---------------------------------------------------------------------------
describe('"Me interesa" como texto visible (sin comentarios): solo en las excepciones documentadas', () => {
  const EXCEPCIONES = new Set([
    'apps/web/lib/contacto.ts',
    'apps/web/app/anunciantes/page.tsx',
    'apps/web/lib/cuenta/tablas-personales.ts',
  ])

  it('ninguna ocurrencia fuera de las excepciones', () => {
    const hallazgosFueraDeExcepcion: string[] = []
    const excepcionesEncontradas = new Set<string>()

    for (const archivo of ARCHIVOS) {
      const contenido = readFileSync(join(REPO_ROOT, archivo), 'utf8')
      const limpio = quitarComentarios(contenido)
      if (!limpio.includes('Me interesa')) continue

      if (EXCEPCIONES.has(archivo)) {
        excepcionesEncontradas.add(archivo)
      } else {
        const lineas = limpio.split('\n')
        lineas.forEach((linea, indice) => {
          if (linea.includes('Me interesa')) hallazgosFueraDeExcepcion.push(`${archivo}:${indice + 1}: ${linea.trim()}`)
        })
      }
    }

    expect(hallazgosFueraDeExcepcion, hallazgosFueraDeExcepcion.join('\n')).toEqual([])
    // Si esto no encuentra NINGUNA de las excepciones esperadas, el
    // recorrido o el stripping de comentarios están rotos (pasaría en verde
    // sin haber comprobado nada de verdad).
    expect([...excepcionesEncontradas].sort()).toEqual(
      ['apps/web/app/anunciantes/page.tsx', 'apps/web/lib/contacto.ts', 'apps/web/lib/cuenta/tablas-personales.ts'].sort(),
    )
  })

  it('las excepciones existen de verdad en el recorrido (si no, la lista de arriba miente)', () => {
    for (const excepcion of EXCEPCIONES) {
      expect(ARCHIVOS, `falta ${excepcion} en el recorrido`).toContain(excepcion)
    }
  })

  it('"Me interesa anunciar" (contacto/anunciantes) es otro sentido, no asistencia a un evento', () => {
    const contacto = quitarComentarios(readFileSync(join(REPO_ROOT, 'apps/web/lib/contacto.ts'), 'utf8'))
    expect(contacto).toContain('Me interesa anunciar')
  })

  it.each([
    'apps/web/app/eliminar-cuenta/page.tsx',
    'apps/web/app/perfil/eliminar-cuenta/page.tsx',
    'apps/mobile/app/eliminar-cuenta.tsx',
  ])('%s: "Qué se borra" menciona las marcas de "Voy" y ya no "Me interesa" (#77)', (archivo) => {
    const pagina = quitarComentarios(readFileSync(join(REPO_ROOT, archivo), 'utf8'))
    expect(pagina).toContain('Voy')
    expect(pagina).not.toContain('Me interesa')
  })
})
