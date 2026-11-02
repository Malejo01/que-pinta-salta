/**
 * Las secciones `mapa` y `buscar` de los diccionarios (78-a): mismas claves
 * en castellano e inglés, ningún texto vacío ni copiado del castellano, plurales
 * correctos en los dos idiomas y castellano en voseo (sin tuteo). Sin red ni base.
 */
import { describe, expect, it } from 'vitest'
import { es } from '@/lib/i18n/diccionarios/es'
import { en } from '@/lib/i18n/diccionarios/en'

type Seccion = Record<string, unknown>
const SECCIONES = ['mapa', 'buscar'] as const

/** Textos que pueden ser iguales en los dos idiomas (nombres propios). Hoy ninguno. */
const IGUALES_PERMITIDOS = new Set<string>([])

function claves(seccion: Seccion): string[] {
  return Object.keys(seccion)
}

/** Cada texto (o función evaluada con argumentos de prueba) de una sección. */
const ARGUMENTOS: Record<string, unknown[]> = {
  contador: [3, 2],
  // Argumentos neutros (ni castellano ni inglés) para que los chequeos de idioma miren solo el texto del diccionario.
  sinEventosEnFecha: ['X'],
  sinUbicacion: [2],
  vacioConFiltrosTitulo: ['X'],
  vacioConFiltrosTexto: ['A · B'],
  seleccionado: ['Sitio X', 2],
  centradoEn: ['Sitio X'],
  eventosEnCategoria: [2],
  resultados: [2, 'peña', true, true],
  eventosFiltrados: [2, true, true],
  sinResultadosParaTexto: ['peña', true, true],
  sinEventosFiltrados: [true, true],
}

function textoDe(seccion: Seccion, clave: string): string {
  const valor = seccion[clave]
  if (typeof valor === 'string') return valor
  const args = ARGUMENTOS[clave]
  if (!args) throw new Error(`Falta ARGUMENTOS para la función ${clave}`)
  return (valor as (...a: unknown[]) => string)(...args)
}

describe.each(SECCIONES)('sección %s', (nombre) => {
  const seccionEs = es[nombre] as Seccion
  const seccionEn = en[nombre] as Seccion

  it('tiene las mismas claves en es y en, en el mismo orden', () => {
    expect(claves(seccionEn)).toEqual(claves(seccionEs))
    expect(claves(seccionEs).length).toBeGreaterThan(5)
  })

  it('cada clave es del mismo tipo (texto con texto, función con función)', () => {
    for (const clave of claves(seccionEs)) {
      expect(typeof seccionEn[clave], clave).toBe(typeof seccionEs[clave])
    }
  })

  it('ninguna función queda sin argumentos de prueba en este test (si se suma una, hay que cubrirla)', () => {
    for (const clave of claves(seccionEs)) {
      if (typeof seccionEs[clave] === 'function') expect(ARGUMENTOS, clave).toHaveProperty(clave)
    }
  })

  it('ningún texto es vacío, en ninguno de los dos idiomas', () => {
    for (const clave of claves(seccionEs)) {
      expect(textoDe(seccionEs, clave).trim().length, `es.${nombre}.${clave}`).toBeGreaterThan(0)
      expect(textoDe(seccionEn, clave).trim().length, `en.${nombre}.${clave}`).toBeGreaterThan(0)
    }
  })

  it('ningún texto en inglés es idéntico al castellano (salvo nombres propios)', () => {
    for (const clave of claves(seccionEs)) {
      if (IGUALES_PERMITIDOS.has(`${nombre}.${clave}`)) continue
      expect(textoDe(seccionEn, clave), `en.${nombre}.${clave}`).not.toBe(textoDe(seccionEs, clave))
    }
  })

  it('el inglés no arrastra palabras sueltas del castellano', () => {
    const CASTELLANO = /\b(evento|eventos|lugar|lugares|gratis|para chicos|quitar|filtros|ver|buscar|mapa de|todas|hoy|finde|elegir|probá|nuestro)\b/i
    for (const clave of claves(seccionEn)) {
      expect(textoDe(seccionEn, clave), `en.${nombre}.${clave}`).not.toMatch(CASTELLANO)
    }
  })

  it('el castellano no tutea (voseo rioplatense)', () => {
    // Formas de tuteo / imperativo en "tú" que no deben aparecer (el voseo lleva tilde: «mirá», «probá», «sacá»).
    const TUTEO =
      /\b(tienes|quieres|puedes|debes|eres|tú|tu cuenta|elige|busca|prueba|saca|mira|selecciona|quita|escribe|revisa|inténtalo|intenta|vuelve|haz|pulsa|ingresa|encuentra|descubre)\b/i
    for (const clave of claves(seccionEs)) {
      expect(textoDe(seccionEs, clave), `es.${nombre}.${clave}`).not.toMatch(TUTEO)
    }
  })
})

describe('el voseo del castellano que ya existía se conserva', () => {
  it('mapa: «Mirá», «elegí», «Probá» y «sacá»', () => {
    expect(es.mapa.bajada).toBe('Mirá dónde pasa cada plan y elegí por día.')
    expect(es.mapa.vacioConFiltrosTexto('Gratis')).toBe('Filtros: Gratis. Probá con otra fecha o sacá alguno.')
    expect(es.mapa.errorTexto).toBe('Tuvimos un problema de nuestro lado. Probá de nuevo en un momento.')
  })
})

describe('mapa: plurales', () => {
  it.each([
    ['es', es.mapa.contador, [[0, 0, '0 eventos en 0 lugares'], [1, 1, '1 evento en 1 lugar'], [2, 2, '2 eventos en 2 lugares'], [8, 5, '8 eventos en 5 lugares']]],
    ['en', en.mapa.contador, [[0, 0, '0 events at 0 venues'], [1, 1, '1 event at 1 venue'], [2, 2, '2 events at 2 venues'], [8, 5, '8 events at 5 venues']]],
  ] as const)('contador (%s)', (_idioma, contador, casos) => {
    for (const [eventos, lugares, esperado] of casos) expect(contador(eventos, lugares)).toBe(esperado)
  })

  it.each([
    ['es', es.mapa.sinUbicacion, ['1 evento no aparece', '0 eventos no aparecen', '2 eventos no aparecen']],
    ['en', en.mapa.sinUbicacion, ['1 event is not on the map', '0 events are not on the map', '2 events are not on the map']],
  ] as const)('sinUbicacion (%s) concuerda en número', (_idioma, fn, [uno, cero, dos]) => {
    expect(fn(1)).toContain(uno)
    expect(fn(0)).toContain(cero)
    expect(fn(2)).toContain(dos)
  })

  it('sinUbicacion: «su lugar» / «its venue» en singular, plural en el resto', () => {
    expect(es.mapa.sinUbicacion(1)).toContain('su lugar todavía no tiene ubicación')
    expect(es.mapa.sinUbicacion(2)).toContain('sus lugares todavía no tienen ubicación')
    expect(en.mapa.sinUbicacion(1)).toContain('its venue does not have a location yet')
    expect(en.mapa.sinUbicacion(2)).toContain('their venues do not have a location yet')
  })

  it('seleccionado: singular y plural en los dos idiomas', () => {
    expect(es.mapa.seleccionado('Lugar de Prueba', 1)).toBe('Lugar de Prueba, seleccionado: 1 evento')
    expect(es.mapa.seleccionado('Lugar de Prueba', 2)).toBe('Lugar de Prueba, seleccionado: 2 eventos')
    expect(en.mapa.seleccionado('Lugar de Prueba', 1)).toBe('Lugar de Prueba, selected: 1 event')
    expect(en.mapa.seleccionado('Lugar de Prueba', 2)).toBe('Lugar de Prueba, selected: 2 events')
    expect(en.mapa.seleccionado('Lugar de Prueba', 0)).toBe('Lugar de Prueba, selected: 0 events')
  })
})

describe('buscar: plurales y chips', () => {
  it.each([
    [0, '0 resultados para "peña"', '0 results for "peña"'],
    [1, '1 resultado para "peña"', '1 result for "peña"'],
    [2, '2 resultados para "peña"', '2 results for "peña"'],
  ])('resultados con %i', (n, textoEs, textoEn) => {
    expect(es.buscar.resultados(n, 'peña', false, false)).toBe(textoEs)
    expect(en.buscar.resultados(n, 'peña', false, false)).toBe(textoEn)
  })

  it('resultados: los chips van de sufijo en los dos idiomas', () => {
    expect(es.buscar.resultados(2, 'peña', true, true)).toBe('2 resultados para "peña" · gratis · para chicos')
    expect(en.buscar.resultados(2, 'peña', true, true)).toBe('2 results for "peña" · free · for kids')
    expect(en.buscar.resultados(2, 'peña', false, true)).toBe('2 results for "peña" · for kids')
  })

  it.each([
    [0, false, false, '0 eventos', '0 events'],
    [1, false, false, '1 evento', '1 event'],
    [2, false, false, '2 eventos', '2 events'],
    [1, true, false, '1 evento gratis', '1 free event'],
    [2, true, true, '2 eventos gratis para chicos', '2 free events for kids'],
  ])('eventosFiltrados %i (gratis %s, chicos %s)', (n, gratis, chicos, textoEs, textoEn) => {
    expect(es.buscar.eventosFiltrados(n, gratis, chicos)).toBe(textoEs)
    expect(en.buscar.eventosFiltrados(n, gratis, chicos)).toBe(textoEn)
  })

  it('sin resultados: con texto y sin texto, con los chips', () => {
    expect(es.buscar.sinResultadosParaTexto('zzz', true, false)).toBe('No se encontraron eventos para "zzz" · gratis')
    expect(en.buscar.sinResultadosParaTexto('zzz', true, false)).toBe('No events found for "zzz" · free')
    expect(es.buscar.sinEventosFiltrados(true, true)).toBe('No hay eventos gratis para chicos por ahora.')
    expect(en.buscar.sinEventosFiltrados(true, true)).toBe('There are no free events for kids right now.')
    expect(en.buscar.sinEventosFiltrados(false, false)).toBe('There are no events right now.')
  })

  it('eventosEnCategoria en inglés concuerda en número (0, 1, 2)', () => {
    expect(en.buscar.eventosEnCategoria(0)).toBe('0 events')
    expect(en.buscar.eventosEnCategoria(1)).toBe('1 event')
    expect(en.buscar.eventosEnCategoria(2)).toBe('2 events')
  })

  it('eventosEnCategoria en castellano: 0 y 2 en plural', () => {
    expect(es.buscar.eventosEnCategoria(0)).toBe('0 eventos')
    expect(es.buscar.eventosEnCategoria(2)).toBe('2 eventos')
  })

  // BUG (preexistente, el diccionario lo copió igual): `${n} eventos` no
  // distingue el singular. En la grilla de categorías de /buscar no aparece una
  // categoría con 1 solo evento como «1 evento». Ver lib/i18n/diccionarios/es.ts
  // (clave buscar.eventosEnCategoria). Si se corrige, quitar `.fails`.
  it.fails('eventosEnCategoria en castellano: 1 es «1 evento» (singular)', () => {
    expect(es.buscar.eventosEnCategoria(1)).toBe('1 evento')
  })
})
