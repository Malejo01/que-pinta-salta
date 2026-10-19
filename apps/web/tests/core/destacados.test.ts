/**
 * `events/destacados.ts` (R50, QPS-239): destacados de eventos sin cron,
 * vencen solos comparando `featured_until` contra `ahora`. Módulo puro: sin
 * red, sin base y sin `Date.now()`/`new Date()` sin argumento. Fixtures
 * inventadas y evidentes.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DURACIONES_DESTACADO_DIAS,
  MAXIMO_DIAS_DESTACADO,
  estaDestacado,
  finDeDiaSalta,
  textoVenceDestacado,
  validarDestacado,
} from '@qps/core/events/destacados'
import { saltaWallClockToDate } from '@qps/core/date-format'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

describe('estaDestacado', () => {
  const ahora = salta('2030-10-10T12:00:00')

  it('null, undefined y string vacío: false', () => {
    expect(estaDestacado(null, ahora)).toBe(false)
    expect(estaDestacado(undefined, ahora)).toBe(false)
    expect(estaDestacado('', ahora)).toBe(false)
  })

  it('un string que no parsea como fecha: false (no tira)', () => {
    expect(estaDestacado('no-es-fecha', ahora)).toBe(false)
  })

  it('una fecha pasada: false', () => {
    expect(estaDestacado(salta('2030-10-01T12:00:00').toISOString(), ahora)).toBe(false)
  })

  it('la fecha exacta de "ahora": false (tiene que ser estrictamente posterior)', () => {
    expect(estaDestacado(ahora.toISOString(), ahora)).toBe(false)
  })

  it('un minuto después de "ahora": true', () => {
    expect(estaDestacado(new Date(ahora.getTime() + 60_000).toISOString(), ahora)).toBe(true)
  })

  it('una fecha lejana futura: true', () => {
    expect(estaDestacado(salta('2031-10-10T12:00:00').toISOString(), ahora)).toBe(true)
  })
})

describe('finDeDiaSalta', () => {
  it('"2026-12-31" -> fin de ese día en Salta (UTC-3)', () => {
    expect(finDeDiaSalta('2026-12-31')).toBe('2026-12-31T23:59:59-03:00')
  })

  it('"2026-02-29" (2026 no es bisiesto): tira', () => {
    expect(() => finDeDiaSalta('2026-02-29')).toThrow()
  })

  it('"2026-13-01" (mes inválido): tira', () => {
    expect(() => finDeDiaSalta('2026-13-01')).toThrow()
  })

  it('"2026-2-9" (sin ceros, formato no exacto): tira', () => {
    expect(() => finDeDiaSalta('2026-2-9')).toThrow()
  })
})

describe('validarDestacado', () => {
  const ahora = salta('2030-10-10T12:00:00')
  const idValido = '11111111-1111-4111-8111-111111111111'

  it('caso ok: devuelve eventId y featuredUntil en ISO', () => {
    const resultado = validarDestacado({ eventId: idValido, hasta: '2030-10-20' }, ahora)
    expect(resultado).toEqual({
      ok: true,
      eventId: idValido,
      featuredUntil: '2030-10-20T23:59:59-03:00',
    })
  })

  it('INVALID_ID: eventId no es un uuid', () => {
    expect(validarDestacado({ eventId: 'no-es-un-uuid', hasta: '2030-10-20' }, ahora)).toEqual({
      ok: false,
      error: 'INVALID_ID',
    })
  })

  it('FECHA_INVALIDA: hasta no es "YYYY-MM-DD" válido', () => {
    expect(validarDestacado({ eventId: idValido, hasta: '2030-02-30' }, ahora)).toEqual({
      ok: false,
      error: 'FECHA_INVALIDA',
    })
  })

  it('FECHA_PASADA: hasta ya venció', () => {
    expect(validarDestacado({ eventId: idValido, hasta: '2030-10-01' }, ahora)).toEqual({
      ok: false,
      error: 'FECHA_PASADA',
    })
  })

  it('FECHA_LEJANA: hasta a más de 365 días de ahora', () => {
    expect(validarDestacado({ eventId: idValido, hasta: '2032-01-01' }, ahora)).toEqual({
      ok: false,
      error: 'FECHA_LEJANA',
    })
  })

  // Para que el límite caiga justo en el borde (sin depender de a qué hora
  // del día es "ahora"), se usa un "ahora" que también es el fin de un día
  // de Salta: así `finDeDiaSalta('2031-10-10')` (365 días de calendario
  // después de "2030-10-10", sin 29 de febrero de por medio: 2031 no es
  // bisiesto) cae exactamente en `ahora + 365 * 24 * 60 * 60 * 1000` ms.
  const ahoraFinDeDia = new Date(finDeDiaSalta('2030-10-10'))

  it('365 días exactos desde "ahora" (en milisegundos: 365 * 24 * 60 * 60 * 1000): pasa, el límite es inclusivo', () => {
    const resultado = validarDestacado({ eventId: idValido, hasta: '2031-10-10' }, ahoraFinDeDia)
    expect(resultado).toEqual({
      ok: true,
      eventId: idValido,
      featuredUntil: '2031-10-10T23:59:59-03:00',
    })
  })

  it('366 días desde "ahora": no pasa (FECHA_LEJANA)', () => {
    expect(validarDestacado({ eventId: idValido, hasta: '2031-10-11' }, ahoraFinDeDia)).toEqual({
      ok: false,
      error: 'FECHA_LEJANA',
    })
  })

  it('entrada que no es un objeto (null, string, número): INVALID_ID, sin tirar', () => {
    expect(validarDestacado(null, ahora)).toEqual({ ok: false, error: 'INVALID_ID' })
    expect(validarDestacado('no-es-un-objeto', ahora)).toEqual({ ok: false, error: 'INVALID_ID' })
    expect(validarDestacado(42, ahora)).toEqual({ ok: false, error: 'INVALID_ID' })
  })

  it('eventId que no es string: INVALID_ID', () => {
    expect(validarDestacado({ eventId: 12345, hasta: '2030-10-20' }, ahora)).toEqual({
      ok: false,
      error: 'INVALID_ID',
    })
  })
})

describe('textoVenceDestacado', () => {
  const ahora = salta('2030-10-10T12:00:00')

  it('vigente: "Destacado hasta el DD/MM"', () => {
    expect(textoVenceDestacado(finDeDiaSalta('2030-10-30'), ahora)).toBe('Destacado hasta el 30/10')
  })

  it('vencido: "Venció el DD/MM"', () => {
    const ahoraMasTarde = salta('2030-10-15T12:00:00')
    expect(textoVenceDestacado(finDeDiaSalta('2030-10-12'), ahoraMasTarde)).toBe('Venció el 12/10')
  })

  it('sin destacado (null): "Sin destacado"', () => {
    expect(textoVenceDestacado(null, ahora)).toBe('Sin destacado')
  })
})

describe('DURACIONES_DESTACADO_DIAS y MAXIMO_DIAS_DESTACADO', () => {
  it('las duraciones ofrecidas son 7, 14 y 30 días', () => {
    expect(DURACIONES_DESTACADO_DIAS).toEqual([7, 14, 30])
  })

  it('el tope es 365 días', () => {
    expect(MAXIMO_DIAS_DESTACADO).toBe(365)
  })
})

describe('pureza del módulo', () => {
  it('no llama a Date.now() ni a "new Date()" sin argumento', () => {
    const ruta = fileURLToPath(new URL('../../../../packages/core/src/events/destacados.ts', import.meta.url))
    const fuente = readFileSync(ruta, 'utf8')
    expect(fuente).not.toMatch(/Date\.now\(\)/)
    expect(fuente).not.toMatch(/new Date\(\s*\)/)
  })
})
