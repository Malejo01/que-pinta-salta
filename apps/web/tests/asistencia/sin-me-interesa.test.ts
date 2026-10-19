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
 *  - Tres páginas de borrado de cuenta (`eliminar-cuenta`, web ×2 + app) y
 *    el inventario de `lib/cuenta/tablas-personales.ts`: mientras la
 *    migración que borra la columna vieja no se aplique, esas filas existen
 *    y hay que avisar que se borran con la cuenta. Las cambia el lead de
 *    día junto con la migración.
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
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
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

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto (mismo criterio que paridad.test.ts). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
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
describe('"me_interesa" / "meInteresa" como código (sin comentarios): ninguna ocurrencia', () => {
  const PATRON_CODIGO = /\bme_interesa\b|\bmeInteresa\b/

  it('ningún archivo recorrido tiene el literal como código', () => {
    const hallazgos: string[] = []
    for (const archivo of ARCHIVOS) {
      const contenido = readFileSync(join(REPO_ROOT, archivo), 'utf8')
      const limpio = quitarComentarios(contenido)
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
    const limpio = quitarComentarios("if (kind === 'me_interesa') return")
    expect(PATRON_CODIGO.test(limpio)).toBe(true)
  })

  it('un comentario con el literal se descarta antes de buscar (no cuenta)', () => {
    const limpio = quitarComentarios("// antes existía 'me_interesa', ya no\nconst x = 1")
    expect(PATRON_CODIGO.test(limpio)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// El texto visible "Me interesa", con los comentarios ya vaciados. Las
// excepciones de arriba (borrado de cuenta ×4, contacto/anunciantes ×2) son
// las ÚNICAS permitidas; cualquier otra es un bug (alguien reescribió el
// texto a mano en vez de usar ETIQUETAS_ASISTENCIA/textoBotonVoy).
// ---------------------------------------------------------------------------
describe('"Me interesa" como texto visible (sin comentarios): solo en las excepciones documentadas', () => {
  const EXCEPCIONES = new Set([
    'apps/web/app/eliminar-cuenta/page.tsx',
    'apps/web/app/perfil/eliminar-cuenta/page.tsx',
    'apps/mobile/app/eliminar-cuenta.tsx',
    'apps/web/lib/cuenta/tablas-personales.ts',
    'apps/web/lib/contacto.ts',
    'apps/web/app/anunciantes/page.tsx',
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
      [
        'apps/web/app/eliminar-cuenta/page.tsx',
        'apps/web/app/perfil/eliminar-cuenta/page.tsx',
        'apps/mobile/app/eliminar-cuenta.tsx',
        'apps/web/lib/cuenta/tablas-personales.ts',
        'apps/web/lib/contacto.ts',
        'apps/web/app/anunciantes/page.tsx',
      ].sort(),
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

  it('las páginas de eliminar-cuenta mencionan "Voy" y "Me interesa" juntas (la fila que se borra, no un botón nuevo)', () => {
    const pagina = quitarComentarios(readFileSync(join(REPO_ROOT, 'apps/web/app/eliminar-cuenta/page.tsx'), 'utf8'))
    expect(pagina).toMatch(/Voy[^]*Me interesa|Me interesa[^]*Voy/)
  })
})
