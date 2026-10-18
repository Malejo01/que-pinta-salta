/**
 * `sufijoSlugFechaHora` y `slugConFechaHora` (QPS-164, hallazgo 1, decisión
 * de Mauro del 17/10). Los tests corren con `TZ=UTC`, así que un string sin
 * hora explícita ("2026-10-20T21:00:00") se interpreta como hora de pared de
 * Salta (sin zona), tal como la entregan las ticketeras, y pasa primero por
 * `saltaWallClockToUtcISO`.
 */
import { describe, expect, it } from 'vitest'
import { slugConFechaHora, sufijoSlugFechaHora } from '@qps/core/scraper/slug-fecha-hora'

describe('sufijoSlugFechaHora', () => {
  it('hora de pared con "T" y con espacio: mismo resultado', () => {
    expect(sufijoSlugFechaHora('2026-10-20T21:00:00')).toBe('2026-10-20-2100')
    expect(sufijoSlugFechaHora('2026-10-20 21:00:00')).toBe('2026-10-20-2100')
  })

  it('con offset explícito -03:00', () => {
    expect(sufijoSlugFechaHora('2026-10-20T21:00:00-03:00')).toBe('2026-10-20-2100')
  })

  it('un Date ya es un instante: el día UTC puede ser otro, pero en Salta sigue siendo el 20', () => {
    expect(sufijoSlugFechaHora(new Date('2026-10-21T00:00:00Z'))).toBe('2026-10-20-2100')
  })

  it('00:00 de Salta es "sin hora": solo el día', () => {
    expect(sufijoSlugFechaHora('2026-10-20T00:00:00')).toBe('2026-10-20')
    expect(sufijoSlugFechaHora('2026-10-20')).toBe('2026-10-20')
  })

  it('fecha inválida o vacía: string vacío, sin lanzar', () => {
    expect(sufijoSlugFechaHora('no-es-fecha')).toBe('')
    expect(sufijoSlugFechaHora(null)).toBe('')
    expect(sufijoSlugFechaHora(undefined)).toBe('')
    expect(sufijoSlugFechaHora('')).toBe('')
  })

  it('dos funciones del mismo show dan sufijos distintos', () => {
    const a = sufijoSlugFechaHora('2026-10-20T16:00:00')
    const b = sufijoSlugFechaHora('2026-10-20T21:00:00')
    expect(a).not.toBe(b)
  })

  it('la misma función, calculada dos veces, da el mismo sufijo', () => {
    const a = sufijoSlugFechaHora('2026-10-20T21:00:00')
    const b = sufijoSlugFechaHora('2026-10-20T21:00:00')
    expect(a).toBe(b)
  })
})

describe('slugConFechaHora', () => {
  it('agrega el sufijo con un guion', () => {
    expect(slugConFechaHora('show', '2026-10-20T21:00:00')).toBe('show-2026-10-20-2100')
  })

  it('sin fecha, devuelve el slug sin cambios', () => {
    expect(slugConFechaHora('show', null)).toBe('show')
  })

  it('dos funciones del mismo show dan slugs distintos; la misma función, dos veces, da el mismo slug', () => {
    const slug16 = slugConFechaHora('show', '2026-10-20T16:00:00')
    const slug21 = slugConFechaHora('show', '2026-10-20T21:00:00')
    expect(slug16).not.toBe(slug21)
    expect(slugConFechaHora('show', '2026-10-20T21:00:00')).toBe(slug21)
  })
})
