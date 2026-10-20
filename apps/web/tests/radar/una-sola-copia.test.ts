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
 *
 * ## El punto ciego cerrado (R56, QPS-253): `.from(<algo que no es un literal>)`
 *
 * Hasta la R54 todo lo de arriba solo reconocía `.from('literal')`: un
 * `.from(variable)` armado con una tabla resuelta en tiempo de ejecución
 * esquivaba el detector entero (está probado abajo con el fixture
 * `admin.from(tabla)`, que sigue dando `[]` A PROPÓSITO en el detector de
 * escrituras sobre las tres tablas — ese detector sigue acotado a esas tres
 * tablas por nombre). Lo que se agrega acá es OTRO detector, más general:
 * busca TODA llamada `<identificador>.from(<argumento>)` en los mismos seis
 * directorios donde el argumento NO es un literal simple (ni una cadena
 * `'...'`/`"..."` sin concatenar, ni un template sin `${`), salvo que el
 * identificador sea uno de los estáticos nativos de JS que también se
 * llaman `.from` y no tienen nada que ver con Supabase: `Array.from`,
 * `Buffer.from` y los `*Array.from` de los typed arrays (hay docenas en el
 * repo, p. ej. para generar fixtures de test o decodificar buffers; ninguno
 * toca una tabla).
 *
 * Cada `.from(no-literal)` real que sobrevive a esa exclusión entra en
 * `ARCHIVOS_PERMITIDOS_PARA_FROM_NO_LITERAL`, con su archivo y su motivo. El
 * inventario (hecho a mano sobre el código real, no supuesto) encontró dos
 * familias:
 *
 *   - Los dos `radar.ts` (web y app): `.from(tablaDeSeguimiento(tabla))`,
 *     el mapeo tipado que ya vigila el detector de arriba.
 *   - Cinco módulos que suben a Supabase Storage con
 *     `supabase.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET)`: el
 *     argumento es el nombre del BUCKET (una constante de configuración),
 *     no una tabla de Postgres — no es del alcance de "una sola copia".
 *
 * Una `.from(variable)` nueva en cualquier otro archivo hace fallar el
 * test, con un mensaje que dice: "si es una tabla `user_followed_*`, va en
 * el módulo del Radar; si no, sumala a la lista con su motivo". Y cada
 * entrada de la lista se vuelve a comprobar contra el archivo real: si
 * alguien borra el `.from(...)` que la justificaba (o el archivo entero),
 * el test queda en rojo en vez de pasar en verde por omisión.
 *
 * Evasiones conocidas que siguen abiertas (no las cierra este detector,
 * porque dejan de ser texto que matchee `identificador.from(`):
 *   - Acceso por corchete: `supabase['from'](tabla)`.
 *   - Una referencia indirecta al método: `const f = supabase.from; f(tabla)`
 *     o `supabase.from.bind(supabase)(tabla)`.
 *   - Un método con otro nombre que delegue a `.from(...)` adentro (el
 *     detector mira el TEXTO, no ejecuta el código).
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

// ---------------------------------------------------------------------------
// El punto ciego cerrado (R56, QPS-253): TODA llamada `.from(<algo que no es
// un literal>)`, no solo las tres tablas de seguimiento. Ver el comentario de
// cabecera para el porqué de cada exclusión.
// ---------------------------------------------------------------------------

/** Estáticos nativos de JS que también se llaman `.from` y no tocan Supabase. */
const RECEPTORES_FROM_NATIVOS_EXCLUIDOS = new Set([
  'Array',
  'Buffer',
  'Uint8Array',
  'Int8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
])

/** `true` si `argumento` (el texto entre los paréntesis de un `.from(...)`) es un literal simple. */
function esArgumentoDeFromLiteral(argumento: string): boolean {
  const a = argumento.trim()
  if (/^'(?:[^'\\]|\\.)*'$/.test(a)) return true
  if (/^"(?:[^"\\]|\\.)*"$/.test(a)) return true
  if (/^`[^`$]*`$/.test(a)) return true // template sin ${...}: también es un literal
  return false
}

/**
 * Busca toda llamada `<identificador>.from(<argumento>)` en `contenidoSinComentarios`
 * cuyo `<identificador>` NO sea uno de los nativos de JS de arriba y cuyo
 * `<argumento>` NO sea un literal simple. Devuelve el receptor y el
 * argumento (recortado) de cada una encontrada.
 */
function llamadasFromNoLiteral(contenidoSinComentarios: string): { receptor: string; argumento: string }[] {
  const resultado: { receptor: string; argumento: string }[] = []
  const patronInicio = /([A-Za-z_$][\w$]*)\s*\.\s*from\s*\(/g
  let m: RegExpExecArray | null
  while ((m = patronInicio.exec(contenidoSinComentarios)) !== null) {
    const receptor = m[1]
    if (RECEPTORES_FROM_NATIVOS_EXCLUIDOS.has(receptor)) continue

    // Balancear paréntesis para encontrar el cierre de ESTE .from(, sin
    // confundirlo con el de una llamada anidada como tablaDeSeguimiento(tabla).
    let profundidad = 1
    let i = patronInicio.lastIndex
    while (i < contenidoSinComentarios.length && profundidad > 0) {
      const c = contenidoSinComentarios[i]
      if (c === '(') profundidad++
      else if (c === ')') profundidad--
      i++
    }
    const argumento = contenidoSinComentarios.slice(patronInicio.lastIndex, i - 1).trim()
    patronInicio.lastIndex = i

    if (argumento && !esArgumentoDeFromLiteral(argumento)) {
      resultado.push({ receptor, argumento })
    }
  }
  return resultado
}

/**
 * Lista de permitidos para `.from(no-literal)`: cada entrada es un
 * `.from(...)` real del código (inventariado a mano, no supuesto) cuyo
 * argumento no es un literal, con el motivo por el que no es una escritura
 * nueva sobre una tabla fuera de control. Los dos `radar.ts` ya están
 * cubiertos por el detector de TABLA_SEGUIMIENTO de arriba; los otros cinco
 * son buckets de Storage, no tablas.
 */
const ARCHIVOS_PERMITIDOS_PARA_FROM_NO_LITERAL = [
  {
    archivo: 'apps/web/lib/actions/radar.ts',
    motivo: '.from(tablaDeSeguimiento(tabla)): el mapeo tipado TABLA_SEGUIMIENTO, ya vigilado arriba.',
  },
  {
    archivo: 'apps/mobile/lib/radar.ts',
    motivo: '.from(tablaDeSeguimiento(tabla)): mismo mapeo, versión app, ya vigilado arriba.',
  },
  {
    archivo: 'apps/web/lib/instagram/process-apify-payload.ts',
    motivo:
      '.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET): nombre de un bucket de Storage (constante de ' +
      'configuración), no una tabla de Postgres.',
  },
  {
    archivo: 'apps/web/lib/recurrentes/generar.ts',
    motivo: '.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET): idem, bucket de Storage.',
  },
  {
    archivo: 'apps/web/lib/scraper/save-to-supabase.ts',
    motivo: '.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET): idem, bucket de Storage.',
  },
  {
    archivo: 'apps/web/lib/scraper/cinema-scraper.ts',
    motivo: '.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET): idem, bucket de Storage.',
  },
  {
    archivo: 'apps/web/app/api/cron/scrape/run-scrape-job.ts',
    motivo: '.storage.from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET): idem, bucket de Storage.',
  },
] as const

const RUTAS_PERMITIDAS_PARA_FROM_NO_LITERAL = new Set<string>(ARCHIVOS_PERMITIDOS_PARA_FROM_NO_LITERAL.map((e) => e.archivo))

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

  it('.from(tabla) con una variable (no un literal) no matchea EL DETECTOR DE LAS TRES TABLAS: es el caso de lib/cuenta/eliminar.ts, que NO está en el alcance de este archivo (sí lo atrapa el detector general de .from(no-literal) de más abajo)', () => {
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

describe('llamadasFromNoLiteral: el detector funciona de verdad (fixtures en memoria)', () => {
  it('un .from(variable) con una tabla de seguimiento armada en una variable: lo detecta (el caso que evadía el detector de las tres tablas)', () => {
    const fixture = `const t = 'user_followed_venues'\nsupabase.from(t).insert({ user_id, venue_id })`
    expect(llamadasFromNoLiteral(fixture)).toEqual([{ receptor: 'supabase', argumento: 't' }])
  })

  it('un .from(\'literal\') SÍ es seguro: no lo marca (ya lo vigila, si corresponde, el detector de arriba)', () => {
    expect(llamadasFromNoLiteral(`supabase.from('events').select()`)).toEqual([])
  })

  it('.from(tablaDeSeguimiento(tabla)) (llamada anidada): se detecta como no-literal, con el argumento completo', () => {
    const fixture = `await supabase.from(tablaDeSeguimiento(tabla)).insert(fila)`
    expect(llamadasFromNoLiteral(fixture)).toEqual([{ receptor: 'supabase', argumento: 'tablaDeSeguimiento(tabla)' }])
  })

  it('Array.from(...) NO se confunde con un .from() de Supabase (estático nativo de JS, excluido a propósito)', () => {
    expect(llamadasFromNoLiteral(`const ids = Array.from(new Set(rows.map((r) => r.id)))`)).toEqual([])
  })

  it('Buffer.from(...) tampoco se confunde (otro estático nativo de JS)', () => {
    expect(llamadasFromNoLiteral(`const buf = Buffer.from(arrayBuffer)`)).toEqual([])
  })

  it('Uint8Array.from(...) tampoco (typed array nativo)', () => {
    expect(llamadasFromNoLiteral(`const bytes = Uint8Array.from([1, 2, 3])`)).toEqual([])
  })

  it('un .storage.from(constante) (bucket de Storage, no una tabla): el detector SÍ lo marca igual — la excepción vive en la lista de permitidos, no en el detector', () => {
    const fixture = `await supabase.storage\n  .from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET)\n  .upload(path, buffer)`
    expect(llamadasFromNoLiteral(fixture)).toEqual([{ receptor: 'storage', argumento: 'INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET' }])
  })

  it('un template sin ${...} es un literal (no lo marca)', () => {
    expect(llamadasFromNoLiteral('supabase.from(`events`).select()')).toEqual([])
  })

  it('un template CON ${...} no es un literal (sí lo marca)', () => {
    const fixture = 'supabase.from(`user_${tabla}`).select()'
    expect(llamadasFromNoLiteral(fixture)).toEqual([{ receptor: 'supabase', argumento: '`user_${tabla}`' }])
  })
})

describe('cualquier .from(<algo que no es un literal>) aparece solo en los módulos permitidos (R56, QPS-253)', () => {
  it('ningún archivo fuera de la lista permitida tiene un .from(no-literal)', () => {
    const hallazgos: string[] = []
    for (const archivo of ARCHIVOS) {
      if (RUTAS_PERMITIDAS_PARA_FROM_NO_LITERAL.has(archivo)) continue
      const limpio = quitarComentarios(readFileSync(join(REPO_ROOT, archivo), 'utf8'))
      const llamadas = llamadasFromNoLiteral(limpio)
      if (llamadas.length > 0) {
        for (const { receptor, argumento } of llamadas) {
          hallazgos.push(
            `${archivo}: ${receptor}.from(${argumento}) — si es una tabla user_followed_*, va en el módulo del ` +
              `Radar; si no, sumala a ARCHIVOS_PERMITIDOS_PARA_FROM_NO_LITERAL con su motivo`,
          )
        }
      }
    }
    expect(hallazgos, hallazgos.join('\n')).toEqual([])
  })

  it('cada archivo permitido SIGUE teniendo de verdad su .from(no-literal) (si lo perdiera, o se borrara el archivo, esto tiene que quedar en rojo, no en verde por omisión)', () => {
    for (const { archivo, motivo } of ARCHIVOS_PERMITIDOS_PARA_FROM_NO_LITERAL) {
      const limpio = quitarComentarios(readFileSync(join(REPO_ROOT, archivo), 'utf8'))
      const llamadas = llamadasFromNoLiteral(limpio)
      expect(llamadas.length, `${archivo} ya no tiene ningún .from(no-literal) — motivo registrado: "${motivo}"`).toBeGreaterThan(0)
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
