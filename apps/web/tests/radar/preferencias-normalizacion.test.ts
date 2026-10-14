/**
 * `radar/preferencias.ts` (R27, tarea 27-a): normalización de las
 * preferencias del Radar antes de guardarlas. Sin React, sin Supabase, sin
 * red. Fixtures inventadas.
 */
import { describe, expect, it } from 'vitest'
import {
  FRECUENCIAS_RADAR,
  normalizarPreferenciasRadar,
  type PreferenciasRadarEntrada,
} from '@qps/core/radar/preferencias'

function entrada(overrides: Partial<PreferenciasRadarEntrada> = {}): PreferenciasRadarEntrada {
  return {
    email_frequency: 'weekly',
    categoryIds: [],
    venueIds: [],
    instagramAccountIds: [],
    ...overrides,
  }
}

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'

describe('FRECUENCIAS_RADAR', () => {
  it('son exactamente estas 4, en este orden', () => {
    expect(FRECUENCIAS_RADAR).toEqual(['weekly', 'biweekly', 'monthly', 'disabled'])
  })
})

describe('normalizarPreferenciasRadar: frecuencia', () => {
  it.each(FRECUENCIAS_RADAR)('acepta la frecuencia válida "%s"', (frecuencia) => {
    const result = normalizarPreferenciasRadar(entrada({ email_frequency: frecuencia }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.datos.email_frequency).toBe(frecuencia)
  })

  it('rechaza una frecuencia inventada ("daily")', () => {
    const result = normalizarPreferenciasRadar(entrada({ email_frequency: 'daily' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/frecuencia/i)
  })

  it('rechaza una frecuencia vacía', () => {
    expect(normalizarPreferenciasRadar(entrada({ email_frequency: '' })).ok).toBe(false)
  })

  it('rechaza una frecuencia maliciosa (intento de inyección en el valor)', () => {
    expect(
      normalizarPreferenciasRadar(entrada({ email_frequency: "weekly'; drop table events; --" })).ok,
    ).toBe(false)
  })
})

describe('normalizarPreferenciasRadar: ids', () => {
  it('descarta ids que no son uuid (categoryIds, venueIds, instagramAccountIds)', () => {
    const result = normalizarPreferenciasRadar(
      entrada({
        categoryIds: [UUID_A, 'no-es-un-uuid', ''],
        venueIds: ['<script>alert(1)</script>', UUID_B],
        instagramAccountIds: ['123', UUID_A],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.datos.categoryIds).toEqual([UUID_A])
    expect(result.datos.venueIds).toEqual([UUID_B])
    expect(result.datos.instagramAccountIds).toEqual([UUID_A])
  })

  it('descarta ids repetidos, conservando el orden de la primera aparición', () => {
    const result = normalizarPreferenciasRadar(entrada({ categoryIds: [UUID_B, UUID_A, UUID_B, UUID_A] }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.datos.categoryIds).toEqual([UUID_B, UUID_A])
  })

  it('listas null/undefined no rompen: quedan vacías', () => {
    const result = normalizarPreferenciasRadar(
      entrada({
        categoryIds: null as unknown as string[],
        venueIds: undefined as unknown as string[],
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.datos.categoryIds).toEqual([])
      expect(result.datos.venueIds).toEqual([])
    }
  })

  it('un elemento que no es string (número, objeto) se descarta sin romper', () => {
    const result = normalizarPreferenciasRadar(
      entrada({ categoryIds: [123 as unknown as string, { id: UUID_A } as unknown as string, UUID_A] }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.datos.categoryIds).toEqual([UUID_A])
  })

  it('un uuid en mayúsculas también es válido (insensible a mayúsculas)', () => {
    const result = normalizarPreferenciasRadar(entrada({ categoryIds: [UUID_A.toUpperCase()] }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.datos.categoryIds).toEqual([UUID_A.toUpperCase()])
  })
})

describe('normalizarPreferenciasRadar: nunca email_target', () => {
  it('ni siquiera si el llamador lo manda (as any), no aparece en el resultado', () => {
    const conEmailAjeno = {
      ...entrada(),
      email_target: 'ajeno@otra-casilla.test',
    } as unknown as PreferenciasRadarEntrada
    const result = normalizarPreferenciasRadar(conEmailAjeno)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect('email_target' in result.datos).toBe(false)
      expect(Object.keys(result.datos).sort()).toEqual(
        ['categoryIds', 'email_frequency', 'instagramAccountIds', 'venueIds'].sort(),
      )
    }
  })

  it('con frecuencia inválida tampoco hay datos (ok:false no tiene campo "datos")', () => {
    const result = normalizarPreferenciasRadar(entrada({ email_frequency: 'daily' }))
    expect(result.ok).toBe(false)
    expect('datos' in result).toBe(false)
  })
})
