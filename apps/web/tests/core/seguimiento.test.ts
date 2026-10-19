/**
 * `packages/core/src/radar/seguimiento.ts` (R47, tarea 47-a, QPS-197): "+
 * Seguir" un lugar, una cuenta de Instagram o una categoría. Sin React, sin
 * Supabase, sin red. Fixtures inventadas.
 */
import { describe, expect, it } from 'vitest'
import {
  TABLA_SEGUIMIENTO,
  cuentaParaSeguir,
  textoSeguir,
  textoSeguirCuenta,
  validarSeguimiento,
} from '@qps/core/radar/seguimiento'

const UUID_A = '11111111-1111-1111-1111-111111111111'

describe('TABLA_SEGUIMIENTO', () => {
  it('lugar -> user_followed_venues / venue_id', () => {
    expect(TABLA_SEGUIMIENTO.lugar).toEqual({ tabla: 'user_followed_venues', columna: 'venue_id' })
  })

  it('cuenta -> user_followed_instagram_accounts / instagram_account_id', () => {
    expect(TABLA_SEGUIMIENTO.cuenta).toEqual({
      tabla: 'user_followed_instagram_accounts',
      columna: 'instagram_account_id',
    })
  })

  it('categoria -> user_followed_categories / category_id', () => {
    expect(TABLA_SEGUIMIENTO.categoria).toEqual({
      tabla: 'user_followed_categories',
      columna: 'category_id',
    })
  })
})

describe('validarSeguimiento', () => {
  it('un uuid inválido: rechaza', () => {
    const resultado = validarSeguimiento({ tipo: 'lugar', id: 'no-es-un-uuid', seguir: true })
    expect(resultado.ok).toBe(false)
  })

  it('un tipo desconocido: rechaza', () => {
    const resultado = validarSeguimiento({ tipo: 'evento', id: UUID_A, seguir: true })
    expect(resultado.ok).toBe(false)
  })

  it('seguir como string "true": rechaza (no es booleano de verdad)', () => {
    const resultado = validarSeguimiento({ tipo: 'lugar', id: UUID_A, seguir: 'true' })
    expect(resultado.ok).toBe(false)
  })

  it('seguir como número 1: rechaza', () => {
    const resultado = validarSeguimiento({ tipo: 'lugar', id: UUID_A, seguir: 1 })
    expect(resultado.ok).toBe(false)
  })

  it('null: rechaza', () => {
    expect(validarSeguimiento(null).ok).toBe(false)
  })

  it('un arreglo: rechaza', () => {
    expect(validarSeguimiento([{ tipo: 'lugar', id: UUID_A, seguir: true }]).ok).toBe(false)
  })

  it('un caso válido: acepta', () => {
    const resultado = validarSeguimiento({ tipo: 'cuenta', id: UUID_A, seguir: false })
    expect(resultado).toEqual({ ok: true, tipo: 'cuenta', id: UUID_A, seguir: false })
  })

  it('los mensajes de error están en castellano, con voseo si corresponde', () => {
    const resultado = validarSeguimiento(null)
    if (!resultado.ok) expect(resultado.error.length).toBeGreaterThan(0)
  })
})

function filaFlyer(overrides: {
  published_at: string
  account: { id: string; username: string; is_active?: boolean } | null
}) {
  return {
    published_at: overrides.published_at,
    account: overrides.account ? { is_active: true, ...overrides.account } : null,
  }
}

describe('cuentaParaSeguir', () => {
  it('cero filas: null', () => {
    expect(cuentaParaSeguir([])).toBeNull()
  })

  it('una fila: esa cuenta', () => {
    const filas = [filaFlyer({ published_at: '2026-10-01T00:00:00Z', account: { id: 'c1', username: 'unalma' } })]
    expect(cuentaParaSeguir(filas)).toEqual({ id: 'c1', username: 'unalma' })
  })

  it('dos filas: gana la más reciente', () => {
    const filas = [
      filaFlyer({ published_at: '2026-10-01T00:00:00Z', account: { id: 'c1', username: 'vieja' } }),
      filaFlyer({ published_at: '2026-10-15T00:00:00Z', account: { id: 'c2', username: 'nueva' } }),
    ]
    expect(cuentaParaSeguir(filas)).toEqual({ id: 'c2', username: 'nueva' })
  })

  it('empate de published_at: desempata por account.id', () => {
    const filas = [
      filaFlyer({ published_at: '2026-10-15T00:00:00Z', account: { id: 'aaa', username: 'primera-por-id' } }),
      filaFlyer({ published_at: '2026-10-15T00:00:00Z', account: { id: 'bbb', username: 'segunda-por-id' } }),
    ]
    expect(cuentaParaSeguir(filas)?.username).toBe('segunda-por-id')
  })

  it('una fila inactiva sola: null', () => {
    const filas = [
      filaFlyer({ published_at: '2026-10-15T00:00:00Z', account: { id: 'c1', username: 'inactiva', is_active: false } }),
    ]
    expect(cuentaParaSeguir(filas)).toBeNull()
  })

  it('la más reciente inactiva, con una vieja activa: da la vieja', () => {
    const filas = [
      filaFlyer({ published_at: '2026-10-01T00:00:00Z', account: { id: 'c1', username: 'vieja-activa' } }),
      filaFlyer({ published_at: '2026-10-15T00:00:00Z', account: { id: 'c2', username: 'nueva-inactiva', is_active: false } }),
    ]
    expect(cuentaParaSeguir(filas)).toEqual({ id: 'c1', username: 'vieja-activa' })
  })

  it('filas sin account se descartan', () => {
    const filas = [
      filaFlyer({ published_at: '2026-10-15T00:00:00Z', account: null }),
      filaFlyer({ published_at: '2026-10-01T00:00:00Z', account: { id: 'c1', username: 'unica' } }),
    ]
    expect(cuentaParaSeguir(filas)).toEqual({ id: 'c1', username: 'unica' })
  })
})

describe('textoSeguir', () => {
  it('siguiendo: "✓ Siguiendo"', () => {
    expect(textoSeguir(true)).toBe('✓ Siguiendo')
  })

  it('no siguiendo: "+ Seguir"', () => {
    expect(textoSeguir(false)).toBe('+ Seguir')
  })
})

describe('textoSeguirCuenta', () => {
  it('siguiendo: "Siguiendo @usuario"', () => {
    expect(textoSeguirCuenta('unalma', true)).toBe('Siguiendo @unalma')
  })

  it('no siguiendo: "Seguir @usuario"', () => {
    expect(textoSeguirCuenta('unalma', false)).toBe('Seguir @unalma')
  })
})
