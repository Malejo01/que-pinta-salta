// R69, 69-q (QPS-354 y QPS-338): el pulido de la portada. Sin red ni base; la
// app no monta componentes en los tests, así que son detectores sobre el texto
// fuente (sin comentarios) más un cálculo puro de contraste.
//
// Cada detector es una función que devuelve las violaciones, y cada `describe`
// la prueba también sobre una COPIA EN MEMORIA del fuente real con la rotura
// aplicada (nunca se edita producción): si la rotura no produce violaciones, el
// test falla. Las roturas probadas:
//   - efecto de ChipsCategorias con deps `[]` en vez de `[seleccionada]`
//   - efecto sin `scrollTo`
//   - efecto con otra clave de respaldo (`?? 'todos'`) que la del onLayout/key
//   - efecto con otro offset (8) que el del onLayout (16)
//   - la tarjeta mostrando la fecha para una película (sin "En cartel")
//   - la tarjeta mostrando "En cartel" para todos
//   - borde inactivo más claro que el mínimo (#555555 / #9a9a9a)
//   - el anuncio del conteo sin la guarda `primeraVez || iOS`
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformMovie } from '@qps/core/home/transform'
import { contraste, cumpleContraste } from '@/lib/accesibilidad'
import { bordeChipInactivo } from '@/lib/colores'
import { COLORES_CLARO, COLORES_OSCURO } from '@/lib/theme'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

// ---------------------------------------------------------------------------
// 4. ChipsCategorias: el chip elegido vuelve a la vista
// ---------------------------------------------------------------------------
export function violacionesDeScrollChip(fuente: string): string[] {
  const c = sinComentarios(fuente)
  const v: string[] = []

  const efecto = /useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\)/.exec(c)
  if (!efecto) return ['no hay un useEffect con arreglo de dependencias']
  const [, cuerpo, deps] = efecto

  if (!/\bseleccionada\b/.test(deps)) v.push('el efecto no depende de seleccionada')
  if (!/\bscrollTo\(/.test(cuerpo)) v.push('el efecto no llama a scrollTo')

  // Clave: la misma `?? '<literal>'` en el efecto, en el onLayout y en el key.
  const claveEfecto = /posiciones\.current\[\s*seleccionada\s*\?\?\s*(['"][^'"]+['"])\s*\]/.exec(cuerpo)
  const claveLayout = /posiciones\.current\[\s*chip\.slug\s*\?\?\s*(['"][^'"]+['"])\s*\]\s*=/.exec(c)
  const claveKey = /key=\{\s*chip\.slug\s*\?\?\s*(['"][^'"]+['"])\s*\}/.exec(c)
  if (!claveEfecto) v.push('el efecto no lee posiciones.current[seleccionada ?? <clave>]')
  if (!claveLayout) v.push('el onLayout no guarda posiciones.current[chip.slug ?? <clave>]')
  if (!claveKey) v.push('el chip no tiene key={chip.slug ?? <clave>}')
  if (claveEfecto && claveLayout && claveEfecto[1] !== claveLayout[1]) v.push('la clave de respaldo del efecto no es la del onLayout')
  if (claveEfecto && claveKey && claveEfecto[1] !== claveKey[1]) v.push('la clave de respaldo del efecto no es la del key')

  // Offset: `x - N` del scrollTo del efecto igual al del onLayout.
  const offsetEfecto = /scrollTo\(\{\s*x:\s*Math\.max\(0,\s*x\s*-\s*(\d+)\)/.exec(cuerpo)
  const resto = c.slice(c.indexOf(efecto[0]) + efecto[0].length)
  const offsetLayout = /scrollTo\(\{\s*x:\s*Math\.max\(0,\s*x\s*-\s*(\d+)\)/.exec(resto)
  if (!offsetEfecto) v.push('el scrollTo del efecto no es Math.max(0, x - N)')
  if (!offsetLayout) v.push('el scrollTo del onLayout no es Math.max(0, x - N)')
  if (offsetEfecto && offsetLayout && offsetEfecto[1] !== offsetLayout[1]) v.push('el offset del efecto no es el del onLayout')

  return v
}

describe('components/ChipsCategorias.tsx: el chip elegido vuelve a la vista (QPS-354)', () => {
  const real = leer('components', 'ChipsCategorias.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesDeScrollChip(real)).toEqual([])
  })

  it('el onLayout del activo se mantiene (primer posicionamiento al montar)', () => {
    expect(sinComentarios(real)).toMatch(/if \(activo\) scrollRef\.current\?\.scrollTo\(/)
  })

  it.each([
    ['deps vacías', (s: string) => s.replace('}, [seleccionada])', '}, [])'), 'el efecto no depende de seleccionada'],
    ['efecto sin scrollTo', (s: string) => s.replace(/if \(x !== undefined\) scrollRef\.current\?\.scrollTo\([^\n]*\)\n/, ''), 'el efecto no llama a scrollTo'],
    [
      "clave del efecto distinta ('todos')",
      (s: string) => s.replace("posiciones.current[seleccionada ?? 'todas']", "posiciones.current[seleccionada ?? 'todos']"),
      'la clave de respaldo del efecto no es la del onLayout',
    ],
    [
      'offset del efecto distinto (8)',
      (s: string) => s.replace('const x = posiciones.current[seleccionada ?? \'todas\']\n    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16)', 'const x = posiciones.current[seleccionada ?? \'todas\']\n    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - 8)'),
      'el offset del efecto no es el del onLayout',
    ],
    [
      'onLayout que no guarda la x',
      (s: string) => s.replace("posiciones.current[chip.slug ?? 'todas'] = x", 'void x'),
      'el onLayout no guarda posiciones.current[chip.slug ?? <clave>]',
    ],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real) // la rotura se aplicó de verdad
    expect(violacionesDeScrollChip(roto)).toContain(esperada)
  })
})

// ---------------------------------------------------------------------------
// 5. TarjetaEvento: "En cartel" en vez de la fecha para una película
// ---------------------------------------------------------------------------
/** Contenido del <Text style={estilos.fecha} ...> de la tarjeta. */
function textoDeFecha(fuente: string): string | null {
  const m = /<Text\s+style=\{estilos\.fecha\}[^>]*>([\s\S]*?)<\/Text>/.exec(sinComentarios(fuente))
  return m ? m[1] : null
}

export function violacionesDeEnCartel(fuente: string): string[] {
  const v: string[] = []
  const contenido = textoDeFecha(fuente)
  if (contenido === null) return ['no se encontró el <Text style={estilos.fecha}>']
  const m = /\{\s*evento\.isCinemaMovie\s*\?\s*'En cartel'\s*:\s*([\s\S]*)\}\s*$/.exec(contenido)
  if (!m) {
    v.push("la fecha no es `evento.isCinemaMovie ? 'En cartel' : <fecha>`")
  } else if (!/\$\{fecha\}/.test(m[1])) {
    v.push('la rama de eventos no muestra la fecha')
  }
  if (!/isCinemaMovie\s*\?\s*`\$\{evento\.title\}, en cartel`/.test(sinComentarios(fuente))) {
    v.push('la etiqueta de accesibilidad de la película no dice "en cartel"')
  }
  return v
}

describe('components/TarjetaEvento.tsx: "En cartel" para películas (QPS-338)', () => {
  const real = leer('components', 'TarjetaEvento.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesDeEnCartel(real)).toEqual([])
  })

  it.each([
    [
      'la película muestra la fecha',
      (s: string) => s.replace("evento.isCinemaMovie ? 'En cartel' : `${fecha}${evento.time ? ` ${evento.time}` : ''}`", '`${fecha}${evento.time ? ` ${evento.time}` : \'\'}`'),
    ],
    [
      "'En cartel' para todos (sin fecha en la rama de eventos)",
      (s: string) => s.replace("evento.isCinemaMovie ? 'En cartel' : `${fecha}${evento.time ? ` ${evento.time}` : ''}`", "evento.isCinemaMovie ? 'En cartel' : `${evento.venue}`"),
    ],
    [
      'la etiqueta de accesibilidad pierde "en cartel"',
      (s: string) => s.replace('${evento.title}, en cartel', '${evento.title}'),
    ],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesDeEnCartel(roto)).not.toEqual([])
  })

  // Hallazgo a reportar: ¿una película puede traer `occurrences` > 1 y mostrar
  // "+N fechas" debajo de "En cartel"? `occurrences` solo lo arma
  // `groupEventItems` (core) y solo para EVENTOS; `transformMovie` no lo pone.
  it('una película armada por transformMovie no trae occurrences (nunca "+N fechas" bajo "En cartel")', () => {
    const peli = transformMovie(
      { id: '11111111-1111-4111-8111-111111111111', slug: 'pelicula-de-prueba', title: 'Película de Prueba', poster_url: null, showings: {}, created_at: '2026-10-01T12:00:00.000Z' },
      '2026-10-26',
    )
    expect(peli.isCinemaMovie).toBe(true)
    expect(peli.occurrences).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 6. Contraste del borde de los chips inactivos (WCAG 1.4.11, >= 3:1)
// ---------------------------------------------------------------------------
describe('bordeChipInactivo: contraste >= 3:1 contra el fondo de la portada (QPS-338)', () => {
  it.each([
    ['oscuro', COLORES_OSCURO],
    ['claro', COLORES_CLARO],
  ])('esquema %s', (_nombre, colores) => {
    const borde = bordeChipInactivo(colores)
    expect(borde).toMatch(/^#[0-9a-f]{6}$/i)
    const razon = contraste(borde, colores.background)
    expect(razon, `contraste ${borde} sobre ${colores.background} = ${razon.toFixed(2)}`).toBeGreaterThanOrEqual(3)
    expect(cumpleContraste(razon, 'componente')).toBe(true)
  })

  it('el token border global NO llega a 3:1 (por eso hace falta un borde propio)', () => {
    expect(contraste(COLORES_OSCURO.border, COLORES_OSCURO.background)).toBeLessThan(3)
    expect(contraste(COLORES_CLARO.border, COLORES_CLARO.background)).toBeLessThan(3)
  })

  it('el cálculo discrimina: bordes más suaves (#555555 oscuro, #9a9a9a claro) no pasan', () => {
    expect(contraste('#555555', COLORES_OSCURO.background)).toBeLessThan(3)
    expect(contraste('#9a9a9a', COLORES_CLARO.background)).toBeLessThan(3)
  })

  it('claro y oscuro devuelven bordes distintos', () => {
    expect(bordeChipInactivo(COLORES_OSCURO)).not.toBe(bordeChipInactivo(COLORES_CLARO))
  })

  it('ChipsCategorias usa bordeChipInactivo para el chip inactivo (no el token border)', () => {
    const c = sinComentarios(leer('components', 'ChipsCategorias.tsx'))
    expect(c).toMatch(/borderColor:\s*bordeInactivo/)
    expect(c).toMatch(/const bordeInactivo = bordeChipInactivo\(colores\)/)
    expect(c).not.toMatch(/borderColor:\s*colores\.border\b/)
  })
})

// ---------------------------------------------------------------------------
// Anuncio del conteo al aparecer (QPS-354)
// ---------------------------------------------------------------------------
export function violacionesDeAnuncio(fuente: string): string[] {
  const c = sinComentarios(fuente)
  const v: string[] = []
  if (!/announceForAccessibility\(\s*textoConteo\s*\)/.test(c)) v.push('no anuncia textoConteo')
  if (!/primeraVez\s*\|\|\s*Platform\.OS\s*===\s*'ios'\s*\)\s*AccessibilityInfo\.announceForAccessibility/.test(c)) {
    v.push("el anuncio no está guardado por `primeraVez || Platform.OS === 'ios'`")
  }
  if (!/\}, \[textoConteo\]\)/.test(c)) v.push('el efecto del anuncio no depende de textoConteo')
  return v
}

describe('app/(tabs)/index.tsx: anuncio del conteo de la categoría (QPS-354)', () => {
  const real = leer('app', '(tabs)', 'index.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesDeAnuncio(real)).toEqual([])
  })

  it.each([
    ['anuncia siempre (doble lectura en Android)', (s: string) => s.replace("if (primeraVez || Platform.OS === 'ios') AccessibilityInfo", 'if (true) AccessibilityInfo')],
    ['sin dependencia textoConteo', (s: string) => s.replace('}, [textoConteo])', '}, [])')],
    ['no anuncia', (s: string) => s.replace('announceForAccessibility(textoConteo)', 'announceForAccessibility("")')],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesDeAnuncio(roto)).not.toEqual([])
  })
})
