// 36-b (G1 del feedback del teléfono 2, ops/rondas/36-feedback-telefono-2):
// el Hero de la portada pasa de un alto fijo (`ALTO_HERO = 200`) a
// `altoHero(altoVentana)`, ~60 % del alto de la ventana, leído con
// `useWindowDimensions()` DENTRO del componente — nunca `Dimensions` a nivel
// de módulo (QPS-132, mismo criterio que `tests/dimensions.test.ts`).
//
// No hay `@testing-library/react-native` en el repo (mismo motivo que
// `tests/portada.test.ts`): `components/Hero.tsx` importa React Native, así
// que no se puede `import`ar acá. Por eso:
//   1. `altoHero` se re-testea con una copia local idéntica (mismo patrón
//      que `eventosHero` en `tests/portada.test.ts`), y un chequeo estático
//      aparte confirma que el archivo real define la función con la MISMA
//      fórmula (no solo que "existe" con cualquier cuerpo).
//   2. El resto son detectores sobre el texto del archivo real
//      (`readFileSync`), con los comentarios saneados ANTES de buscar nada:
//      así ni un `// const ALTO_HERO = 200` dejado comentado al lado de la
//      versión buena, ni un comentario que solo *menciona* `Dimensions` o
//      `useWindowDimensions`, puede pasar o reprobar el detector por
//      accidente. Cada detector exige la presencia concreta de lo bueno Y la
//      ausencia concreta de lo malo — no solo una de las dos.
import { readFileSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const HERO_PATH = join(MOBILE_ROOT, 'components', 'Hero.tsx')

// ---------------------------------------------------------------------------
// Saneado de comentarios (mismo criterio que `lineasConDimensions` de
// `tests/dimensions.test.ts` y `sinComentarios` de `tests/portada-atajos.test.ts`,
// pero devolviendo el texto completo en vez de líneas con el número): bloques
// `/* ... */` y comentarios de línea, cuidando no cortar por el `//` de una
// URL (`https://...`) dentro de un comentario.
// ---------------------------------------------------------------------------


describe('sinComentarios (fixtures en memoria: tiene que sanear de verdad)', () => {
  it('saca un comentario de línea sin tocar el código real de esa línea', () => {
    expect(sinComentarios('const alto = 1 // ALTO_HERO = 200, viejo')).toBe('const alto = 1')
  })

  it('saca un comentario de línea completo dejado al lado del código bueno', () => {
    const contenido = ['// const ALTO_HERO = 200', 'const alto = altoHero(altoVentana)'].join('\n')
    expect(sinComentarios(contenido)).toBe('\nconst alto = altoHero(altoVentana)')
  })

  it('saca un bloque /* ... */ de una sola línea', () => {
    expect(sinComentarios('const x = 1 /* Dimensions.get viejo */ + 2')).toBe('const x = 1  + 2')
  })

  it('saca un bloque /* ... */ que se extiende en varias líneas', () => {
    const contenido = ['/**', ' * Dimensions.get("window"), ALTO_HERO = 200 (viejo, ya no se usa)', ' */', 'const x = 1'].join('\n')
    expect(sinComentarios(contenido)).toBe('\n\n\nconst x = 1')
  })

  it('no corta por el "//" de una URL dentro de un comentario', () => {
    expect(sinComentarios('// ver https://reactnative.dev/docs/usewindowdimensions')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// `altoHero`: copia local idéntica a la de `components/Hero.tsx` (no se
// puede `import`ar el archivo real, ver el comentario de arriba).
// ---------------------------------------------------------------------------
function altoHero(altoVentana: number): number {
  return Math.round(altoVentana * 0.6)
}

describe('altoHero (copia local, fixtures en memoria)', () => {
  it('390×844 (celular chico/medio, vertical): ~506, con tolerancia de ±1', () => {
    expect(Math.abs(altoHero(844) - 506)).toBeLessThanOrEqual(1)
  })

  it('360×780 (celular chico, vertical): ~468, con tolerancia de ±1', () => {
    expect(Math.abs(altoHero(780) - 468)).toBeLessThanOrEqual(1)
  })

  it('es, en efecto, el 60% redondeado (no una constante que por casualidad da esos números)', () => {
    expect(altoHero(1000)).toBe(600)
    expect(altoHero(500)).toBe(300)
    // 333 * 0.6 = 199.8 -> redondea a 200 (confirma el redondeo, no un truncado)
    expect(altoHero(333)).toBe(200)
  })

  it('acompaña la rotación: con el ancho y el alto de la ventana invertidos (horizontal), da otro alto', () => {
    // 844x390 en vertical pasa a 390 de alto en horizontal.
    expect(altoHero(390)).not.toBe(altoHero(844))
    expect(altoHero(390)).toBe(234)
  })
})

// ---------------------------------------------------------------------------
// Detectores sobre el archivo real, con los comentarios ya saneados.
// ---------------------------------------------------------------------------
describe('components/Hero.tsx: lectura estática (comentarios saneados antes de cualquier chequeo)', () => {
  const crudo = readFileSync(HERO_PATH, 'utf8')
  const contenido = sinComentarios(crudo)

  it('el archivo se leyó (no está vacío) y sigue siendo el Hero', () => {
    expect(contenido.length).toBeGreaterThan(500)
    expect(contenido).toMatch(/export function Hero\(/)
  })

  it('no usa Dimensions (ni Dimensions.get ni un import de Dimensions, con o sin alias) fuera de comentarios', () => {
    expect(contenido).not.toMatch(/\bDimensions\b/)
  })

  it('no queda ningún 200 fijo (ni ALTO_HERO = 200 ni otro número suelto) fuera de comentarios', () => {
    expect(contenido).not.toMatch(/\b200\b/)
  })

  it('no reimplementa el alto fijo con otra constante numérica a nivel de módulo (p. ej. ALTO_HERO = 253)', () => {
    // Nada de "ALTO_HERO = <número>" fuera de comentarios: el alto tiene que
    // salir SIEMPRE de altoHero(altoVentana), nunca de una constante.
    expect(contenido).not.toMatch(/\bALTO_HERO\s*=\s*\d/)
  })

  it('usa useWindowDimensions, importado de react-native, Y llamado de verdad (no solo importado)', () => {
    expect(contenido).toMatch(/import\s*\{[^}]*\buseWindowDimensions\b[^}]*\}\s*from\s*['"]react-native['"]/)
    expect(contenido).toMatch(/\buseWindowDimensions\s*\(\s*\)/)
  })

  it('define altoHero con la MISMA fórmula que la copia local (exportada, Math.round, *0.6 o equivalente ~60%)', () => {
    const idx = contenido.indexOf('function altoHero(')
    expect(idx).toBeGreaterThan(-1)
    expect(contenido.slice(0, idx)).toMatch(/export\s*$/m) // "export function altoHero(" visto desde atrás
    const cierre = contenido.indexOf('\n}', idx)
    expect(cierre).toBeGreaterThan(idx)
    const cuerpo = contenido.slice(idx, cierre)
    expect(cuerpo).toMatch(/Math\.round\(/)
    // El parámetro es el alto de la ventana, no uno fijo: el cuerpo lo usa de verdad,
    // multiplicado por el factor (literal 0.6, o una constante que valga 0.6 —
    // se acepta cualquiera de las dos formas, pero no una constante con OTRO valor).
    expect(cuerpo).toMatch(/altoVentana/)
    const multiplicacion =
      cuerpo.match(/altoVentana\s*\*\s*(\w+(?:\.\d+)?)/) ?? cuerpo.match(/(\w+(?:\.\d+)?)\s*\*\s*altoVentana/)
    expect(multiplicacion).not.toBeNull()
    const factor = multiplicacion![1]
    if (/^\d/.test(factor)) {
      expect(factor).toMatch(/^0\.6\d*$/)
    } else {
      // Es un identificador: tiene que estar declarado como 0.6 en el archivo
      // (en cualquier otra parte, no solo dentro del cuerpo de la función).
      expect(contenido).toMatch(new RegExp(`\\b${factor}\\s*=\\s*0\\.6\\b`))
    }
  })

  it('el valor de altoHero se usa para el alto del contenedor del carrusel (no queda sin usar)', () => {
    expect(contenido).toMatch(/const\s+alto\s*=\s*altoHero\(/)
    expect(contenido).toMatch(/height:\s*alto\b/)
  })

  it('el ancho de cada diapositiva sale de useWindowDimensions (misma fuente que el alto, para que getItemLayout no se desalinee)', () => {
    expect(contenido).toMatch(/const\s*\{\s*width:\s*ancho\s*,\s*height:\s*altoVentana\s*\}\s*=\s*useWindowDimensions\(\)/)
  })

  it('getItemLayout usa "ancho" (el mismo valor que el width de cada diapositiva, nunca un número aparte)', () => {
    const idx = contenido.indexOf('getItemLayout=')
    expect(idx).toBeGreaterThan(-1)
    const bloque = contenido.slice(idx, idx + 200)
    expect(bloque).toMatch(/length:\s*ancho\b/)
    expect(bloque).toMatch(/offset:\s*ancho\s*\*\s*index\b/)
  })

  it('cada diapositiva (DiapositivaHero) recibe el mismo "ancho" y "alto" que calculó Hero (no otra medida)', () => {
    expect(contenido).toMatch(/<DiapositivaHero\s+evento=\{item\}\s+ancho=\{ancho\}\s+alto=\{alto\}/)
  })
})

// ---------------------------------------------------------------------------
// Autoplay: sigue limpiando su setInterval al desmontar, con el mismo
// temporizador que arrancó (no uno "suelto" sin relación).
// ---------------------------------------------------------------------------
describe('components/Hero.tsx: el autoplay limpia su setInterval al desmontar', () => {
  const crudo = readFileSync(HERO_PATH, 'utf8')
  const contenido = sinComentarios(crudo)

  it('setInterval está dentro de un useEffect', () => {
    const idxSetInterval = contenido.indexOf('setInterval(')
    expect(idxSetInterval).toBeGreaterThan(-1)
    const antes = contenido.slice(Math.max(0, idxSetInterval - 400), idxSetInterval)
    expect(antes).toMatch(/useEffect\(/)
  })

  it('el temporizador que arranca setInterval es el MISMO que limpia clearInterval (misma variable)', () => {
    const asignacion = contenido.match(/const\s+(\w+)\s*=\s*setInterval\(/)
    expect(asignacion).not.toBeNull()
    const nombre = asignacion![1]
    expect(contenido).toMatch(new RegExp(`return\\s*\\(\\)\\s*=>\\s*clearInterval\\(\\s*${nombre}\\s*\\)`))
  })

  // 49-f (QPS-246): se suma "lectorActivo" a los deps. No alcanza con un
  // `useRef` para esquivar este chequeo: un `ref` no dispara una nueva
  // corrida del efecto, así que cuando alguien prende TalkBack con el Hero
  // ya montado, el `setInterval` que ya estaba corriendo seguiría disparando
  // (el `if (lectorActivo) return` de más arriba en el cuerpo del efecto
  // nunca llegaría a ejecutarse de nuevo). Tiene que ser `useState`, y ese
  // estado tiene que estar en los deps para que React vuelva a correr el
  // efecto (y recién ahí salga antes de armar el temporizador) en el momento
  // exacto en que cambia.
  it('el efecto del intervalo depende de "indice" (se reinicia al deslizar), "slides.length" y "lectorActivo" (si no, al prender TalkBack el intervalo que ya corría no se frena: WCAG 2.2.2)', () => {
    expect(contenido).toMatch(/\}, \[indice, slides\.length, lectorActivo\]\)/)
  })
})
