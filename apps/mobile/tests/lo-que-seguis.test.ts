/**
 * R47, tarea 47-g (QPS-197): `components/LoQueSeguis.tsx` ("Lo que seguís"
 * en Cuenta: lugares, cuentas de Instagram y categorías, con "Dejar de
 * seguir").
 *
 * Por qué esto es solo detectores estáticos (no se importa el .tsx), con
 * prueba hecha: igual que `tests/fila-acciones.test.ts` documenta para
 * `FilaAccionesEvento.tsx`/`BotonSeguir.tsx`, `vitest.config.ts` corre en
 * `environment: 'node'` ("sin React Native"). Antes de escribir este
 * archivo se probó de verdad si se podía importar `filasDeLoQueSeguis`
 * desde `@/components/LoQueSeguis` (la función pura que pide el encargo):
 * Vitest/Rollup intenta transformar, por el import, todo el árbol de
 * módulos — incluido `components/LoQueSeguis.tsx` (que importa
 * 'react-native'/'expo-router' a nivel de módulo) — y la build falla al
 * llegar a `node_modules/react-native/index.js` con
 * `RollupError: Parse failure: Expected 'from', got 'typeOf'` (la fuente
 * de react-native usa sintaxis Flow, `import typeof * as ...`, que Rollup
 * no sabe parsear fuera de un bundler de RN). No hay forma de importar la
 * función pura sin arrastrar eso.
 *
 * Por eso, lo que sigue son detectores sobre el texto real de
 * `components/LoQueSeguis.tsx` — probados primero con fixtures en memoria
 * (mismo estilo que el resto del repo: "tiene que fallar de verdad") y
 * después aplicados al archivo real — más los dos chequeos que SÍ se
 * pueden hacer con imports de verdad (el detector de supabase transitivo,
 * que solo lee archivos con `node:fs`, sin resolver el módulo con
 * Vite/Rollup).
 */
import { existsSync, readFileSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUTA_COMPONENTE = join(MOBILE_ROOT, 'components', 'LoQueSeguis.tsx')
const CONTENIDO_CRUDO = readFileSync(RUTA_COMPONENTE, 'utf8')

/** Comentarios de línea y de bloque vaciados (mismo patrón que tests/asistencia-umbral.test.ts y tests/fila-acciones.test.ts). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

const CONTENIDO = quitarComentarios(CONTENIDO_CRUDO)

// ---------------------------------------------------------------------------
// filasDeLoQueSeguis: las tres listas -> filas, en el orden de los grupos.
// El riesgo real (lo dice el encargo): un copiar y pegar que manda 'lugar'
// para una cuenta o una categoría. El detector no evalúa la función (no se
// puede, ver la cabecera); en cambio, aísla el bloque de cada `.map(...)`
// (balanceando paréntesis) y confirma que SOLO tiene el literal de tipo que
// corresponde a esa lista — así, si alguien copia el bloque de `lugares` y
// solo cambia el nombre de la lista, pero no el literal 'lugar' de adentro,
// esto se rompe.
// ---------------------------------------------------------------------------

/** El argumento de `fn(...)` empezando justo después del "(" de apertura, balanceando paréntesis. */
function leerArgumentoBalanceado(content: string, desdeIndex: number): string {
  let profundidad = 1
  let j = desdeIndex
  for (; j < content.length; j++) {
    if (content[j] === '(') profundidad++
    else if (content[j] === ')') {
      profundidad--
      if (profundidad === 0) break
    }
  }
  return content.slice(desdeIndex, j)
}

/** El bloque `listas.<lista>.map(...)` completo (el argumento del `.map`), o null si no está. */
function bloqueMap(content: string, lista: string): string | null {
  const regex = new RegExp(`listas\\.${lista}\\.map\\s*\\(`)
  const m = regex.exec(content)
  if (!m) return null
  return leerArgumentoBalanceado(content, m.index + m[0].length)
}

describe('bloqueMap / leerArgumentoBalanceado (fixtures en memoria: tienen que fallar de verdad)', () => {
  it('aísla el argumento de listas.lugares.map(...), balanceando paréntesis anidados', () => {
    const fixture = `listas.lugares.map((lugar) => ({ tipo: 'lugar' as const, id: lugar.id })), otraCosa()`
    expect(bloqueMap(fixture, 'lugares')).toBe(`(lugar) => ({ tipo: 'lugar' as const, id: lugar.id })`)
  })

  it('devuelve null si la lista no aparece', () => {
    expect(bloqueMap('listas.lugares.map(() => ({}))', 'cuentas')).toBeNull()
  })
})

describe('components/LoQueSeguis.tsx: filasDeLoQueSeguis mapea cada lista a su propio tipo (sin copy-paste cruzado)', () => {
  it('exporta filasDeLoQueSeguis', () => {
    expect(CONTENIDO).toMatch(/export\s+function\s+filasDeLoQueSeguis\s*\(/)
  })

  it('lugares -> tipo "lugar" (y no "cuenta" ni "categoria")', () => {
    const bloque = bloqueMap(CONTENIDO, 'lugares')
    expect(bloque).not.toBeNull()
    expect(bloque).toMatch(/tipo:\s*'lugar'\s*as\s*const/)
    expect(bloque).not.toMatch(/tipo:\s*'cuenta'/)
    expect(bloque).not.toMatch(/tipo:\s*'categoria'/)
  })

  it('cuentas -> tipo "cuenta" (y no "lugar" ni "categoria"); la etiqueta es "@usuario"', () => {
    const bloque = bloqueMap(CONTENIDO, 'cuentas')
    expect(bloque).not.toBeNull()
    expect(bloque).toMatch(/tipo:\s*'cuenta'\s*as\s*const/)
    expect(bloque).not.toMatch(/tipo:\s*'lugar'/)
    expect(bloque).not.toMatch(/tipo:\s*'categoria'/)
    expect(bloque).toMatch(/etiqueta:\s*`@\$\{cuenta\.username\}`/)
  })

  it('categorias -> tipo "categoria" (y no "lugar" ni "cuenta")', () => {
    const bloque = bloqueMap(CONTENIDO, 'categorias')
    expect(bloque).not.toBeNull()
    expect(bloque).toMatch(/tipo:\s*'categoria'\s*as\s*const/)
    expect(bloque).not.toMatch(/tipo:\s*'lugar'/)
    expect(bloque).not.toMatch(/tipo:\s*'cuenta'/)
  })

  it('el orden de los grupos en el `return [...]` es lugares, cuentas, categorias', () => {
    const idxLugares = CONTENIDO.indexOf('listas.lugares.map')
    const idxCuentas = CONTENIDO.indexOf('listas.cuentas.map')
    const idxCategorias = CONTENIDO.indexOf('listas.categorias.map')
    expect(idxLugares).toBeGreaterThan(-1)
    expect(idxCuentas).toBeGreaterThan(idxLugares)
    expect(idxCategorias).toBeGreaterThan(idxCuentas)
  })
})

// ---------------------------------------------------------------------------
// "Dejar de seguir" arma `seguir: false` con el tipo correcto: el riesgo es
// que `dejarDeSeguir` use un tipo fijo en vez de `fila.tipo` (el mismo
// copy-paste, pero del lado de la escritura). El detector confirma que la
// llamada a cambiarSeguimiento usa `fila.tipo`/`fila.id` (no un literal), y
// que el `onPress` del botón le pasa la fila real (`dejarDeSeguir(fila)`,
// no un tipo fijo "a mano" por fuera del loop).
// ---------------------------------------------------------------------------
describe('components/LoQueSeguis.tsx: "Dejar de seguir" llama a cambiarSeguimiento con el tipo de la fila, no uno fijo', () => {
  it('escribe siempre a través de cambiarSeguimiento (lib/radar.ts)', () => {
    expect(CONTENIDO).toMatch(/from\s*['"]@\/lib\/radar['"]/)
    expect(CONTENIDO).toMatch(/cambiarSeguimiento\s*\(/)
  })

  it('la entrada de cambiarSeguimiento usa fila.tipo y fila.id (no un literal "lugar"/"cuenta"/"categoria" fijo)', () => {
    const m = /cambiarSeguimiento\s*\(\s*userId\s*,\s*\{([^}]*)\}\s*\)/.exec(CONTENIDO)
    expect(m).not.toBeNull()
    const entrada = m![1]
    expect(entrada).toMatch(/tipo:\s*fila\.tipo/)
    expect(entrada).toMatch(/id:\s*fila\.id/)
    expect(entrada).toMatch(/seguir:\s*false/)
    // Ninguno de los tres tipos como literal fijo adentro de la llamada.
    expect(entrada).not.toMatch(/tipo:\s*'(lugar|cuenta|categoria)'/)
  })

  it('el botón de cada fila pasa la fila real a dejarDeSeguir (no una fila fija por fuera del .map de cada grupo)', () => {
    expect(CONTENIDO).toMatch(/onPress=\{\(\)\s*=>\s*dejarDeSeguir\(fila\)\}/)
  })
})

// ---------------------------------------------------------------------------
// "Dejar de seguir": accesibilidad (obligatoria en todo lo nuevo, según el
// encargo) — accessibilityRole="button" (con accessibilityState de
// "busy", no "selected"/"checked": no es un toggle), y minHeight: 48.
// ---------------------------------------------------------------------------
describe('components/LoQueSeguis.tsx: accesibilidad del botón "Dejar de seguir"', () => {
  it('accessibilityRole="button"', () => {
    expect(CONTENIDO).toMatch(/accessibilityRole="button"/)
  })

  it('accessibilityLabel dice DE QUÉ es ("Dejar de seguir <etiqueta>", no un texto fijo repetido)', () => {
    expect(CONTENIDO).toMatch(/accessibilityLabel=\{`Dejar de seguir \$\{fila\.etiqueta\}`\}/)
  })

  it('accessibilityState usa "busy" (no "selected" ni "checked": no es un toggle)', () => {
    expect(CONTENIDO).toMatch(/accessibilityState=\{\{\s*busy:\s*ocupado\s*\}\}/)
    expect(CONTENIDO).not.toMatch(/accessibilityState=\{\{\s*selected:/)
    expect(CONTENIDO).not.toMatch(/accessibilityState=\{\{\s*checked:/)
  })

  it('minHeight: 48 en el estilo del botón', () => {
    const idxBoton = CONTENIDO.indexOf('boton:')
    expect(idxBoton).toBeGreaterThan(-1)
    const bloqueEstilo = CONTENIDO.slice(idxBoton, idxBoton + 120)
    expect(bloqueEstilo).toMatch(/minHeight:\s*48/)
  })

  it('disabled mientras está en vuelo (no se puede tocar dos veces la misma fila)', () => {
    expect(CONTENIDO).toMatch(/disabled=\{ocupado\}/)
  })
})

// ---------------------------------------------------------------------------
// Un grupo vacío no se dibuja; sin nada seguido, el mismo texto que la web
// y un acceso al Radar; estados de carga/error con EstadoCarga.
// ---------------------------------------------------------------------------
describe('components/LoQueSeguis.tsx: grupo vacío, vacío total y estados de carga/error', () => {
  it('un grupo sin filas no se dibuja (return null antes del encabezado del grupo)', () => {
    expect(CONTENIDO).toMatch(/if\s*\(\s*filasDelGrupo\.length\s*===\s*0\s*\)\s*return\s*null/)
  })

  it('sin nada seguido: el mismo texto que la web, con "Vacio" y un acceso al Radar', () => {
    expect(CONTENIDO_CRUDO).toContain(
      'Todavía no seguís nada. Seguí un lugar desde la ficha de un evento, o elegí categorías en el Radar.',
    )
    expect(CONTENIDO).toMatch(/<Vacio\s+mensaje=\{MENSAJE_SIN_NADA\}[^>]*textoAccion="Ir al Radar"/)
    expect(CONTENIDO).toMatch(/onAccion=\{\(\)\s*=>\s*router\.push\(\s*['"]\/radar['"]\s*\)\}/)
  })

  it('importa Cargando, ErrorCarga y Vacio de @/components/EstadoCarga (no reimplementa esos estados)', () => {
    expect(CONTENIDO).toMatch(
      /import\s*\{\s*Cargando,\s*ErrorCarga,\s*Vacio\s*\}\s*from\s*['"]@\/components\/EstadoCarga['"]/,
    )
  })

  it('el estado de error usa ErrorCarga con onReintentar (vuelve a llamar a cargar)', () => {
    expect(CONTENIDO).toMatch(/<ErrorCarga\s+mensaje=\{estado\.error\}\s+onReintentar=\{cargar\}/)
  })
})

// ---------------------------------------------------------------------------
// Nunca importa supabase, ni transitivamente por un import relativo local
// (mismo detector, probado igual, que tests/fila-acciones.test.ts).
// ---------------------------------------------------------------------------
function tieneImportSupabaseDirecto(contenido: string): boolean {
  const limpio = quitarComentarios(contenido)
  return /from\s*['"][^'"]*\/supabase['"]/.test(limpio) || /from\s*['"]supabase['"]/.test(limpio)
}

function importaSupabaseTransitivo(rutaInicial: string, visitados: Set<string> = new Set()): boolean {
  const ruta = resolve(rutaInicial)
  if (visitados.has(ruta) || !existsSync(ruta)) return false
  visitados.add(ruta)

  const contenido = readFileSync(ruta, 'utf8')
  if (tieneImportSupabaseDirecto(contenido)) return true

  const limpio = quitarComentarios(contenido)
  const relativos = [...limpio.matchAll(/from\s*['"](\.[^'"]+)['"]/g)].map((coincidencia) => coincidencia[1])

  for (const relativo of relativos) {
    const base = join(dirname(ruta), relativo)
    const candidato = [base, `${base}.ts`, `${base}.tsx`].find((posible) => existsSync(posible))
    if (candidato && importaSupabaseTransitivo(candidato, visitados)) return true
  }

  return false
}

describe('tieneImportSupabaseDirecto (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
  it('detecta un import con alias "@/lib/supabase"', () => {
    expect(tieneImportSupabaseDirecto(`import { supabase } from '@/lib/supabase'`)).toBe(true)
  })

  it('detecta un import relativo "./supabase"', () => {
    expect(tieneImportSupabaseDirecto(`import { supabase } from './supabase'`)).toBe(true)
  })

  it('un import a @/lib/radar (vía lib/, esperado) no cuenta', () => {
    expect(tieneImportSupabaseDirecto(`import { cambiarSeguimiento } from '@/lib/radar'`)).toBe(false)
  })

  it('un comentario que menciona "supabase" no cuenta (se descarta antes de buscar)', () => {
    const fixture = "// nunca importar supabase acá\nimport { cambiarSeguimiento } from '@/lib/radar'"
    expect(tieneImportSupabaseDirecto(fixture)).toBe(false)
  })
})

describe('importaSupabaseTransitivo (con archivos temporales reales: el recorrido relativo tiene que funcionar de verdad)', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('sigue un import relativo local hasta encontrar supabase, aunque el archivo de entrada no lo importe directo', () => {
    dir = mkdtempSync(join(tmpdir(), 'qps-lo-que-seguis-'))
    writeFileSync(join(dir, 'supabase.ts'), `export const supabase = null\n`)
    writeFileSync(join(dir, 'intermedio.ts'), `export { supabase } from './supabase'\n`)
    writeFileSync(join(dir, 'Componente.tsx'), `import { supabase } from './intermedio'\n`)

    expect(importaSupabaseTransitivo(join(dir, 'Componente.tsx'))).toBe(true)
  })

  it('sin ningún camino local hacia supabase: false', () => {
    dir = mkdtempSync(join(tmpdir(), 'qps-lo-que-seguis-'))
    writeFileSync(join(dir, 'otro.ts'), `export const x = 1\n`)
    writeFileSync(join(dir, 'Componente.tsx'), `import { x } from './otro'\nimport { cambiarSeguimiento } from '@/lib/radar'\n`)

    expect(importaSupabaseTransitivo(join(dir, 'Componente.tsx'))).toBe(false)
  })
})

// `@/lib/radar` SÍ usa supabase adentro, a propósito (es la arquitectura:
// las escrituras pasan por ahí); el recorrido de `importaSupabaseTransitivo`
// sigue imports RELATIVOS locales (`./...`), no los alias `@/lib/...` — así
// que, aplicado a LoQueSeguis.tsx, nunca "sigue" hasta `lib/radar.ts` (y no
// debería: ese archivo usa supabase legítimamente). Esto es lo mismo que ya
// documenta tests/fila-acciones.test.ts para BotonSeguir.tsx.
describe('LoQueSeguis.tsx: nunca importa supabase, ni transitivamente por un import relativo local', () => {
  it('LoQueSeguis.tsx', () => {
    expect(importaSupabaseTransitivo(RUTA_COMPONENTE)).toBe(false)
  })

  it('sanity check: @/lib/radar.ts sí importa supabase directo (para que el detector de arriba sea significativo)', () => {
    const libRadar = readFileSync(join(MOBILE_ROOT, 'lib', 'radar.ts'), 'utf8')
    expect(tieneImportSupabaseDirecto(libRadar)).toBe(true)
  })
})
