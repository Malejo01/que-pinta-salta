import { describe, expect, it } from 'vitest'
import { debePausar, motivoPausa } from '@qps/core/publicidad/bajas'

describe('debePausar', () => {
  it('4 de 200 con umbral 0,02: no (es igual, no mayor)', () => {
    expect(debePausar({ destinatarios: 200, bajas: 4, umbral: 0.02 })).toBe(false)
  })
  it('5 de 200: sí', () => {
    expect(debePausar({ destinatarios: 200, bajas: 5, umbral: 0.02 })).toBe(true)
  })
  it('0 destinatarios: no', () => {
    expect(debePausar({ destinatarios: 0, bajas: 0, umbral: 0.02 })).toBe(false)
  })
  it('null: no', () => {
    expect(debePausar({ destinatarios: null, bajas: 3, umbral: 0.02 })).toBe(false)
    expect(debePausar({ destinatarios: 200, bajas: null, umbral: 0.02 })).toBe(false)
  })
})

describe('motivoPausa', () => {
  it('arma el texto con números y la fecha', () => {
    expect(motivoPausa({ bajas: 7, destinatarios: 200, umbral: 0.02, fecha: '2026-11-12' })).toBe(
      'Bajas en 48 h: 7 de 200 (umbral 2%), campaña del 12/11',
    )
  })
  it('no tiene nada con forma de uuid', () => {
    const texto = motivoPausa({ bajas: 7, destinatarios: 200, umbral: 0.02, fecha: '2026-11-12' })
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })
})
