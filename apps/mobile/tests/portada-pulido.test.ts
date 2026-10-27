// R69, 69-q (QPS-354 y QPS-338): el pulido de la portada. Sin red ni base; la
// app no monta componentes en los tests, así que son detectores sobre el texto
// fuente (sin comentarios) más un cálculo puro de contraste.
//
// Cada detector es una función que devuelve las violaciones, y cada `describe`
// la prueba también sobre una COPIA EN MEMORIA del fuente real con la rotura
// aplicada (nunca se edita producción): si la rotura no produce violaciones, el
// test falla. Las roturas probadas:
//   - efecto de ChipsCategorias con deps `[]` en vez de `[seleccionada]`
//   - efecto que no trae el chip a la vista
//   - efecto con otra clave de respaldo (`?? 'todos'`) que la del onLayout/key
//   - (A2, ronda de correcciones) efecto que no limpia `posicionada`, sin la
//     guarda de una sola vez, o con el destino calculado a mano (en vez del
//     viejo "otro offset que el del onLayout", que ya no aplica)
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
// A2 (nube Q1, ronda de correcciones): el desplazamiento cambió de forma —
// el destino sale de `destinoScrollChip` (0 si el chip entra en la ventana
// visible, `x - 16` si no; lógica pura probada en `tests/portada-gratis.test.ts`)
// y se hace una sola vez por cada `seleccionada` (`traerALaVista` con la guarda
// `posicionada`, que el efecto limpia). El arreglo QPS-354 sigue igual de
// exigido: el efecto sobre `seleccionada` trae el chip a la vista (selección
// que cambia desde afuera), con la misma clave que el onLayout y el key.
export function violacionesDeScrollChip(fuente: string): string[] {
  const c = sinComentarios(fuente)
  const v: string[] = []

  const efecto = /useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\)/.exec(c)
  if (!efecto) return ['no hay un useEffect con arreglo de dependencias']
  const [, cuerpo, deps] = efecto

  if (!/\bseleccionada\b/.test(deps)) v.push('el efecto no depende de seleccionada')
  if (!/\btraerALaVista\(/.test(cuerpo)) v.push('el efecto no trae el chip a la vista')
  if (!/posicionada\.current = null/.test(cuerpo)) v.push('el efecto no limpia posicionada (una selección nueva no se volvería a posicionar)')

  // Clave: la misma `?? '<literal>'` en el efecto, en el onLayout y en el key.
  const claveEfecto = /traerALaVista\([^)]*seleccionada\s*\?\?\s*(['"][^'"]+['"])\s*\)/.exec(cuerpo)
  const claveLayout = /posiciones\.current\[\s*chip\.slug\s*\?\?\s*(['"][^'"]+['"])\s*\]\s*=\s*\{\s*x,\s*width\s*\}/.exec(c)
  const claveKey = /key=\{\s*chip\.slug\s*\?\?\s*(['"][^'"]+['"])\s*\}/.exec(c)
  if (!claveEfecto) v.push('el efecto no llama traerALaVista(…, seleccionada ?? <clave>)')
  if (!claveLayout) v.push('el onLayout no guarda posiciones.current[chip.slug ?? <clave>] = { x, width }')
  if (!claveKey) v.push('el chip no tiene key={chip.slug ?? <clave>}')
  if (claveEfecto && claveLayout && claveEfecto[1] !== claveLayout[1]) v.push('la clave de respaldo del efecto no es la del onLayout')
  if (claveEfecto && claveKey && claveEfecto[1] !== claveKey[1]) v.push('la clave de respaldo del efecto no es la del key')

  // El destino y la guarda de "una sola vez".
  const funcion = /function traerALaVista\([\s\S]*?\n\}\n/.exec(c)
  if (!funcion) v.push('no hay function traerALaVista')
  else {
    if (!/if \(posicionada\.current === clave\) return/.test(funcion[0])) v.push('traerALaVista no tiene la guarda de una sola vez por selección')
    // A3 (nube Q1, ronda de correcciones): vuelve al criterio de A2 (los filtros
    // salieron de la fila, así que "Todas" arranca en x = 16 y entra siempre).
    if (!/destinoScrollChip\(posiciones\.current\[clave\], anchoVisible\.current\)/.test(funcion[0])) v.push('el destino no sale de destinoScrollChip')
    if (!/scrollTo\(\{\s*x:\s*destino\b/.test(funcion[0])) v.push('traerALaVista no desplaza al destino')
  }
  if (!/anchoVisible\.current = evento\.nativeEvent\.layout\.width/.test(c)) v.push('el ScrollView no mide su ancho visible')
  if (/scrollTo\(\{\s*x:\s*Math\.max/.test(c)) v.push('hay un scrollTo con el destino calculado a mano')

  return v
}

describe('components/ChipsCategorias.tsx: el chip elegido vuelve a la vista (QPS-354)', () => {
  const real = leer('components', 'ChipsCategorias.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesDeScrollChip(real)).toEqual([])
  })

  it('el onLayout del activo se mantiene (primer posicionamiento al montar)', () => {
    expect(sinComentarios(real)).toMatch(/if \(activo\) traerALaVista\(/)
  })

  it.each([
    ['deps vacías', (s: string) => s.replace('}, [seleccionada])', '}, [])'), 'el efecto no depende de seleccionada'],
    [
      'efecto sin traer a la vista',
      (s: string) => s.replace("    traerALaVista(scrollRef, posiciones, anchoVisible, posicionada, seleccionada ?? 'todas')\n  }, [seleccionada])", '  }, [seleccionada])'),
      'el efecto no trae el chip a la vista',
    ],
    [
      'efecto que no limpia posicionada',
      (s: string) => s.replace('    posicionada.current = null\n', ''),
      'el efecto no limpia posicionada (una selección nueva no se volvería a posicionar)',
    ],
    [
      "clave del efecto distinta ('todos')",
      (s: string) => s.replace("posicionada, seleccionada ?? 'todas')\n  }, [seleccionada])", "posicionada, seleccionada ?? 'todos')\n  }, [seleccionada])"),
      'la clave de respaldo del efecto no es la del onLayout',
    ],
    [
      'onLayout que no guarda la medida',
      (s: string) => s.replace("posiciones.current[chip.slug ?? 'todas'] = { x, width }", 'void x'),
      'el onLayout no guarda posiciones.current[chip.slug ?? <clave>] = { x, width }',
    ],
    [
      'sin la guarda de una sola vez (la fila salta)',
      (s: string) => s.replace('  if (posicionada.current === clave) return\n', ''),
      'traerALaVista no tiene la guarda de una sola vez por selección',
    ],
    [
      'destino a mano (x - 16 siempre)',
      (s: string) => s.replace('scroll.current?.scrollTo({ x: destino, animated: false })', 'scroll.current?.scrollTo({ x: Math.max(0, (posiciones.current[clave]?.x ?? 0) - 16), animated: false })'),
      'hay un scrollTo con el destino calculado a mano',
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
  if (!/isCinemaMovie\s*\?\s*`\$\{evento\.title\}, en cartel/.test(sinComentarios(fuente))) {
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
// A2 (nube Q1, ronda de correcciones): lo que se anuncia pasó a ser
// `textoAnuncio` (el conteo si hay resultados, el texto del vacío si no;
// `anuncioDeLaGrilla`, probada en `tests/portada-gratis.test.ts`), y "primera
// vez" es que cambie el `tipoAnuncio` (cada nodo es otro en pantalla). La
// guarda contra la doble lectura en Android sigue igual.
export function violacionesDeAnuncio(fuente: string): string[] {
  const c = sinComentarios(fuente)
  const v: string[] = []
  if (!/announceForAccessibility\(\s*textoAnuncio\s*\)/.test(c)) v.push('no anuncia textoAnuncio')
  if (!/primeraVez\s*\|\|\s*Platform\.OS\s*===\s*'ios'\s*\)\s*AccessibilityInfo\.announceForAccessibility/.test(c)) {
    v.push("el anuncio no está guardado por `primeraVez || Platform.OS === 'ios'`")
  }
  if (!/const primeraVez = tipoAnunciado\.current !== tipoAnuncio/.test(c)) v.push('primeraVez no sale del cambio de tipo')
  if (!/\}, \[textoAnuncio, tipoAnuncio\]\)/.test(c)) v.push('el efecto del anuncio no depende de textoAnuncio y tipoAnuncio')
  return v
}

describe('app/(tabs)/index.tsx: anuncio del conteo de la categoría (QPS-354)', () => {
  const real = leer('app', '(tabs)', 'index.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesDeAnuncio(real)).toEqual([])
  })

  it.each([
    ['anuncia siempre (doble lectura en Android)', (s: string) => s.replace("if (primeraVez || Platform.OS === 'ios') AccessibilityInfo", 'if (true) AccessibilityInfo')],
    ['sin dependencia textoAnuncio', (s: string) => s.replace('}, [textoAnuncio, tipoAnuncio])', '}, [tipoAnuncio])')],
    ['no anuncia', (s: string) => s.replace('announceForAccessibility(textoAnuncio)', 'announceForAccessibility("")')],
    ['primera vez sin mirar el tipo', (s: string) => s.replace('const primeraVez = tipoAnunciado.current !== tipoAnuncio', 'const primeraVez = tipoAnunciado.current === null')],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesDeAnuncio(roto)).not.toEqual([])
  })
})
