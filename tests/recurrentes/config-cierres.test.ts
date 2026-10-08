import { describe, expect, it } from 'vitest'
import { MUSEOS, PENAS } from '@/lib/recurrentes/config'

// QPS-067: cierres cargados el 2026-10-07. Los museos tienen cierre el mismo día
// que abren; las peñas siguen sin cierre hasta que Mauro lo confirme.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

describe('cierres de los recurrentes', () => {
  it('los 6 museos tienen cierre válido, posterior a la apertura y del mismo día', () => {
    expect(MUSEOS).toHaveLength(6)
    for (const m of MUSEOS) {
      expect(m.cierre, m.titulo).toMatch(HHMM)
      expect(m.cierre! > m.hora, `${m.titulo}: ${m.hora} → ${m.cierre}`).toBe(true)
    }
  })

  it('las peñas todavía no tienen cierre (sin confirmar)', () => {
    for (const p of PENAS) expect(p.cierre, p.titulo).toBeUndefined()
  })
})
