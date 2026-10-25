// "Gratis" de verdad (R68-a): `is_free` solo con evidencia. Funciones puras, textos inventados.
import { describe, expect, it } from 'vitest'
import {
  CONDICIONES_NO_GRATIS,
  FRASES_GRATIS,
  detectarGratis,
  textoIndicaGratis,
  tieneCondicionNoGratis,
} from '@qps/core/events/gratis'
import { hasFreeConditionals } from '@/lib/ai/validate-extraction'

describe('FRASES_GRATIS: una por frase', () => {
  // [id, texto normalizado que la tiene que activar]
  const casos: Array<[string, string]> = [
    ['entrada-libre', 'entrada libre'],
    ['entrada-gratuita', 'entrada gratuita'],
    ['entrada-gratuita', 'entrada gratis'],
    ['libre-y-gratuito', 'libre y gratuito'],
    ['libre-y-gratuito', 'libre y gratuita'],
    ['gratis', 'gratis'],
    ['gratuito', 'gratuito'],
    ['gratuito', 'gratuita'],
    ['sin-costo', 'sin costo'],
    ['acceso-libre', 'acceso libre'],
    ['entrada-free', 'entrada free'],
    ['free-access', 'free access'],
  ]
  it.each(casos)('%s: "%s"', (id, texto) => {
    const frase = FRASES_GRATIS.find((f) => f.id === id)
    expect(frase).toBeDefined()
    expect(frase!.re.test(texto)).toBe(true)
  })

  it('cada frase de la lista tiene al menos un caso', () => {
    for (const { id } of FRASES_GRATIS) expect(casos.some(([i]) => i === id)).toBe(true)
  })

  it('ninguna regex lleva el flag g (estado lastIndex)', () => {
    for (const { re } of [...FRASES_GRATIS, ...CONDICIONES_NO_GRATIS]) expect(re.global).toBe(false)
  })
})

describe('CONDICIONES_NO_GRATIS: una por condición', () => {
  const casos: Array<[string, string]> = [
    ['hasta', 'entrada libre hasta las 2'],
    ['hasta', 'entrada libre hasta 23hs'],
    ['free-hasta', 'free hasta medianoche'],
    ['gratis-hasta', 'gratis hasta medianoche'],
    ['damas', 'damas free'],
    ['con-lista', 'free con lista'],
    ['antes-de', 'gratis antes de las 23'],
    ['free-antes', 'free antes de la una'],
    ['2x1', '2x1 en tragos'],
    ['2x1', '2 x 1 en cerveza'],
    ['2x1', 'dos por uno en fernet'],
    ['grupo', 'gratis menores de 5'],
    ['grupo', 'jubilados no pagan'],
    ['grupo', 'menores de 5 anos gratis'],
    ['grupo', 'gratis para los jubilados'],
    ['grupo', 'ninos gratis'],
    ['grupo', 'chicas free'],
    ['grupo', 'mujeres gratis'],
    ['grupo', 'caballeros gratis'],
    ['grupo', 'socios free'],
    ['primeros-n', 'los primeros 50 entran gratis'],
    ['flyer', 'gratis con este flyer'],
    ['invitacion', 'entrada libre por invitacion'],
    ['negacion', 'el evento no es gratis'],
    ['grupo', 'cumpleaneros gratis'],
    ['grupo', 'estudiantes gratis con credencial'],
    ['grupo', 'acompanante gratis'],
    ['extra', 'consumicion gratis'],
    ['extra', 'trago gratis'],
    ['extra', 'bebida gratuita'],
    ['extra', 'copa free'],
    ['extra', 'shot gratis'],
    ['extra', 'regalo gratis'],
    ['extra', 'estacionamiento gratuito'],
    ['extra', 'envio gratis'],
    ['extra', 'wifi gratis'],
    ['extra', 'degustacion gratuita'],
    ['extra', 'gratis: tu primer trago'],
    ['sorteo', 'sorteo de entradas'],
    ['sorteo', 'sorteamos entradas'],
    ['sorteo', 'ganate tu entrada'],
    ['sorteo', 'sorteamos 2 entradas gratis'],
    ['sorteo', 'gana tu entrada'],
    ['sorteo', 'concurso para ganar entradas'],
    ['extra', 'gratis cancelacion'],
    ['extra', 'free devolucion'],
    ['monto', 'entradas $ 1500'],
    ['monto', 'entradas $1.500'],
    ['monto', 'entradas 1500 pesos'],
    ['monto', 'entradas ars 1500'],
    ['monto', 'entradas ars$ 800'],
    ['monto', 'entrada 2.000 pesos'],
    ['a-la-gorra', 'a la gorra'],
    ['aporte-voluntario', 'aporte voluntario'],
    ['aporte-voluntario', 'colaboracion sugerida'],
    ['aporte-voluntario', 'contribucion solidaria'],
    ['a-voluntad', 'a voluntad'],
    ['bono-contribucion', 'bono contribucion'],
    ['bono-contribucion', 'bono colaboracion'],
    ['colaboracion', 'colaboracion: $500'],
    ['colaboracion', 'colaboracion $ 300'],
  ]
  it.each(casos)('%s: "%s"', (id, texto) => {
    const cond = CONDICIONES_NO_GRATIS.find((c) => c.id === id)
    expect(cond).toBeDefined()
    expect(cond!.re.test(texto)).toBe(true)
  })

  it('cada condición de la lista tiene al menos un caso', () => {
    for (const { id } of CONDICIONES_NO_GRATIS) expect(casos.some(([i]) => i === id)).toBe(true)
  })

  it('el monto no agarra $0, horas ni fechas', () => {
    const monto = CONDICIONES_NO_GRATIS.find((c) => c.id === 'monto')!
    for (const t of ['$0', '$ 0', 'ars 0', '0 pesos', '21:00', '21:00 hs', '24/10/2026', 'viernes 24 de octubre 22.30']) {
      expect(monto.re.test(t)).toBe(false)
    }
  })
})

describe('detectarGratis', () => {
  it('frase positiva sin condiciones: gratis, con la frase encontrada', () => {
    expect(detectarGratis('Entrada libre y gratuita')).toEqual({ gratis: true, frase: 'entrada libre' })
  })

  it('sin frase: sin-evidencia (nunca se infiere de que falte el precio)', () => {
    expect(detectarGratis('Show en vivo, viernes 21:00')).toEqual({ gratis: false, motivo: 'sin-evidencia' })
    expect(detectarGratis('', null, undefined)).toEqual({ gratis: false, motivo: 'sin-evidencia' })
    expect(detectarGratis()).toEqual({ gratis: false, motivo: 'sin-evidencia' })
  })

  it('frase y condición: condicion, con la frase', () => {
    expect(detectarGratis('Gratis hasta las 2')).toMatchObject({
      gratis: false,
      motivo: 'condicion',
      condicion: 'hasta',
      frase: 'gratis',
    })
  })

  it('condición sin frase: condicion con frase null', () => {
    expect(detectarGratis('2x1 en tragos')).toEqual({ gratis: false, motivo: 'condicion', condicion: '2x1', frase: null })
  })

  it('une los textos con salto de línea y los busca todos', () => {
    expect(detectarGratis('Fiesta', 'ENTRADA LIBRE')).toMatchObject({ gratis: true })
    expect(detectarGratis('Entrada libre', 'Damas con lista')).toMatchObject({ gratis: false, motivo: 'condicion' })
  })

  it('el estado no se pega entre llamadas', () => {
    for (let i = 0; i < 3; i++) {
      expect(textoIndicaGratis('entrada libre')).toBe(true)
      expect(tieneCondicionNoGratis('2x1')).toBe(true)
    }
  })
})

describe('textoIndicaGratis: positivos', () => {
  it.each([
    'Entrada libre',
    'ENTRADA LIBRE Y GRATUITA',
    'Entrada gratuita',
    'Entrada gratis',
    'Evento gratuito en la plaza',
    'Función gratuita',
    'Sin costo',
    'Acceso libre',
    'Entrada free',
    'Free access',
    'Acceso Libre y Gratuito',
    'Gratis!',
    'Ingreso GRATIS',
    'Show a las 21:00, entrada libre. 24/10/2026',
    'Entrada libre, $0',
  ])('%s', (t) => {
    expect(textoIndicaGratis(t)).toBe(true)
  })
})

describe('textoIndicaGratis: no se bloquea de más (vuelta 1)', () => {
  it.each([
    'Organiza Cultura en colaboración con la UNSa. Entrada libre y gratuita',
    'En colaboración con X. Entrada libre y gratuita',
    'Entrada libre y gratuita. Chicos y grandes',
    'Entrada libre, apto para niños',
    'Festival gratuito para toda la familia, niños y adultos',
    'Entrada gratuita. Habrá bebidas a la venta',
    'Entrada libre. Estacionamiento sin costo adicional',
    'Muestra abierta hasta el 30 de noviembre. Entrada libre y gratuita',
    'Entrada libre y gratuita. Antes de empezar, charla introductoria',
    'Concurso de cueca, entrada libre',
    'Sorteo de una guitarra entre los asistentes. Entrada libre',
  ])('%s', (t) => {
    expect(textoIndicaGratis(t)).toBe(true)
  })

  it('sin-costo no toma "sin costo de/adicional/extra" como frase', () => {
    expect(textoIndicaGratis('Sin costo adicional')).toBe(false)
    expect(textoIndicaGratis('Sin costo de envío')).toBe(false)
    expect(textoIndicaGratis('Sin costo')).toBe(true)
  })

  it('un texto enorme no cuelga las regex (ars + 50000 espacios)', () => {
    const inicio = Date.now()
    expect(textoIndicaGratis('ars' + ' '.repeat(50000))).toBe(false)
    expect(textoIndicaGratis('entrada libre ars' + ' '.repeat(50000) + '1500')).toBe(true)
    expect(Date.now() - inicio).toBeLessThan(500)
  })
})

describe('textoIndicaGratis: vuelta 2', () => {
  it.each([
    'Entrada libre hasta las dos de la mañana',
    'Entrada libre hasta 00:30',
    'Entrada libre hasta la una',
    'Entrada libre antes de las doce',
    'Menores de 12 años sin costo. Adultos consultar',
    'Jubilados entrada libre',
    'Ganá 2 entradas gratis para el viernes',
    // Con frase positiva: sin ella darían false por falta de evidencia y no por el sorteo.
    'Gratis: sorteamos tres entradas',
    'Entrada libre: sorteo de 2 pares de entradas',
    // Conservador a propósito: la gratuidad para niños y adultos juntos se bloquea.
    'Entrada libre y gratuita para niños y adultos',
  ])('NO gratis: %s', (t) => {
    expect(textoIndicaGratis(t)).toBe(false)
  })

  it.each(['Gratis: sorteamos tres entradas', 'Entrada libre: sorteo de 2 pares de entradas'])(
    'lo bloquea el sorteo, no la falta de frase: %s',
    (t) => {
      expect(detectarGratis(t)).toMatchObject({ gratis: false, motivo: 'condicion', condicion: 'sorteo' })
    }
  )

  it.each([
    'Muestra abierta hasta el 30 de noviembre. Entrada libre y gratuita',
    'Sorteo de una guitarra entre los asistentes. Entrada libre',
  ])('gratis: %s', (t) => {
    expect(textoIndicaGratis(t)).toBe(true)
  })
})

describe('textoIndicaGratis: falsos positivos', () => {
  it.each([
    '2x1 en tragos',
    '2x1, entrada libre',
    'Gratis menores de 5',
    'Entrada libre, menores de 12 gratis',
    'Consumición gratis',
    'Entrada $5000 con consumición gratis',
    'Sorteamos entradas gratis',
    'Ganate entradas gratis',
    'A la gorra',
    'Entrada a la gorra, gratis para jubilados',
    'Entrada libre, bono contribución $500',
    'Entrada libre con aporte voluntario',
    'Entrada libre, colaboración: $300',
    'Entrada libre, no es gratis para todos',
    'Entrada gratis para los primeros 50',
    'Entrada libre con invitación',
    'Gratis con este flyer',
    'Mujeres gratis',
    'Sorteamos 2 entradas gratis',
    'Entrada gratis, sin cancelación ni cambios gratis',
    'Free hasta las 2',
    'Damas free',
    'Free con lista',
    'Gratis antes de las 23',
    'Entrada gratis, estacionamiento gratuito',
    'Entradas gratis, 1500 pesos la consumición',
    'Entrada libre, ARS 3000 el pack',
    'Entrada $ 1500',
    'Precio a confirmar',
    'Consultar',
  ])('%s', (t) => {
    expect(textoIndicaGratis(t)).toBe(false)
  })

  it('tildes y mayúsculas no cambian el resultado', () => {
    expect(textoIndicaGratis('ENTRADA LIBRE')).toBe(true)
    expect(textoIndicaGratis('Cumpleañeros GRATIS')).toBe(false)
    expect(textoIndicaGratis('BONO CONTRIBUCIÓN $500, entrada libre')).toBe(false)
    expect(textoIndicaGratis('Acceso Libre — Colaboración: $500')).toBe(false)
    expect(textoIndicaGratis('Niños Gratis')).toBe(false)
  })
})

describe('tieneCondicionNoGratis / hasFreeConditionals', () => {
  it('detecta condiciones aun sin frase positiva', () => {
    expect(tieneCondicionNoGratis('Damas free hasta las 2')).toBe(true)
    expect(tieneCondicionNoGratis('2x1')).toBe(true)
    expect(tieneCondicionNoGratis('Show en vivo')).toBe(false)
    expect(tieneCondicionNoGratis(null, undefined)).toBe(false)
  })

  it('hasFreeConditionals delega en core con la misma firma', () => {
    expect(hasFreeConditionals('Free hasta las 1', null)).toBe(true)
    expect(hasFreeConditionals('Entrada libre', undefined)).toBe(false)
    expect(hasFreeConditionals('Show', '2x1')).toBe(true)
  })
})
