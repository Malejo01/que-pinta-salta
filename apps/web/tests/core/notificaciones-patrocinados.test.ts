/**
 * `notificaciones/patrocinados.ts` (D2/Ronda 51, tarea 51-a): `semanaSalta`
 * (en `./reglas`, pero el borde del año ISO es crítico para el dedupe
 * patrocinado, así que se cubre acá junto con el resto de la validación de
 * campaña), `validarCampania`, `campaniaVigente` y `enLotes`. Fixtures
 * inventadas y evidentes, sin red ni base.
 */
import { describe, expect, it } from 'vitest'
import {
  campaniaVigente,
  DIAS_MAXIMOS_VENTANA,
  LARGO_MAXIMO_CUERPO,
  LARGO_MAXIMO_TITULO,
  validarCampania,
  type VentanaCampania,
} from '@qps/core/notificaciones/patrocinados'
import { semanaSalta } from '@qps/core/notificaciones/reglas'
import { enLotes } from '@qps/core/notificaciones/lotes'
import { saltaWallClockToDate } from '@qps/core/date-format'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

function entradaValida(overrides: Record<string, unknown> = {}) {
  return {
    titulo: 'Recital en el Anfiteatro',
    cuerpo: 'No te lo pierdas, entrada gratis.',
    eventId: '00000000-0000-0000-0000-000000000001',
    startsAt: salta('2026-10-20T00:00:00').toISOString(),
    endsAt: salta('2026-10-25T00:00:00').toISOString(),
    ...overrides,
  }
}

describe('semanaSalta', () => {
  it('un domingo 23:30 de Salta (ya lunes en UTC) cae en la MISMA semana que el lunes de esa semana, no en la del lunes siguiente', () => {
    const lunesDeEsaSemana = salta('2026-10-19T10:00:00') // lunes de la semana del domingo 25/10
    const domingo2330 = salta('2026-10-25T23:30:00') // domingo 25/10, 23:30 de Salta (lunes 26 en UTC)
    const lunesSiguiente0000 = salta('2026-10-26T00:00:00')
    expect(semanaSalta(domingo2330)).toBe(semanaSalta(lunesDeEsaSemana))
    expect(semanaSalta(domingo2330)).not.toBe(semanaSalta(lunesSiguiente0000))
  })

  it('el lunes 00:00 de Salta abre la semana siguiente a la del domingo anterior', () => {
    const domingo = salta('2026-10-25T12:00:00')
    const lunes = salta('2026-10-26T00:00:00')
    expect(semanaSalta(domingo)).not.toBe(semanaSalta(lunes))
  })

  it('la semana 1 del año existe y tiene el formato AAAA-Sss', () => {
    // 2026-01-01 es jueves: cae en la semana 1 del año ISO 2026.
    expect(semanaSalta(salta('2026-01-01T12:00:00'))).toBe('2026-S01')
  })

  it('el borde de la semana 52/53: el 2027-01-01 (viernes) cae en la semana 53 del año ISO 2026, no en la 1 del 2027', () => {
    expect(semanaSalta(salta('2027-01-01T12:00:00'))).toBe('2026-S53')
  })

  describe('año ISO 2027, cuyo 1 de enero NO cae jueves (es viernes): el caso que la fórmula vieja `ceil(dias/7 + 1)` no agarraba, porque solo coincide con `ceil((dias+1)/7)` cuando el 1 de enero cae jueves', () => {
    it('2027-01-03 (domingo): todavía semana 53 del año ISO 2026', () => {
      expect(semanaSalta(salta('2027-01-03T12:00:00'))).toBe('2026-S53')
    })

    it('2027-01-04 (lunes): ya abre la semana 1 del año ISO 2027', () => {
      expect(semanaSalta(salta('2027-01-04T12:00:00'))).toBe('2027-S01')
    })

    it('2027-01-07 (jueves de la semana 1 del 2027)', () => {
      expect(semanaSalta(salta('2027-01-07T12:00:00'))).toBe('2027-S01')
    })

    it('2027-12-30 (jueves): última semana del año ISO 2027, la 52', () => {
      expect(semanaSalta(salta('2027-12-30T12:00:00'))).toBe('2027-S52')
    })

    it('2028-01-01 (sábado): todavía semana 52 del año ISO 2027 (el año de calendario ya cambió, el ISO no)', () => {
      expect(semanaSalta(salta('2028-01-01T12:00:00'))).toBe('2027-S52')
    })
  })
})

describe('validarCampania: cada error por separado', () => {
  const ahora = salta('2026-10-15T12:00:00')

  it('título vacío', () => {
    const r = validarCampania(entradaValida({ titulo: '   ' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'titulo')).toBe(true)
  })

  it('título demasiado largo', () => {
    const r = validarCampania(entradaValida({ titulo: 'x'.repeat(LARGO_MAXIMO_TITULO + 1) }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'titulo')).toBe(true)
  })

  it('título con salto de línea', () => {
    const r = validarCampania(entradaValida({ titulo: 'Línea uno\nLínea dos' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'titulo')).toBe(true)
  })

  it('cuerpo vacío', () => {
    const r = validarCampania(entradaValida({ cuerpo: '' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'cuerpo')).toBe(true)
  })

  it('cuerpo demasiado largo', () => {
    const r = validarCampania(entradaValida({ cuerpo: 'x'.repeat(LARGO_MAXIMO_CUERPO + 1) }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'cuerpo')).toBe(true)
  })

  it('eventId ausente', () => {
    const r = validarCampania(entradaValida({ eventId: undefined }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'eventId')).toBe(true)
  })

  it('eventId que no es uuid', () => {
    const r = validarCampania(entradaValida({ eventId: 'no-es-un-uuid' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'eventId')).toBe(true)
  })

  it('startsAt no parseable', () => {
    const r = validarCampania(entradaValida({ startsAt: 'esto-no-es-una-fecha' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'startsAt')).toBe(true)
  })

  it('endsAt antes que startsAt', () => {
    const r = validarCampania(
      entradaValida({
        startsAt: salta('2026-10-25T00:00:00').toISOString(),
        endsAt: salta('2026-10-20T00:00:00').toISOString(),
      }),
      ahora,
      [],
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'endsAt')).toBe(true)
  })

  it(`ventana más larga que DIAS_MAXIMOS_VENTANA (${DIAS_MAXIMOS_VENTANA} días)`, () => {
    const inicio = salta('2026-10-20T00:00:00')
    const fin = new Date(inicio.getTime() + (DIAS_MAXIMOS_VENTANA + 1) * 24 * 60 * 60 * 1000)
    const r = validarCampania(
      entradaValida({ startsAt: inicio.toISOString(), endsAt: fin.toISOString() }),
      ahora,
      [],
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'endsAt')).toBe(true)
  })

  it('endsAt ya pasado respecto de ahora', () => {
    const r = validarCampania(
      entradaValida({
        startsAt: salta('2026-10-01T00:00:00').toISOString(),
        endsAt: salta('2026-10-05T00:00:00').toISOString(),
      }),
      ahora, // 2026-10-15, posterior a endsAt
      [],
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'endsAt')).toBe(true)
  })

  it('url http:// rechazada', () => {
    const r = validarCampania(entradaValida({ url: 'http://ejemplo.com' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'url')).toBe(true)
  })

  it('url https:// aceptada', () => {
    const r = validarCampania(entradaValida({ url: 'https://ejemplo.com' }), ahora, [])
    expect(r.ok).toBe(true)
  })

  it('url ausente (null/undefined) es válida, no es obligatoria', () => {
    expect(validarCampania(entradaValida({ url: null }), ahora, []).ok).toBe(true)
    expect(validarCampania(entradaValida({ url: undefined }), ahora, []).ok).toBe(true)
  })
})

describe('validarCampania: varios errores juntos', () => {
  it('título vacío y cuerpo vacío a la vez: los dos errores vienen juntos', () => {
    const ahora = salta('2026-10-15T12:00:00')
    const r = validarCampania(entradaValida({ titulo: '', cuerpo: '' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores.length).toBeGreaterThanOrEqual(2)
      expect(r.errores.some((e) => e.campo === 'titulo')).toBe(true)
      expect(r.errores.some((e) => e.campo === 'cuerpo')).toBe(true)
    }
  })
})

describe('validarCampania: palabras que imitan al sistema (política de Ads de Play)', () => {
  const ahora = salta('2026-10-15T12:00:00')

  it('"Actualización de seguridad" es rechazado', () => {
    const r = validarCampania(entradaValida({ titulo: 'Actualización de seguridad' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'titulo')).toBe(true)
  })

  it('"ACTUALIZACION" (sin tildes y en mayúsculas) también es rechazado', () => {
    const r = validarCampania(entradaValida({ titulo: 'ACTUALIZACION de la semana' }), ahora, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'titulo')).toBe(true)
  })

  it('un título sin ninguna palabra prohibida es aceptado', () => {
    const r = validarCampania(entradaValida({ titulo: 'Recital en el Anfiteatro' }), ahora, [])
    expect(r.ok).toBe(true)
  })
})

describe('validarCampania: cruce de ventanas', () => {
  const ahora = salta('2026-10-01T12:00:00')

  function ventana(id: string, inicio: string, fin: string): VentanaCampania {
    return { id, startsAt: salta(inicio), endsAt: salta(fin) }
  }

  it('se superpone con otra campaña ya cargada: rechazada', () => {
    const otras = [ventana('otra-1', '2026-10-20T00:00:00', '2026-10-24T00:00:00')]
    const r = validarCampania(
      entradaValida({
        startsAt: salta('2026-10-22T00:00:00').toISOString(),
        endsAt: salta('2026-10-26T00:00:00').toISOString(),
      }),
      ahora,
      otras,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.some((e) => e.campo === 'startsAt')).toBe(true)
  })

  it('el borde exacto (el endsAt de una es el startsAt de la otra) NO es cruce: aceptada', () => {
    const otras = [ventana('otra-1', '2026-10-15T00:00:00', '2026-10-20T00:00:00')]
    const r = validarCampania(
      entradaValida({
        startsAt: salta('2026-10-20T00:00:00').toISOString(),
        endsAt: salta('2026-10-24T00:00:00').toISOString(),
      }),
      ahora,
      otras,
    )
    expect(r.ok).toBe(true)
  })

  it('el borde exacto al revés (el startsAt de la nueva es el endsAt de otra) también NO es cruce: aceptada', () => {
    const otras = [ventana('otra-1', '2026-10-24T00:00:00', '2026-10-28T00:00:00')]
    const r = validarCampania(
      entradaValida({
        startsAt: salta('2026-10-20T00:00:00').toISOString(),
        endsAt: salta('2026-10-24T00:00:00').toISOString(),
      }),
      ahora,
      otras,
    )
    expect(r.ok).toBe(true)
  })

  it('sin ninguna otra campaña: nunca hay cruce', () => {
    const r = validarCampania(
      entradaValida({
        startsAt: salta('2026-10-20T00:00:00').toISOString(),
        endsAt: salta('2026-10-24T00:00:00').toISOString(),
      }),
      ahora,
      [],
    )
    expect(r.ok).toBe(true)
  })
})

describe('campaniaVigente', () => {
  function ventana(id: string, inicio: string, fin: string): VentanaCampania {
    return { id, startsAt: salta(inicio), endsAt: salta(fin) }
  }

  it('con 0 campañas, da null', () => {
    expect(campaniaVigente([], salta('2026-10-20T12:00:00'))).toBeNull()
  })

  it('con 1 campaña vigente, la devuelve', () => {
    const campania = ventana('c1', '2026-10-20T00:00:00', '2026-10-25T00:00:00')
    expect(campaniaVigente([campania], salta('2026-10-22T12:00:00'))).toEqual(campania)
  })

  it('con 1 campaña que ya terminó (ahora >= endsAt), da null', () => {
    const campania = ventana('c1', '2026-10-20T00:00:00', '2026-10-25T00:00:00')
    expect(campaniaVigente([campania], salta('2026-10-25T00:00:00'))).toBeNull()
  })

  it('con 1 campaña que todavía no empezó (ahora < startsAt), da null', () => {
    const campania = ventana('c1', '2026-10-20T00:00:00', '2026-10-25T00:00:00')
    expect(campaniaVigente([campania], salta('2026-10-19T23:59:00'))).toBeNull()
  })

  it('con 2 campañas vigentes (no debería pasar), elige la de startsAt más temprano', () => {
    const masTemprana = ventana('c2', '2026-10-18T00:00:00', '2026-10-25T00:00:00')
    const masTardia = ventana('c1', '2026-10-20T00:00:00', '2026-10-25T00:00:00')
    const resultado = campaniaVigente([masTardia, masTemprana], salta('2026-10-22T12:00:00'))
    expect(resultado).toEqual(masTemprana)
  })

  it('con 2 campañas vigentes con el mismo startsAt, elige la de id menor, de forma determinista', () => {
    const a = ventana('b-campania', '2026-10-20T00:00:00', '2026-10-25T00:00:00')
    const b = ventana('a-campania', '2026-10-20T00:00:00', '2026-10-25T00:00:00')
    const resultado1 = campaniaVigente([a, b], salta('2026-10-22T12:00:00'))
    const resultado2 = campaniaVigente([b, a], salta('2026-10-22T12:00:00'))
    expect(resultado1).toEqual(b)
    expect(resultado2).toEqual(b)
  })

  it('no muta el array de entrada', () => {
    const c1 = ventana('c1', '2026-10-20T00:00:00', '2026-10-25T00:00:00')
    const c2 = ventana('c2', '2026-10-01T00:00:00', '2026-10-05T00:00:00')
    const entrada = [c1, c2]
    campaniaVigente(entrada, salta('2026-10-22T12:00:00'))
    expect(entrada).toEqual([c1, c2])
  })
})

describe('enLotes', () => {
  it('con 0 elementos, da [] (no [[]])', () => {
    expect(enLotes([], 200)).toEqual([])
  })

  it('con 200 elementos y tamaño 200, da un solo lote con los 200', () => {
    const items = Array.from({ length: 200 }, (_, i) => i)
    const lotes = enLotes(items, 200)
    expect(lotes).toHaveLength(1)
    expect(lotes[0]).toHaveLength(200)
  })

  it('con 401 elementos y tamaño 200, da 3 lotes (200, 200, 1)', () => {
    const items = Array.from({ length: 401 }, (_, i) => i)
    const lotes = enLotes(items, 200)
    expect(lotes).toHaveLength(3)
    expect(lotes.map((l) => l.length)).toEqual([200, 200, 1])
  })

  it('la concatenación de los lotes es igual al original, en el mismo orden', () => {
    const items = Array.from({ length: 401 }, (_, i) => i)
    const lotes = enLotes(items, 200)
    expect(lotes.flat()).toEqual(items)
  })

  it('con tamanio <= 0, tira un error (no se cuelga en un bucle infinito)', () => {
    expect(() => enLotes([1, 2, 3], 0)).toThrow()
    expect(() => enLotes([1, 2, 3], -1)).toThrow()
  })
})
