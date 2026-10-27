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
function quitarComentarios(content: string): string {
  const lineasDeTexto = content.split('\n')
  const resultado: string[] = []
  let dentroDeBloqueComentario = false

  for (let linea of lineasDeTexto) {
    if (dentroDeBloqueComentario) {
      const finBloque = linea.indexOf('*/')
      if (finBloque === -1) {
        resultado.push('')
        continue
      }
      linea = linea.slice(finBloque + 2)
      dentroDeBloqueComentario = false
    }

    // Bloques que abren y cierran en la misma línea.
    linea = linea.replace(/\/\*.*?\*\//g, '')

    const inicioBloque = linea.indexOf('/*')
    if (inicioBloque !== -1) {
      linea = linea.slice(0, inicioBloque)
      dentroDeBloqueComentario = true
    }

    const idxComentarioDeLinea = linea.search(/(^|\s)\/\//)
    resultado.push(idxComentarioDeLinea === -1 ? linea : linea.slice(0, idxComentarioDeLinea))
  }

  return resultado.join('\n')
}

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
describe('components/Esqueleto.tsx', () => {
  const crudo = leer('components/Esqueleto.tsx')
  const src = quitarComentarios(crudo)

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

  it('consulta isReduceMotionEnabled y escucha reduceMotionChanged, con remove() al desmontar', () => {
    expect(src).toMatch(/AccessibilityInfo\.isReduceMotionEnabled\(\)/)
    expect(src).toMatch(/AccessibilityInfo\.addEventListener\(\s*'reduceMotionChanged'/)
    expect(src).toMatch(/suscripcion\.remove\(\)/)
  })

  it('el setState del ajuste va en el callback (de la promesa y del listener), nunca suelto en el efecto', () => {
    expect(src).toMatch(/\.then\(\(valor\)\s*=>\s*\{\s*if \(montado\) setReducir\(valor\)/)
    expect(src).toMatch(/'reduceMotionChanged',\s*\(valor\)\s*=>\s*\{\s*if \(montado\) setReducir\(valor\)/)
    expect(contar(src, /setReducir\(/g)).toBe(2)
  })

  it('anima con Animated.loop y el driver nativo (nunca useNativeDriver: false), y lo para en el cleanup', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bAnimated\b[^}]*\}\s*from\s*'react-native'/)
    expect(src).toMatch(/Animated\.loop\(/)
    expect(contar(src, /useNativeDriver:\s*true/g)).toBeGreaterThanOrEqual(2)
    expect(src).not.toMatch(/useNativeDriver:\s*false/)
    expect(src).toMatch(/return \(\) => \{\s*pulso\.stop\(\)/)
    // La decisión de animar sale de la función pura.
    expect(src).toMatch(/animacionEsqueleto\(reducir\)/)
  })

  it('solo colores del tema: useColoresQPS, sin hex ni rgb escritos a mano', () => {
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
    expect(src).toMatch(new RegExp(`estado\\.tipo === 'cargando'\\)?\\s*(\\?|return)\\s*<${esqueleto}\\b`))
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
  }
})

describe('Cargando sigue existiendo para las demás pantallas', () => {
  it('components/EstadoCarga.tsx lo sigue exportando', () => {
    expect(leer('components/EstadoCarga.tsx')).toMatch(/export function Cargando\(/)
  })
})
