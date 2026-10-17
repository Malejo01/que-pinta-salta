/**
 * Tarea 38-q: el umbral del contador de "Voy / Me interesa", del lado de la
 * app. Hueco real, verificado por el lead: se rompió `cantidadVisible` a
 * mano (que devolviera siempre `n`, sin umbral) y la suite de `apps/mobile`
 * pasó entera en verde — ningún test de esta carpeta ejercitaba el umbral
 * (los tests de `packages/core`/`apps/web` lo cubren, pero el runner de
 * `apps/mobile` no los corre). Este archivo cierra ese hueco: importa
 * `textoBoton` exactamente como lo hace la app (`@qps/core/asistencia`, vía
 * el alias de `vitest.config.ts`) y afirma sobre el texto para cantidades
 * de los dos lados del umbral, más un detector estático de que
 * `BotonesAsistencia.tsx` muestra ese texto y no la cantidad cruda.
 *
 * Qué bug real deja en rojo cada bloque:
 *  - El bloque "textoBoton: tabla de cantidades" deja en rojo cualquier
 *    cambio al umbral (constante `UMBRAL_CONTADOR_ASISTENCIA`) o a
 *    `cantidadVisible` en `packages/core/src/asistencia/index.ts`: por
 *    ejemplo, que `cantidadVisible` devuelva siempre `n` (sin umbral), o que
 *    el umbral cambie de 3 a otro número.
 *  - El bloque "BotonesAsistencia.tsx: muestra textoBoton, no la cantidad
 *    cruda" deja en rojo que el componente deje de llamar a `textoBoton` y
 *    muestre `cantidad` (o `cantidades.voy`/`cantidades.meInteresa`) directo
 *    en un `<Text>`, lo que mostraría el número sin pasar nunca por el
 *    umbral ni por la etiqueta.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ETIQUETAS_ASISTENCIA, textoBoton, type TipoAsistencia } from '@qps/core/asistencia'

// ---------------------------------------------------------------------------
// textoBoton, para los dos tipos, con cantidades de los dos lados del
// umbral: 0, 1, 2 (sin número) y 3, 4, 10 (con número).
// ---------------------------------------------------------------------------
describe('textoBoton (importado tal como lo hace la app, desde @qps/core/asistencia)', () => {
  const tipos: TipoAsistencia[] = ['voy', 'me_interesa']

  describe.each(tipos)('tipo: %s', (tipo) => {
    it('cantidad 0: sin número', () => {
      expect(textoBoton(tipo, 0)).toBe(ETIQUETAS_ASISTENCIA[tipo])
    })

    it('cantidad 1: sin número', () => {
      expect(textoBoton(tipo, 1)).toBe(ETIQUETAS_ASISTENCIA[tipo])
    })

    it('cantidad 2 (justo debajo del umbral): sin número', () => {
      expect(textoBoton(tipo, 2)).toBe(ETIQUETAS_ASISTENCIA[tipo])
    })

    it('cantidad 3 (justo en el umbral, inclusive): con número', () => {
      expect(textoBoton(tipo, 3)).toBe(`${ETIQUETAS_ASISTENCIA[tipo]} · 3`)
    })

    it('cantidad 4: con número', () => {
      expect(textoBoton(tipo, 4)).toBe(`${ETIQUETAS_ASISTENCIA[tipo]} · 4`)
    })

    it('cantidad 10: con número', () => {
      expect(textoBoton(tipo, 10)).toBe(`${ETIQUETAS_ASISTENCIA[tipo]} · 10`)
    })
  })

  // Si alguien saca el umbral de cantidadVisible (lo hace devolver siempre
  // n), este caso puntual también lo detecta: con la regla rota, 0 y 1
  // mostrarían número, cosa que este test no admite.
  it('0 y 1 nunca muestran "· 0" ni "· 1" (si esto falla, el umbral se rompió)', () => {
    expect(textoBoton('voy', 0)).not.toContain('·')
    expect(textoBoton('voy', 1)).not.toContain('·')
    expect(textoBoton('me_interesa', 0)).not.toContain('·')
    expect(textoBoton('me_interesa', 1)).not.toContain('·')
  })
})

// ===========================================================================
// Detector estático: BotonesAsistencia.tsx muestra el texto que devuelve
// textoBoton, no la cantidad cruda. No se puede renderizar el componente en
// este entorno (vitest.config.ts: `environment: 'node'`, sin runner de React
// Native — ver la nota de esa config); mismo criterio que
// `tests/estado-carga-detector.test.ts` (detector estático sobre el código
// real, no un fixture).
// ===========================================================================

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUTA_COMPONENTE = `${MOBILE_ROOT}/components/BotonesAsistencia.tsx`

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto. */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/** `true` si el contenido importa `textoBoton` de `@qps/core/asistencia` (con o sin alias). */
function importaTextoBoton(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /import\s+(?:type\s+)?\{[^}]*\btextoBoton\b[^}]*\}\s*from\s*['"]@qps\/core\/asistencia['"]/.test(limpio)
}

/**
 * `true` si hay un `<Text ...>{algo}</Text>` cuyo contenido es una cantidad
 * cruda (una variable/propiedad que se llama o termina en "cantidad", o el
 * acceso directo a `cantidades.voy`/`cantidades.meInteresa`), en vez del
 * resultado de `textoBoton(...)`. Busca la FORMA de la interpolación, no un
 * nombre de componente fijo.
 */
function muestraCantidadCrudaEnTexto(content: string): boolean {
  const limpio = quitarComentarios(content)
  const regex = /<Text\b[^>]*>\s*\{\s*([^}]+?)\s*\}\s*<\/Text>/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(limpio))) {
    const expresion = m[1].trim()
    if (/\btextoBoton\s*\(/.test(expresion)) continue
    if (/\bcantidad(es)?\b/i.test(expresion)) return true
  }
  return false
}

describe('muestraCantidadCrudaEnTexto / importaTextoBoton (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
  it('detecta mostrar la cantidad cruda directo', () => {
    expect(muestraCantidadCrudaEnTexto('<Text>{cantidad}</Text>')).toBe(true)
  })

  it('detecta mostrar cantidades.voy directo', () => {
    expect(muestraCantidadCrudaEnTexto('<Text style={estilo}>{cantidades.voy}</Text>')).toBe(true)
  })

  it('llamar a textoBoton(tipo, cantidad) dentro del Text no cuenta como cantidad cruda: false', () => {
    expect(muestraCantidadCrudaEnTexto('<Text style={estilos.textoBoton}>{textoBoton(tipo, cantidad)}</Text>')).toBe(
      false,
    )
  })

  it('un Text con otro contenido cualquiera (sin relación a cantidad) no cuenta: false', () => {
    expect(muestraCantidadCrudaEnTexto('<Text>{MENSAJE_NO_DISPONIBLE}</Text>')).toBe(false)
  })

  it('un comentario que menciona "cantidad" no cuenta (se descarta antes de buscar)', () => {
    const fixture = '// acá se muestra la cantidad, nunca cruda\n<Text>{textoBoton(tipo, cantidad)}</Text>'
    expect(muestraCantidadCrudaEnTexto(fixture)).toBe(false)
  })

  it('importaTextoBoton detecta el import real, con alias', () => {
    expect(importaTextoBoton(`import { textoBoton as armar } from '@qps/core/asistencia'`)).toBe(true)
  })

  it('importaTextoBoton: sin textoBoton entre las llaves, false', () => {
    expect(importaTextoBoton(`import { siguienteMarca } from '@qps/core/asistencia'`)).toBe(false)
  })
})

describe('components/BotonesAsistencia.tsx: muestra textoBoton, no la cantidad cruda', () => {
  const contenido = readFileSync(RUTA_COMPONENTE, 'utf8')

  it('importa textoBoton de @qps/core/asistencia', () => {
    if (!importaTextoBoton(contenido)) {
      throw new Error('BotonesAsistencia.tsx: no importa "textoBoton" de "@qps/core/asistencia"')
    }
    expect(importaTextoBoton(contenido)).toBe(true)
  })

  it('llama a textoBoton con dos argumentos (tipo, cantidad)', () => {
    const limpio = quitarComentarios(contenido)
    expect(/\btextoBoton\s*\([^)]*,[^)]*\)/.test(limpio)).toBe(true)
  })

  it('ningún <Text> muestra la cantidad cruda en vez del resultado de textoBoton', () => {
    if (muestraCantidadCrudaEnTexto(contenido)) {
      throw new Error('BotonesAsistencia.tsx: parece mostrar la cantidad cruda, en vez de textoBoton(tipo, cantidad)')
    }
    expect(muestraCantidadCrudaEnTexto(contenido)).toBe(false)
  })
})

// ===========================================================================
// Punto 3 del encargo (38-q): "ninguna consulta pide el user_id de otro".
// `apps/web/tests/asistencia/web.test.ts` ya tiene este detector del lado
// web; `apps/mobile/tests/asistencia.test.ts` (otro teammate lo está
// escribiendo en paralelo, no se toca) todavía no lo tiene del lado app al
// momento de escribir esto: ningún test de esta carpeta falla si
// `lib/asistencia.ts` pidiera `select('user_id, kind')` (o `select('*')`)
// sobre `event_attendance`, ni si las cantidades se leyeran de otra tabla
// que no fuera la vista pública `event_attendance_counts`. Mismo criterio
// que el detector del lado web (adaptado al código de `apps/mobile`): se
// agrega acá, en el archivo que me toca del lado app, para no duplicar si
// el otro teammate ya lo cubre en el suyo.
// ===========================================================================

/** Empareja cada `.from('tabla')` con el primer `.select(...)` de su propia cadena (null si no hay). */
interface FromSelect {
  tabla: string
  columnas: string | null
}

function extraerFromSelect(contenido: string): FromSelect[] {
  const limpio = quitarComentarios(contenido)
  const fromRegex = /\.from\(\s*(['"`])([\w.]+)\1\s*\)/g
  const posiciones: Array<{ indexInicio: number; indexFin: number; tabla: string }> = []
  let m: RegExpExecArray | null
  while ((m = fromRegex.exec(limpio))) {
    posiciones.push({ indexInicio: m.index, indexFin: m.index + m[0].length, tabla: m[2] })
  }

  return posiciones.map((pos, i) => {
    const finDeCadena = i + 1 < posiciones.length ? posiciones[i + 1].indexInicio : limpio.length
    const cadena = limpio.slice(pos.indexFin, finDeCadena)
    const selectMatch = /\.select\(\s*(['"`])([\s\S]*?)\1\s*\)/.exec(cadena)
    return { tabla: pos.tabla, columnas: selectMatch ? selectMatch[2] : null }
  })
}

/** `null` si el select es legítimo; un mensaje si pide `user_id` o `*` sobre `event_attendance`. */
function selectProblematicoSobreAsistencia(tabla: string, columnas: string): string | null {
  if (tabla !== 'event_attendance') return null
  if (/\*/.test(columnas)) return `select con "*" sobre event_attendance (columnas: "${columnas}")`
  if (/\buser_id\b/.test(columnas)) return `select con "user_id" sobre event_attendance (columnas: "${columnas}")`
  return null
}

/** `true` si el string de columnas trae tanto "voy" como "me_interesa" (en cualquier orden/espaciado). */
function tieneColumnasDeCantidades(columnas: string): boolean {
  return /\bvoy\b/.test(columnas) && /\bme_interesa\b/.test(columnas)
}

/** Recorre recursivamente .ts/.tsx bajo `dir`, sin node_modules/dist/tests/.git. */
function listarArchivosDeCodigo(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'tests', '.git', '.expo'].includes(entrada.name)) continue
    const ruta = `${dir}/${entrada.name}`
    if (entrada.isDirectory()) {
      listarArchivosDeCodigo(ruta, acumulado)
    } else if (/\.(ts|tsx)$/.test(entrada.name) && !entrada.name.endsWith('.d.ts')) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

describe('extraerFromSelect / selectProblematicoSobreAsistencia / tieneColumnasDeCantidades (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
  it('detecta select("user_id, kind") sobre event_attendance', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance').select('user_id, kind').eq('event_id', id)`)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).not.toBeNull()
  })

  it('detecta select("*") sobre event_attendance, con comillas dobles', () => {
    const [r] = extraerFromSelect(`supabase.from("event_attendance").select("*")`)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).not.toBeNull()
  })

  it('un select("kind") legítimo sobre event_attendance no dispara nada', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance').select('kind').eq('event_id', id).maybeSingle()`)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).toBeNull()
  })

  it('cantidades leídas de otra tabla con las mismas columnas: tieneColumnasDeCantidades lo marca, y la tabla no es la vista pública', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance_totals').select('voy, me_interesa').eq('event_id', id)`)
    expect(tieneColumnasDeCantidades(r.columnas!)).toBe(true)
    expect(r.tabla).not.toBe('event_attendance_counts')
  })

  it('cantidades leídas de event_attendance_counts: la tabla es exactamente la vista pública', () => {
    const [r] = extraerFromSelect(
      `supabase.from('event_attendance_counts').select('voy, me_interesa').eq('event_id', id).maybeSingle()`,
    )
    expect(tieneColumnasDeCantidades(r.columnas!)).toBe(true)
    expect(r.tabla).toBe('event_attendance_counts')
  })

  it('un .from() sin .select() en su cadena (por ejemplo, un delete) da columnas null, no revienta', () => {
    const [r] = extraerFromSelect(`supabase.from('event_attendance').delete().eq('event_id', id)`)
    expect(r.columnas).toBeNull()
  })

  it('un comentario que menciona "user_id" no cuenta (se descarta antes de buscar)', () => {
    const fixture = '// nunca se pide user_id\nsupabase.from(\'event_attendance\').select(\'kind\').eq(\'event_id\', id)'
    const [r] = extraerFromSelect(fixture)
    expect(selectProblematicoSobreAsistencia(r.tabla, r.columnas!)).toBeNull()
  })
})

describe('detector estático: ningún select sobre event_attendance pide user_id o "*" (código real de apps/mobile)', () => {
  const MOBILE_ROOT_ABS = fileURLToPath(new URL('..', import.meta.url))
  const archivos = listarArchivosDeCodigo(MOBILE_ROOT_ABS)

  it('recorrió al menos un archivo (si esto da 0, el detector no está mirando nada)', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it('ningún select sobre event_attendance tiene user_id ni "*"', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas === null) continue
        const problema = selectProblematicoSobreAsistencia(tabla, columnas)
        if (problema) violaciones.push(`${archivo}: ${problema}`)
      }
    }
    expect(violaciones).toEqual([])
  })
})

describe('detector estático: la única tabla/vista de la que se leen "voy"/"me_interesa" es event_attendance_counts', () => {
  const MOBILE_ROOT_ABS = fileURLToPath(new URL('..', import.meta.url))
  const archivos = listarArchivosDeCodigo(MOBILE_ROOT_ABS)

  it('ningún select de columnas de cantidades aparece sobre otra tabla', () => {
    const violaciones: string[] = []
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas === null) continue
        if (tieneColumnasDeCantidades(columnas) && tabla !== 'event_attendance_counts') {
          violaciones.push(`${archivo}: select de cantidades sobre "${tabla}" (columnas: "${columnas}")`)
        }
      }
    }
    expect(violaciones).toEqual([])
  })

  it('al menos un archivo real sí lee cantidades de event_attendance_counts (si esto da 0, el detector de arriba pasaría por no mirar nada)', () => {
    let encontrado = false
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8')
      for (const { tabla, columnas } of extraerFromSelect(contenido)) {
        if (columnas && tieneColumnasDeCantidades(columnas) && tabla === 'event_attendance_counts') {
          encontrado = true
        }
      }
    }
    expect(encontrado).toBe(true)
  })
})
