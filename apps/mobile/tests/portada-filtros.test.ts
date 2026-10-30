// R81, 81-a: la cabecera de la portada en UNA fila. Sin red ni base. Tiene dos
// partes:
//   1. La lógica pura de `lib/portada-filtros.ts` (cuántos filtros hay activos,
//      cómo se llama el botón «Filtros», los chips removibles, «Ver N eventos»).
//   2. Detectores sobre el fuente (la app no monta componentes en los tests,
//      como `tests/portada-cabecera.test.ts`): la cabecera de `index.tsx` tiene
//      UNA sola fila fija (y falla si vuelven las tres de antes), la hoja de
//      `components/HojaFiltros.tsx` es un `Modal` con `onRequestClose` que
//      respeta «Reducir movimiento», y los textos de accesibilidad del botón.
// Los fuentes se leen SIN comentarios (con un scanner de caracteres), para que
// un comentario que nombra algo no tape una rotura.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  chipsRemovibles,
  contarFiltrosActivos,
  etiquetaAccesibleFiltros,
  etiquetaVisibleFiltros,
  textoVerEventos,
} from '../lib/portada-filtros'

// ---------------------------------------------------------------------------
// 1. Lógica pura
// ---------------------------------------------------------------------------
describe('contarFiltrosActivos', () => {
  it('sin filtros, 0', () => {
    expect(contarFiltrosActivos({ gratis: false, paraChicos: false, categoria: null })).toBe(0)
  })
  it('cada filtro suma 1', () => {
    expect(contarFiltrosActivos({ gratis: true, paraChicos: false, categoria: null })).toBe(1)
    expect(contarFiltrosActivos({ gratis: false, paraChicos: true, categoria: null })).toBe(1)
    expect(contarFiltrosActivos({ gratis: false, paraChicos: false, categoria: 'teatro' })).toBe(1)
  })
  it('los tres, 3 (la fecha no cuenta: no es parte del argumento)', () => {
    expect(contarFiltrosActivos({ gratis: true, paraChicos: true, categoria: 'teatro' })).toBe(3)
  })
  it('una categoría vacía ("") sigue siendo una categoría elegida (solo null es «Todas»)', () => {
    expect(contarFiltrosActivos({ gratis: false, paraChicos: false, categoria: '' })).toBe(1)
  })
})

describe('etiquetas del botón «Filtros»', () => {
  it('visible: «Filtros» sin activos y «Filtros · N» con activos', () => {
    expect(etiquetaVisibleFiltros(0)).toBe('Filtros')
    expect(etiquetaVisibleFiltros(1)).toBe('Filtros · 1')
    expect(etiquetaVisibleFiltros(2)).toBe('Filtros · 2')
  })
  it('accesible: «Filtros», «Filtros, 1 activo», «Filtros, 2 activos»', () => {
    expect(etiquetaAccesibleFiltros(0)).toBe('Filtros')
    expect(etiquetaAccesibleFiltros(1)).toBe('Filtros, 1 activo')
    expect(etiquetaAccesibleFiltros(2)).toBe('Filtros, 2 activos')
    expect(etiquetaAccesibleFiltros(3)).toBe('Filtros, 3 activos')
  })
  it('un número negativo no inventa activos', () => {
    expect(etiquetaAccesibleFiltros(-1)).toBe('Filtros')
  })
})

describe('chipsRemovibles', () => {
  it('sin filtros, ninguno', () => {
    expect(chipsRemovibles({ gratis: false, paraChicos: false, categoria: null }, '')).toEqual([])
  })
  it('en el orden de la hoja y con la etiqueta «Quitar …»', () => {
    expect(chipsRemovibles({ gratis: true, paraChicos: true, categoria: 'teatro' }, 'Teatro')).toEqual([
      { clave: 'gratis', texto: 'Gratis', etiqueta: 'Quitar Gratis' },
      { clave: 'para-chicos', texto: 'Para chicos', etiqueta: 'Quitar Para chicos' },
      { clave: 'categoria', texto: 'Teatro', etiqueta: 'Quitar Teatro' },
    ])
  })
  it('un solo filtro, un solo chip', () => {
    expect(chipsRemovibles({ gratis: false, paraChicos: true, categoria: null }, '').map((c) => c.clave)).toEqual(['para-chicos'])
  })
  it('sin nombre visible de la categoría, usa el slug', () => {
    expect(chipsRemovibles({ gratis: false, paraChicos: false, categoria: 'penas' }, '')).toEqual([
      { clave: 'categoria', texto: 'penas', etiqueta: 'Quitar penas' },
    ])
  })
  it('la cantidad de chips es la cantidad de filtros activos', () => {
    const f = { gratis: true, paraChicos: false, categoria: 'cine' }
    expect(chipsRemovibles(f, 'Cine')).toHaveLength(contarFiltrosActivos(f))
  })
})

describe('textoVerEventos', () => {
  it('singular y plural', () => {
    expect(textoVerEventos(1)).toBe('Ver 1 evento')
    expect(textoVerEventos(0)).toBe('Ver 0 eventos')
    expect(textoVerEventos(12)).toBe('Ver 12 eventos')
  })
})

// ---------------------------------------------------------------------------
// 2. Detectores sobre el fuente
// ---------------------------------------------------------------------------
const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')

/** Reemplaza los comentarios por espacios (respeta strings y template literals). */
function sinComentarios(fuente: string): string {
  let salida = ''
  let i = 0
  while (i < fuente.length) {
    const c = fuente[i]
    const siguiente = fuente[i + 1]
    if (c === '/' && siguiente === '/') {
      while (i < fuente.length && fuente[i] !== '\n') {
        salida += ' '
        i++
      }
    } else if (c === '/' && siguiente === '*') {
      salida += '  '
      i += 2
      while (i < fuente.length && !(fuente[i] === '*' && fuente[i + 1] === '/')) {
        salida += fuente[i] === '\n' ? '\n' : ' '
        i++
      }
      salida += '  '
      i += 2
    } else if (c === "'" || c === '"') {
      salida += c
      i++
      while (i < fuente.length && fuente[i] !== c && fuente[i] !== '\n') {
        if (fuente[i] === '\\') {
          salida += fuente[i]
          i++
        }
        salida += fuente[i] ?? ''
        i++
      }
      if (i < fuente.length && fuente[i] === c) {
        salida += c
        i++
      }
    } else if (c === '`') {
      salida += c
      i++
      while (i < fuente.length && fuente[i] !== '`') {
        if (fuente[i] === '\\') {
          salida += fuente[i]
          i++
        }
        salida += fuente[i] ?? ''
        i++
      }
      salida += '`'
      i++
    } else {
      salida += c
      i++
    }
  }
  return salida
}

/** Fin (índice del `>`) de la etiqueta que abre en `ini`, ignorando los `>` de llaves y strings. */
function finDeEtiqueta(texto: string, ini: number): number {
  let llaves = 0
  let comilla: string | null = null
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i]
    if (comilla) {
      if (c === comilla) comilla = null
    } else if (c === '"' || c === "'") {
      if (llaves === 0) comilla = c
    } else if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0 && texto[i - 1] !== '=') return i
  }
  return -1
}

/**
 * Los hijos directos (`<View …>`) de la View que abre en `ini`: devuelve el
 * texto de la View completa y cuántas `<View` anidadas hay a profundidad 1.
 */
function cabeceraDeLaPortada(codigo: string): { texto: string; hijosView: number } | null {
  const ini = codigo.indexOf('<View style={[estilos.cabecera,')
  if (ini < 0) return null
  let prof = 0
  let hijosView = 0
  const re = /<View(?![A-Za-z0-9])|<\/View>/g
  re.lastIndex = ini
  for (let m = re.exec(codigo); m; m = re.exec(codigo)) {
    if (m[0] === '</View>') {
      prof--
      if (prof === 0) return { texto: codigo.slice(ini, m.index + 7), hijosView }
    } else {
      const fin = finDeEtiqueta(codigo, m.index)
      const autocerrada = codigo[fin - 1] === '/'
      if (prof === 1) hijosView++
      if (!autocerrada) prof++
      re.lastIndex = fin + 1
    }
  }
  return null
}

/** Violaciones: la cabecera fija de la portada tiene UNA sola fila (botón + pills + chips removibles). */
function violacionesUnaFila(portadaCruda: string): string[] {
  const c = sinComentarios(portadaCruda)
  const cab = cabeceraDeLaPortada(c)
  if (!cab) return ['no hay cabecera']
  const v: string[] = []
  const t = cab.texto
  if (/<ChipGratis\b|<ChipParaChicos\b|<ChipsCategorias\b/.test(t)) v.push('hay un chip de filtro o de categoría directo en la cabecera')
  if (cab.hijosView !== 1) v.push(`la cabecera tiene ${cab.hijosView} filas (View directas), tiene que haber 1`)
  if ((t.match(/<PillsAtajos\b/g) ?? []).length !== 1) v.push('no hay exactamente una fila de pills')
  if ((t.match(/<BotonFiltros\b/g) ?? []).length !== 1) v.push('no hay exactamente un botón Filtros')
  if (/\bflexWrap\b|<ScrollView\b/.test(t)) v.push('la cabecera tiene un wrap o un ScrollView propio (una segunda fila)')
  const fila = /<View style=\{estilos\.filaCabecera\}>/.exec(t)
  if (!fila) v.push('no hay estilos.filaCabecera')
  else if (t.indexOf('<BotonFiltros') < fila.index || t.indexOf('<PillsAtajos') < fila.index) v.push('el botón y las pills no están dentro de filaCabecera')
  // Los chips removibles van DENTRO de las pills (`despues`), no en otra fila.
  if (!/<PillsAtajos\b[\s\S]*?\bdespues=\{\s*<ChipsRemovibles\b/.test(t)) v.push('los chips removibles no van dentro de la fila de las pills (despues=)')
  const estilo = /\bfilaCabecera:\s*\{([^}]*)\}/.exec(c)?.[1] ?? ''
  if (!/flexDirection:\s*'row'/.test(estilo)) v.push('filaCabecera no es una fila')
  if (/flexWrap/.test(estilo)) v.push('filaCabecera tiene wrap')
  return v
}

describe('la cabecera de la portada es UNA fila fija', () => {
  const portada = leer('app', '(tabs)', 'index.tsx')

  it('el fuente real tiene una sola fila', () => {
    expect(violacionesUnaFila(portada)).toEqual([])
  })

  it.each([
    [
      'vuelve la fila de Gratis y Para chicos',
      (s: string) => s.replace('<View style={estilos.filaCabecera}>', '<View style={estilos.filaFiltros}><ChipGratis activo={gratis} onCambiar={cambiarGratis} /></View>\n<View style={estilos.filaCabecera}>'),
      'hay un chip de filtro o de categoría directo en la cabecera',
    ],
    [
      'vuelven los chips de categoría',
      (s: string) => s.replace('<View style={estilos.filaCabecera}>', '<ChipsCategorias categorias={[]} seleccionada={null} onCambiar={cambiarCategoria} />\n<View style={estilos.filaCabecera}>'),
      'hay un chip de filtro o de categoría directo en la cabecera',
    ],
    [
      'una segunda fila de View',
      (s: string) => s.replace('<View style={estilos.filaCabecera}>', '<View style={estilos.otraFila}><Texto>x</Texto></View>\n<View style={estilos.filaCabecera}>'),
      'la cabecera tiene 2 filas (View directas), tiene que haber 1',
    ],
    [
      'las pills en otra fila',
      (s: string) => s.replace('<View style={estilos.pillsYChips}>', '</View><View style={estilos.otraFila}><View style={estilos.pillsYChips}>'),
      'la cabecera tiene 2 filas (View directas), tiene que haber 1',
    ],
    [
      'los chips removibles en otra fila',
      (s: string) => s.replace(/despues=\{\s*<ChipsRemovibles/, 'xdespues={<ChipsRemovibles'),
      'los chips removibles no van dentro de la fila de las pills (despues=)',
    ],
    [
      'la fila con wrap',
      (s: string) => s.replace("filaCabecera: { flexDirection: 'row',", "filaCabecera: { flexDirection: 'row', flexWrap: 'wrap',"),
      'filaCabecera tiene wrap',
    ],
    [
      'sin el botón Filtros',
      (s: string) => s.replace('<BotonFiltros', '<OtraCosa'),
      'no hay exactamente un botón Filtros',
    ],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(portada)
    expect(roto).not.toBe(portada)
    expect(violacionesUnaFila(roto)).toContain(esperada)
  })
})

/** Violaciones de la hoja de filtros (`components/HojaFiltros.tsx`). */
function violacionesHoja(hojaCruda: string): string[] {
  const c = sinComentarios(hojaCruda)
  const v: string[] = []
  const iniModal = c.indexOf('<Modal')
  const modal = iniModal < 0 ? '' : c.slice(iniModal, finDeEtiqueta(c, iniModal) + 1)
  if (!modal) return ['no usa <Modal']
  if (!/\bonRequestClose=\{onCerrar\}/.test(modal)) v.push('el Modal no cierra con Atrás (onRequestClose={onCerrar})')
  if (!/\bvisible=\{visible\}/.test(modal)) v.push('el Modal no es controlado por visible')
  if (!/\btransparent\b/.test(modal)) v.push('el Modal no es transparente (hoja inferior)')
  // Reducir movimiento: slide solo con el ajuste apagado; si no (o sin saber), none.
  if (!/import \{ useReducirMovimiento \} from '@\/lib\/reducir-movimiento'/.test(c)) v.push('no importa useReducirMovimiento')
  if (!/const reducir = useReducirMovimiento\(\)/.test(c)) v.push('no consulta useReducirMovimiento()')
  if (!/animationType=\{reducir === false \? 'slide' : 'none'\}/.test(modal)) v.push("la animación no respeta reducir movimiento (slide solo con reducir === false)")
  // Fondo y hoja hermanos, hoja modal para el lector de pantalla.
  if (!/accessibilityViewIsModal/.test(c)) v.push('la hoja no lleva accessibilityViewIsModal')
  if (!/accessibilityRole="header"/.test(c)) v.push('el título no es un header')
  if (!/>\s*Filtros\s*</.test(c)) v.push('no hay un título «Filtros»')
  // Foco: adentro al abrir, de vuelta al botón al cerrar.
  if (!/onShow=\{[\s\S]*?setAccessibilityFocus\(/.test(modal)) v.push('al abrir no manda el foco al título')
  if (!/setAccessibilityFocus\(nodo\)[\s\S]*?\[visible, botonRef\]/.test(c)) v.push('al cerrar no devuelve el foco al botón')
  // Acciones y áreas táctiles.
  if (!/textoVerEventos\(cantidad\)/.test(c)) v.push('falta «Ver N eventos»')
  if (!/>\s*Limpiar\s*</.test(c)) v.push('falta «Limpiar»')
  if (!/onPress=\{onLimpiar\}/.test(c)) v.push('«Limpiar» no llama onLimpiar')
  for (const clave of ['boton', 'chipRemovible', 'tituloCaja', 'accion']) {
    const m = new RegExp(`\\b${clave}:\\s*\\{([^}]*)\\}`).exec(c)
    const minimo = m ? /minHeight:\s*(\d+)/.exec(m[1])?.[1] : undefined
    if (!minimo || Number(minimo) < 48) v.push(`área: ${clave} sin minHeight >= 48`)
  }
  // El botón y los chips removibles dicen qué hacen.
  if (!/accessibilityLabel=\{etiquetaAccesibleFiltros\(activos\)\}/.test(c)) v.push('el botón no usa etiquetaAccesibleFiltros(activos)')
  if (!/accessibilityLabel=\{chip\.etiqueta\}/.test(c)) v.push('los chips removibles no dicen «Quitar …»')
  if (/#[0-9a-fA-F]{3,8}\b/.test(c)) v.push('hay un color hexadecimal literal')
  return v
}

describe('components/HojaFiltros.tsx', () => {
  const hoja = leer('components', 'HojaFiltros.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesHoja(hoja)).toEqual([])
  })

  it.each([
    ['sin onRequestClose', (s: string) => s.replace('onRequestClose={onCerrar}', ''), 'el Modal no cierra con Atrás (onRequestClose={onCerrar})'],
    ['animación siempre slide', (s: string) => s.replace("animationType={reducir === false ? 'slide' : 'none'}", 'animationType="slide"'), 'la animación no respeta reducir movimiento (slide solo con reducir === false)'],
    ['animación con reducir invertido', (s: string) => s.replace("reducir === false ? 'slide' : 'none'", "reducir ? 'slide' : 'none'"), 'la animación no respeta reducir movimiento (slide solo con reducir === false)'],
    ['sin consultar reducir movimiento', (s: string) => s.replace('const reducir = useReducirMovimiento()', 'const reducir = false'), 'no consulta useReducirMovimiento()'],
    ['hoja que no es modal', (s: string) => s.replace('accessibilityViewIsModal', ''), 'la hoja no lleva accessibilityViewIsModal'],
    ['título sin rol', (s: string) => s.replace('accessibilityRole="header"', ''), 'el título no es un header'],
    ['sin foco al abrir', (s: string) => s.replace('onShow={() => {', 'onDismiss={() => {'), 'al abrir no manda el foco al título'],
    ['sin devolver el foco', (s: string) => s.replace('[visible, botonRef]', '[botonRef]'), 'al cerrar no devuelve el foco al botón'],
    ['sin «Ver N eventos»', (s: string) => s.replace('{textoVerEventos(cantidad)}', 'Ver'), 'falta «Ver N eventos»'],
    ['«Limpiar» que no limpia', (s: string) => s.replace('onPress={onLimpiar}', 'onPress={onCerrar}'), '«Limpiar» no llama onLimpiar'],
    ['botón chico', (s: string) => s.replace(/(boton: \{[^}]*?)minHeight: 48/, '$1minHeight: 40'), 'área: boton sin minHeight >= 48'],
    ['botón sin etiqueta accesible', (s: string) => s.replace('accessibilityLabel={etiquetaAccesibleFiltros(activos)}', ''), 'el botón no usa etiquetaAccesibleFiltros(activos)'],
    ['chip sin «Quitar»', (s: string) => s.replace('accessibilityLabel={chip.etiqueta}', ''), 'los chips removibles no dicen «Quitar …»'],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(hoja)
    expect(roto).not.toBe(hoja)
    expect(violacionesHoja(roto)).toContain(esperada)
  })
})

describe('el skeleton de la portada dibuja una sola fila de cabecera', () => {
  const esqueleto = sinComentarios(leer('components', 'Esqueleto.tsx'))
  const portada = /export function EsqueletoPortada\(\) \{[\s\S]*?\n\}\n/.exec(esqueleto)?.[0] ?? ''

  it('no dibuja la fila de chips de categoría (ANCHOS_CHIPS) y sí el botón de Filtros', () => {
    expect(portada).not.toBe('')
    expect(portada).not.toMatch(/ANCHOS_CHIPS/)
    expect(portada).toMatch(/ANCHO_BOTON_FILTROS/)
    expect(portada).toMatch(/ANCHOS_PILLS_INICIO/)
  })
})
