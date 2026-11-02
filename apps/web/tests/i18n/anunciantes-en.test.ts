/**
 * /anunciantes en inglés (78-b): precios, pie, aviso, vigencia y conteos que la
 * página arma con `lib/i18n/anunciantes.ts`. Se comparan contra el tarifario y
 * los formateadores reales de castellano (mismo monto, mismo redondeo) y, si el
 * texto no tiene un formato conocido, la API devuelve `null` (la página lo
 * muestra tal cual con lang="es"). Sin red ni base.
 */
import { describe, expect, it } from 'vitest'
import {
  PIE_TARIFARIO,
  TARIFARIO,
  VIGENCIA_TARIFARIO,
  formatearPesos,
  textoPrecioFundador,
  textoPrecioLista,
  textoUsdAprox,
} from '@qps/core/publicidad/precios'
import { formatPublicCount, formatRadarSubscribers } from '@/lib/anunciantes/metricas'
import {
  avisoEnIngles,
  conteoPublicoEn,
  pieEnIngles,
  precioFundadorEn,
  precioListaEn,
  suscriptosRadarEn,
  usdAproxEn,
  vigenciaEnIngles,
  type PalabrasPrecio,
} from '@/lib/i18n/anunciantes'
import { en } from '@/lib/i18n/diccionarios/en'
import { es } from '@/lib/i18n/diccionarios/es'

const PALABRAS: PalabrasPrecio = {
  gratis: en.anunciantes.gratis,
  proximamente: en.anunciantes.proximamente,
  reservaPrioridad: en.anunciantes.reservaPrioridad,
  porMes: en.anunciantes.porMes,
}

/** Solo los dígitos: "$ 14.000" y "ARS 14,000" dan el mismo 14000. */
const digitos = (texto: string) => Number(texto.replace(/\D/g, ''))

describe('precios en inglés: uno por cada producto del TARIFARIO real', () => {
  it('el tarifario real tiene productos de los tres tipos (gratis, pesos, próximamente)', () => {
    const tipos = new Set(TARIFARIO.map((p) => p.precio.tipo))
    expect(tipos).toEqual(new Set(['gratis', 'pesos', 'proximamente']))
  })

  it.each(TARIFARIO.map((p) => [p.id, p] as const))('%s: precio de lista', (_id, producto) => {
    const enTexto = precioListaEn(producto.precio, PALABRAS)
    const esTexto = textoPrecioLista(producto.precio)
    if (producto.precio.tipo === 'pesos') {
      expect(enTexto).toMatch(/^ARS \d{1,3}(,\d{3})*(\/month)?$/)
      expect(digitos(enTexto)).toBe(digitos(esTexto))
      expect(digitos(enTexto)).toBe(Math.round(producto.precio.listaArs))
      // El período mensual coincide en los dos idiomas.
      expect(enTexto.endsWith('/month')).toBe(esTexto.endsWith('/mes'))
      expect(enTexto.endsWith('/month')).toBe(producto.precio.periodo === 'mes')
    } else if (producto.precio.tipo === 'gratis') {
      expect(enTexto).toBe('Free')
    } else {
      expect(enTexto).toBe('Coming soon')
    }
  })

  it.each(TARIFARIO.map((p) => [p.id, p] as const))('%s: precio fundador', (_id, producto) => {
    const enTexto = precioFundadorEn(producto.precio, PALABRAS)
    const esTexto = textoPrecioFundador(producto.precio)
    if (producto.precio.tipo === 'pesos') {
      expect(digitos(enTexto)).toBe(digitos(esTexto))
      expect(digitos(enTexto)).toBe(Math.round(producto.precio.fundadorArs))
      expect(enTexto.endsWith('/month')).toBe(esTexto.endsWith('/mes'))
    } else if (producto.precio.tipo === 'gratis') {
      expect(enTexto).toBe('Free')
    } else {
      expect(enTexto).toBe('Reserve priority')
    }
  })

  it.each(TARIFARIO.map((p) => [p.id, p] as const))('%s: USD aproximado', (_id, producto) => {
    const enTexto = usdAproxEn(producto.precio)
    const esTexto = textoUsdAprox(producto.precio)
    if (producto.precio.tipo !== 'pesos') {
      expect(enTexto).toBeNull()
      expect(esTexto).toBeNull()
      return
    }
    expect(enTexto).toMatch(/^USD \d+\.\d$/)
    // Mismo valor: solo cambia la coma decimal por el punto.
    expect(enTexto).toBe((esTexto as string).replace(',', '.'))
    expect(Number(enTexto!.replace('USD ', ''))).toBe(producto.precio.usdLista)
  })

  it('el monto en inglés tiene exactamente el redondeo de formatearPesos (sin decimales, hacia el entero más cercano)', () => {
    for (const monto of [0.4, 0.5, 999.5, 1234.49, 1234.5, 42000, 1234567.8]) {
      const precio = { tipo: 'pesos', listaArs: monto, fundadorArs: monto, usdLista: 1, periodo: null } as const
      expect(digitos(precioListaEn(precio, PALABRAS))).toBe(digitos(formatearPesos(monto)))
      expect(digitos(precioFundadorEn(precio, PALABRAS))).toBe(digitos(formatearPesos(monto)))
    }
  })

  it('formato en-US con coma de miles y sin decimales; períodos "/month" solo en los planes mensuales', () => {
    const mensual = { tipo: 'pesos', listaArs: 42000, fundadorArs: 29500, usdLista: 27.5, periodo: 'mes' } as const
    const unico = { tipo: 'pesos', listaArs: 14000, fundadorArs: 10000, usdLista: 9.2, periodo: null } as const
    expect(precioListaEn(mensual, PALABRAS)).toBe('ARS 42,000/month')
    expect(precioFundadorEn(mensual, PALABRAS)).toBe('ARS 29,500/month')
    expect(precioListaEn(unico, PALABRAS)).toBe('ARS 14,000')
    expect(precioFundadorEn(unico, PALABRAS)).toBe('ARS 10,000')
    expect(usdAproxEn(unico)).toBe('USD 9.2')
    expect(usdAproxEn(mensual)).toBe('USD 27.5')
  })

  it('un USD entero conserva el decimal (USD 10.0), como en castellano (USD 10,0)', () => {
    const precio = { tipo: 'pesos', listaArs: 15000, fundadorArs: 10000, usdLista: 10, periodo: null } as const
    expect(usdAproxEn(precio)).toBe('USD 10.0')
    expect(textoUsdAprox(precio)).toBe('USD 10,0')
  })

  it('las palabras sueltas salen del diccionario que se le pasa', () => {
    const otras: PalabrasPrecio = { gratis: 'G', proximamente: 'P', reservaPrioridad: 'R', porMes: '/m' }
    expect(precioListaEn({ tipo: 'gratis' }, otras)).toBe('G')
    expect(precioFundadorEn({ tipo: 'gratis' }, otras)).toBe('G')
    expect(precioListaEn({ tipo: 'proximamente' }, otras)).toBe('P')
    expect(precioFundadorEn({ tipo: 'proximamente' }, otras)).toBe('R')
    expect(precioListaEn({ tipo: 'pesos', listaArs: 1000, fundadorArs: 700, usdLista: 1, periodo: 'mes' }, otras)).toBe('ARS 1,000/m')
  })
})

describe('pieEnIngles', () => {
  it('traduce el PIE_TARIFARIO real de core', () => {
    const pie = pieEnIngles(PIE_TARIFARIO)
    expect(pie).not.toBeNull()
    expect(pie).toContain('November 1, 2026')
    expect(pie).toContain('January 31, 2027')
    expect(pie).toContain('30 days in advance')
    expect(pie).toContain('10% off')
    expect(pie).toContain('Mercado Pago')
    expect(pie).not.toMatch(/Precios|dólar|anticipación|transferencia/)
  })

  it('la fecha del dólar es el único dato variable: otra fecha válida se traduce con su mes', () => {
    const otro = PIE_TARIFARIO.replace('1/11/2026', '15/12/2026')
    expect(pieEnIngles(otro)).toContain('December 15, 2026')
    // Sin cero adelante: "01/02/2027" sale como "February 1, 2027".
    expect(pieEnIngles(PIE_TARIFARIO.replace('1/11/2026', '01/02/2027'))).toContain('February 1, 2027')
  })

  it('un pie distinto devuelve null (la página lo muestra tal cual, con lang="es")', () => {
    expect(pieEnIngles('Pie de prueba que no conoce la traducción.')).toBeNull()
    expect(pieEnIngles('')).toBeNull()
    expect(pieEnIngles(PIE_TARIFARIO + ' Texto agregado de prueba.')).toBeNull()
    expect(pieEnIngles(PIE_TARIFARIO.replace('10% off', '15% off'))).toBeNull()
  })

  it('una fecha del dólar imposible (mes 13 o 0) devuelve null', () => {
    expect(pieEnIngles(PIE_TARIFARIO.replace('1/11/2026', '1/13/2026'))).toBeNull()
    expect(pieEnIngles(PIE_TARIFARIO.replace('1/11/2026', '1/0/2026'))).toBeNull()
  })

  it('un pie sin fecha del dólar devuelve null', () => {
    expect(pieEnIngles(PIE_TARIFARIO.replace('del 1/11/2026', ''))).toBeNull()
  })
})

describe('avisoEnIngles', () => {
  it('formato conocido: "Desde el 1/3, los precios pasan al tramo de 1.000 personas."', () => {
    expect(avisoEnIngles('Desde el 1/3, los precios pasan al tramo de 1.000 personas.')).toBe(
      'Starting March 1, prices move to the 1,000-person tier.',
    )
    expect(avisoEnIngles('Desde el 15/12, los precios pasan al tramo de 25.000 personas.')).toBe(
      'Starting December 15, prices move to the 25,000-person tier.',
    )
    expect(avisoEnIngles('Desde el 01/02, los precios pasan al tramo de 500 personas.')).toBe(
      'Starting February 1, prices move to the 500-person tier.',
    )
  })

  it.each(['1.000', '1,000', '1000'])('personas con miles por punto, por coma o sin separador (%s): mismo texto', (n) => {
    expect(avisoEnIngles(`Desde el 1/3, los precios pasan al tramo de ${n} personas.`)).toBe(
      'Starting March 1, prices move to the 1,000-person tier.',
    )
  })

  it('miles múltiples (1.000.000, 1,000,000) también se normalizan', () => {
    expect(avisoEnIngles('Desde el 1/3, los precios pasan al tramo de 1.000.000 personas.')).toBe(
      'Starting March 1, prices move to the 1,000,000-person tier.',
    )
    expect(avisoEnIngles('Desde el 1/3, los precios pasan al tramo de 1,000,000 personas.')).toBe(
      'Starting March 1, prices move to the 1,000,000-person tier.',
    )
  })

  it.each(['1..000', '1.00', '1.0000', '1,00', '.000', '1.000.', '1 000', '1.000,5', '-5'])(
    'formato de personas raro (%s): null',
    (n) => {
      expect(avisoEnIngles(`Desde el 1/3, los precios pasan al tramo de ${n} personas.`)).toBeNull()
    },
  )

  it('texto distinto alrededor del número: null', () => {
    expect(avisoEnIngles('Desde el 1/3, los precios pasan al tramo de 1.000 usuarios.')).toBeNull()
    expect(avisoEnIngles('Hasta el 1/3, los precios pasan al tramo de 1.000 personas.')).toBeNull()
  })

  it('texto desconocido, mes imposible o con basura alrededor: null', () => {
    expect(avisoEnIngles('Aviso de prueba cualquiera.')).toBeNull()
    expect(avisoEnIngles('')).toBeNull()
    expect(avisoEnIngles('Desde el 1/13, los precios pasan al tramo de 1.000 personas.')).toBeNull()
    expect(avisoEnIngles('Desde el 1/3, los precios pasan al tramo de 1.000 personas. Más texto.')).toBeNull()
    expect(avisoEnIngles('Desde el 1/3, los precios pasan al tramo de mil personas.')).toBeNull()
  })
})

describe('vigenciaEnIngles', () => {
  it('traduce la vigencia real del tarifario', () => {
    expect(vigenciaEnIngles(VIGENCIA_TARIFARIO)).toBe('November 2026')
  })

  it('los doce meses, sin importar mayúsculas ni espacios de más; "setiembre" vale como septiembre', () => {
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const ingles = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    meses.forEach((mes, i) => expect(vigenciaEnIngles(`${mes} 2027`)).toBe(`${ingles[i]} 2027`))
    expect(vigenciaEnIngles('  Diciembre 2026 ')).toBe('December 2026')
    expect(vigenciaEnIngles('setiembre 2026')).toBe('September 2026')
  })

  it('formatos desconocidos: null', () => {
    expect(vigenciaEnIngles('primavera 2026')).toBeNull()
    expect(vigenciaEnIngles('noviembre')).toBeNull()
    expect(vigenciaEnIngles('noviembre de 2026')).toBeNull()
    expect(vigenciaEnIngles('11/2026')).toBeNull()
    expect(vigenciaEnIngles('')).toBeNull()
  })
})

describe('conteos de métricas en inglés', () => {
  it('conteoPublicoEn: null/negativo "—", menos de 5 "<5", desde 5 el número en en-US', () => {
    expect(conteoPublicoEn(null)).toBe('—')
    expect(conteoPublicoEn(-1)).toBe('—')
    expect(conteoPublicoEn(0)).toBe('<5')
    expect(conteoPublicoEn(4)).toBe('<5')
    expect(conteoPublicoEn(5)).toBe('5')
    expect(conteoPublicoEn(999)).toBe('999')
    expect(conteoPublicoEn(1234)).toBe('1,234')
    expect(conteoPublicoEn(1234567)).toBe('1,234,567')
  })

  it('suscriptosRadarEn: <5, 5+, decenas hacia abajo con "+" y miles en en-US', () => {
    expect(suscriptosRadarEn(null)).toBe('—')
    expect(suscriptosRadarEn(-3)).toBe('—')
    expect(suscriptosRadarEn(0)).toBe('<5')
    expect(suscriptosRadarEn(4)).toBe('<5')
    expect(suscriptosRadarEn(5)).toBe('5+')
    expect(suscriptosRadarEn(9)).toBe('5+')
    expect(suscriptosRadarEn(10)).toBe('10+')
    expect(suscriptosRadarEn(19)).toBe('10+')
    expect(suscriptosRadarEn(99)).toBe('90+')
    expect(suscriptosRadarEn(1299)).toBe('1,290+')
  })

  it('«over N»: el diccionario en inglés arma "over 12,345" con formato en-US', () => {
    expect(en.anunciantes.masDe((12345).toLocaleString('en-US'))).toBe('over 12,345')
    expect(es.anunciantes.masDe((12345).toLocaleString('es-AR'))).toMatch(/^más de 12\D?345$/)
  })

  it.each([null, -1, 0, 3, 4, 5, 9, 10, 11, 49, 100, 1234, 56789, 1000000])(
    'mismo número que en castellano para %s (solo cambia el separador de miles)',
    (n) => {
      const solo = (t: string) => t.replace(/[.,\s]/g, '')
      expect(solo(conteoPublicoEn(n))).toBe(solo(formatPublicCount(n)))
      expect(solo(suscriptosRadarEn(n))).toBe(solo(formatRadarSubscribers(n)))
    },
  )
})
