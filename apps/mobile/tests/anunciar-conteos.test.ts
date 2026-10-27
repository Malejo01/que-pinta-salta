// A8 (nube Q1, QPS-339): los conteos que cambian por un filtro se anuncian a
// mano (Android e iOS) desde `useAnunciarConteo`, sin live region. Partes:
//   1. La lógica pura de `lib/anunciar-conteo.ts`, importada de verdad: qué se
//      anuncia (`decidirAnuncio`), cuándo (`demoraDelAnuncio`), el anunciador
//      con su espera del texto tipeado (con el reloj falso de Vitest) y lo que
//      arma cada pantalla (portada, Buscar, Cines) con sus textos reales.
//   2. Detectores sobre el fuente sin comentarios (no hay runner de React
//      Native): cada pantalla usa el hook con su armador, el hook anuncia
//      siempre (sin rama por plataforma) y limpia su temporizador, y no queda
//      ningún conteo con live region + anuncio (doble lectura) ni ningún
//      `announceForAccessibility` suelto fuera del hook. Cada detector tiene
//      sus roturas en memoria que lo ponen en rojo.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import {
  ANUNCIO_EXPLORAR,
  componerAnuncio,
  conteoPeliculas,
  crearAnunciadorDeConteo,
  decidirAnuncio,
  DEMORA_TEXTO_MS,
  demoraDelAnuncio,
  estadoAnunciableBuscar,
  estadoAnunciableCines,
  estadoAnunciablePortada,
  textoHablado,
  type EstadoAnunciable,
} from '../lib/anunciar-conteo'
import type { FiltrosTextoBuscar } from '../lib/buscar-filtros'
import { anuncioDeLaGrilla, textoVacioGratis, tituloGratis } from '../lib/portada-gratis'
import { tituloParaChicos } from '../lib/portada-para-chicos'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// 1. Lógica pura
// ---------------------------------------------------------------------------

const base: EstadoAnunciable = { clave: 'hoy|musica||', titulo: 'Música · Hoy', conteo: '3 eventos', alSalir: 'Todos los eventos · Hoy' }

describe('textoHablado y componerAnuncio', () => {
  it('el « · » se dice como una coma', () => {
    expect(textoHablado('Música gratis · Hoy')).toBe('Música gratis, Hoy')
    expect(textoHablado('3 eventos gratis en Música · el finde')).toBe('3 eventos gratis en Música, el finde')
    expect(textoHablado('3 eventos')).toBe('3 eventos')
  })

  it('título: conteo, o el conteo solo', () => {
    expect(componerAnuncio('Música gratis · Hoy', '3 eventos')).toBe('Música gratis, Hoy: 3 eventos')
    expect(componerAnuncio(null, '3 eventos')).toBe('3 eventos')
    expect(componerAnuncio('', '3 eventos')).toBe('3 eventos')
  })
})

describe('decidirAnuncio: qué se anuncia', () => {
  it('mismo resultado y mismo texto -> no anuncia (un render más no es un cambio)', () => {
    expect(decidirAnuncio(base, { ...base })).toBeNull()
  })

  it('mismo número con otro filtro (otra clave y otro título) -> título + conteo', () => {
    const gratis = { ...base, clave: 'hoy|musica|gratis|', titulo: 'Música gratis · Hoy' }
    expect(decidirAnuncio(base, gratis)).toBe('Música gratis, Hoy: 3 eventos')
  })

  it('mismo número, mismo título visible, otro filtro (Cine · En cartel con otra fecha) -> igual anuncia', () => {
    const cine: EstadoAnunciable = { clave: 'hoy|cine||', titulo: 'Cine · En cartel', conteo: '5 películas' }
    expect(decidirAnuncio(cine, { ...cine, clave: 'finde|cine||' })).toBe('Cine, En cartel: 5 películas')
  })

  it('aparición (no había conteo) -> título + conteo', () => {
    const normal: EstadoAnunciable = { clave: 'hoy|||', titulo: null, conteo: null, alSalir: 'Todos los eventos · Hoy' }
    expect(decidirAnuncio(normal, base)).toBe('Música, Hoy: 3 eventos')
    // Desde «no hay nada» (cargando): llegar a Buscar con `?categoria=`.
    expect(decidirAnuncio(null, base)).toBe('Música, Hoy: 3 eventos')
  })

  it('desaparición / salida del modo grilla -> alSalir', () => {
    const normal: EstadoAnunciable = { clave: 'hoy|||', titulo: null, conteo: null, alSalir: 'Todos los eventos · Hoy' }
    expect(decidirAnuncio(base, normal)).toBe('Todos los eventos, Hoy')
    expect(decidirAnuncio(base, { ...normal, alSalir: null })).toBeNull()
    expect(decidirAnuncio(base, { ...normal, alSalir: undefined })).toBeNull()
  })

  it('sin conteo antes ni después (pill en la portada normal) -> nada', () => {
    const hoy: EstadoAnunciable = { clave: 'hoy|||', titulo: null, conteo: null, alSalir: 'Todos los eventos · Hoy' }
    expect(decidirAnuncio(hoy, { ...hoy, clave: 'finde|||', alSalir: 'Todos los eventos · Finde' })).toBeNull()
    // De «nada» (cargando) a la portada normal: tampoco.
    expect(decidirAnuncio(null, hoy)).toBeNull()
  })

  it('pasar a cargando no es un cambio que anunciar', () => {
    expect(decidirAnuncio(base, null)).toBeNull()
    expect(decidirAnuncio(null, null)).toBeNull()
  })

  it('mismo resultado y otro número (pull-to-refresh) -> el conteo solo', () => {
    expect(decidirAnuncio(base, { ...base, conteo: '4 eventos' })).toBe('4 eventos')
  })

  it('el vacío va sin título (ya nombra los filtros)', () => {
    const vacio = { ...base, clave: 'hoy|musica|gratis|', titulo: null, conteo: 'No hay eventos gratis de Música para hoy.' }
    expect(decidirAnuncio(base, vacio)).toBe('No hay eventos gratis de Música para hoy.')
  })

  it('otro texto tipeado con el mismo número -> anuncia', () => {
    const a: EstadoAnunciable = { clave: '', texto: 'roc', titulo: null, conteo: '2 resultados para "roc"' }
    const b: EstadoAnunciable = { clave: '', texto: 'rock', titulo: null, conteo: '2 resultados para "rock"' }
    expect(decidirAnuncio(a, b)).toBe('2 resultados para "rock"')
  })
})

describe('demoraDelAnuncio: cuándo', () => {
  const t = (texto: string, clave = ''): EstadoAnunciable => ({ clave, texto, titulo: null, conteo: texto ? `x ${texto}` : null })

  it('solo cambió el texto tipeado -> espera DEMORA_TEXTO_MS (entre 600 y 800 ms)', () => {
    expect(DEMORA_TEXTO_MS).toBeGreaterThanOrEqual(600)
    expect(DEMORA_TEXTO_MS).toBeLessThanOrEqual(800)
    expect(demoraDelAnuncio(t('ro'), t('rock'))).toBe(DEMORA_TEXTO_MS)
    expect(demoraDelAnuncio(t(''), t('r'))).toBe(DEMORA_TEXTO_MS)
  })

  it('el campo quedó vacío (Limpiar búsqueda) -> al toque', () => {
    expect(demoraDelAnuncio(t('rock'), t(''))).toBe(0)
    expect(demoraDelAnuncio(t('rock'), t('   '))).toBe(0)
  })

  it('cambió un filtro por toque -> al toque (aunque también cambie el texto)', () => {
    expect(demoraDelAnuncio(t('rock'), t('rock', 'gratis'))).toBe(0)
    expect(demoraDelAnuncio(t('roc'), t('rock', 'gratis'))).toBe(0)
  })

  it('sin estado (cargando) o sin cambios -> al toque', () => {
    expect(demoraDelAnuncio(null, t('rock'))).toBe(0)
    expect(demoraDelAnuncio(t('rock'), null)).toBe(0)
    expect(demoraDelAnuncio(t('rock'), t('rock'))).toBe(0)
  })
})

describe('crearAnunciadorDeConteo: montaje, toques y debounce del texto', () => {
  let dichos: string[]
  let anunciador: ReturnType<typeof crearAnunciadorDeConteo>
  const buscar = (texto: string, clave = ''): EstadoAnunciable => ({
    clave,
    texto,
    titulo: null,
    conteo: texto ? `1 resultado para "${texto}"` : null,
    alSalir: ANUNCIO_EXPLORAR,
  })

  beforeEach(() => {
    vi.useFakeTimers()
    dichos = []
    anunciador = crearAnunciadorDeConteo({
      anunciar: (texto) => dichos.push(texto),
      reloj: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) },
    })
  })

  afterEach(() => {
    anunciador.cancelar()
    vi.useRealTimers()
  })

  it('el montaje no se anuncia, aunque ya tenga conteo', () => {
    anunciador.observar(base)
    vi.runAllTimers()
    expect(dichos).toEqual([])
  })

  it('montaje cargando y después un conteo (llegar con ?categoria=) -> se anuncia', () => {
    anunciador.observar(null)
    anunciador.observar(base)
    expect(dichos).toEqual(['Música, Hoy: 3 eventos'])
  })

  it('un toque se anuncia al toque', () => {
    anunciador.observar({ ...base, conteo: null, titulo: null })
    anunciador.observar(base)
    expect(dichos).toEqual(['Música, Hoy: 3 eventos'])
  })

  it('tipear: nada en cada tecla, una sola vez cuando el texto se estabiliza', () => {
    anunciador.observar(buscar(''))
    for (const parcial of ['r', 'ro', 'roc', 'rock']) {
      anunciador.observar(buscar(parcial))
      vi.advanceTimersByTime(DEMORA_TEXTO_MS - 100)
    }
    expect(dichos).toEqual([])
    vi.advanceTimersByTime(100)
    expect(dichos).toEqual(['1 resultado para "rock"'])
    vi.runAllTimers()
    expect(dichos).toHaveLength(1)
  })

  it('tipear y borrar lo mismo antes de la espera -> nada', () => {
    anunciador.observar(buscar('rock'))
    anunciador.observar(buscar('rocks'))
    anunciador.observar(buscar('rock'))
    vi.runAllTimers()
    expect(dichos).toEqual([])
  })

  it('un toque durante la espera cancela lo pendiente y se anuncia al toque', () => {
    anunciador.observar(buscar(''))
    anunciador.observar(buscar('rock'))
    anunciador.observar(buscar('rock', 'gratis'))
    expect(dichos).toEqual(['1 resultado para "rock"'])
    vi.runAllTimers()
    expect(dichos).toHaveLength(1)
  })

  it('vaciar el campo (Limpiar búsqueda) se anuncia al toque', () => {
    anunciador.observar(buscar(''))
    anunciador.observar(buscar('rock'))
    vi.runAllTimers()
    anunciador.observar(buscar(''))
    expect(dichos).toEqual(['1 resultado para "rock"', ANUNCIO_EXPLORAR])
  })

  it('cancelar (desmontar) descarta lo pendiente', () => {
    anunciador.observar(buscar(''))
    anunciador.observar(buscar('rock'))
    anunciador.cancelar()
    vi.runAllTimers()
    expect(dichos).toEqual([])
  })
})

describe('estadoAnunciablePortada: los casos del ticket', () => {
  const portada = (p: { categoria: string | null; nombre?: string; gratis?: boolean; paraChicos?: boolean; cantidad: number; atajo?: 'hoy' | 'finde' }) => {
    const atajo = p.atajo ?? 'hoy'
    const gratis = p.gratis ?? false
    const paraChicos = p.paraChicos ?? false
    const nombre = p.categoria === null ? null : (p.nombre ?? 'Música')
    const modoGrilla = p.categoria !== null || gratis || paraChicos
    const tituloGrilla = paraChicos
      ? tituloParaChicos(nombre, p.categoria, atajo, gratis)
      : gratis
        ? tituloGratis(nombre, atajo)
        : `${nombre ?? ''} · ${atajo === 'hoy' ? 'Hoy' : 'Finde'}`
    const anuncio = anuncioDeLaGrilla({
      modoGrilla,
      gratis,
      paraChicos,
      cantidad: p.cantidad,
      textoConteo: `${p.cantidad} ${p.cantidad === 1 ? 'evento' : 'eventos'}`,
      textoVacio: textoVacioGratis(p.categoria, nombre ?? '', atajo),
    })
    return estadoAnunciablePortada({ atajo, categoria: p.categoria, gratis, paraChicos, tituloGrilla, anuncio })
  }

  it('Música con 3 eventos, todos gratis: prender «Gratis» anuncia el título nuevo', () => {
    expect(decidirAnuncio(portada({ categoria: 'musica', cantidad: 3 }), portada({ categoria: 'musica', gratis: true, cantidad: 3 }))).toBe(
      'Música gratis, Hoy: 3 eventos',
    )
  })

  it('entrar al modo grilla anuncia título + conteo', () => {
    expect(decidirAnuncio(portada({ categoria: null, cantidad: 0 }), portada({ categoria: 'musica', cantidad: 3 }))).toBe('Música, Hoy: 3 eventos')
    expect(decidirAnuncio(portada({ categoria: null, cantidad: 0 }), portada({ categoria: null, paraChicos: true, cantidad: 2 }))).toBe(
      'Para chicos, Hoy: 2 eventos',
    )
  })

  it('salir del modo grilla (apagar el último filtro, «Todas las categorías», «Ver todos los precios») anuncia la portada normal', () => {
    expect(decidirAnuncio(portada({ categoria: 'musica', cantidad: 3 }), portada({ categoria: null, cantidad: 0 }))).toBe('Todos los eventos, Hoy')
    expect(decidirAnuncio(portada({ categoria: null, gratis: true, cantidad: 0, atajo: 'finde' }), portada({ categoria: null, cantidad: 0, atajo: 'finde' }))).toBe(
      'Todos los eventos, Finde',
    )
  })

  it('el vacío se anuncia con su texto, sin el título', () => {
    expect(decidirAnuncio(portada({ categoria: 'musica', cantidad: 3 }), portada({ categoria: 'musica', gratis: true, cantidad: 0 }))).toBe(
      'No hay eventos gratis de Música para hoy.',
    )
  })

  it('las pills en la portada normal no anuncian nada', () => {
    expect(decidirAnuncio(portada({ categoria: null, cantidad: 0 }), portada({ categoria: null, cantidad: 0, atajo: 'finde' }))).toBeNull()
  })
})

describe('estadoAnunciableBuscar', () => {
  const f = (cambios: Partial<FiltrosTextoBuscar> = {}): FiltrosTextoBuscar => ({
    texto: '',
    soloGratis: false,
    paraChicos: false,
    categoria: null,
    nombreCategoria: null,
    atajo: null,
    ...cambios,
  })
  const b = (filtros: FiltrosTextoBuscar, cantidad: number) => {
    const mostrarResultados = Boolean(filtros.texto) || filtros.soloGratis || filtros.paraChicos || filtros.categoria !== null || filtros.atajo !== null
    return estadoAnunciableBuscar({ mostrarResultados, cantidad, filtros })
  }

  it('de «Explorar por categoría» a resultados (tocar una categoría) -> el conteo nuevo', () => {
    expect(decidirAnuncio(b(f(), 10), b(f({ categoria: 'musica', nombreCategoria: 'Música' }), 3))).toBe('3 eventos en Música')
  })

  it('prender un filtro con el mismo número: el conteo visible ya lo nombra', () => {
    const musica = f({ categoria: 'musica', nombreCategoria: 'Música' })
    expect(decidirAnuncio(b(musica, 3), b({ ...musica, soloGratis: true }, 3))).toBe('3 eventos gratis en Música')
  })

  it('con texto, los chips de filtro que el conteo no nombra van como título', () => {
    const rock = f({ texto: 'rock' })
    expect(decidirAnuncio(b(rock, 3), b({ ...rock, soloGratis: true }, 3))).toBe('Gratis: 3 resultados para "rock"')
    expect(decidirAnuncio(b(rock, 3), b({ ...rock, soloGratis: true, paraChicos: true }, 3))).toBe('Gratis y para chicos: 3 resultados para "rock"')
    // Con Infantil no se repite «para chicos».
    const infantil = f({ texto: 'rock', categoria: 'infantil', nombreCategoria: 'Infantil' })
    expect(decidirAnuncio(b(infantil, 1), b({ ...infantil, paraChicos: true }, 1))).toBe('1 resultado para "rock" en Infantil')
    // Apagar el chip con el mismo número también dice algo.
    expect(decidirAnuncio(b({ ...rock, soloGratis: true }, 3), b(rock, 3))).toBe('3 resultados para "rock"')
  })

  it('sin resultados se anuncia el texto del vacío, no «0 eventos»', () => {
    expect(decidirAnuncio(b(f(), 10), b(f({ atajo: 'hoy', soloGratis: true }), 0))).toBe('No hay eventos gratis para hoy.')
  })

  it('volver a «Explorar por categoría» lo dice', () => {
    expect(decidirAnuncio(b(f({ categoria: 'musica', nombreCategoria: 'Música' }), 3), b(f(), 10))).toBe('Explorar por categoría')
  })

  it('el texto tipeado espera; los chips no', () => {
    expect(demoraDelAnuncio(b(f(), 10), b(f({ texto: 'r' }), 8))).toBe(DEMORA_TEXTO_MS)
    expect(demoraDelAnuncio(b(f({ texto: 'rock' }), 3), b(f({ texto: 'rock', soloGratis: true }), 3))).toBe(0)
    expect(demoraDelAnuncio(b(f({ texto: 'rock' }), 3), b(f(), 10))).toBe(0)
  })
})

describe('estadoAnunciableCines', () => {
  const c = (busqueda: string, cantidad: number) =>
    estadoAnunciableCines({ busqueda, cantidad, total: 6, textoVacio: `No hay resultados para "${busqueda}". Probá buscando con otro título.` })

  it('sin búsqueda no hay conteo; con búsqueda, «N películas para "x"» o el vacío', () => {
    expect(c('', 6).conteo).toBeNull()
    expect(decidirAnuncio(c('du', 1), c('dun', 1))).toBe('1 película para "dun"')
    expect(decidirAnuncio(c('dun', 1), c('dunx', 0))).toBe('No hay resultados para "dunx". Probá buscando con otro título.')
  })

  it('al limpiar, cuántas hay en cartel', () => {
    expect(decidirAnuncio(c('dun', 1), c('', 6))).toBe('6 películas en cartel')
    expect(conteoPeliculas(1)).toBe('1 película')
  })

  it('tipear espera; limpiar no', () => {
    expect(demoraDelAnuncio(c('', 6), c('d', 3))).toBe(DEMORA_TEXTO_MS)
    expect(demoraDelAnuncio(c('dun', 1), c('', 6))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Detectores
// ---------------------------------------------------------------------------

/** Las pantallas que entran en A8, con el armador que tiene que pasarle al hook. */
const PANTALLAS: { ruta: string[]; llamada: RegExp }[] = [
  {
    ruta: ['app', '(tabs)', 'index.tsx'],
    llamada: /useAnunciarConteo\(\s*datosPortada\s*\?\s*estadoAnunciablePortada\(\{[^}]*\}\)\s*:\s*null\s*\)/,
  },
  {
    ruta: ['app', '(tabs)', 'buscar.tsx'],
    llamada:
      /useAnunciarConteo\(\s*estado\.tipo === 'ok'\s*\?\s*estadoAnunciableBuscar\(\{\s*mostrarResultados,\s*cantidad: resultadosMostrados\.length,\s*filtros: filtrosTexto\s*\}\)\s*:\s*null,?\s*\)/,
  },
  {
    ruta: ['app', 'cines.tsx'],
    llamada:
      /useAnunciarConteo\(\s*estado\.tipo === 'ok'\s*\?\s*estadoAnunciableCines\(\{\s*busqueda,\s*cantidad: filtradas\.length,\s*total: peliculas\.length,\s*textoVacio: mensajeVacio\s*\}\)\s*:\s*null,?\s*\)/,
  },
]

/** Una pantalla de A8: usa el hook con su armador y no anuncia dos veces. */
export function violacionesPantalla(fuente: string, llamada: RegExp): string[] {
  const c = quitarComentarios(fuente)
  const v: string[] = []
  if (!/import \{ useAnunciarConteo \} from '@\/lib\/anunciar-conteo-hook'/.test(c)) v.push('no importa useAnunciarConteo')
  if (!llamada.test(c)) v.push('no llama a useAnunciarConteo con su armador')
  if ((c.match(/useAnunciarConteo\(/g) ?? []).length !== 1) v.push('no llama a useAnunciarConteo exactamente una vez')
  if (/accessibilityLiveRegion/.test(c)) v.push('tiene una live region además del anuncio (doble lectura)')
  if (/announceForAccessibility/.test(c)) v.push('anuncia por su cuenta además del hook (doble anuncio)')
  return v
}

describe('detector: cada pantalla con conteo por filtro usa el hook y no anuncia dos veces', () => {
  for (const { ruta, llamada } of PANTALLAS) {
    const nombre = ruta.join('/')
    const real = leer(...ruta)

    it(`${nombre}: el fuente real no tiene violaciones`, () => {
      expect(violacionesPantalla(real, llamada)).toEqual([])
    })

    it.each([
      ['sin el import', (s: string) => s.replace("import { useAnunciarConteo } from '@/lib/anunciar-conteo-hook'", "import { useAnunciarConteo as _u } from '@/lib/anunciar-conteo-hook'"), 'no importa useAnunciarConteo'],
      ['sin la llamada', (s: string) => s.replace(/useAnunciarConteo\(/, 'void ('), 'no llama a useAnunciarConteo con su armador'],
      ['siempre con null', (s: string) => s.replace(/useAnunciarConteo\(\s*(datosPortada|estado\.tipo === 'ok')/, 'useAnunciarConteo(false'), 'no llama a useAnunciarConteo con su armador'],
      ['dos llamadas', (s: string) => s.replace(/(\n\s*)useAnunciarConteo\(/, '$1useAnunciarConteo(null)$1useAnunciarConteo('), 'no llama a useAnunciarConteo exactamente una vez'],
      ['live region de vuelta', (s: string) => s.replace(/<Texto /, '<Texto accessibilityLiveRegion="polite" '), 'tiene una live region además del anuncio (doble lectura)'],
      ['anuncio suelto', (s: string) => s.replace(/(\n\s*)useAnunciarConteo\(/, "$1AccessibilityInfo.announceForAccessibility('x')$1useAnunciarConteo("), 'anuncia por su cuenta además del hook (doble anuncio)'],
    ])(`${nombre}: rotura en memoria: %s -> detectada`, (_n, romper, esperada) => {
      const roto = romper(real)
      expect(roto).not.toBe(real)
      expect(violacionesPantalla(roto, llamada)).toContain(esperada)
    })
  }
})

/** El hook: anuncia siempre (sin rama por plataforma), con su temporizador limpio. */
export function violacionesHook(fuente: string): string[] {
  const c = quitarComentarios(fuente)
  const v: string[] = []
  if (!/AccessibilityInfo\.announceForAccessibilityWithOptions\(texto, \{ queue: true \}\)/.test(c)) v.push('no anuncia con announceForAccessibilityWithOptions(texto, { queue: true })')
  if (/\bPlatform\b/.test(c)) v.push('tiene una rama por plataforma (A8: se anuncia igual en Android y en iOS)')
  if (!/crearAnunciadorDeConteo\(\{ anunciar: anunciarConLector, reloj: \{ setTimeout, clearTimeout \} \}\)/.test(c)) v.push('no usa crearAnunciadorDeConteo con el lector y el reloj real')
  if (!/return \(\) => actual\.cancelar\(\)/.test(c)) v.push('el efecto no cancela el anuncio pendiente al limpiar')
  if (!/\}, \[listo, clave, texto, titulo, conteo, alSalir\]\)/.test(c)) v.push('el efecto no depende de todos los campos del estado')
  if (/\bset[A-Z]\w*\(/.test(c.replace(/\bsetTimeout\b/g, ''))) v.push('el hook hace setState (un anuncio no es setState)')
  return v
}

describe('detector: lib/anunciar-conteo-hook.ts', () => {
  const real = leer('lib', 'anunciar-conteo-hook.ts')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesHook(real)).toEqual([])
  })

  it.each([
    ['sin queue', (s: string) => s.replace('{ queue: true }', '{}'), 'no anuncia con announceForAccessibilityWithOptions(texto, { queue: true })'],
    ['solo en iOS', (s: string) => s.replace("import { AccessibilityInfo } from 'react-native'", "import { AccessibilityInfo, Platform } from 'react-native'").replace('  AccessibilityInfo.announceForAccessibilityWithOptions', "  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions"), 'tiene una rama por plataforma (A8: se anuncia igual en Android y en iOS)'],
    ['sin limpiar el temporizador', (s: string) => s.replace('return () => actual.cancelar()', 'return undefined'), 'el efecto no cancela el anuncio pendiente al limpiar'],
    ['sin una dependencia', (s: string) => s.replace('}, [listo, clave, texto, titulo, conteo, alSalir])', '}, [listo, clave, conteo])'), 'el efecto no depende de todos los campos del estado'],
    ['otro reloj', (s: string) => s.replace('reloj: { setTimeout, clearTimeout }', 'reloj: { setTimeout, clearTimeout: () => undefined }'), 'no usa crearAnunciadorDeConteo con el lector y el reloj real'],
    ['con setState', (s: string) => s.replace('    anunciador.current = actual\n', '    anunciador.current = actual\n    setAnunciado(true)\n'), 'el hook hace setState (un anuncio no es setState)'],
  ])('rotura en memoria: %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesHook(roto)).toContain(esperada)
  })
})

/** Todos los .ts/.tsx de app/, components/ y lib/ (sin node_modules). */
function fuentesDeLaApp(): { ruta: string; fuente: string }[] {
  const salida: { ruta: string; fuente: string }[] = []
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else if (/\.tsx?$/.test(nombre)) salida.push({ ruta: relative(MOBILE_ROOT, ruta).replace(/\\/g, '/'), fuente: readFileSync(ruta, 'utf8') })
    }
  }
  for (const carpeta of ['app', 'components', 'lib']) recorrer(join(MOBILE_ROOT, carpeta))
  return salida
}

/**
 * En toda la app, `announceForAccessibility*` solo vive en el hook, y ningún
 * archivo que usa el hook tiene una live region (un solo anuncio por cambio).
 * Las live regions que quedan (`AvisoSinConexion`, `BotonCalendario`,
 * `HojaCompartirTarjeta`) son mensajes que no anuncia el hook.
 */
export function violacionesGlobales(fuentes: { ruta: string; fuente: string }[]): string[] {
  const v: string[] = []
  for (const { ruta, fuente } of fuentes) {
    const c = quitarComentarios(fuente)
    if (/announceForAccessibility/.test(c) && ruta !== 'lib/anunciar-conteo-hook.ts') v.push(`${ruta}: announceForAccessibility fuera de useAnunciarConteo`)
    if (/useAnunciarConteo\(/.test(c) && /accessibilityLiveRegion/.test(c)) v.push(`${ruta}: usa useAnunciarConteo y tiene una live region`)
  }
  if (!fuentes.some((f) => f.ruta === 'lib/anunciar-conteo-hook.ts')) v.push('no está lib/anunciar-conteo-hook.ts')
  return v
}

describe('detector global: un solo camino para anunciar conteos', () => {
  const reales = fuentesDeLaApp()

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesGlobales(reales)).toEqual([])
  })

  it('rotura en memoria: un announceForAccessibility en otra pantalla -> detectada', () => {
    const rotas = reales.map((f) => (f.ruta === 'app/(tabs)/favoritos.tsx' ? { ...f, fuente: `${f.fuente}\nAccessibilityInfo.announceForAccessibility('x')\n` } : f))
    expect(violacionesGlobales(rotas)).toContain('app/(tabs)/favoritos.tsx: announceForAccessibility fuera de useAnunciarConteo')
  })

  it('rotura en memoria: una live region en una pantalla con el hook -> detectada', () => {
    const rotas = reales.map((f) => (f.ruta === 'app/(tabs)/buscar.tsx' ? { ...f, fuente: f.fuente.replace('<Texto tono="secundario" style={estilos.tituloSeccion}>', '<Texto tono="secundario" accessibilityLiveRegion="polite" style={estilos.tituloSeccion}>') } : f))
    expect(rotas).not.toEqual(reales)
    expect(violacionesGlobales(rotas)).toContain('app/(tabs)/buscar.tsx: usa useAnunciarConteo y tiene una live region')
  })

  it('rotura en memoria: sin el hook -> detectada', () => {
    expect(violacionesGlobales(reales.filter((f) => f.ruta !== 'lib/anunciar-conteo-hook.ts'))).toContain('no está lib/anunciar-conteo-hook.ts')
  })
})

/** La lógica es pura: sin React ni React Native (si no, Vitest no la podría importar). */
export function violacionesPureza(fuente: string): string[] {
  const c = quitarComentarios(fuente)
  const v: string[] = []
  if (/from 'react(-native)?'/.test(c)) v.push('lib/anunciar-conteo.ts importa React o React Native')
  if (/\bsetTimeout\(/.test(c.replace(/deps\.reloj\.setTimeout\(/g, ''))) v.push('usa setTimeout directo en vez del reloj inyectado')
  return v
}

describe('detector: lib/anunciar-conteo.ts es pura', () => {
  const real = leer('lib', 'anunciar-conteo.ts')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesPureza(real)).toEqual([])
  })

  it.each([
    ['importa react-native', (s: string) => `import { AccessibilityInfo } from 'react-native'\n${s}`, 'lib/anunciar-conteo.ts importa React o React Native'],
    ['setTimeout directo', (s: string) => s.replace('pendiente = deps.reloj.setTimeout(', 'pendiente = setTimeout('), 'usa setTimeout directo en vez del reloj inyectado'],
  ])('rotura en memoria: %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesPureza(roto)).toContain(esperada)
  })
})
