// A8 (nube Q1, QPS-339): los conteos que cambian por un filtro se anuncian a
// mano (Android e iOS) desde `useAnunciarConteo`, sin live region en esos
// nodos, y todo anuncio de la app pasa por `anunciar` (`lib/anunciar.ts`).
// Partes:
//   1. La lógica pura de `lib/anunciar-conteo.ts`, importada de verdad: qué se
//      anuncia (`decidirAnuncio`), cuándo (`esperaDelTexto`, `demoraDelToque`),
//      el anunciador con la espera del texto, la demora de los toques en
//      Android, el nonce `toque` y `asentarEnSilencio` (con el reloj falso de
//      Vitest), y lo que arma cada pantalla (portada, Buscar, Cines) con sus
//      textos reales.
//   2. Detectores sobre el fuente sin comentarios (no hay runner de React
//      Native): cada pantalla usa el hook con su armador y no anuncia conteos
//      por su cuenta; el conteo y los vacíos que anuncia el hook no tienen live
//      region (POR NODO: otras live regions de la pantalla, como la de
//      `AvisoSinConexion`, no se tocan); el hook no tiene ramas por plataforma,
//      se calla al perder el foco y limpia su temporizador;
//      `AccessibilityInfo.announceForAccessibility*` solo vive en
//      `lib/anunciar.ts`. Cada detector tiene sus roturas en memoria.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import type { Atajo } from '@qps/core/home/atajos'
import {
  ANUNCIO_EXPLORAR,
  componerAnuncio,
  conteoPeliculas,
  crearAnunciadorDeConteo,
  decidirAnuncio,
  DEMORA_TEXTO_MS,
  DEMORA_TOQUE_ANDROID_MS,
  demoraDelAnuncio,
  demoraDelToque,
  esperaDelTexto,
  estadoAnunciableBuscar,
  estadoAnunciableCines,
  estadoAnunciablePortada,
  textoHablado,
  type EstadoAnunciable,
} from '../lib/anunciar-conteo'
import type { FiltrosTextoBuscar } from '../lib/buscar-filtros'
import { anuncioDeLaGrilla, ETIQUETA_ATAJO, textoVacioGratis, tituloGratis } from '../lib/portada-gratis'
import { tituloParaChicos } from '../lib/portada-para-chicos'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// 1. Lógica pura
// ---------------------------------------------------------------------------

const base: EstadoAnunciable = {
  clave: 'hoy|musica||',
  titulo: 'Música · Hoy',
  conteo: '3 eventos',
  alSalir: 'Sin filtros: todos los eventos de hoy',
}

describe('textoHablado y componerAnuncio', () => {
  it('el « · » se dice como una coma y lo hablado va sin comillas', () => {
    expect(textoHablado('Música gratis · Hoy')).toBe('Música gratis, Hoy')
    expect(textoHablado('3 eventos gratis en Música · el finde')).toBe('3 eventos gratis en Música, el finde')
    expect(textoHablado('3 resultados para "rock"')).toBe('3 resultados para rock')
    expect(textoHablado('No hay resultados para «dune».')).toBe('No hay resultados para dune.')
    expect(textoHablado('3 eventos')).toBe('3 eventos')
  })

  it('el conteo primero y después el detalle', () => {
    expect(componerAnuncio('3 eventos', 'Música gratis · Hoy')).toBe('3 eventos, Música gratis, Hoy')
    expect(componerAnuncio('3 eventos', null)).toBe('3 eventos')
    expect(componerAnuncio('3 eventos', '')).toBe('3 eventos')
  })
})

describe('decidirAnuncio: qué se anuncia', () => {
  it('mismo resultado y mismo texto -> no anuncia (un render más no es un cambio)', () => {
    expect(decidirAnuncio(base, { ...base })).toBeNull()
  })

  it('mismo número con otro filtro (otra clave y otro título) -> conteo + título', () => {
    const gratis = { ...base, clave: 'hoy|musica|gratis|', titulo: 'Música gratis · Hoy' }
    expect(decidirAnuncio(base, gratis)).toBe('3 eventos, Música gratis, Hoy')
  })

  it('mismo número, mismo título visible, otro filtro (Cine · En cartel con otra fecha) -> igual anuncia', () => {
    const cine: EstadoAnunciable = { clave: 'hoy|cine||', titulo: 'Cine · En cartel', conteo: '5 películas' }
    expect(decidirAnuncio(cine, { ...cine, clave: 'finde|cine||' })).toBe('5 películas, Cine, En cartel')
  })

  it('aparición (no había conteo) -> conteo + título', () => {
    const normal: EstadoAnunciable = { clave: 'hoy|||', titulo: null, conteo: null, alSalir: base.alSalir }
    expect(decidirAnuncio(normal, base)).toBe('3 eventos, Música, Hoy')
    // Desde «no hay nada» (cargando): llegar a Buscar con `?categoria=`.
    expect(decidirAnuncio(null, base)).toBe('3 eventos, Música, Hoy')
  })

  it('desaparición / salida del modo grilla -> alSalir', () => {
    const normal: EstadoAnunciable = { clave: 'hoy|||', titulo: null, conteo: null, alSalir: base.alSalir }
    expect(decidirAnuncio(base, normal)).toBe('Sin filtros: todos los eventos de hoy')
    expect(decidirAnuncio(base, { ...normal, alSalir: null })).toBeNull()
    expect(decidirAnuncio(base, { ...normal, alSalir: undefined })).toBeNull()
  })

  it('sin conteo antes ni después (pill en la portada normal) -> nada', () => {
    const hoy: EstadoAnunciable = { clave: 'hoy|||', titulo: null, conteo: null, alSalir: base.alSalir }
    expect(decidirAnuncio(hoy, { ...hoy, clave: 'finde|||', alSalir: 'Sin filtros: todos los eventos del finde' })).toBeNull()
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

  it('el nonce `toque` solo no es un resultado nuevo (sin doble anuncio)', () => {
    const a: EstadoAnunciable = { clave: '', texto: 'rock', toque: 1, titulo: null, conteo: '2 resultados para "rock"' }
    expect(decidirAnuncio(a, { ...a, toque: 2 })).toBeNull()
  })
})

describe('esperaDelTexto y demoraDelToque: cuándo', () => {
  const t = (texto: string, clave = '', toque?: number): EstadoAnunciable => ({ clave, texto, toque, titulo: null, conteo: texto ? `x ${texto}` : null })

  it('solo cambió el texto tipeado -> espera DEMORA_TEXTO_MS (1500 ms, el teclado de TalkBack)', () => {
    expect(DEMORA_TEXTO_MS).toBe(1500)
    expect(esperaDelTexto(t('ro'), t('rock'))).toBe(true)
    expect(esperaDelTexto(t(''), t('r'))).toBe(true)
    expect(demoraDelAnuncio(t('ro'), t('rock'), 'android')).toBe(DEMORA_TEXTO_MS)
    expect(demoraDelAnuncio(t('ro'), t('rock'), 'ios')).toBe(DEMORA_TEXTO_MS)
  })

  it('el campo quedó vacío (solo `\'\'`: las pantallas normalizan con trim) -> es un toque', () => {
    expect(esperaDelTexto(t('rock'), t(''))).toBe(false)
    expect(esperaDelTexto(t('rock'), t('   '))).toBe(true)
  })

  it('cambió un filtro por toque, o llegó un texto por toque (nonce) -> sin espera', () => {
    expect(esperaDelTexto(t('rock'), t('rock', 'gratis'))).toBe(false)
    expect(esperaDelTexto(t('roc'), t('rock', 'gratis'))).toBe(false)
    expect(esperaDelTexto(t('roc', '', 1), t('rock', '', 2))).toBe(false)
    expect(esperaDelTexto(t('', '', 1), t('rock', '', 1))).toBe(true)
  })

  it('sin estado (cargando) o sin cambios -> sin espera', () => {
    expect(esperaDelTexto(null, t('rock'))).toBe(false)
    expect(esperaDelTexto(t('rock'), null)).toBe(false)
    expect(esperaDelTexto(t('rock'), t('rock'))).toBe(false)
  })

  it('los toques esperan 400 ms en Android (sin `queue`) y nada en iOS', () => {
    expect(DEMORA_TOQUE_ANDROID_MS).toBe(400)
    expect(demoraDelToque('android')).toBe(400)
    expect(demoraDelToque('ios')).toBe(0)
    expect(demoraDelAnuncio(t('rock'), t('rock', 'gratis'), 'android')).toBe(400)
    expect(demoraDelAnuncio(t('rock'), t('rock', 'gratis'), 'ios')).toBe(0)
  })
})

describe('crearAnunciadorDeConteo: montaje, toques, debounce, nonce y foco', () => {
  let dichos: string[]
  const buscar = (texto: string, clave = '', toque?: number): EstadoAnunciable => ({
    clave,
    texto,
    toque,
    titulo: null,
    conteo: texto ? `1 resultado para "${texto}"` : null,
    alSalir: ANUNCIO_EXPLORAR,
  })
  const crear = (plataforma: string) =>
    crearAnunciadorDeConteo({
      anunciar: (texto) => dichos.push(texto),
      reloj: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) },
      plataforma,
    })

  beforeEach(() => {
    vi.useFakeTimers()
    dichos = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('iOS (queue: al toque)', () => {
    let a: ReturnType<typeof crear>
    beforeEach(() => {
      a = crear('ios')
    })
    afterEach(() => a.cancelar())

    it('el montaje no se anuncia, aunque ya tenga conteo', () => {
      a.observar(base)
      vi.runAllTimers()
      expect(dichos).toEqual([])
    })

    it('montaje cargando y después un conteo (llegar con ?categoria=) -> se anuncia', () => {
      a.observar(null)
      a.observar(base)
      expect(dichos).toEqual(['3 eventos, Música, Hoy'])
    })

    it('un toque se anuncia al toque', () => {
      a.observar({ ...base, conteo: null, titulo: null })
      a.observar(base)
      expect(dichos).toEqual(['3 eventos, Música, Hoy'])
    })

    it('tipear: nada en cada tecla, una sola vez cuando el texto se estabiliza', () => {
      a.observar(buscar(''))
      for (const parcial of ['r', 'ro', 'roc', 'rock']) {
        a.observar(buscar(parcial))
        vi.advanceTimersByTime(DEMORA_TEXTO_MS - 100)
      }
      expect(dichos).toEqual([])
      vi.advanceTimersByTime(100)
      expect(dichos).toEqual(['1 resultado para rock'])
      vi.runAllTimers()
      expect(dichos).toHaveLength(1)
    })

    it('tipear y borrar lo mismo antes de la espera -> nada', () => {
      a.observar(buscar('rock'))
      a.observar(buscar('rocks'))
      a.observar(buscar('rock'))
      vi.runAllTimers()
      expect(dichos).toEqual([])
    })

    it('un toque durante la espera cancela lo pendiente y se anuncia al toque', () => {
      a.observar(buscar(''))
      a.observar(buscar('rock'))
      a.observar(buscar('rock', 'gratis'))
      expect(dichos).toEqual(['1 resultado para rock'])
      vi.runAllTimers()
      expect(dichos).toHaveLength(1)
    })

    it('vaciar el campo (Limpiar búsqueda) se anuncia al toque', () => {
      a.observar(buscar(''))
      a.observar(buscar('rock'))
      vi.runAllTimers()
      a.observar(buscar(''))
      expect(dichos).toEqual(['1 resultado para rock', ANUNCIO_EXPLORAR])
    })

    it('texto por toque (enviar, búsqueda reciente de A5) antes de la espera -> al toque, una sola vez', () => {
      a.observar(buscar('', '', 0))
      a.observar(buscar('rock', '', 0))
      a.observar(buscar('rock', '', 1))
      expect(dichos).toEqual(['1 resultado para rock'])
      vi.runAllTimers()
      expect(dichos).toHaveLength(1)
    })

    it('texto por toque (una reciente que pone un texto nuevo de una) -> al toque', () => {
      a.observar(buscar('', '', 0))
      a.observar(buscar('jazz', '', 1))
      expect(dichos).toEqual(['1 resultado para jazz'])
    })

    it('enviar después de que la espera ya lo anunció -> no se repite', () => {
      a.observar(buscar('', '', 0))
      a.observar(buscar('rock', '', 0))
      vi.runAllTimers()
      a.observar(buscar('rock', '', 1))
      vi.runAllTimers()
      expect(dichos).toEqual(['1 resultado para rock'])
    })

    it('cancelar (desmontar) descarta lo pendiente', () => {
      a.observar(buscar(''))
      a.observar(buscar('rock'))
      a.cancelar()
      vi.runAllTimers()
      expect(dichos).toEqual([])
    })

    it('perder el foco: cancela lo pendiente y asienta sin anunciar', () => {
      a.observar(buscar(''))
      a.observar(buscar('rock'))
      a.asentarEnSilencio(buscar('rock'))
      vi.runAllTimers()
      expect(dichos).toEqual([])
      // Al volver con lo mismo, nada; con un cambio (otra `v`, otro filtro), se anuncia.
      a.observar(buscar('rock'))
      expect(dichos).toEqual([])
      a.observar(buscar('rock', 'musica'))
      expect(dichos).toEqual(['1 resultado para rock'])
    })

    it('montarse sin foco tampoco anuncia (asentarEnSilencio cuenta como montaje)', () => {
      a.asentarEnSilencio(null)
      a.observar(null)
      expect(dichos).toEqual([])
    })
  })

  describe('Android (sin queue: los toques esperan 400 ms)', () => {
    let a: ReturnType<typeof crear>
    beforeEach(() => {
      a = crear('android')
    })
    afterEach(() => a.cancelar())

    it('un toque se anuncia a los 400 ms, no antes', () => {
      a.observar({ ...base, conteo: null, titulo: null })
      a.observar(base)
      vi.advanceTimersByTime(DEMORA_TOQUE_ANDROID_MS - 1)
      expect(dichos).toEqual([])
      vi.advanceTimersByTime(1)
      expect(dichos).toEqual(['3 eventos, Música, Hoy'])
    })

    it('dos toques seguidos -> solo el último', () => {
      a.observar({ ...base, conteo: null, titulo: null })
      a.observar(base)
      a.observar({ ...base, clave: 'hoy|musica|gratis|', titulo: 'Música gratis · Hoy', conteo: '2 eventos' })
      vi.runAllTimers()
      expect(dichos).toEqual(['2 eventos, Música gratis, Hoy'])
    })

    it('un render sin cambios durante la espera del toque no la cancela', () => {
      a.observar({ ...base, conteo: null, titulo: null })
      a.observar(base)
      a.observar({ ...base })
      vi.runAllTimers()
      expect(dichos).toEqual(['3 eventos, Música, Hoy'])
    })

    it('lo tipeado espera 1500 ms y no suma los 400 ms del toque', () => {
      a.observar(buscar(''))
      a.observar(buscar('rock'))
      vi.advanceTimersByTime(DEMORA_TEXTO_MS)
      expect(dichos).toEqual(['1 resultado para rock'])
    })

    it('perder el foco durante la espera del toque -> no se dice', () => {
      a.observar({ ...base, conteo: null, titulo: null })
      a.observar(base)
      a.asentarEnSilencio(base)
      vi.runAllTimers()
      expect(dichos).toEqual([])
    })
  })
})

describe('estadoAnunciablePortada: los casos del ticket', () => {
  const portada = (p: { categoria: string | null; nombre?: string; gratis?: boolean; paraChicos?: boolean; cantidad: number; atajo?: Atajo }) => {
    const atajo = p.atajo ?? 'hoy'
    const gratis = p.gratis ?? false
    const paraChicos = p.paraChicos ?? false
    const nombre = p.categoria === null ? null : (p.nombre ?? 'Música')
    const modoGrilla = p.categoria !== null || gratis || paraChicos
    const tituloGrilla = paraChicos
      ? tituloParaChicos(nombre, p.categoria, atajo, gratis)
      : gratis
        ? tituloGratis(nombre, atajo)
        : `${nombre ?? ''} · ${ETIQUETA_ATAJO[atajo]}`
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

  it('Música con 3 eventos, todos gratis: prender «Gratis» anuncia el resultado nuevo', () => {
    expect(decidirAnuncio(portada({ categoria: 'musica', cantidad: 3 }), portada({ categoria: 'musica', gratis: true, cantidad: 3 }))).toBe(
      '3 eventos, Música gratis, Hoy',
    )
  })

  it('entrar al modo grilla anuncia conteo + título', () => {
    expect(decidirAnuncio(portada({ categoria: null, cantidad: 0 }), portada({ categoria: 'musica', cantidad: 3 }))).toBe('3 eventos, Música, Hoy')
    expect(decidirAnuncio(portada({ categoria: null, cantidad: 0 }), portada({ categoria: null, paraChicos: true, cantidad: 2 }))).toBe(
      '2 eventos, Para chicos, Hoy',
    )
  })

  it.each([
    ['hoy', 'Sin filtros: todos los eventos de hoy'],
    ['esta-noche', 'Sin filtros: todos los eventos de esta noche'],
    ['finde', 'Sin filtros: todos los eventos del finde'],
    ['semana', 'Sin filtros: todos los eventos de esta semana'],
  ] as const)('salir del modo grilla con %s -> «%s»', (atajo, texto) => {
    expect(decidirAnuncio(portada({ categoria: 'musica', cantidad: 3, atajo }), portada({ categoria: null, cantidad: 0, atajo }))).toBe(texto)
    expect(decidirAnuncio(portada({ categoria: null, gratis: true, cantidad: 0, atajo }), portada({ categoria: null, cantidad: 0, atajo }))).toBe(texto)
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
  const b = (filtros: FiltrosTextoBuscar, cantidad: number, extra: { v?: string | null; toque?: number } = {}) => {
    const mostrarResultados = Boolean(filtros.texto) || filtros.soloGratis || filtros.paraChicos || filtros.categoria !== null || filtros.atajo !== null
    return estadoAnunciableBuscar({ mostrarResultados, cantidad, filtros, ...extra })
  }

  it('de «Explorar por categoría» a resultados (tocar una categoría) -> el conteo nuevo', () => {
    expect(decidirAnuncio(b(f(), 10), b(f({ categoria: 'musica', nombreCategoria: 'Música' }), 3))).toBe('3 eventos en Música')
  })

  it('prender un filtro con el mismo número: el conteo visible ya lo nombra', () => {
    const musica = f({ categoria: 'musica', nombreCategoria: 'Música' })
    expect(decidirAnuncio(b(musica, 3), b({ ...musica, soloGratis: true }, 3))).toBe('3 eventos gratis en Música')
  })

  it('con texto, los chips que el conteo no nombra van al final con la palabra del chip', () => {
    const rock = f({ texto: 'rock' })
    expect(decidirAnuncio(b(rock, 3), b({ ...rock, soloGratis: true }, 3))).toBe('3 resultados para rock, solo gratis')
    expect(decidirAnuncio(b(rock, 3), b({ ...rock, soloGratis: true, paraChicos: true }, 3))).toBe('3 resultados para rock, solo gratis, para chicos')
    expect(decidirAnuncio(b(rock, 3), b({ ...rock, soloGratis: true }, 0))).toBe('No se encontraron eventos para rock, solo gratis')
    // Con Infantil no se repite «para chicos».
    const infantil = f({ texto: 'rock', categoria: 'infantil', nombreCategoria: 'Infantil' })
    expect(decidirAnuncio(b(infantil, 1), b({ ...infantil, paraChicos: true }, 1))).toBe('1 resultado para rock en Infantil')
    // Apagar el chip con el mismo número también dice algo.
    expect(decidirAnuncio(b({ ...rock, soloGratis: true }, 3), b(rock, 3))).toBe('3 resultados para rock')
  })

  it('el texto entra con trim(): un espacio de más no es otro resultado', () => {
    expect(b(f({ texto: '  rock ' }), 3).texto).toBe('rock')
    expect(decidirAnuncio(b(f({ texto: 'rock' }), 3), b(f({ texto: 'rock ' }), 3))).toBeNull()
    expect(esperaDelTexto(b(f({ texto: 'rock' }), 3), b(f({ texto: '   ' }), 10))).toBe(false)
  })

  it('volver con el mismo ?categoria= y otra `v` vuelve a anunciar', () => {
    const musica = f({ categoria: 'musica', nombreCategoria: 'Música' })
    expect(decidirAnuncio(b(musica, 3, { v: '1' }), b(musica, 3, { v: '2' }))).toBe('3 eventos en Música')
  })

  it('sin resultados se anuncia el texto del vacío, no «0 eventos»', () => {
    expect(decidirAnuncio(b(f(), 10), b(f({ atajo: 'hoy', soloGratis: true }), 0))).toBe('No hay eventos gratis para hoy.')
  })

  it('volver a «Explorar por categoría»: «Sin filtros: explorar por categoría»', () => {
    expect(decidirAnuncio(b(f({ categoria: 'musica', nombreCategoria: 'Música' }), 3), b(f(), 10))).toBe('Sin filtros: explorar por categoría')
  })

  it('el texto tipeado espera; los chips y el envío no', () => {
    expect(esperaDelTexto(b(f(), 10), b(f({ texto: 'r' }), 8))).toBe(true)
    expect(esperaDelTexto(b(f({ texto: 'rock' }), 3), b(f({ texto: 'rock', soloGratis: true }), 3))).toBe(false)
    expect(esperaDelTexto(b(f({ texto: 'roc' }), 3, { toque: 0 }), b(f({ texto: 'rock' }), 3, { toque: 1 }))).toBe(false)
    expect(esperaDelTexto(b(f({ texto: 'rock' }), 3), b(f(), 10))).toBe(false)
  })
})

describe('estadoAnunciableCines', () => {
  const c = (busqueda: string, cantidad: number, toque?: number) => estadoAnunciableCines({ busqueda, cantidad, total: 6, toque })

  it('sin búsqueda no hay conteo; con búsqueda, «N películas para x» o «Ninguna película para x»', () => {
    expect(c('', 6).conteo).toBeNull()
    expect(c('   ', 6).conteo).toBeNull()
    expect(decidirAnuncio(c('du', 1), c('dun', 1))).toBe('1 película para dun')
    expect(decidirAnuncio(c('dun', 1), c('dunx', 0))).toBe('Ninguna película para dunx')
  })

  it('al limpiar, cuántas hay en cartel', () => {
    expect(decidirAnuncio(c('dun', 1), c('', 6))).toBe('6 películas en cartel')
    expect(conteoPeliculas(1)).toBe('1 película')
  })

  it('tipear espera; limpiar y enviar no', () => {
    expect(esperaDelTexto(c('', 6), c('d', 3))).toBe(true)
    expect(esperaDelTexto(c('dun', 1), c('', 6))).toBe(false)
    expect(esperaDelTexto(c('du', 1, 0), c('dun', 1, 1))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Detectores
// ---------------------------------------------------------------------------

/**
 * Los nodos que anuncia el hook, por pantalla: ninguno puede tener live region.
 * Es POR NODO (ronda de correcciones de A8): otras live regions de la misma
 * pantalla (p. ej. `AvisoSinConexion`, A6) no son asunto de este detector.
 */
const NODOS_ANUNCIADOS = /<(?:Texto|View|Text)\b[^>]*accessibilityLiveRegion[^>]*>\s*\{(?:conteoCategoria\(|textoVacio\}|texto\}|textoResultadosBuscar\()/
const VACIO_DE_LISTA_CON_LIVE_REGION = /ListEmptyComponent=\{\s*(?:<View\b[^>]*accessibilityLiveRegion|<Vacio\b[^>]*accessibilityLiveRegion)/
/** Un anuncio de un conteo hecho a mano en la pantalla (en vez del hook). */
const ANUNCIO_DIRECTO_DE_CONTEO = /\banunciar\([^)]*(?:conteo|textoResultados|textoSinResultados|anuncio|textoVacio|filtradas|resultadosMostrados|mensajeVacio)/

/** Las pantallas que entran en A8, con el armador que tiene que pasarle al hook. */
const PANTALLAS: { ruta: string[]; llamada: RegExp; romperNodo: (s: string) => string }[] = [
  {
    ruta: ['app', '(tabs)', 'index.tsx'],
    llamada: /useAnunciarConteo\(\s*datosPortada\s*\?\s*estadoAnunciablePortada\(\{[^}]*\}\)\s*:\s*null\s*\)/,
    romperNodo: (s) => s.replace('<Texto tono="secundario">\n                    {conteoCategoria', '<Texto tono="secundario" accessibilityLiveRegion="polite">\n                    {conteoCategoria'),
  },
  {
    ruta: ['app', '(tabs)', 'buscar.tsx'],
    llamada:
      /useAnunciarConteo\(\s*estado\.tipo === 'ok'\s*\?\s*estadoAnunciableBuscar\(\{\s*mostrarResultados,\s*cantidad: resultadosMostrados\.length,\s*filtros: filtrosTexto,\s*v: vParam,\s*toque: toqueTexto\s*\}\)\s*:\s*null,?\s*\)/,
    romperNodo: (s) => s.replace('<Texto tono="secundario" style={estilos.tituloSeccion}>', '<Texto tono="secundario" accessibilityLiveRegion="polite" style={estilos.tituloSeccion}>'),
  },
  {
    ruta: ['app', 'cines.tsx'],
    llamada:
      /useAnunciarConteo\(\s*estado\.tipo === 'ok'\s*\?\s*estadoAnunciableCines\(\{\s*busqueda,\s*cantidad: filtradas\.length,\s*total: peliculas\.length,\s*toque: toqueBusqueda\s*\}\)\s*:\s*null,?\s*\)/,
    romperNodo: (s) => s.replace('ListEmptyComponent={<Vacio mensaje={mensajeVacio} />}', 'ListEmptyComponent={<View accessibilityLiveRegion="polite"><Vacio mensaje={mensajeVacio} /></View>}'),
  },
]

/** Una pantalla de A8: usa el hook con su armador y no anuncia sus conteos dos veces. */
export function violacionesPantalla(fuente: string, llamada: RegExp): string[] {
  const c = quitarComentarios(fuente)
  const v: string[] = []
  if (!/import \{ useAnunciarConteo \} from '@\/lib\/anunciar-conteo-hook'/.test(c)) v.push('no importa useAnunciarConteo')
  if (!llamada.test(c)) v.push('no llama a useAnunciarConteo con su armador')
  if ((c.match(/useAnunciarConteo\(/g) ?? []).length !== 1) v.push('no llama a useAnunciarConteo exactamente una vez')
  if (NODOS_ANUNCIADOS.test(c) || VACIO_DE_LISTA_CON_LIVE_REGION.test(c)) v.push('un nodo que anuncia el hook tiene live region (doble lectura)')
  if (/AccessibilityInfo\.announceForAccessibility/.test(c)) v.push('anuncia con AccessibilityInfo directo (doble anuncio)')
  if (ANUNCIO_DIRECTO_DE_CONTEO.test(c)) v.push('anuncia un conteo a mano además del hook (doble anuncio)')
  return v
}

describe('detector: cada pantalla con conteo por filtro usa el hook y no anuncia dos veces', () => {
  for (const { ruta, llamada, romperNodo } of PANTALLAS) {
    const nombre = ruta.join('/')
    const real = leer(...ruta)

    it(`${nombre}: el fuente real no tiene violaciones`, () => {
      expect(violacionesPantalla(real, llamada)).toEqual([])
    })

    it(`${nombre}: otra live region en la pantalla (no anunciada por el hook) no es violación`, () => {
      const conOtra = real.replace(/(\n\s*)useAnunciarConteo\(/, '$1const _aviso = <Texto accessibilityLiveRegion="polite">Volvió la conexión.</Texto>$1useAnunciarConteo(')
      expect(conOtra).not.toBe(real)
      expect(violacionesPantalla(conOtra, llamada)).toEqual([])
    })

    it(`${nombre}: un aviso que no es conteo con anunciar() no es violación`, () => {
      const conAviso = real.replace(/(\n\s*)useAnunciarConteo\(/, "$1const _listo = () => anunciar('Listo, actualizado.')$1useAnunciarConteo(")
      expect(violacionesPantalla(conAviso, llamada)).toEqual([])
    })

    it.each([
      ['sin el import', (s: string) => s.replace("import { useAnunciarConteo } from '@/lib/anunciar-conteo-hook'", "import { useAnunciarConteo as _u } from '@/lib/anunciar-conteo-hook'"), 'no importa useAnunciarConteo'],
      ['sin la llamada', (s: string) => s.replace(/useAnunciarConteo\(/, 'void ('), 'no llama a useAnunciarConteo con su armador'],
      ['siempre con null', (s: string) => s.replace(/useAnunciarConteo\(\s*(datosPortada|estado\.tipo === 'ok')/, 'useAnunciarConteo(false'), 'no llama a useAnunciarConteo con su armador'],
      ['dos llamadas', (s: string) => s.replace(/(\n\s*)useAnunciarConteo\(/, '$1useAnunciarConteo(null)$1useAnunciarConteo('), 'no llama a useAnunciarConteo exactamente una vez'],
      ['live region de vuelta en el nodo anunciado', romperNodo, 'un nodo que anuncia el hook tiene live region (doble lectura)'],
      ['AccessibilityInfo directo', (s: string) => s.replace(/(\n\s*)useAnunciarConteo\(/, "$1AccessibilityInfo.announceForAccessibility('x')$1useAnunciarConteo("), 'anuncia con AccessibilityInfo directo (doble anuncio)'],
      ['conteo anunciado a mano', (s: string) => s.replace(/(\n\s*)useAnunciarConteo\(/, '$1anunciar(textoResultados(cantidad, busqueda))$1useAnunciarConteo('), 'anuncia un conteo a mano además del hook (doble anuncio)'],
    ])(`${nombre}: rotura en memoria: %s -> detectada`, (_n, romper, esperada) => {
      const roto = romper(real)
      expect(roto).not.toBe(real)
      expect(violacionesPantalla(roto, llamada)).toContain(esperada)
    })
  }

  it('Buscar y Cines: enviar con el teclado sube el nonce del toque', () => {
    const buscar = quitarComentarios(leer('app', '(tabs)', 'buscar.tsx'))
    const cines = quitarComentarios(leer('app', 'cines.tsx'))
    // Integración con A5: el mismo handler también guarda la búsqueda («enviar»).
    expect(buscar).toMatch(/onSubmitEditing=\{\(evento\) => \{\s*recordarBusqueda\(evento\.nativeEvent\.text, 'enviar'\)\s*setToqueTexto\(\(n\) => n \+ 1\)\s*\}\}/)
    expect(cines).toMatch(/onSubmitEditing=\{\(\) => setToqueBusqueda\(\(n\) => n \+ 1\)\}/)
  })

  it('el `Vacio` de EstadoCarga (el de Buscar y Cines) no tiene live region', () => {
    const vacio = /export function Vacio\([\s\S]*?\n\}\n/.exec(quitarComentarios(leer('components', 'EstadoCarga.tsx')))?.[0] ?? ''
    expect(vacio).toMatch(/<Text\b/)
    expect(vacio).not.toMatch(/accessibilityLiveRegion/)
  })
})

/** El hook: sin ramas por plataforma, callado sin foco, con su temporizador limpio. */
export function violacionesHook(fuente: string): string[] {
  const c = quitarComentarios(fuente)
  const v: string[] = []
  if (!/import \{ anunciar \} from '@\/lib\/anunciar'/.test(c)) v.push('no habla a través de anunciar (lib/anunciar.ts)')
  if (/AccessibilityInfo/.test(c)) v.push('usa AccessibilityInfo directo en vez de anunciar')
  if (!/crearAnunciadorDeConteo\(\{ anunciar: \(texto\) => anunciar\(texto\), reloj: \{ setTimeout, clearTimeout \}, plataforma: Platform\.OS \}\)/.test(c)) {
    v.push('no crea el anunciador con anunciar, el reloj real y Platform.OS')
  }
  if (/Platform\.OS\s*[!=]==|Platform\.select/.test(c)) v.push('tiene una rama por plataforma (la decide el anunciador puro)')
  if (!/const enFoco = useIsFocused\(\)/.test(c)) v.push('no sabe si la pestaña está en foco')
  if (!/if \(enFoco\) anunciador\.observar\(actual\)\s*else anunciador\.asentarEnSilencio\(actual\)/.test(c)) v.push('no se calla al perder el foco (asentarEnSilencio)')
  if (!/useEffect\(\(\) => \(\) => anunciador\.cancelar\(\), \[anunciador\]\)/.test(c)) v.push('no cancela el anuncio pendiente al desmontar')
  if (!/\}, \[anunciador, enFoco, listo, clave, texto, toque, titulo, conteo, alSalir\]\)/.test(c)) v.push('el efecto no depende de todos los campos del estado')
  if (/\bset[A-Z]\w*\(/.test(c.replace(/\bsetTimeout\b/g, ''))) v.push('el hook hace setState (un anuncio no es setState)')
  return v
}

describe('detector: lib/anunciar-conteo-hook.ts', () => {
  const real = leer('lib', 'anunciar-conteo-hook.ts')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesHook(real)).toEqual([])
  })

  it.each([
    ['sin anunciar', (s: string) => s.replace("import { anunciar } from '@/lib/anunciar'", "import { anunciar as decir } from '@/lib/anunciar'"), 'no habla a través de anunciar (lib/anunciar.ts)'],
    ['AccessibilityInfo directo', (s: string) => s.replace("import { Platform } from 'react-native'", "import { AccessibilityInfo, Platform } from 'react-native'"), 'usa AccessibilityInfo directo en vez de anunciar'],
    ['plataforma fija', (s: string) => s.replace('plataforma: Platform.OS', "plataforma: 'ios'"), 'no crea el anunciador con anunciar, el reloj real y Platform.OS'],
    ['rama por plataforma', (s: string) => s.replace('    if (enFoco) anunciador', "    if (Platform.OS === 'ios') return\n    if (enFoco) anunciador"), 'tiene una rama por plataforma (la decide el anunciador puro)'],
    ['sin foco', (s: string) => s.replace('const enFoco = useIsFocused()', 'const enFoco = true'), 'no sabe si la pestaña está en foco'],
    ['anuncia sin foco', (s: string) => s.replace('else anunciador.asentarEnSilencio(actual)', 'else anunciador.observar(actual)'), 'no se calla al perder el foco (asentarEnSilencio)'],
    ['sin limpiar el temporizador', (s: string) => s.replace('useEffect(() => () => anunciador.cancelar(), [anunciador])', ''), 'no cancela el anuncio pendiente al desmontar'],
    ['sin una dependencia', (s: string) => s.replace('}, [anunciador, enFoco, listo, clave, texto, toque, titulo, conteo, alSalir])', '}, [anunciador, enFoco, listo, clave, conteo])'), 'el efecto no depende de todos los campos del estado'],
    ['con setState', (s: string) => s.replace('    const actual = listo', '    setAnunciado(true)\n    const actual = listo'), 'el hook hace setState (un anuncio no es setState)'],
  ])('rotura en memoria: %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesHook(roto)).toContain(esperada)
  })
})

/** El envoltorio único: `queue: true` por omisión. */
export function violacionesEnvoltorio(fuente: string): string[] {
  const c = quitarComentarios(fuente)
  const v: string[] = []
  if (!/export function anunciar\(texto: string, opciones: OpcionesAnuncio = \{\}\): void/.test(c)) v.push('no exporta anunciar(texto, opciones?)')
  if (!/AccessibilityInfo\.announceForAccessibilityWithOptions\(texto, \{ queue: opciones\.queue \?\? true \}\)/.test(c)) v.push('no anuncia con queue: true por omisión')
  return v
}

describe('detector: lib/anunciar.ts', () => {
  const real = leer('lib', 'anunciar.ts')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesEnvoltorio(real)).toEqual([])
  })

  it.each([
    ['sin queue por omisión', (s: string) => s.replace('opciones.queue ?? true', 'opciones.queue ?? false'), 'no anuncia con queue: true por omisión'],
    ['sin opciones', (s: string) => s.replace('opciones: OpcionesAnuncio = {}', 'opciones: OpcionesAnuncio'), 'no exporta anunciar(texto, opciones?)'],
  ])('rotura en memoria: %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesEnvoltorio(roto)).toContain(esperada)
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
 * En toda la app, `AccessibilityInfo.announceForAccessibility*` solo vive en
 * `lib/anunciar.ts` (ronda de correcciones de A8: el envoltorio único que usan
 * el hook y, al integrar, A5 y A6). Las live regions se miran por nodo en el
 * detector de cada pantalla, no acá.
 */
export function violacionesGlobales(fuentes: { ruta: string; fuente: string }[]): string[] {
  const v: string[] = []
  for (const { ruta, fuente } of fuentes) {
    const c = quitarComentarios(fuente)
    if (/AccessibilityInfo\.announceForAccessibility/.test(c) && ruta !== 'lib/anunciar.ts') v.push(`${ruta}: AccessibilityInfo.announceForAccessibility fuera de lib/anunciar.ts`)
  }
  if (!fuentes.some((f) => f.ruta === 'lib/anunciar.ts')) v.push('no está lib/anunciar.ts')
  return v
}

describe('detector global: un solo camino para hablarle al lector de pantalla', () => {
  const reales = fuentesDeLaApp()

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesGlobales(reales)).toEqual([])
  })

  it('rotura en memoria: AccessibilityInfo.announceForAccessibility en un componente -> detectada', () => {
    const rotas = reales.map((f) => (f.ruta === 'app/(tabs)/favoritos.tsx' ? { ...f, fuente: `${f.fuente}\nAccessibilityInfo.announceForAccessibility('x')\n` } : f))
    expect(violacionesGlobales(rotas)).toContain('app/(tabs)/favoritos.tsx: AccessibilityInfo.announceForAccessibility fuera de lib/anunciar.ts')
  })

  it('rotura en memoria: el hook volviendo a AccessibilityInfo -> detectada', () => {
    const rotas = reales.map((f) => (f.ruta === 'lib/anunciar-conteo-hook.ts' ? { ...f, fuente: `${f.fuente}\nAccessibilityInfo.announceForAccessibilityWithOptions('x', {})\n` } : f))
    expect(violacionesGlobales(rotas)).toContain('lib/anunciar-conteo-hook.ts: AccessibilityInfo.announceForAccessibility fuera de lib/anunciar.ts')
  })

  it('anunciar() desde otro archivo (A5, A6) no es violación', () => {
    const conAviso = reales.map((f) => (f.ruta === 'components/AvisoSinConexion.tsx' ? { ...f, fuente: `${f.fuente}\nanunciar('Volvió la conexión.')\n` } : f))
    expect(violacionesGlobales(conAviso)).toEqual([])
  })

  it('rotura en memoria: sin el envoltorio -> detectada', () => {
    expect(violacionesGlobales(reales.filter((f) => f.ruta !== 'lib/anunciar.ts'))).toContain('no está lib/anunciar.ts')
  })
})

/** La lógica es pura: sin React ni React Native (si no, Vitest no la podría importar). */
export function violacionesPureza(fuente: string): string[] {
  const c = quitarComentarios(fuente)
  const v: string[] = []
  if (/from '(react|react-native|expo-router)'/.test(c)) v.push('lib/anunciar-conteo.ts importa React, React Native o expo-router')
  if (/\bsetTimeout\(/.test(c.replace(/deps\.reloj\.setTimeout\(/g, ''))) v.push('usa setTimeout directo en vez del reloj inyectado')
  if (/\bPlatform\b/.test(c)) v.push('lee la plataforma por su cuenta en vez de recibirla')
  return v
}

describe('detector: lib/anunciar-conteo.ts es pura', () => {
  const real = leer('lib', 'anunciar-conteo.ts')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesPureza(real)).toEqual([])
  })

  it.each([
    ['importa react-native', (s: string) => `import { AccessibilityInfo } from 'react-native'\n${s}`, 'lib/anunciar-conteo.ts importa React, React Native o expo-router'],
    ['setTimeout directo', (s: string) => s.replace('pendiente = deps.reloj.setTimeout(', 'pendiente = setTimeout('), 'usa setTimeout directo en vez del reloj inyectado'],
    ['plataforma propia', (s: string) => s.replace("return plataforma === 'android'", "return Platform.OS === 'android'"), 'lee la plataforma por su cuenta en vez de recibirla'],
  ])('rotura en memoria: %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesPureza(roto)).toContain(esperada)
  })
})
