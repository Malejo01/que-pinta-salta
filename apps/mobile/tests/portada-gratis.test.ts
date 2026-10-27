// A2 (nube Q1): chip "Gratis" de la portada. Dos partes:
//   1. La lógica pura de `lib/portada-gratis.ts` y `lib/chips-desplazamiento.ts`,
//      importada de verdad (no es una copia): combinaciones de fecha +
//      categoría + gratis con datos inventados, los chips, el cine, el título,
//      el vacío, el anuncio y a dónde se desplaza la fila de chips.
//   2. Detectores sobre el fuente sin comentarios de `components/ChipGratis.tsx`,
//      `components/ChipsCategorias.tsx`, `app/(tabs)/index.tsx` y
//      `app/(tabs)/buscar.tsx` (no hay runner de React Native: se leen como
//      texto). Cada detector tiene su fixture roto que lo pone en rojo.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { saltaWallClockToDate } from '@qps/core/date-format'
import { eventoEnAtajo, type Atajo } from '@qps/core/home/atajos'
import { categoriasDisponibles, filtrarCombinado, type ItemFiltrable } from '@qps/core/home/filtros-combinados'
import { transformMovie } from '@qps/core/home/transform'
import type { DisplayEvent } from '@qps/core/home/types'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { AIRE_CHIP, destinoScrollChip } from '../lib/chips-desplazamiento'
import {
  anuncioDeLaGrilla,
  chipsDeLaPortada,
  enModoGrilla,
  ETIQUETA_ATAJO,
  eventosDeLaGrilla,
  FRASE_ATAJO,
  segundaSalidaVacioGratis,
  textoVacioCategoria,
  textoVacioGratis,
  tituloGratis,
} from '../lib/portada-gratis'

function leer(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
}

// ---------------------------------------------------------------------------
// Datos inventados. "Ahora": miércoles 9/10/2030, 12:00 en Salta. El finde
// arranca el viernes 11 a las 19:00.
// ---------------------------------------------------------------------------
const salta = (wallClock: string) => saltaWallClockToDate(wallClock)
const AHORA = salta('2030-10-09T12:00:00')

const CATEGORIAS = [
  { slug: 'musica', name: 'Música' },
  { slug: 'teatro', name: 'Teatro' },
  { slug: 'cine', name: 'Cine' },
  { slug: 'ferias', name: 'Ferias' },
  { slug: 'humor', name: 'Humor' },
]

function evento(id: string, categoria: string, inicio: string, price: DisplayEvent['price']): DisplayEvent {
  const nombre = CATEGORIAS.find((c) => c.slug === categoria)?.name ?? categoria
  return {
    id,
    slug: id,
    title: `Evento ${id}`,
    venue: 'Lugar',
    date: inicio.slice(0, 10),
    time: inicio.slice(11, 16),
    category: categoria,
    categoryName: nombre,
    price,
    image: '/placeholder.svg',
    description: '',
    address: '',
    startDateTime: salta(inicio).toISOString(),
    isFeatured: false,
  }
}

const EVENTOS: DisplayEvent[] = [
  evento('musica-gratis-hoy', 'musica', '2030-10-09T21:00:00', 'gratis'),
  evento('musica-paga-hoy', 'musica', '2030-10-09T21:30:00', 5000),
  evento('feria-confirmar-hoy', 'ferias', '2030-10-09T18:00:00', 'confirmar'),
  evento('teatro-gratis-sabado', 'teatro', '2030-10-12T21:00:00', 'gratis'),
  evento('musica-gratis-sabado', 'musica', '2030-10-12T22:00:00', 'gratis'),
  // Un evento real de la categoría cine, gratis (un ciclo al aire libre).
  evento('cine-gratis-domingo', 'cine', '2030-10-13T20:00:00', 'gratis'),
  // `price: 0` no es gratis (`soloGratis` solo deja pasar `'gratis'`).
  evento('humor-cero-sabado', 'humor', '2030-10-12T23:00:00', 0),
]

const PELICULAS = [
  transformMovie({ id: 'p1', slug: 'p1', title: 'Película 1', poster_url: null, showings: {} }, '2030-10-09'),
  transformMovie({ id: 'p2', slug: 'p2', title: 'Película 2', poster_url: null, showings: {} }, '2030-10-09'),
]

/** Lo mismo que arma la portada: eventos con su `paraAtajo` + películas con `paraAtajo: null`. */
const ITEMS: ItemFiltrable[] = [
  ...EVENTOS.map((e) => ({ evento: e, paraAtajo: { start_date: e.startDateTime, category: e.category } })),
  ...PELICULAS.map((e) => ({ evento: e, paraAtajo: null })),
]

/** Lo que la portada llama `todosLosEventos`: los de la fecha + las películas. */
function delAtajo(atajo: Atajo): DisplayEvent[] {
  return [
    ...ITEMS.filter((i) => i.paraAtajo !== null && eventoEnAtajo(i.paraAtajo, atajo, AHORA)).map((i) => i.evento),
    ...PELICULAS,
  ]
}

const ids = (lista: DisplayEvent[]) => lista.map((e) => e.id)

describe('los datos inventados caen en la fecha que se cree (guarda)', () => {
  it('hoy: los tres de hoy; finde: los del sábado y el domingo', () => {
    expect(ids(delAtajo('hoy').filter((e) => !e.isCinemaMovie))).toEqual(['musica-gratis-hoy', 'musica-paga-hoy', 'feria-confirmar-hoy'])
    expect(ids(delAtajo('finde').filter((e) => !e.isCinemaMovie))).toEqual([
      'teatro-gratis-sabado',
      'musica-gratis-sabado',
      'cine-gratis-domingo',
      'humor-cero-sabado',
    ])
  })

  it('las películas de transformMovie no son gratis', () => {
    expect(PELICULAS.every((p) => p.price !== 'gratis')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 1. Lógica pura
// ---------------------------------------------------------------------------
describe('enModoGrilla', () => {
  it.each([
    [null, false, false],
    [null, true, true],
    ['musica', false, true],
    ['musica', true, true],
  ] as const)('categoría %s + gratis %s -> %s', (categoria, gratis, esperado) => {
    expect(enModoGrilla({ categoria, gratis })).toBe(esperado)
  })
})

describe('eventosDeLaGrilla: fecha + categoría + gratis', () => {
  it('Gratis + Todas + Hoy: solo el gratis de hoy (sin películas, sin pagos, sin "a confirmar")', () => {
    expect(ids(eventosDeLaGrilla(ITEMS, { atajo: 'hoy', categoria: null, gratis: true }, AHORA))).toEqual(['musica-gratis-hoy'])
  })

  it('Gratis + Música + Finde: solo la música gratis del finde', () => {
    expect(ids(eventosDeLaGrilla(ITEMS, { atajo: 'finde', categoria: 'musica', gratis: true }, AHORA))).toEqual(['musica-gratis-sabado'])
  })

  it('Gratis + Todas + Semana: todos los gratis de la semana, en el orden de entrada; `price: 0` no cuenta', () => {
    expect(ids(eventosDeLaGrilla(ITEMS, { atajo: 'semana', categoria: null, gratis: true }, AHORA))).toEqual([
      'musica-gratis-hoy',
      'teatro-gratis-sabado',
      'musica-gratis-sabado',
      'cine-gratis-domingo',
    ])
  })

  it('Gratis + Teatro + Hoy: vacío (el de teatro es el sábado)', () => {
    expect(eventosDeLaGrilla(ITEMS, { atajo: 'hoy', categoria: 'teatro', gratis: true }, AHORA)).toEqual([])
  })

  it('Gratis apagado: es el mismo filtrarCombinado de antes (atajo + categoría)', () => {
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) {
      for (const categoria of [null, 'musica', 'cine', 'humor']) {
        expect(eventosDeLaGrilla(ITEMS, { atajo, categoria, gratis: false }, AHORA)).toEqual(filtrarCombinado(ITEMS, { atajo, categoria }, AHORA))
      }
    }
  })

  it('Gratis prendido: es filtrarCombinado con soloGratis (no una regla propia)', () => {
    expect(eventosDeLaGrilla(ITEMS, { atajo: 'finde', categoria: null, gratis: true }, AHORA)).toEqual(
      filtrarCombinado(ITEMS, { atajo: 'finde', categoria: null, soloGratis: true }, AHORA),
    )
  })

  describe('Cine + Gratis', () => {
    it('sin Gratis, el chip Cine trae las películas (en cartel, sin fecha)', () => {
      const conPelis = eventosDeLaGrilla(ITEMS, { atajo: 'hoy', categoria: 'cine', gratis: false }, AHORA)
      expect(ids(conPelis)).toEqual(['movie-p1', 'movie-p2'])
    })

    it('con Gratis, las películas quedan afuera: hoy no queda nada', () => {
      expect(eventosDeLaGrilla(ITEMS, { atajo: 'hoy', categoria: 'cine', gratis: true }, AHORA)).toEqual([])
    })

    it('con Gratis, los eventos reales de cine gratis sí quedan (finde)', () => {
      expect(ids(eventosDeLaGrilla(ITEMS, { atajo: 'finde', categoria: 'cine', gratis: true }, AHORA))).toEqual(['cine-gratis-domingo'])
    })
  })
})

describe('chipsDeLaPortada', () => {
  it('Gratis apagado: lo mismo que categoriasDisponibles de siempre (la portada no cambia)', () => {
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) {
      for (const categoria of [null, 'musica', 'cine', 'humor']) {
        expect(chipsDeLaPortada(delAtajo(atajo), CATEGORIAS, categoria, false)).toEqual(
          categoriasDisponibles(delAtajo(atajo), CATEGORIAS, categoria),
        )
      }
    }
  })

  it('Gratis + Hoy: solo Música (Cine y Ferias no tienen gratis hoy)', () => {
    expect(chipsDeLaPortada(delAtajo('hoy'), CATEGORIAS, null, true)).toEqual([{ slug: 'musica', name: 'Música', cantidad: 1 }])
    // Sin Gratis, Cine (por las películas) y Ferias sí están.
    expect(chipsDeLaPortada(delAtajo('hoy'), CATEGORIAS, null, false).map((c) => c.slug)).toEqual(['cine', 'musica', 'ferias'])
  })

  it('Gratis + Finde: Cine aparece solo por el evento real gratis, con su cantidad sin películas', () => {
    const chips = chipsDeLaPortada(delAtajo('finde'), CATEGORIAS, null, true)
    expect(chips).toEqual([
      { slug: 'cine', name: 'Cine', cantidad: 1 },
      { slug: 'musica', name: 'Música', cantidad: 1 },
      { slug: 'teatro', name: 'Teatro', cantidad: 1 },
    ])
    // `price: 0` no es gratis: Humor no aparece.
    expect(chips.some((c) => c.slug === 'humor')).toBe(false)
  })

  it('la elegida se mantiene siempre, aunque no tenga gratis (con 0, al final)', () => {
    expect(chipsDeLaPortada(delAtajo('hoy'), CATEGORIAS, 'cine', true)).toEqual([
      { slug: 'musica', name: 'Música', cantidad: 1 },
      { slug: 'cine', name: 'Cine', cantidad: 0 },
    ])
    expect(chipsDeLaPortada(delAtajo('hoy'), CATEGORIAS, 'teatro', true).at(-1)).toEqual({ slug: 'teatro', name: 'Teatro', cantidad: 0 })
  })

  it('sin ningún gratis en la fecha y "Todas": no hay chips de categoría', () => {
    const soloPagos = [evento('x', 'musica', '2030-10-09T21:00:00', 3000), ...PELICULAS]
    expect(chipsDeLaPortada(soloPagos, CATEGORIAS, null, true)).toEqual([])
  })
})

describe('tituloGratis', () => {
  it.each([
    [null, 'hoy', 'Gratis · Hoy'],
    [null, 'esta-noche', 'Gratis · Esta noche'],
    [null, 'finde', 'Gratis · Finde'],
    [null, 'semana', 'Gratis · Semana'],
    ['Música', 'finde', 'Música gratis · Finde'],
    ['Teatro', 'hoy', 'Teatro gratis · Hoy'],
    // Con "Cine" va la fecha y no "En cartel": con Gratis no hay películas.
    ['Cine', 'hoy', 'Cine gratis · Hoy'],
  ] as const)('%s + %s -> "%s"', (nombre, atajo, esperado) => {
    expect(tituloGratis(nombre, atajo)).toBe(esperado)
  })

  it('usa las mismas etiquetas de fecha que el modo categoría', () => {
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) {
      expect(tituloGratis(null, atajo).endsWith(ETIQUETA_ATAJO[atajo])).toBe(true)
    }
  })
})

describe('textoVacioGratis', () => {
  it.each([
    [null, '', 'hoy', 'No hay eventos gratis para hoy.'],
    [null, '', 'esta-noche', 'No hay eventos gratis para esta noche.'],
    [null, '', 'finde', 'No hay eventos gratis para el finde.'],
    [null, '', 'semana', 'No hay eventos gratis para esta semana.'],
    ['musica', 'Música', 'finde', 'No hay eventos gratis de Música para el finde.'],
    ['teatro', 'Teatro', 'hoy', 'No hay eventos gratis de Teatro para hoy.'],
    ['cine', 'Cine', 'hoy', 'No hay eventos gratis de Cine para hoy. Las películas en cartel no son gratis.'],
  ] as const)('%s + %s -> "%s"', (categoria, nombre, atajo, esperado) => {
    expect(textoVacioGratis(categoria, nombre, atajo)).toBe(esperado)
  })

  it('usa las mismas frases de fecha que el vacío del modo categoría', () => {
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) {
      expect(textoVacioGratis(null, '', atajo)).toContain(FRASE_ATAJO[atajo])
    }
  })
})

describe('segundaSalidaVacioGratis', () => {
  it('con una categoría: "Todas las categorías" (deja Gratis prendido)', () => {
    expect(segundaSalidaVacioGratis('musica', 'hoy')).toEqual({ tipo: 'todas-las-categorias', texto: 'Todas las categorías' })
    expect(segundaSalidaVacioGratis('cine', 'semana')).toEqual({ tipo: 'todas-las-categorias', texto: 'Todas las categorías' })
  })

  it('con "Todas" y una fecha que no es la semana: "Ver esta semana"', () => {
    for (const atajo of ['hoy', 'esta-noche', 'finde'] as const) {
      expect(segundaSalidaVacioGratis(null, atajo)).toEqual({ tipo: 'esta-semana', texto: 'Ver esta semana' })
    }
  })

  it('con "Todas" y la semana: ninguna (queda solo "Ver todos los precios")', () => {
    expect(segundaSalidaVacioGratis(null, 'semana')).toBeNull()
  })
})

describe('textoVacioCategoria (el vacío de siempre del modo categoría)', () => {
  it.each([
    ['Música', 'hoy', 'No hay eventos de Música para hoy.'],
    ['Teatro', 'finde', 'No hay eventos de Teatro para el finde.'],
  ] as const)('%s + %s -> "%s"', (nombre, atajo, esperado) => {
    expect(textoVacioCategoria(nombre, atajo)).toBe(esperado)
  })
})

describe('anuncioDeLaGrilla: el conteo si hay resultados, el vacío si no', () => {
  const base = { textoConteo: '3 eventos', textoVacio: 'No hay eventos gratis para hoy.' }

  it('fuera del modo grilla no se anuncia nada', () => {
    expect(anuncioDeLaGrilla({ ...base, modoGrilla: false, gratis: false, cantidad: 3 })).toBeNull()
    expect(anuncioDeLaGrilla({ ...base, modoGrilla: false, gratis: false, cantidad: 0 })).toBeNull()
  })

  it('con resultados, el conteo (con o sin Gratis)', () => {
    expect(anuncioDeLaGrilla({ ...base, modoGrilla: true, gratis: true, cantidad: 3 })).toEqual({ texto: '3 eventos', tipo: 'conteo' })
    expect(anuncioDeLaGrilla({ ...base, modoGrilla: true, gratis: false, cantidad: 3 })).toEqual({ texto: '3 eventos', tipo: 'conteo' })
  })

  it('sin resultados y con Gratis, el texto del vacío de Gratis', () => {
    expect(anuncioDeLaGrilla({ ...base, modoGrilla: true, gratis: true, cantidad: 0 })).toEqual({
      texto: 'No hay eventos gratis para hoy.',
      tipo: 'vacio-gratis',
    })
  })

  it('sin resultados y sin Gratis, el vacío de categoría (otro nodo: otro tipo)', () => {
    const vacio = 'No hay eventos de Música para hoy.'
    expect(anuncioDeLaGrilla({ ...base, textoVacio: vacio, modoGrilla: true, gratis: false, cantidad: 0 })).toEqual({ texto: vacio, tipo: 'vacio-categoria' })
  })
})

describe('destinoScrollChip: la fila solo se desplaza si el chip elegido no entra', () => {
  // A3 (nube Q1, ronda de correcciones): "Gratis" ya no va en esta fila (tiene
  // su fila fija de filtros), así que las medidas son las de la fila sola. A
  // 360 dp: "Todas" (16..96) + Música (106..216) + Teatro (226..336) + Ferias
  // (346..446)…
  const ANCHO = 360

  it('sin medir el chip o el ancho visible: no se desplaza todavía (null)', () => {
    expect(destinoScrollChip(undefined, ANCHO)).toBeNull()
    expect(destinoScrollChip({ x: 16, width: 80 }, null)).toBeNull()
  })

  it('"Todas" (x = 16) entra: la fila va al principio (0)', () => {
    expect(destinoScrollChip({ x: 16, width: 80 }, ANCHO)).toBe(0)
  })

  it('una categoría que entra entera (con su aire) también va a 0, no a x - 16', () => {
    expect(destinoScrollChip({ x: 106, width: 110 }, ANCHO)).toBe(0)
    expect(destinoScrollChip({ x: 226, width: 110 }, ANCHO)).toBe(0)
    // Justo en el borde: 234 + 110 + 16 = 360.
    expect(destinoScrollChip({ x: 234, width: 110 }, ANCHO)).toBe(0)
  })

  it('una que no entra va a x - 16 (como antes de A2)', () => {
    expect(destinoScrollChip({ x: 235, width: 110 }, ANCHO)).toBe(235 - AIRE_CHIP)
    expect(destinoScrollChip({ x: 346, width: 100 }, ANCHO)).toBe(330)
  })

  it('nunca da negativo', () => {
    expect(destinoScrollChip({ x: 4, width: 900 }, ANCHO)).toBe(0)
  })
})

describe('lib/portada-gratis.ts usa core, no reglas propias', () => {
  const fuente = quitarComentarios(leer('../lib/portada-gratis.ts'))

  it('importa filtrarCombinado/categoriasDisponibles/soloGratis de @qps/core y no compara price a mano', () => {
    expect(fuente).toMatch(/import\s*\{[^}]*\bfiltrarCombinado\b[^}]*\}\s*from\s*'@qps\/core\/home\/filtros-combinados'/)
    expect(fuente).toMatch(/import\s*\{[^}]*\bsoloGratis\b[^}]*\}\s*from\s*'@qps\/core\/home\/filtros-extra'/)
    expect(fuente).toMatch(/soloGratis:\s*filtros\.gratis/)
    expect(fuente).not.toMatch(/\.price\b/)
    expect(fuente).not.toMatch(/from\s*'react/)
  })
})

// ---------------------------------------------------------------------------
// 2. Detectores sobre el fuente
// ---------------------------------------------------------------------------

/** Desde el `{` en `desde`, el bloque hasta su `}` par (con las llaves). */
function bloque(texto: string, desde: number): string {
  let nivel = 0
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === '{') nivel++
    else if (texto[i] === '}') {
      nivel--
      if (nivel === 0) return texto.slice(desde, i + 1)
    }
  }
  return texto.slice(desde)
}

const numero = (obj: string, clave: string): number | null => {
  const m = new RegExp(`\\b${clave}\\s*:\\s*(\\d+)`).exec(obj)
  return m ? Number(m[1]) : null
}

/** Los nombres de ícono que existen en `components/Icono.tsx` (las claves de ICONOS_LUCIDE). */
function iconosQueExisten(fuenteIcono: string): Set<string> {
  const inicio = fuenteIcono.indexOf('const ICONOS_LUCIDE = {')
  const cuerpo = bloque(fuenteIcono, fuenteIcono.indexOf('{', inicio))
  return new Set([...cuerpo.matchAll(/\b([A-Z]\w*)\b/g)].map((m) => m[1]))
}

const ICONOS = iconosQueExisten(quitarComentarios(leer('../components/Icono.tsx')))

/** Violaciones del chip "Gratis" (`components/ChipGratis.tsx`). */
function violacionesChipGratis(fuenteCruda: string): string[] {
  const c = quitarComentarios(fuenteCruda)
  const v: string[] = []
  const desde = c.indexOf('<Pressable')
  const hasta = c.indexOf('</Pressable>', desde)
  if (desde < 0 || hasta < 0) return ['no hay <Pressable']
  const pressable = c.slice(desde, hasta)

  if (!/accessibilityRole="button"/.test(pressable)) v.push('rol: el chip no es accessibilityRole="button"')
  if (!/accessibilityState=\{\{\s*selected:\s*activo\s*\}\}/.test(pressable)) v.push('estado: falta accessibilityState={{ selected: activo }}')
  if (!/onPress=\{\(\) => onCambiar\(!activo\)\}/.test(pressable)) v.push('no es un interruptor: onPress no llama onCambiar(!activo)')
  if (!/>\s*Gratis\s*</.test(pressable)) v.push('el texto visible no es "Gratis"')
  // Ronda de correcciones: "Gratis, botón" sonaba a categoría.
  if (!/accessibilityLabel="Solo eventos gratis"/.test(pressable)) v.push('etiqueta: falta accessibilityLabel="Solo eventos gratis"')

  // Área táctil: la clave de estilo del Pressable con minHeight >= 48 (detector `area-chica`).
  const clave = /style=\{\[\s*estilos\.(\w+)/.exec(pressable)
  if (!clave) v.push('el style del Pressable no arranca con una clave de estilos.*')
  else {
    const m = new RegExp(`\\b${clave[1]}:\\s*\\{([^}]*)\\}`).exec(c)
    const minimo = m ? numero(m[1], 'minHeight') : null
    if (minimo === null || minimo < 48) v.push(`área: la clave "${clave[1]}" no tiene minHeight >= 48`)
  }

  // Forma, no solo color (R72, 72-c): contorno 2 vs 1, padding compensado, negrita.
  const ternario = /\bactivo\s*\?\s*\{/.exec(pressable)
  if (!ternario) v.push('no hay estilo activo ? {…} : {…}')
  else {
    const ini = ternario.index + ternario[0].length - 1
    const activoObj = bloque(pressable, ini)
    const resto = /^\s*:\s*\{/.exec(pressable.slice(ini + activoObj.length))
    const inactivoObj = resto ? bloque(pressable, ini + activoObj.length + resto[0].length - 1) : ''
    const bA = numero(activoObj, 'borderWidth')
    const bI = numero(inactivoObj, 'borderWidth')
    if (bA === null || bI === null || bA <= bI) v.push('forma: el activo no tiene un contorno más grueso que el inactivo')
    else {
      const padA = numero(activoObj, 'paddingHorizontal') ?? 16
      const padI = numero(inactivoObj, 'paddingHorizontal') ?? 16
      if (bA + padA !== bI + padI) v.push('ancho: el chip salta al prenderse')
    }
    if (!/backgroundColor:\s*colores\.primary\b/.test(activoObj)) v.push('forma: el activo no va relleno de colores.primary')
    if (!/borderColor:\s*bordeInactivo\b/.test(inactivoObj)) v.push('borde: el inactivo no usa bordeInactivo (3:1)')
  }
  if (!/peso=\{activo \? 'bold' : 'semibold'\}/.test(pressable)) v.push("peso: falta peso={activo ? 'bold' : 'semibold'}")
  if (!/const bordeInactivo = bordeChipInactivo\(colores\)/.test(c)) v.push('borde: no usa bordeChipInactivo(colores)')
  if (!/const colores = useColoresQPS\(\)/.test(c)) v.push('colores: no salen de useColoresQPS()')
  if (/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(c)) v.push('colores: hay un color literal')
  if (/colores\.border\b/.test(c)) v.push('borde: usa colores.border (no llega a 3:1)')

  // Íconos: solo nombres que existen en components/Icono.tsx.
  const icono = /<Icono\s+nombre=\{([^}]*)\}/.exec(pressable)
  if (!icono) v.push('no hay <Icono nombre={…}>')
  else {
    const nombres = [...icono[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
    if (nombres.length === 0) v.push('el ícono no es un nombre literal')
    for (const n of nombres) if (!ICONOS.has(n)) v.push(`ícono: "${n}" no existe en components/Icono.tsx`)
  }
  return v
}

describe('components/ChipGratis.tsx', () => {
  const real = leer('../components/ChipGratis.tsx')

  it('la guarda: los íconos de Icono.tsx se leen bien', () => {
    expect(ICONOS.has('Ticket')).toBe(true)
    expect(ICONOS.has('Check')).toBe(true)
    expect(ICONOS.has('BadgeDollarSign')).toBe(false)
  })

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesChipGratis(real)).toEqual([])
  })

  it.each([
    ['sin rol', (s: string) => s.replace('accessibilityRole="button"\n      accessibilityState', 'accessibilityState'), 'rol: el chip no es accessibilityRole="button"'],
    ['estado fijo', (s: string) => s.replace('selected: activo', 'selected: false'), 'estado: falta accessibilityState={{ selected: activo }}'],
    ['checked en vez de selected', (s: string) => s.replace('selected: activo', 'checked: activo'), 'estado: falta accessibilityState={{ selected: activo }}'],
    ['etiqueta "Gratis"', (s: string) => s.replace('accessibilityLabel="Solo eventos gratis"', 'accessibilityLabel="Gratis"'), 'etiqueta: falta accessibilityLabel="Solo eventos gratis"'],
    ['no alterna', (s: string) => s.replace('onCambiar(!activo)', 'onCambiar(true)'), 'no es un interruptor: onPress no llama onCambiar(!activo)'],
    ['minHeight 40', (s: string) => s.replace('minHeight: 48,\n  },\n})', 'minHeight: 40,\n  },\n})'), 'área: la clave "chipGratis" no tiene minHeight >= 48'],
    ['contorno igual', (s: string) => s.replace('borderWidth: 2', 'borderWidth: 1'), 'forma: el activo no tiene un contorno más grueso que el inactivo'],
    ['sin compensar el padding', (s: string) => s.replace('paddingHorizontal: 15', 'paddingHorizontal: 16'), 'ancho: el chip salta al prenderse'],
    ['sin negrita', (s: string) => s.replace("peso={activo ? 'bold' : 'semibold'}", "peso={activo ? 'semibold' : 'semibold'}"), "peso: falta peso={activo ? 'bold' : 'semibold'}"],
    ['borde genérico', (s: string) => s.replace('borderColor: bordeInactivo', 'borderColor: colores.border'), 'borde: el inactivo no usa bordeInactivo (3:1)'],
    ['color literal', (s: string) => s.replace('backgroundColor: colores.primary,', "backgroundColor: '#C0392B',"), 'colores: hay un color literal'],
    ['ícono inventado', (s: string) => s.replace("'Ticket'", "'BadgeDollarSign'"), 'ícono: "BadgeDollarSign" no existe en components/Icono.tsx'],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesChipGratis(roto)).toContain(esperada)
  })
})

/**
 * A3 (nube Q1, ronda de correcciones): el chip "Gratis" ya no va dentro de
 * ChipsCategorias (tiene su fila fija en la cabecera de la portada). La fila
 * con scroll es solo "Todas" + categorías, y la barra depende de `mostrarBarra`.
 */
function violacionesChipsCategorias(fuenteCruda: string): string[] {
  const c = quitarComentarios(fuenteCruda)
  const v: string[] = []
  if (/\bChipGratis\b|\bChipParaChicos\b/.test(c)) v.push('un chip de filtro sigue adentro de la fila con scroll')
  if (/\bgratis\?:|\bparaChicos\?:/.test(c)) v.push('quedan las props de los filtros')
  if (/estilos\.separador/.test(c)) v.push('queda el separador')
  if (!/\bmostrarBarra\?:\s*boolean/.test(c)) v.push('la prop mostrarBarra no es opcional')
  if (!/showsHorizontalScrollIndicator=\{mostrarBarra\}/.test(c)) v.push('la barra no depende de mostrarBarra')
  if (!/persistentScrollbar=\{mostrarBarra\}/.test(c)) v.push('persistentScrollbar no depende de mostrarBarra')
  if (!/mostrarBarra = false/.test(c)) v.push('la barra no arranca apagada (Buscar)')
  return v
}

describe('components/ChipsCategorias.tsx: los filtros van aparte', () => {
  const real = leer('../components/ChipsCategorias.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesChipsCategorias(real)).toEqual([])
  })

  it.each([
    ['Gratis otra vez adentro', (s: string) => s.replace("import { Icono,", "import { ChipGratis } from '@/components/ChipGratis'\nimport { Icono,"), 'un chip de filtro sigue adentro de la fila con scroll'],
    ['barra siempre', (s: string) => s.replace('showsHorizontalScrollIndicator={mostrarBarra}', 'showsHorizontalScrollIndicator'), 'la barra no depende de mostrarBarra'],
    ['barra persistente siempre', (s: string) => s.replace('persistentScrollbar={mostrarBarra}', 'persistentScrollbar'), 'persistentScrollbar no depende de mostrarBarra'],
    ['barra prendida por defecto', (s: string) => s.replace('mostrarBarra = false', 'mostrarBarra = true'), 'la barra no arranca apagada (Buscar)'],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesChipsCategorias(roto)).toContain(esperada)
  })

  it('Buscar no pasa mostrarBarra (queda sin barra) y tiene su propio "Solo gratis"', () => {
    const buscar = quitarComentarios(leer('../app/(tabs)/buscar.tsx'))
    const uso = /<ChipsCategorias\b[^>]*\/>/.exec(buscar)
    expect(uso).not.toBeNull()
    expect(uso![0]).not.toMatch(/\bmostrarBarra\b|\bgratis=/)
    expect(buscar).toMatch(/>\s*Solo gratis\s*</)
  })
})

/** Violaciones del modo "Gratis" en la portada. */
function violacionesPortada(fuenteCruda: string): string[] {
  const c = quitarComentarios(fuenteCruda)
  const v: string[] = []
  if (!/const \[gratis, setGratis\] = useState\(false\)/.test(c)) v.push('Gratis no arranca apagado')
  // A3 (nube Q1, ronda de correcciones): el chip va primero en la fila fija de
  // filtros, el primer hijo de la cabecera (siempre dibujada, sin scroll).
  if (!/borderBottomColor: colores\.border \}\]\}>\s*<View style=\{estilos\.filaFiltros\}>\s*<ChipGratis activo=\{gratis\} onCambiar=\{cambiarGratis\} \/>/.test(c)) v.push('el chip Gratis no va primero en la fila fija de filtros de la cabecera')
  const estiloFiltros = /\bfilaFiltros:\s*\{([^}]*)\}/.exec(c)
  if (!estiloFiltros || !/flexDirection:\s*'row'/.test(estiloFiltros[1]) || !/flexWrap:\s*'wrap'/.test(estiloFiltros[1])) v.push('filaFiltros no es una fila con wrap')

  // El handler: cambia el estado y vuelve el scroll arriba (no en un efecto).
  const handler = /const cambiarGratis = useCallback\(\(nuevo: boolean\) => \{([\s\S]*?)\}, \[\]\)/.exec(c)
  if (!handler) v.push('no existe el handler cambiarGratis')
  else {
    if (!/\bsetGratis\(nuevo\)/.test(handler[1])) v.push('cambiarGratis no llama setGratis(nuevo)')
    if (!/\.scrollTo\(\{\s*y:\s*0\b/.test(handler[1])) v.push('cambiarGratis no vuelve el scroll arriba')
  }

  // El modo grilla sale de enModoGrilla (categoría o Gratis), sin repetirlo en línea.
  // A3 (nube Q1): más `paraChicos` (lo prueba también `tests/para-chicos.test.ts`).
  if (!/const modoGrilla = enModoGrilla\(\{ categoria, gratis, paraChicos \}\)/.test(c)) v.push('modoGrilla no es enModoGrilla({ categoria, gratis })')
  if (!/if \(enModoGrilla\(\{ categoria, gratis, paraChicos \}\)\) \{/.test(c)) v.push('la grilla del useMemo no se arma con enModoGrilla')
  if (/categoria !== null \|\| gratis/.test(c)) v.push('se repite `categoria !== null || gratis` en línea')

  // Sin Hero, sin InvitacionAvisos, sin secciones (banners/anuncio).
  if (!/\{!modoGrilla && datosPortada\.carrusel\.length > 0 \? <Hero/.test(c)) v.push('el Hero no se apaga con Gratis')
  if (!/\{!modoGrilla \? <InvitacionAvisos/.test(c)) v.push('InvitacionAvisos no se apaga con Gratis')
  if (!/datosPortada && !modoGrilla \? seccionesPortada\(/.test(c)) v.push('las secciones (banners y anuncio) no se apagan con Gratis')
  if (!/\{modoGrilla \? \(\s*<View style=\{estilos\.bloqueCategoria\}>/.test(c)) v.push('la grilla no se dibuja con Gratis')

  // A3 (nube Q1, ronda de correcciones): la fila de chips de categoría vuelve
  // a dibujarse solo si hay chips (Gratis se apaga desde su fila fija), con su
  // barra; las pills siempre tienen una fila arriba.
  if (!/\{datosPortada\.chips\.length > 0 \? \(\s*<ChipsCategorias categorias=\{datosPortada\.chips\} seleccionada=\{categoria\} onCambiar=\{cambiarCategoria\} mostrarBarra \/>/.test(c)) v.push('la fila de chips no se dibuja con sus chips y su barra')
  if (!/<View style=\{estilos\.pillsBajoChips\}>\s*<PillsAtajos/.test(c)) v.push('las pills no se acomodan bajo las filas de arriba')

  // El vacío de categoría solo sin Gratis (con Gratis va el de Gratis).
  // A3 (nube Q1): ni con "Para chicos" (va el suyo).
  if (!/datosPortada\.eventosCategoria\.length === 0 && categoria !== null && !gratis && !paraChicos \? \(/.test(c)) v.push('el vacío de categoría también se muestra con Gratis')

  // El anuncio: el conteo o el vacío, con el mismo texto que se ve.
  if (!/const anuncio = datosPortada\s*\?\s*anuncioDeLaGrilla\(\{\s*modoGrilla,\s*gratis,/.test(c)) v.push('el anuncio no sale de anuncioDeLaGrilla')
  // A3 (nube Q1): sin "Para chicos" (la rama del medio de `textoVacio`, que va primero con `paraChicos ?`).
  if (!/const textoVacio = paraChicos[\s\S]{0,120}?:\s*gratis \? textoVacioGratis\(categoria, nombreCategoria, atajo\) : textoVacioCategoria\(nombreCategoria, atajo\)/.test(c)) v.push('el texto del vacío no sale de textoVacioGratis/textoVacioCategoria')
  if (!/accessibilityLiveRegion="polite">\s*\{textoVacio\}/.test(c)) v.push('el vacío de categoría no muestra textoVacio en una live region')
  // (más abajo, dentro del uso de `<VacioGratis>`: `<VacioParaChicos>` también recibe `texto={textoVacio}`)

  // Filtros y chips por lib/portada-gratis.
  // A3 (nube Q1): la grilla suma `paraChicos` y los chips salen de `eventosDeLosChips` (que es
  // `todosLosEventos` sin "Para chicos"); `chipsDeLaPortada` sigue sumando "Gratis".
  if (!/eventosCategoria = eventosDeLaGrilla\(items, \{ atajo, categoria, gratis, paraChicos \}, ahora\)/.test(c)) v.push('la grilla no filtra con gratis')
  if (!/const chips = chipsDeLaPortada\(eventosDeLosChips\(items, \{ atajo, paraChicos \}, ahora\), estado\.categorias, categoria, gratis\)/.test(c)) v.push('los chips no salen de chipsDeLaPortada con gratis')
  if (!/\}, \[estado, atajo, categoria, gratis, paraChicos\]\)/.test(c)) v.push('datosPortada no depende de gratis')

  // Título.
  if (!/tituloGratis\(categoria === null \? null : nombreCategoria, atajo\)/.test(c)) v.push('el título de Gratis no sale de tituloGratis')

  // Cada salida del vacío de Gratis llama a su handler. A3 (nube Q1): se mira
  // solo el `<VacioGratis … />` (el de "Para chicos" usa los mismos handlers).
  const usoVacio = /<VacioGratis\b[\s\S]*?\/>/.exec(c)?.[0] ?? ''
  if (!/onVerTodosLosPrecios=\{\(\) => cambiarGratis\(false\)\}/.test(usoVacio)) v.push('"Ver todos los precios" no apaga Gratis')
  if (!/onTodasLasCategorias=\{\(\) => cambiarCategoria\(null\)\}/.test(usoVacio)) v.push('"Todas las categorías" no vuelve a "Todas"')
  if (!/onEstaSemana=\{\(\) => cambiarAtajo\('semana'\)\}/.test(usoVacio)) v.push('"Ver esta semana" no pasa a la semana')

  // Los botones secundarios de los dos vacíos con el borde de 3:1.
  if (!/onPress=\{\(\) => cambiarCategoria\(null\)\}\s*accessibilityRole="button"\s*style=\{\[estilos\.vacioHoyBoton, estilos\.botonVacio, \{ borderWidth: 1, borderColor: bordeInactivo \}\]\}/.test(c)) {
    v.push('el secundario del vacío de categoría no usa bordeInactivo')
  }
  if (!/bordeSecundario=\{bordeInactivo\}/.test(usoVacio)) v.push('el secundario del vacío de Gratis no usa bordeInactivo')
  // A3, ronda de correcciones: buscado dentro del uso de `<VacioGratis>`, como las otras.
  if (!/texto=\{textoVacio\}/.test(usoVacio)) v.push('el vacío de Gratis no recibe textoVacio')

  const vacio = /function VacioGratis\([\s\S]*?\n\}\n/.exec(c)
  if (!vacio) v.push('no hay function VacioGratis')
  else {
    const cuerpo = vacio[0]
    const pressables = cuerpo.match(/<Pressable\b/g) ?? []
    const roles = cuerpo.match(/accessibilityRole="button"/g) ?? []
    if (!/>\s*Ver todos los precios\s*</.test(cuerpo)) v.push('el vacío no ofrece "Ver todos los precios"')
    if (pressables.length !== roles.length) v.push('un botón del vacío no tiene accessibilityRole="button"')
    if (!/<Pressable\s+onPress=\{onVerTodosLosPrecios\}/.test(cuerpo)) v.push('"Ver todos los precios" no llama onVerTodosLosPrecios')
    if (!/onPress=\{segunda\.tipo === 'todas-las-categorias' \? onTodasLasCategorias : onEstaSemana\}/.test(cuerpo)) v.push('la segunda salida no despacha a su handler')
    if (!/borderColor: bordeSecundario/.test(cuerpo)) v.push('el secundario del vacío de Gratis no usa bordeSecundario')
    if (!/accessibilityLiveRegion="polite">\s*\{texto\}/.test(cuerpo)) v.push('el texto del vacío de Gratis no es una live region')
    if (/BannerAnuncio|BannerRadar/.test(cuerpo)) v.push('hay un banner en el vacío')
  }
  return v
}

/**
 * A3 (nube Q1): reemplaza `a` por `b` solo dentro del `<VacioGratis … />` (el
 * de "Para chicos" usa los mismos handlers y un `replace` suelto lo tocaría a él).
 */
function enVacioGratis(fuente: string, a: string, b: string): string {
  const uso = /<VacioGratis\b[\s\S]*?\/>/.exec(fuente)
  if (!uso) return fuente
  return fuente.slice(0, uso.index) + uso[0].replace(a, b) + fuente.slice(uso.index + uso[0].length)
}

describe('app/(tabs)/index.tsx: el modo "Gratis"', () => {
  const real = leer('../app/(tabs)/index.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesPortada(real)).toEqual([])
  })

  it.each([
    ['arranca prendido', (s: string) => s.replace('useState(false)', 'useState(true)'), 'Gratis no arranca apagado'],
    ['sin scroll arriba', (s: string) => s.replace(/(const cambiarGratis[\s\S]*?)scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/, '$1void 0'), 'cambiarGratis no vuelve el scroll arriba'],
    ['modo grilla sin Gratis', (s: string) => s.replace('const modoGrilla = enModoGrilla({ categoria, gratis, paraChicos })', 'const modoGrilla = enModoGrilla({ categoria, gratis: false, paraChicos })'), 'modoGrilla no es enModoGrilla({ categoria, gratis })'],
    ['condición repetida en línea', (s: string) => s.replace('if (enModoGrilla({ categoria, gratis, paraChicos })) {', 'if (categoria !== null || gratis || paraChicos) {'), 'se repite `categoria !== null || gratis` en línea'],
    ['Hero con Gratis', (s: string) => s.replace('{!modoGrilla && datosPortada.carrusel', '{categoria === null && datosPortada.carrusel'), 'el Hero no se apaga con Gratis'],
    ['banners con Gratis', (s: string) => s.replace('datosPortada && !modoGrilla ? seccionesPortada(', 'datosPortada && categoria === null ? seccionesPortada('), 'las secciones (banners y anuncio) no se apagan con Gratis'],
    ['fila de chips sin barra', (s: string) => s.replace('onCambiar={cambiarCategoria} mostrarBarra />', 'onCambiar={cambiarCategoria} />'), 'la fila de chips no se dibuja con sus chips y su barra'],
    ['Gratis de vuelta en la fila con scroll', (s: string) => s.replace('<ChipGratis activo={gratis} onCambiar={cambiarGratis} />\n', ''), 'el chip Gratis no va primero en la fila fija de filtros de la cabecera'],
    ['fila de filtros condicional', (s: string) => s.replace('<View style={estilos.filaFiltros}>', '{modoGrilla ? null : null}<View style={estilos.filaFiltros}>'), 'el chip Gratis no va primero en la fila fija de filtros de la cabecera'],
    ['fila de filtros sin wrap', (s: string) => s.replace("filaFiltros: { flexDirection: 'row', flexWrap: 'wrap',", "filaFiltros: { flexDirection: 'row',"), 'filaFiltros no es una fila con wrap'],
    ['pills con margen condicional', (s: string) => s.replace('<View style={estilos.pillsBajoChips}>', '<View style={datosPortada.chips.length > 0 ? estilos.pillsBajoChips : null}>'), 'las pills no se acomodan bajo las filas de arriba'],
    ['vacío de Gratis sin el texto', (s: string) => enVacioGratis(s, 'texto={textoVacio}', 'texto=""'), 'el vacío de Gratis no recibe textoVacio'],
    ['vacío de categoría con Gratis', (s: string) => s.replace('eventosCategoria.length === 0 && categoria !== null && !gratis && !paraChicos ? (', 'eventosCategoria.length === 0 && categoria !== null && !paraChicos ? ('), 'el vacío de categoría también se muestra con Gratis'],
    ['vacío sin anuncio', (s: string) => s.replace('const anuncio = datosPortada\n    ? anuncioDeLaGrilla({', 'const anuncio = datosPortada && false\n    ? anuncioDeLaGrilla({'), 'el anuncio no sale de anuncioDeLaGrilla'],
    ['vacío de categoría sin live region', (s: string) => s.replace(/accessibilityLiveRegion="polite">(\s*)\{textoVacio\}/, '>$1{textoVacio}'), 'el vacío de categoría no muestra textoVacio en una live region'],
    ['grilla sin gratis', (s: string) => s.replace('{ atajo, categoria, gratis, paraChicos }, ahora)', '{ atajo, categoria, gratis: false, paraChicos }, ahora)'), 'la grilla no filtra con gratis'],
    ['"Ver todos los precios" que no apaga', (s: string) => s.replace('onVerTodosLosPrecios={() => cambiarGratis(false)}', 'onVerTodosLosPrecios={() => cambiarCategoria(null)}'), '"Ver todos los precios" no apaga Gratis'],
    ['"Todas las categorías" que apaga Gratis', (s: string) => enVacioGratis(s, 'onTodasLasCategorias={() => cambiarCategoria(null)}', 'onTodasLasCategorias={() => cambiarGratis(false)}'), '"Todas las categorías" no vuelve a "Todas"'],
    ['"Ver esta semana" a hoy', (s: string) => enVacioGratis(s, "onEstaSemana={() => cambiarAtajo('semana')}", "onEstaSemana={() => cambiarAtajo('hoy')}"), '"Ver esta semana" no pasa a la semana'],
    ['secundario del vacío de Gratis sin bordeInactivo', (s: string) => enVacioGratis(s, 'bordeSecundario={bordeInactivo}', 'bordeSecundario={colores.border}'), 'el secundario del vacío de Gratis no usa bordeInactivo'],
    ['segunda salida cruzada', (s: string) => s.replace("segunda.tipo === 'todas-las-categorias' ? onTodasLasCategorias : onEstaSemana", "segunda.tipo === 'todas-las-categorias' ? onEstaSemana : onTodasLasCategorias"), 'la segunda salida no despacha a su handler'],
    ['secundario de categoría con colores.border', (s: string) => s.replace('{ borderWidth: 1, borderColor: bordeInactivo }]}\n                  >\n                    <Texto peso="bold">Todas las categorías', '{ borderWidth: 1, borderColor: colores.border }]}\n                  >\n                    <Texto peso="bold">Todas las categorías'), 'el secundario del vacío de categoría no usa bordeInactivo'],
    ['sin "Ver todos los precios"', (s: string) => s.replace('Ver todos los precios\n', 'Ver más\n'), 'el vacío no ofrece "Ver todos los precios"'],
    ['botón del vacío sin rol', (s: string) => s.replace(/(onPress=\{onVerTodosLosPrecios\}\s*)accessibilityRole="button"/, '$1'), 'un botón del vacío no tiene accessibilityRole="button"'],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesPortada(roto)).toContain(esperada)
  })
})
