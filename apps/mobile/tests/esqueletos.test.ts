// A1 (nube Q1): esqueletos de carga en Inicio, Buscar, Cines y la ficha de un
// evento (`components/Esqueleto.tsx`, con la parte pura en `lib/esqueleto.ts`).
//
// Dos partes, mismo estilo que `tests/estado-carga-detector.test.ts` y
// `tests/hero.test.ts`:
// 1. La lógica pura (`animacionEsqueleto`, `cantidadQueAsoma`,
//    `filasDeGrilla`), importada de verdad.
// 2. Detectores sobre el código fuente (no hay runner de React Native: el
//    componente y las pantallas se leen como texto, sin comentarios): las 4
//    pantallas usan su esqueleto en el estado `cargando` en vez de
//    `<Cargando />`; el componente esconde los bloques al lector de pantalla,
//    tiene un único elemento accesible "Cargando", consulta
//    `isReduceMotionEnabled` y escucha `reduceMotionChanged`, anima con el
//    driver nativo, limpia todo al desmontar y no usa colores fijos.
//
// QPS-250: este archivo no importa nada de otro `*.test.ts`; `quitarComentarios`
// es una copia de la de `tests/estado-carga-detector.test.ts`.
import { readFileSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  animacionEsqueleto,
  cantidadQueAsoma,
  DURACION_MEDIO_PULSO_MS,
  filasDeGrilla,
  OPACIDAD_MAXIMA,
  OPACIDAD_MINIMA,
} from '@/lib/esqueleto'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** `content` sin comentarios (de línea y de bloque, incluidos los `{/* … *\/}`
 * de JSX), conservando la cantidad de líneas. */


function leer(ruta: string): string {
  return readFileSync(join(MOBILE_ROOT, ruta), 'utf8')
}

function contar(texto: string, regex: RegExp): number {
  return (texto.match(regex) ?? []).length
}

// ===========================================================================
// 1. Lógica pura
// ===========================================================================
describe('animacionEsqueleto: pulso solo si "Reducir movimiento" está apagado', () => {
  it('apagado (false): anima', () => {
    expect(animacionEsqueleto(false)).toEqual({ anima: true, opacidadFija: OPACIDAD_MAXIMA })
  })

  it('prendido (true): no anima, opacidad fija', () => {
    expect(animacionEsqueleto(true)).toEqual({ anima: false, opacidadFija: OPACIDAD_MAXIMA })
  })

  it('todavía sin saber (null, la promesa no resolvió): no anima', () => {
    expect(animacionEsqueleto(null).anima).toBe(false)
    expect(animacionEsqueleto(null).opacidadFija).toBe(OPACIDAD_MAXIMA)
  })

  it('el pulso va de una opacidad visible a la plena, nunca a 0', () => {
    expect(OPACIDAD_MINIMA).toBeGreaterThan(0)
    expect(OPACIDAD_MINIMA).toBeLessThan(OPACIDAD_MAXIMA)
    expect(OPACIDAD_MAXIMA).toBeLessThanOrEqual(1)
    expect(DURACION_MEDIO_PULSO_MS).toBeGreaterThanOrEqual(500)
  })
})

describe('cantidadQueAsoma: cuántos bloques de una fila horizontal se ven', () => {
  const tarjetas = Array.from({ length: 6 }, () => 180)

  it('a 360 dp asoman 2 tarjetas de 180 (la segunda cortada), como en FilaCategoria', () => {
    expect(cantidadQueAsoma(360, tarjetas, 16, 20)).toBe(2)
  })

  it('a 412 dp siguen siendo 2; a 600, 3', () => {
    expect(cantidadQueAsoma(412, tarjetas, 16, 20)).toBe(2)
    expect(cantidadQueAsoma(600, tarjetas, 16, 20)).toBe(3)
  })

  it('una que arranca justo en el borde no cuenta (no se ve)', () => {
    // 16 + 100 + 4 = 120: la segunda arrancaría en x = 120.
    expect(cantidadQueAsoma(120, [100, 100], 16, 4)).toBe(1)
    expect(cantidadQueAsoma(121, [100, 100], 16, 4)).toBe(2)
  })

  it('con anchos distintos (chips): a 360 dp no se dibujan todos', () => {
    const chips = [84, 108, 96, 120, 92, 104]
    const cantidad = cantidadQueAsoma(360, chips, 16, 10)
    expect(cantidad).toBe(4)
    expect(cantidad).toBeLessThan(chips.length)
  })

  it('nunca más que los que hay, aunque sobre ancho', () => {
    expect(cantidadQueAsoma(5000, tarjetas, 16, 20)).toBe(tarjetas.length)
  })

  it('sin bloques: 0', () => {
    expect(cantidadQueAsoma(360, [], 16, 20)).toBe(0)
  })

  it('ancho no válido (0, negativo, NaN): 1, nunca una fila vacía', () => {
    expect(cantidadQueAsoma(0, tarjetas, 16, 20)).toBe(1)
    expect(cantidadQueAsoma(-10, tarjetas, 16, 20)).toBe(1)
    expect(cantidadQueAsoma(Number.NaN, tarjetas, 16, 20)).toBe(1)
  })
})

describe('filasDeGrilla: la grilla de 2 columnas de Buscar', () => {
  it('8 en 2 columnas: 4 filas completas', () => {
    expect(filasDeGrilla(8, 2)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ])
  })

  it('impar: la última fila queda con una', () => {
    expect(filasDeGrilla(5, 2)).toEqual([[0, 1], [2, 3], [4]])
  })

  it('0 o negativo: ninguna fila', () => {
    expect(filasDeGrilla(0, 2)).toEqual([])
    expect(filasDeGrilla(-3, 2)).toEqual([])
  })

  it('columnas < 1 se toma como 1', () => {
    expect(filasDeGrilla(2, 0)).toEqual([[0], [1]])
  })
})

describe('lib/esqueleto.ts es puro', () => {
  const src = leer('lib/esqueleto.ts')

  it('no importa react-native ni expo-*', () => {
    expect(src).not.toMatch(/from\s+['"]react-native['"]/)
    expect(src).not.toMatch(/from\s+['"]expo/)
  })
})

// ===========================================================================
// 2. Detectores sobre el código
// ===========================================================================
/** El cuerpo de `function nombre(...) { ... }` (de la llave que abre la función
 * hasta su llave de cierre, contando llaves). */
function cuerpoDeFuncion(src: string, nombre: string): string {
  const inicio = src.search(new RegExp(`function ${nombre}\\b`))
  if (inicio === -1) throw new Error(`no está la función ${nombre}`)
  // La llave del cuerpo es la primera `{` después del `)` que cierra la firma
  // seguida de `{` (puede haber un tipo de retorno con llaves, `): { ... } {`).
  const firma = src.slice(inicio).match(/\)(?::\s*(?:\{[^}]*\}|[^{]+))?\s*\{/)
  if (!firma || firma.index === undefined) throw new Error(`no encuentro el cuerpo de ${nombre}`)
  const apertura = inicio + firma.index + firma[0].length - 1
  let profundidad = 0
  for (let i = apertura; i < src.length; i += 1) {
    if (src[i] === '{') profundidad += 1
    else if (src[i] === '}') {
      profundidad -= 1
      if (profundidad === 0) return src.slice(apertura, i + 1)
    }
  }
  throw new Error(`la función ${nombre} no cierra`)
}

/** El cuerpo de `const nombre = useCallback(async () => { ... }`. */
function cuerpoDeCallback(src: string, nombre: string): string {
  const inicio = src.search(new RegExp(`const ${nombre} = useCallback\\(`))
  if (inicio === -1) throw new Error(`no está ${nombre}`)
  const apertura = src.indexOf('{', inicio)
  let profundidad = 0
  for (let i = apertura; i < src.length; i += 1) {
    if (src[i] === '{') profundidad += 1
    else if (src[i] === '}') {
      profundidad -= 1
      if (profundidad === 0) return src.slice(apertura, i + 1)
    }
  }
  throw new Error(`${nombre} no cierra`)
}

describe('cuerpoDeFuncion / cuerpoDeCallback (fixtures)', () => {
  it('recorta el cuerpo con llaves anidadas y tipo de retorno con llaves', () => {
    const src = 'function f(): { a: number } {\n  if (x) { y() }\n  return z\n}\nfunction g() {}'
    expect(cuerpoDeFuncion(src, 'f')).toBe('{\n  if (x) { y() }\n  return z\n}')
  })

  it('recorta el cuerpo de un useCallback', () => {
    const src = "const refrescar = useCallback(async () => {\n  a()\n  if (b) { c() }\n}, [d])"
    expect(cuerpoDeCallback(src, 'refrescar')).toBe('{\n  a()\n  if (b) { c() }\n}')
  })
})

describe('components/Esqueleto.tsx', () => {
  const crudo = leer('components/Esqueleto.tsx')
  const src = quitarComentarios(crudo)
  const pulso = cuerpoDeFuncion(src, 'usePulso')
  const pantalla = cuerpoDeFuncion(src, 'PantallaEsqueleto')

  it('exporta las 4 variantes y el contenedor base', () => {
    for (const nombre of ['EsqueletoPortada', 'EsqueletoBuscar', 'EsqueletoCines', 'EsqueletoFicha', 'PantallaEsqueleto', 'Bloque']) {
      expect(src).toMatch(new RegExp(`export function ${nombre}\\b`))
    }
  })

  it('un único elemento accesible: un solo accessibilityLabel="Cargando", un solo `accessible`', () => {
    expect(contar(src, /accessibilityLabel="Cargando"/g)).toBe(1)
    expect(contar(src, /accessibilityLabel=/g)).toBe(1)
    expect(contar(src, /\saccessible(?=[\s>/]|=\{true\})/g)).toBe(1)
  })

  it('el elemento accesible es una barra de progreso ocupada', () => {
    expect(src).toMatch(
      /accessible\s+accessibilityRole="progressbar"\s+accessibilityLabel="Cargando"\s+accessibilityState=\{\{\s*busy:\s*true\s*\}\}/,
    )
  })

  it('los bloques y su capa quedan ocultos al lector (iOS y Android)', () => {
    expect(contar(src, /accessibilityElementsHidden(?=[\s>/])/g)).toBeGreaterThanOrEqual(2)
    expect(contar(src, /importantForAccessibility="no-hide-descendants"/g)).toBeGreaterThanOrEqual(2)
    // La capa animada (hija del contenedor accesible) es la que los esconde.
    expect(src).toMatch(
      /<Animated\.View\s+accessibilityElementsHidden\s+importantForAccessibility="no-hide-descendants"/,
    )
    // El Bloque también, por si se usa suelto.
    expect(src).toMatch(/export function Bloque[\s\S]*?<View\s+accessibilityElementsHidden\s+importantForAccessibility="no-hide-descendants"/)
  })

  it('el contenedor accesible NO lleva no-hide-descendants (se escondería a sí mismo en Android)', () => {
    const apertura = src.match(/<View\s+accessible\b[\s\S]*?>/)
    expect(apertura).not.toBeNull()
    expect(apertura?.[0]).not.toMatch(/importantForAccessibility/)
    expect(apertura?.[0]).not.toMatch(/accessibilityElementsHidden/)
  })

  it('anidado: el View accesible es lo primero que devuelve y CONTIENE al Animated.View oculto (no al revés)', () => {
    const jsx = pantalla.slice(pantalla.indexOf('return ('))
    const abreVista = jsx.search(/<View\s+accessible\b/)
    const abreCapa = jsx.search(/<Animated\.View\s+accessibilityElementsHidden\s+importantForAccessibility="no-hide-descendants"/)
    const hijos = jsx.indexOf('{children}')
    const cierraCapa = jsx.indexOf('</Animated.View>')
    const cierraVista = jsx.lastIndexOf('</View>')
    // Lo primero después de `return (` es el View accesible.
    expect(jsx).toMatch(/^return \(\s*<View\s+accessible\b/)
    expect(abreVista).toBeGreaterThan(-1)
    expect(abreCapa).toBeGreaterThan(abreVista)
    expect(hijos).toBeGreaterThan(abreCapa)
    expect(cierraCapa).toBeGreaterThan(hijos)
    expect(cierraVista).toBeGreaterThan(cierraCapa)
  })

  it('"Reducir movimiento" sale del hook compartido (lib/reducir-movimiento.ts), no de uno propio', () => {
    expect(src).toMatch(/import\s*\{\s*useReducirMovimiento\s*\}\s*from\s*'@\/lib\/reducir-movimiento'/)
    expect(pulso).toMatch(/animacionEsqueleto\(useReducirMovimiento\(\)\)/)
    expect(src).not.toMatch(/function useReducirMovimiento\b/)
    expect(src).not.toMatch(/AccessibilityInfo/)
  })

  it('anima con Animated.loop y el driver nativo (nunca useNativeDriver: false), lo arranca y lo para en el cleanup', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bAnimated\b[^}]*\}\s*from\s*'react-native'/)
    expect(pulso).toMatch(/const pulso = Animated\.loop\(/)
    expect(contar(pulso, /useNativeDriver:\s*true/g)).toBe(2)
    expect(src).not.toMatch(/useNativeDriver:\s*false/)
    expect(pulso).toMatch(/\n\s*pulso\.start\(\)/)
    expect(pulso).toMatch(/return \(\) => \{\s*pulso\.stop\(\)/)
    // Sin animación: opacidad fija y salida temprana, antes de armar el loop.
    expect(pulso).toMatch(/if \(!anima\) \{\s*opacidad\.setValue\(opacidadFija\)\s*return undefined\s*\}/)
  })

  it('el efecto del pulso depende solo de anima, opacidadFija y opacidad (no se reinicia en cada render)', () => {
    const deps = pulso.match(/\}, \[([^\]]*)\]\)\s*\n\s*return \{ opacidad, anima \}/)
    expect(deps).not.toBeNull()
    const lista = (deps?.[1] ?? '').split(',').map((d) => d.trim()).filter(Boolean).sort()
    expect(lista).toEqual(['anima', 'opacidad', 'opacidadFija'])
    // `opacidad` es estable (sale de useState con inicializador), no un `new` por render.
    expect(pulso).toMatch(/const \[opacidad\] = useState\(\(\) => new Animated\.Value\(OPACIDAD_MAXIMA\)\)/)
  })

  it('la capa animada tiene la opacidad conectada SOLO cuando anima, y textura de hardware mientras anima', () => {
    expect(pantalla).toMatch(/const \{ opacidad, anima \} = usePulso\(\)/)
    const capa = pantalla.match(/<Animated\.View\b[\s\S]*?>/)?.[0] ?? ''
    expect(capa).toMatch(/style=\{anima \? \{ opacity: opacidad \} : undefined\}/)
    expect(capa).toMatch(/renderToHardwareTextureAndroid=\{anima\}/)
  })

  it('colores: los bloques con colorBloqueEsqueleto/colorBloqueEncima (lib/colores.ts), nunca muted; sin hex ni rgb a mano', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bcolorBloqueEncima\b[^}]*\bcolorBloqueEsqueleto\b[^}]*\}\s*from\s*'@\/lib\/colores'/)
    expect(src).toMatch(/backgroundColor: encima \? colorBloqueEncima\(colores\) : colorBloqueEsqueleto\(colores\)/)
    // Los fondos llenos (Hero, afiche de película, afiche de la ficha, caja de precio).
    expect(contar(src, /backgroundColor: colorBloqueEsqueleto\(colores\) \}/g)).toBe(4)
    expect(src).not.toMatch(/colores\.muted\b/)
    expect(src).toMatch(/useColoresQPS\(\)/)
    expect(src).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/)
    expect(src).not.toMatch(/rgba?\(/)
    expect(src).not.toMatch(/['"](white|black|gray|grey)['"]/)
  })

  it('sin texto visible nuevo (no dibuja Text ni Texto)', () => {
    expect(src).not.toMatch(/<Text\b/)
    expect(src).not.toMatch(/<Texto\b/)
  })

  it('el ancho sale de useWindowDimensions (nunca Dimensions a nivel de módulo) y las filas cortan con overflow hidden', () => {
    expect(src).toMatch(/useWindowDimensions\(\)/)
    expect(src).not.toMatch(/\bDimensions\.get\b/)
    expect(src).toMatch(/cantidadQueAsoma\(/)
    expect(src).toMatch(/filaQueAsoma:\s*\{[^}]*overflow:\s*'hidden'/)
  })

  it('Buscar: los chips con el paddingBottom de ChipsCategorias y el título con su línea y su marginBottom', () => {
    expect(src).toMatch(/chipsBuscar:\s*\{[^}]*paddingBottom:\s*12/)
    expect(src).toMatch(/tituloBuscar:\s*\{\s*marginTop:\s*2,\s*marginBottom:\s*14\s*\}/)
    expect(contar(src, /style=\{estilos\.tituloBuscar\}/g)).toBe(2)
  })
})

describe('lib/reducir-movimiento.ts (el hook compartido)', () => {
  const src = quitarComentarios(leer('lib/reducir-movimiento.ts'))
  const hook = cuerpoDeFuncion(src, 'useReducirMovimiento')

  it('consulta isReduceMotionEnabled y escucha reduceMotionChanged, con remove() al desmontar', () => {
    expect(hook).toMatch(/AccessibilityInfo\.isReduceMotionEnabled\(\)/)
    expect(hook).toMatch(/AccessibilityInfo\.addEventListener\(\s*'reduceMotionChanged'/)
    expect(hook).toMatch(/return \(\) => \{\s*montado = false\s*suscripcion\.remove\(\)/)
  })

  it('el setState va en el callback (de la promesa y del listener), nunca suelto en el efecto', () => {
    expect(hook).toMatch(/\.then\(\(valor\)\s*=>\s*\{\s*if \(montado\) setReducir\(valor\)/)
    expect(hook).toMatch(/'reduceMotionChanged',\s*\(valor\)\s*=>\s*\{\s*if \(montado\) setReducir\(valor\)/)
    expect(contar(hook, /setReducir\(/g)).toBe(2)
  })

  it('arranca en null (sin saber) y se exporta', () => {
    expect(src).toMatch(/export function useReducirMovimiento\(\): boolean \| null/)
    expect(hook).toMatch(/useState<boolean \| null>\(null\)/)
  })
})

describe('components/PillsAtajos.tsx respeta "Quitar animaciones"', () => {
  const src = quitarComentarios(leer('components/PillsAtajos.tsx'))

  it('usa el hook compartido', () => {
    expect(src).toMatch(/import\s*\{\s*useReducirMovimiento\s*\}\s*from\s*'@\/lib\/reducir-movimiento'/)
    expect(src).toMatch(/const reducir = useReducirMovimiento\(\)/)
  })

  it('sin reducir === false (prendido o sin saber) y en la primera medida: setValue, nunca spring', () => {
    expect(src).toMatch(
      /if \(!posicionado\.current \|\| reducir !== false\) \{\s*posicionado\.current = true\s*animX\.setValue\(medida\.x\)\s*animWidth\.setValue\(medida\.width\)\s*return\s*\}\s*Animated\.spring/,
    )
    expect(contar(src, /Animated\.spring\(/g)).toBe(2)
    expect(src).toMatch(/\}, \[atajo, medidas, animX, animWidth, reducir\]\)/)
  })
})

const PANTALLAS = [
  { ruta: 'app/(tabs)/index.tsx', esqueleto: 'EsqueletoPortada', conRefresco: true },
  { ruta: 'app/(tabs)/buscar.tsx', esqueleto: 'EsqueletoBuscar', conRefresco: true },
  { ruta: 'app/cines.tsx', esqueleto: 'EsqueletoCines', conRefresco: true },
  { ruta: 'app/evento/[id].tsx', esqueleto: 'EsqueletoFicha', conRefresco: false },
] as const

describe.each(PANTALLAS)('$ruta: esqueleto en vez de <Cargando /> en la carga inicial', ({ ruta, esqueleto, conRefresco }) => {
  const src = quitarComentarios(leer(ruta))

  it(`importa ${esqueleto} de @/components/Esqueleto`, () => {
    expect(src).toMatch(new RegExp(`import\\s*\\{\\s*${esqueleto}\\s*\\}\\s*from\\s*'@/components/Esqueleto'`))
  })

  it(`el estado 'cargando' dibuja <${esqueleto}`, () => {
    // Ternario en el JSX (`estado.tipo === 'cargando' ? <X`) o rama con
    // `if (estado.tipo === 'cargando') { return (... <X ...) }` (la ficha).
    const ternario = new RegExp(`estado\\.tipo === 'cargando' \\? <${esqueleto}\\b`)
    const rama = new RegExp(`if \\(estado\\.tipo === 'cargando'\\) \\{\\s*return \\([\\s\\S]{0,600}?<${esqueleto} />\\s*</View>\\s*\\)\\s*\\}`)
    expect(ternario.test(src) || rama.test(src)).toBe(true)
    expect(contar(src, new RegExp(`<${esqueleto}\\b`, 'g'))).toBe(1)
  })

  it('ya no usa ni importa Cargando', () => {
    expect(src).not.toMatch(/<Cargando\b/)
    expect(src).not.toMatch(/import\s*\{[^}]*\bCargando\b[^}]*\}\s*from\s*'@\/components\/EstadoCarga'/)
  })

  it('no suma otro "Cargando" accesible por su cuenta (el único es el del esqueleto)', () => {
    expect(src).not.toMatch(/accessibilityLabel="Cargando"/)
  })

  if (conRefresco) {
    it('el pull-to-refresh no cambia: sigue el RefreshControl con `refrescando`', () => {
      expect(src).toMatch(/<RefreshControl refreshing=\{refrescando\} onRefresh=\{refrescar\}/)
    })

    it('el cuerpo de `refrescar` nunca pasa por el estado cargando (no muestra el esqueleto)', () => {
      const cuerpo = cuerpoDeCallback(src, 'refrescar')
      expect(cuerpo).toMatch(/setRefrescando\(true\)/)
      expect(cuerpo).not.toMatch(/cargando/i)
      expect(cuerpo).not.toMatch(/\bcargar\(\)/)
    })
  }
})

describe('app/(tabs)/buscar.tsx elige el esqueleto con la misma condición que la lista', () => {
  const src = quitarComentarios(leer('app/(tabs)/buscar.tsx'))

  it('pasa resultados={mostrarResultados}', () => {
    expect(src).toMatch(/<EsqueletoBuscar resultados=\{mostrarResultados\} \/>/)
    expect(src).toMatch(/estado\.tipo === 'ok' && mostrarResultados \?/)
  })
})

describe('app/evento/[id].tsx: con ?patrocinado=1, la franja real arriba y FUERA del esqueleto', () => {
  const src = quitarComentarios(leer('app/evento/[id].tsx'))

  it('la rama cargando dibuja AvisoPatrocinado antes de EsqueletoFicha, como hermano (no adentro)', () => {
    expect(src).toMatch(
      /if \(estado\.tipo === 'cargando'\) \{\s*return \(\s*<View[^>]*>\s*\{esAvisoPatrocinado && session \? \(\s*<View style=\{estilos\.avisoCargando\}>\s*<AvisoPatrocinado \/>\s*<\/View>\s*\) : null\}\s*<EsqueletoFicha \/>/,
    )
  })
})

describe('Cargando sigue existiendo para las demás pantallas', () => {
  it('components/EstadoCarga.tsx lo sigue exportando', () => {
    expect(leer('components/EstadoCarga.tsx')).toMatch(/export function Cargando\(/)
  })
})
