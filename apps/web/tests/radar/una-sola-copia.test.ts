/**
 * "Una sola copia" de las escrituras de "+ Seguir" (R47, QPS-197): las
 * escrituras (`.insert`, `.upsert`, `.delete`) sobre `user_followed_venues`,
 * `user_followed_instagram_accounts` y `user_followed_categories`, y las
 * referencias al identificador `TABLA_SEGUIMIENTO` (de
 * `@qps/core/radar/seguimiento`), tienen que aparecer solo en:
 *
 *   - apps/web/lib/actions/radar.ts
 *   - apps/mobile/lib/radar.ts
 *   - apps/web/lib/cuenta/tablas-personales.ts (el borrado de cuenta, que ya
 *     estaba: ahí el nombre de la tabla es un dato del inventario, no una
 *     escritura — no se espera que el detector de abajo la encuentre, pero
 *     el archivo queda permitido si alguna vez la tuviera).
 *
 * y los componentes de "+ Seguir" y "Lo que seguís" (`boton-seguir.tsx` ×2,
 * `lo-que-seguis.tsx`/`LoQueSeguis.tsx`) importan de esos módulos y NUNCA
 * tocan la base ellos mismos.
 *
 * Mismo criterio que `tests/asistencia/sin-me-interesa.test.ts`: el test
 * afirma cuántos archivos recorrió y que los módulos permitidos SÍ
 * aparecen, para que no pase en verde por un glob roto.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url)) // apps/web/tests/radar -> repo root

const DIRECTORIOS_A_RECORRER = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib']

const TABLAS_DE_SEGUIMIENTO = ['user_followed_venues', 'user_followed_instagram_accounts', 'user_followed_categories']

const ARCHIVOS_PERMITIDOS_PARA_ESCRIBIR = new Set([
  'apps/web/lib/actions/radar.ts',
  'apps/mobile/lib/radar.ts',
  'apps/web/lib/cuenta/tablas-personales.ts',
])

const ARCHIVOS_PERMITIDOS_PARA_TABLA_SEGUIMIENTO = new Set(['apps/web/lib/actions/radar.ts', 'apps/mobile/lib/radar.ts'])

function esArchivoDeCodigo(nombre: string): boolean {
  return (nombre.endsWith('.ts') || nombre.endsWith('.tsx')) && !nombre.endsWith('.test.ts') && !nombre.endsWith('.test.tsx')
}

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
      resultado.push(relative(baseAbsoluta, rutaAbsoluta).split('\\').join('/'))
    }
  }
  return resultado
}

const ARCHIVOS: string[] = DIRECTORIOS_A_RECORRER.flatMap((dir) => listarArchivos(join(REPO_ROOT, dir), REPO_ROOT))

function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/**
 * `true` si, en `contenido` (ya sin comentarios), alguna de las tablas de
 * seguimiento aparece en un `.from(<tabla>)` seguido —dentro de una ventana
 * razonable, para cubrir cadenas de varias líneas como
 * `.from(t).delete().eq(...)`— de `.insert(`, `.upsert(` o `.delete(`.
 */
function tieneEscrituraSobreTablasDeSeguimiento(contenidoSinComentarios: string): string[] {
  const tablasEncontradas: string[] = []
  for (const tabla of TABLAS_DE_SEGUIMIENTO) {
    const patronFrom = new RegExp(`\\.from\\(\\s*['"]${tabla}['"]\\s*\\)([\\s\\S]{0,250})`, 'g')
    let m: RegExpExecArray | null
    while ((m = patronFrom.exec(contenidoSinComentarios)) !== null) {
      const ventana = m[1]
      if (/\.\s*(insert|upsert|delete)\s*\(/.test(ventana)) {
        tablasEncontradas.push(tabla)
        break
      }
    }
  }
  return tablasEncontradas
}

function tieneTablaSeguimiento(contenidoSinComentarios: string): boolean {
  return /\bTABLA_SEGUIMIENTO\b/.test(contenidoSinComentarios)
}

describe('sanidad del recorrido', () => {
  it('recorrió al menos 300 archivos .ts/.tsx de producción', () => {
    expect(ARCHIVOS.length).toBeGreaterThanOrEqual(300)
  })

  it('incluyó apps/web y apps/mobile', () => {
    expect(ARCHIVOS.some((f) => f.startsWith('apps/web/'))).toBe(true)
    expect(ARCHIVOS.some((f) => f.startsWith('apps/mobile/'))).toBe(true)
  })
})

describe('el detector funciona de verdad (fixtures en memoria)', () => {
  it('detecta un insert en una sola línea', () => {
    const fixture = `await supabase.from('user_followed_venues').insert({ user_id, venue_id })`
    expect(tieneEscrituraSobreTablasDeSeguimiento(fixture)).toEqual(['user_followed_venues'])
  })

  it('detecta un delete encadenado en varias líneas', () => {
    const fixture = `await supabase\n  .from("user_followed_categories")\n  .delete()\n  .eq("user_id", userId)`
    expect(tieneEscrituraSobreTablasDeSeguimiento(fixture)).toEqual(['user_followed_categories'])
  })

  it('un select no cuenta como escritura', () => {
    const fixture = `await supabase.from('user_followed_venues').select('venue_id').eq('user_id', userId)`
    expect(tieneEscrituraSobreTablasDeSeguimiento(fixture)).toEqual([])
  })

  it('.from(tabla) con una variable (no un literal) no matchea: es el caso de lib/cuenta/eliminar.ts, que NO está en el alcance de este archivo', () => {
    const fixture = `await admin.from(tabla).delete().eq(columna, userId)`
    expect(tieneEscrituraSobreTablasDeSeguimiento(fixture)).toEqual([])
  })

  it('TABLA_SEGUIMIENTO se detecta como identificador, no como substring de otra palabra', () => {
    expect(tieneTablaSeguimiento('const { tabla, columna } = TABLA_SEGUIMIENTO[tipo]')).toBe(true)
    expect(tieneTablaSeguimiento('const otraCosa = 1')).toBe(false)
  })
})

describe('las escrituras sobre las tres tablas de seguimiento aparecen solo en los módulos permitidos', () => {
  it('ningún archivo fuera de la lista permitida escribe sobre user_followed_*', () => {
    const hallazgos: string[] = []
    for (const archivo of ARCHIVOS) {
      if (ARCHIVOS_PERMITIDOS_PARA_ESCRIBIR.has(archivo)) continue
      const limpio = quitarComentarios(readFileSync(join(REPO_ROOT, archivo), 'utf8'))
      const tablas = tieneEscrituraSobreTablasDeSeguimiento(limpio)
      if (tablas.length > 0) hallazgos.push(`${archivo}: escribe sobre ${tablas.join(', ')}`)
    }
    expect(hallazgos, hallazgos.join('\n')).toEqual([])
  })

  it('los dos radar.ts SÍ escriben sobre las tres tablas (si esto da false, el detector no está mirando nada)', () => {
    const web = quitarComentarios(readFileSync(join(REPO_ROOT, 'apps/web/lib/actions/radar.ts'), 'utf8'))
    const app = quitarComentarios(readFileSync(join(REPO_ROOT, 'apps/mobile/lib/radar.ts'), 'utf8'))

    expect(tieneEscrituraSobreTablasDeSeguimiento(web).sort()).toEqual([...TABLAS_DE_SEGUIMIENTO].sort())
    expect(tieneEscrituraSobreTablasDeSeguimiento(app).sort()).toEqual([...TABLAS_DE_SEGUIMIENTO].sort())
  })
})

describe('TABLA_SEGUIMIENTO (el mapeo tabla/columna) se referencia solo en los dos radar.ts', () => {
  it('ningún otro archivo de apps/web o apps/mobile lo referencia', () => {
    const hallazgos: string[] = []
    for (const archivo of ARCHIVOS) {
      if (ARCHIVOS_PERMITIDOS_PARA_TABLA_SEGUIMIENTO.has(archivo)) continue
      const limpio = quitarComentarios(readFileSync(join(REPO_ROOT, archivo), 'utf8'))
      if (tieneTablaSeguimiento(limpio)) hallazgos.push(archivo)
    }
    expect(hallazgos, hallazgos.join('\n')).toEqual([])
  })

  it('los dos radar.ts SÍ lo referencian', () => {
    for (const archivo of ARCHIVOS_PERMITIDOS_PARA_TABLA_SEGUIMIENTO) {
      const limpio = quitarComentarios(readFileSync(join(REPO_ROOT, archivo), 'utf8'))
      expect(tieneTablaSeguimiento(limpio), `${archivo} debería referenciar TABLA_SEGUIMIENTO`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Los componentes de Seguir y de "Lo que seguís": importan de los módulos
// permitidos y nunca tocan la base ellos mismos.
// ---------------------------------------------------------------------------
const COMPONENTES_DE_SEGUIR = [
  { ruta: 'apps/web/components/boton-seguir.tsx', importaDe: '@/lib/actions/radar' },
  { ruta: 'apps/web/app/perfil/lo-que-seguis.tsx', importaDe: '@/lib/actions/radar' },
  { ruta: 'apps/mobile/components/BotonSeguir.tsx', importaDe: '@/lib/radar' },
  { ruta: 'apps/mobile/components/LoQueSeguis.tsx', importaDe: '@/lib/radar' },
] as const

describe.each(COMPONENTES_DE_SEGUIR)('$ruta: importa de $importaDe y no toca la base', (caso) => {
  const contenido = readFileSync(join(REPO_ROOT, caso.ruta), 'utf8')
  const limpio = quitarComentarios(contenido)

  it(`importa cambiarSeguimiento (u obtenerLoQueSeguis) de "${caso.importaDe}"`, () => {
    const patron = new RegExp(`from\\s*['"]${caso.importaDe.replace('/', '\\/')}['"]`)
    expect(patron.test(limpio)).toBe(true)
  })

  it('no importa "supabase" (ni directo, ni de otro módulo de datos)', () => {
    expect(/\bsupabase\b/i.test(limpio)).toBe(false)
  })

  it('no tiene ningún .from(<tabla>) propio', () => {
    expect(/\.\s*from\s*\(/.test(limpio)).toBe(false)
  })

  it('no escribe directamente sobre ninguna de las tres tablas de seguimiento', () => {
    expect(tieneEscrituraSobreTablasDeSeguimiento(limpio)).toEqual([])
  })
})
