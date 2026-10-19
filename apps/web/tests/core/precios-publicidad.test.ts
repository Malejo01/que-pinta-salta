// R50: el tarifario de "Publicitá tu evento" (packages/core/src/publicidad/precios.ts).
import { describe, expect, it } from 'vitest'
import {
  DESCUENTO_FUNDADOR,
  PIE_TARIFARIO,
  TARIFARIO,
  VIGENCIA_TARIFARIO,
  formatearPesos,
  textoPrecioFundador,
  textoPrecioLista,
  textoUsdAprox,
  type PrecioPublicidad,
} from '@qps/core/publicidad/precios'

const gratis: PrecioPublicidad = { tipo: 'gratis' }
const proximamente: PrecioPublicidad = { tipo: 'proximamente' }
const unico: PrecioPublicidad = { tipo: 'pesos', listaArs: 14000, fundadorArs: 10000, usdLista: 9.2, periodo: null }
const mensual: PrecioPublicidad = { tipo: 'pesos', listaArs: 42000, fundadorArs: 29500, usdLista: 27.5, periodo: 'mes' }

describe('formatearPesos', () => {
  it('formato es-AR con "$ " y puntos de miles', () => {
    expect(formatearPesos(14000)).toBe('$ 14.000')
    expect(formatearPesos(8500)).toBe('$ 8.500')
    expect(formatearPesos(500)).toBe('$ 500')
  })

  it('sin decimales: redondea', () => {
    expect(formatearPesos(1234.4)).toBe('$ 1.234')
  })
})

describe('textoPrecioLista / textoPrecioFundador', () => {
  it('gratis', () => {
    expect(textoPrecioLista(gratis)).toBe('Gratis')
    expect(textoPrecioFundador(gratis)).toBe('Gratis')
  })

  it('próximamente: lista "Próximamente", fundador "Reservá prioridad"', () => {
    expect(textoPrecioLista(proximamente)).toBe('Próximamente')
    expect(textoPrecioFundador(proximamente)).toBe('Reservá prioridad')
  })

  it('pago único: sin "/mes"', () => {
    expect(textoPrecioLista(unico)).toBe('$ 14.000')
    expect(textoPrecioFundador(unico)).toBe('$ 10.000')
  })

  it('plan mensual: con "/mes"', () => {
    expect(textoPrecioLista(mensual)).toBe('$ 42.000/mes')
    expect(textoPrecioFundador(mensual)).toBe('$ 29.500/mes')
  })

  it('en el TARIFARIO, "/mes" aparece solo en los dos planes', () => {
    const conMes = TARIFARIO.filter((p) => textoPrecioLista(p.precio).endsWith('/mes')).map((p) => p.id)
    expect(conMes).toEqual(['plan-mensual', 'plan-rrpp'])
    for (const p of TARIFARIO) {
      expect(textoPrecioFundador(p.precio).endsWith('/mes')).toBe(conMes.includes(p.id))
    }
  })
})

describe('textoUsdAprox', () => {
  it('"USD 9,2" con coma decimal', () => {
    expect(textoUsdAprox(unico)).toBe('USD 9,2')
    expect(textoUsdAprox(mensual)).toBe('USD 27,5')
  })

  it('un decimal fijo aunque el valor sea redondo', () => {
    expect(textoUsdAprox({ tipo: 'pesos', listaArs: 1, fundadorArs: 1, usdLista: 10, periodo: null })).toBe('USD 10,0')
  })

  it('null para gratis y próximamente', () => {
    expect(textoUsdAprox(gratis)).toBeNull()
    expect(textoUsdAprox(proximamente)).toBeNull()
  })
})

describe('TARIFARIO: coherencia interna', () => {
  const conPesos = TARIFARIO.flatMap((p) => (p.precio.tipo === 'pesos' ? [{ id: p.id, ...p.precio }] : []))

  it('ids únicos y ningún texto vacío', () => {
    expect(new Set(TARIFARIO.map((p) => p.id)).size).toBe(TARIFARIO.length)
    for (const p of TARIFARIO) {
      expect(p.nombre.trim()).not.toBe('')
      expect(p.queIncluye.trim()).not.toBe('')
    }
  })

  it('hay 6 productos con precio en pesos', () => {
    expect(conPesos).toHaveLength(6)
  })

  it.each(conPesos)('$id: el precio fundador nunca supera la lista y ronda el 70% de la lista (±5%)', (p) => {
    expect(p.fundadorArs).toBeLessThanOrEqual(p.listaArs)
    const objetivo = p.listaArs * (1 - DESCUENTO_FUNDADOR)
    expect(Math.abs(p.fundadorArs - objetivo)).toBeLessThanOrEqual(objetivo * 0.05)
  })

  it.each(conPesos)('$id: montos enteros y múltiplos de $500 (la tabla redondea a $500)', (p) => {
    expect(p.listaArs % 500).toBe(0)
    expect(p.fundadorArs % 500).toBe(0)
  })

  it.each(conPesos)('$id: los USD aproximados son positivos', (p) => {
    expect(p.usdLista).toBeGreaterThan(0)
  })

  it('el precio de lista crece con la duración del destacado (3, 7 y 14 días)', () => {
    const lista = (id: string) => {
      const p = TARIFARIO.find((x) => x.id === id)!.precio
      return p.tipo === 'pesos' ? p.listaArs : NaN
    }
    expect(lista('destacado-3')).toBeLessThan(lista('destacado-7'))
    expect(lista('destacado-7')).toBeLessThan(lista('destacado-14'))
  })

  it('solo un producto está resaltado: el destacado de 7 días', () => {
    expect(TARIFARIO.filter((p) => p.destacado).map((p) => p.id)).toEqual(['destacado-7'])
  })

  it('el descuento fundador es 30% y la vigencia es noviembre 2026', () => {
    expect(DESCUENTO_FUNDADOR).toBe(0.3)
    expect(VIGENCIA_TARIFARIO).toBe('noviembre 2026')
  })
})

describe('PIE_TARIFARIO', () => {
  it('menciona dólar BNA, 30 días de anticipación, 10% prepago, 31/01/2027 y transferencia o Mercado Pago', () => {
    expect(PIE_TARIFARIO).toMatch(/dólar BNA/)
    expect(PIE_TARIFARIO).toMatch(/30 días/)
    expect(PIE_TARIFARIO).toMatch(/10% off/)
    expect(PIE_TARIFARIO).toMatch(/prepago 3 meses/)
    expect(PIE_TARIFARIO).toContain('31/01/2027')
    expect(PIE_TARIFARIO).toMatch(/transferencia o Mercado Pago/)
  })

  it('no menciona IVA ni deja pendientes', () => {
    expect(PIE_TARIFARIO).not.toMatch(/\bIVA\b/i)
    expect(PIE_TARIFARIO).not.toContain('[COMPLETAR')
  })
})
