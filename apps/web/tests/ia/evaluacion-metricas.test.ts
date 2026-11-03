// Q6-4 · Banco de evaluación de IA: normalización y métricas (puras).
import { describe, expect, it } from 'vitest'

import {
  compararFlyer,
  numerosDe,
  obtenidoDeExtraccion,
  puntuarTraduccion,
  resumirClasificacion,
  resumirFlyers,
  resumirTraduccion,
  SIN_RESPUESTA,
} from '@/lib/ia/evaluacion/metricas'
import {
  dice,
  normalizarFecha,
  normalizarHora,
  normalizarNombreLugar,
  normalizarPrecio,
  similitudLugar,
  UMBRAL_LUGAR,
} from '@/lib/ia/evaluacion/normalizar'
import type { CasoTraduccion, EsperadoFlyer } from '@/lib/ia/evaluacion/tipos'

describe('normalizarFecha (YYYY-MM-DD en hora de Salta)', () => {
  it('acepta ISO, DD/MM/YYYY y fecha-hora', () => {
    expect(normalizarFecha('2026-10-31')).toBe('2026-10-31')
    expect(normalizarFecha(' 31/10/2026 ')).toBe('2026-10-31')
    expect(normalizarFecha('1/2/2026')).toBe('2026-02-01')
    expect(normalizarFecha('2026-10-31T23:30')).toBe('2026-10-31')
  })
  it('una fecha-hora con zona se pasa a Salta (UTC−3)', () => {
    expect(normalizarFecha('2026-11-01T02:00:00Z')).toBe('2026-10-31')
    expect(normalizarFecha('2026-11-01T02:00:00-03:00')).toBe('2026-11-01')
    expect(normalizarFecha('2026-11-01T04:00:00.000+00:00')).toBe('2026-11-01')
  })
  it('rechaza lo que no es una fecha válida', () => {
    for (const v of ['2026-02-30', '2026-13-01', '31/02/2026', 'mañana', '', 'null', null, 20261031, undefined]) {
      expect(normalizarFecha(v), String(v)).toBeNull()
    }
  })
})

describe('normalizarHora (HH:MM, 24 h)', () => {
  it.each([
    ['21:00', '21:00'],
    ['9:30', '09:30'],
    ['21.30', '21:30'],
    ['21 hs', '21:00'],
    ['21hs', '21:00'],
    ['21:00 hs.', '21:00'],
    ['22h30', '22:30'],
    ['9 pm', '21:00'],
    ['9:30 p.m.', '21:30'],
    ['12 am', '00:00'],
    ['00:30', '00:30'],
    ['2026-10-31T21:15:00', '21:15'],
    ['2026-11-01T00:30:00Z', '21:30'],
  ])('%s → %s', (entrada, salida) => {
    expect(normalizarHora(entrada)).toBe(salida)
  })
  it('null y basura → null', () => {
    for (const v of [null, undefined, '', 'null', 'de noche', '25:00', '21:75', 21]) expect(normalizarHora(v), String(v)).toBeNull()
  })
})

describe('normalizarPrecio (número, gratis o null)', () => {
  it('0 y las palabras de gratuidad son gratis', () => {
    expect(normalizarPrecio(0)).toBe('gratis')
    expect(normalizarPrecio('0')).toBe('gratis')
    expect(normalizarPrecio('Entrada libre')).toBe('gratis')
    expect(normalizarPrecio('GRATIS')).toBe('gratis')
  })
  it('formatos de precio argentinos', () => {
    expect(normalizarPrecio(18000)).toBe(18000)
    expect(normalizarPrecio('$18.000')).toBe(18000)
    expect(normalizarPrecio('$ 18.000,00')).toBe(18000)
    expect(normalizarPrecio('18,000')).toBe(18000)
    expect(normalizarPrecio('18000.00')).toBe(18000)
    expect(normalizarPrecio('1.500.000')).toBe(1500000)
  })
  it('sin precio o ilegible → null', () => {
    for (const v of [null, undefined, '', 'null', 'consultar', -5, Number.NaN, '18 mil']) expect(normalizarPrecio(v), String(v)).toBeNull()
  })
})

describe('lugar por similitud', () => {
  it('normaliza tildes, mayúsculas, & y puntuación', () => {
    expect(normalizarNombreLugar('Amnesia Pub & Música')).toBe('amnesia pub y musica')
    expect(normalizarNombreLugar('  Búnker!! ')).toBe('bunker')
  })
  it('igual, sin espacios, contenido o mismas palabras → correcto', () => {
    const casos: Array<[string, string[]]> = [
      ['La Metro', ['La Metro']],
      ['Casa Grande', ['Casagrande Peña']],
      ['Búnker', ['Bunker Owl Music Bar']],
      ['Centro de Convenciones', ['Centro de Convenciones Salta']],
      ['Peña Boliche Balderrama', ['Balderrama']],
      ['Treinta y Pico', ['30 y Pico', 'Treinta y Pico']],
      ['Salta Roka', ['La Roka']],
    ]
    for (const [obtenido, nombres] of casos) expect(similitudLugar(obtenido, nombres), obtenido).toBeGreaterThanOrEqual(UMBRAL_LUGAR)
  })
  it('lugares distintos no pasan el umbral', () => {
    expect(similitudLugar('La Metro', ['Babylon'])).toBeLessThan(UMBRAL_LUGAR)
    expect(similitudLugar('Teatro Provincial', ['Teatro del Huerto'])).toBeLessThan(UMBRAL_LUGAR)
    expect(similitudLugar('La', ['La Roka'])).toBeLessThan(UMBRAL_LUGAR)
    expect(similitudLugar(null, ['La Roka'])).toBe(0)
    expect(similitudLugar('', ['La Roka'])).toBe(0)
  })
  it('dice: 1 para iguales, 0 sin bigramas en común', () => {
    expect(dice('roka', 'roka')).toBe(1)
    expect(dice('abc', 'xyz')).toBe(0)
  })
})

const ESPERADO: EsperadoFlyer = {
  fecha: '2026-10-24',
  hora: null,
  lugar: 'Amnesia Pub & Música',
  lugar_alias: ['Amnesia'],
  precio: null,
  categoria: 'boliches',
}

describe('flyers: comparación por campo y resumen', () => {
  it('todo bien con formatos distintos', () => {
    const c = compararFlyer({ ...ESPERADO, hora: '23:30', precio: 18000 }, { fecha: '24/10/2026', hora: '23.30 hs', lugar: 'AMNESIA', precio: '$18.000', categoria: 'boliches' })
    expect(c.aciertos).toEqual({ fecha: true, hora: true, lugar: true, precio: true, categoria: true })
  })
  it('hora null esperada: inventar una hora es error; precio null: decir gratis es error', () => {
    const c = compararFlyer(ESPERADO, { fecha: '2026-10-24', hora: '00:00', lugar: 'Amnesia', precio: 0, categoria: 'recitales' })
    expect(c.aciertos).toEqual({ fecha: true, hora: false, lugar: true, precio: false, categoria: false })
  })
  it('respuesta vacía: todo mal salvo los null esperados', () => {
    const c = compararFlyer(ESPERADO, {})
    expect(c.aciertos).toEqual({ fecha: false, hora: true, lugar: false, precio: true, categoria: false })
  })
  it('lee la salida cruda de extractEventFromFlyer', () => {
    expect(obtenidoDeExtraccion({ date: '2026-10-24', start_time: null, venue_name: 'Amnesia', price: null, category_slug: 'boliches' })).toEqual({
      fecha: '2026-10-24',
      hora: null,
      lugar: 'Amnesia',
      precio: null,
      categoria: 'boliches',
    })
    expect(obtenidoDeExtraccion(null)).toEqual({})
  })
  it('resumen: % por campo, total sobre 4 campos y casos perfectos', () => {
    const bien = compararFlyer(ESPERADO, { fecha: '2026-10-24', hora: null, lugar: 'Amnesia', precio: null, categoria: 'boliches' })
    const mal = compararFlyer(ESPERADO, { fecha: '2026-10-23', hora: null, lugar: 'Otra', precio: null, categoria: 'boliches' })
    const r = resumirFlyers([bien, mal])
    expect(r.porCampo.fecha).toEqual({ correctos: 1, total: 2, pct: 50 })
    expect(r.porCampo.hora.pct).toBe(100)
    expect(r.total).toEqual({ correctos: 6, total: 8, pct: 75 })
    expect(r.casosPerfectos.correctos).toBe(1)
    expect(resumirFlyers([]).total.pct).toBeNull()
  })
})

const CASO_TRAD: CasoTraduccion = {
  id: 't',
  origen: { tabla: 'events', id: '00000000-0000-4000-8000-000000000000' },
  titulo: 'Peña folklórica en Balderrama',
  descripcion: 'Show en vivo desde las 21 hs. Entrada $18.000.',
  lugar: 'Balderrama',
  artistas: [],
  nombres_a_conservar: [],
  referencia: 'agente',
  esperado: { title_en: 'Folk peña at Balderrama', description_en: 'Live show from 21 hs. Admission $18,000.' },
}

describe('traducción: rúbrica 0–4', () => {
  it('la referencia saca 4', () => {
    expect(puntuarTraduccion(CASO_TRAD, CASO_TRAD.esperado).puntos).toBe(4)
  })
  it('perder un nombre o un número resta «conserva»', () => {
    const p = puntuarTraduccion(CASO_TRAD, { title_en: 'Folk night', description_en: 'Live show from 9 pm. Admission $18,000.' })
    expect(p.criterios.conserva).toBe(false)
    expect(p.detalle.faltan).toEqual(expect.arrayContaining(['Balderrama', '21']))
    expect(p.criterios.sinAgregados).toBe(false) // el 9 no estaba
  })
  it('castellano residual resta «sin castellano»', () => {
    const p = puntuarTraduccion(CASO_TRAD, { title_en: 'Peña folklórica en Balderrama', description_en: 'Show en vivo desde las 21 hs. Entrada $18.000.' })
    expect(p.criterios.sinCastellano).toBe(false)
    expect(p.detalle.castellano).toBeGreaterThan(0.05)
  })
  it('largo fuera de rango resta «largo»', () => {
    const corta = puntuarTraduccion(CASO_TRAD, { title_en: 'Balderrama', description_en: '21 hs $18.000' })
    expect(corta.criterios.largo).toBe(false)
  })
  it('agregar información (números, URLs o una descripción que no había) resta «sin agregados»', () => {
    const p = puntuarTraduccion(CASO_TRAD, { title_en: 'Folk peña at Balderrama', description_en: 'Live show from 21 hs, Saturday 25. Admission $18,000. www.ejemplo.com' })
    expect(p.criterios.sinAgregados).toBe(false)
    expect(p.detalle.agregados).toEqual(expect.arrayContaining(['25', 'www.ejemplo.com']))
    const sinDesc = { ...CASO_TRAD, descripcion: null, esperado: { title_en: 'Folk peña at Balderrama', description_en: null } }
    expect(puntuarTraduccion(sinDesc, { title_en: 'Folk peña at Balderrama', description_en: 'A great night.' }).criterios.sinAgregados).toBe(false)
  })
  it('sin respuesta: 0 puntos', () => {
    expect(puntuarTraduccion(CASO_TRAD, null).puntos).toBe(0)
    expect(puntuarTraduccion(CASO_TRAD, { title_en: 42 }).puntos).toBe(0)
  })
  it('los nombres a conservar no cuentan como castellano y las letras «negrita» Unicode se leen como ASCII', () => {
    const caso = { ...CASO_TRAD, titulo: 'La Ñata Contra el Vidrio', descripcion: '𝟖/𝟏𝟏 en el teatro', nombres_a_conservar: ['La Ñata Contra el Vidrio'], esperado: { title_en: 'La Ñata Contra el Vidrio', description_en: '8/11 at the theater' } }
    const p = puntuarTraduccion(caso, caso.esperado)
    expect(p.puntos).toBe(4)
    expect(numerosDe('$𝟖.𝟎𝟎𝟎 y 21:00 y 31/10')).toEqual(['8000', '21:00', '31/10'])
  })
  it('resumen: promedio, 4 de 4, por criterio y validarTraduccion', () => {
    const r = resumirTraduccion([puntuarTraduccion(CASO_TRAD, CASO_TRAD.esperado), puntuarTraduccion(CASO_TRAD, null)], [true, false])
    expect(r.promedio).toBe(2)
    expect(r.completos.pct).toBe(50)
    expect(r.porCriterio.conserva.correctos).toBe(1)
    expect(r.validasProduccion?.pct).toBe(50)
  })
})

describe('clasificación: acierto y matriz de confusión', () => {
  it('cuenta aciertos, arma la matriz y ordena las confusiones', () => {
    const r = resumirClasificacion([
      { esperado: 'penas', obtenido: 'penas' },
      { esperado: 'penas', obtenido: 'recitales' },
      { esperado: 'humor', obtenido: 'espectaculos' },
      { esperado: 'humor', obtenido: 'espectaculos' },
      { esperado: 'teatro', obtenido: null },
    ])
    expect(r.correctas).toEqual({ correctos: 1, total: 5, pct: 20 })
    expect(r.matriz.penas).toEqual({ penas: 1, recitales: 1 })
    expect(r.matriz.teatro).toEqual({ [SIN_RESPUESTA]: 1 })
    expect(r.confusiones[0]).toEqual({ esperado: 'humor', obtenido: 'espectaculos', casos: 2 })
    expect(r.porCategoria.penas.pct).toBe(50)
  })
})
