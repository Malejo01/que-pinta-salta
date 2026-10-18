// R43, 43-a: `textoGuardadoEn` y `TITULO_SIN_CONEXION`
// (lib/sin-conexion/aviso.ts). Todas las fechas se construyen con el offset
// de Salta explícito (`-03:00`) para no depender de la zona de la máquina
// que corre el test, y los casos de "hoy"/"ayer" están pegados a la
// medianoche de Salta (23:59 y 00:01) a propósito: son los que fallarían si
// alguien usara `Date.getHours()`/`getDay()` de la máquina (en UTC) en vez
// de los helpers de `@qps/core`.
import { describe, expect, it } from 'vitest'
import { TEXTO_GUARDADO_INVALIDO, TITULO_SIN_CONEXION, textoGuardadoEn } from '../lib/sin-conexion/aviso'

describe('TITULO_SIN_CONEXION', () => {
  it('es el texto fijo del plan', () => {
    expect(TITULO_SIN_CONEXION).toBe('Sin conexión, mostrando lo último guardado')
  })
})

describe('textoGuardadoEn', () => {
  it('hoy: ahora a las 23:59 de Salta, guardado el mismo día a las 14:32', () => {
    const ahora = new Date('2026-10-14T23:59:00-03:00')
    const guardadoEn = new Date('2026-10-14T14:32:00-03:00')
    expect(textoGuardadoEn(guardadoEn, ahora)).toBe('Guardado hoy a las 14:32')
  })

  it('ayer: ahora recién pasada la medianoche de Salta (00:01), guardado el día anterior a las 21:05', () => {
    const ahora = new Date('2026-10-15T00:01:00-03:00')
    const guardadoEn = new Date('2026-10-14T21:05:00-03:00')
    expect(textoGuardadoEn(guardadoEn, ahora)).toBe('Guardado ayer a las 21:05')
  })

  it('otro día (incluso de otro mes): "el DD/MM"', () => {
    const ahora = new Date('2026-10-15T10:00:00-03:00')
    const guardadoEn = new Date('2026-09-20T10:00:00-03:00')
    expect(textoGuardadoEn(guardadoEn, ahora)).toBe('Guardado el 20/09 a las 10:00')
  })

  it('justo en el límite: lo guardado a las 00:00:00.001 de Salta del día de "ahora" cuenta como "hoy", no "ayer"', () => {
    const ahora = new Date('2026-10-15T12:00:00-03:00')
    const guardadoEn = new Date('2026-10-15T00:00:00.001-03:00')
    expect(textoGuardadoEn(guardadoEn, ahora)).toBe('Guardado hoy a las 00:00')
  })

  it('con guardadoEn inválido, no tira: devuelve el texto neutro', () => {
    expect(textoGuardadoEn(new Date('fecha-que-no-existe'), new Date())).toBe(TEXTO_GUARDADO_INVALIDO)
  })

  it('con ahora inválido, no tira: devuelve el texto neutro', () => {
    expect(textoGuardadoEn(new Date(), new Date('fecha-que-no-existe'))).toBe(TEXTO_GUARDADO_INVALIDO)
  })
})
