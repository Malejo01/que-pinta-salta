/**
 * `horasCompatibles` y la constante `TOLERANCIA_HORA_DEDUP_MIN` (QPS-164,
 * hallazgo 1, decisión de Mauro del 17/10). Los tests corren con `TZ=UTC`
 * (`apps/web/vitest.config.ts`), así que todas las fixtures llevan zona
 * explícita (`-03:00` o `Z`): un string sin zona se interpretaría como hora
 * local UTC, no como hora de Salta, y estaríamos probando otra cosa.
 */
import { describe, expect, it } from 'vitest'
import { horasCompatibles, TOLERANCIA_HORA_DEDUP_MIN } from '@qps/core/scraper/dedup-key'

describe('TOLERANCIA_HORA_DEDUP_MIN', () => {
  it('vale 120 minutos (cambiarla es a conciencia)', () => {
    expect(TOLERANCIA_HORA_DEDUP_MIN).toBe(120)
  })
})

describe('horasCompatibles', () => {
  it('16:00 contra 21:00 del mismo día: no son compatibles', () => {
    expect(horasCompatibles('2026-10-20T16:00:00-03:00', '2026-10-20T21:00:00-03:00')).toBe(false)
  })

  it('21:00 contra 21:30: son compatibles', () => {
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', '2026-10-20T21:30:00-03:00')).toBe(true)
  })

  it('borde inclusivo: 21:00 contra 23:00 (120 minutos exactos) es compatible', () => {
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', '2026-10-20T23:00:00-03:00')).toBe(true)
  })

  it('21:00 contra 23:01 (121 minutos) no es compatible', () => {
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', '2026-10-20T23:01:00-03:00')).toBe(false)
  })

  it('sin hora (00:00 de Salta) contra 21:00: compatible, en los dos órdenes', () => {
    expect(horasCompatibles('2026-10-20T00:00:00-03:00', '2026-10-20T21:00:00-03:00')).toBe(true)
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', '2026-10-20T00:00:00-03:00')).toBe(true)
  })

  it('null de un lado: compatible', () => {
    expect(horasCompatibles(null, '2026-10-20T21:00:00-03:00')).toBe(true)
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', null)).toBe(true)
  })

  it('fecha inválida de un lado: compatible', () => {
    expect(horasCompatibles('no-es-fecha', '2026-10-20T21:00:00-03:00')).toBe(true)
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', 'no-es-fecha')).toBe(true)
  })

  it('el mismo instante escrito con Z y con -03:00: compatible', () => {
    expect(horasCompatibles('2026-10-21T00:00:00Z', '2026-10-20T21:00:00-03:00')).toBe(true)
  })

  it('días distintos, los dos con hora: no son compatibles', () => {
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', '2026-10-21T21:00:00-03:00')).toBe(false)
  })

  it('con toleranciaMin = 0: 21:00 contra 21:30 no es compatible', () => {
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', '2026-10-20T21:30:00-03:00', 0)).toBe(false)
  })

  it('con toleranciaMin = 0: 21:00 contra 21:00 es compatible', () => {
    expect(horasCompatibles('2026-10-20T21:00:00-03:00', '2026-10-20T21:00:00-03:00', 0)).toBe(true)
  })
})
