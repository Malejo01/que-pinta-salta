// R43, 43-a: `esErrorDeRed` (lib/red.ts). Los objetos de error de PostgREST
// están copiados de la forma real de postgrest-js 2.106 (leída en
// `node_modules/@supabase/postgrest-js/dist/index.mjs`, ver el plan de la
// ronda): `{ data, error: { message, details, hint, code }, status,
// statusText }`. Sin red ni base: todo son fixtures inventados.
import { describe, expect, it } from 'vitest'
import { esErrorDeRed } from '../lib/red'

/** Una respuesta de postgrest-js, con la forma real (campos que no usa `esErrorDeRed` incluidos, a propósito). */
function respuestaPostgrest(opts: { status: number; code: string; message?: string; hint?: string }) {
  return {
    data: null,
    error: {
      message: opts.message ?? 'algo falló',
      details: null,
      hint: opts.hint ?? '',
      code: opts.code,
    },
    status: opts.status,
    statusText: '',
  }
}

describe('esErrorDeRed: true (sin conexión)', () => {
  it('fetch rechazado (modo avión/DNS): status 0, code vacío', () => {
    const respuesta = respuestaPostgrest({
      status: 0,
      code: '',
      message: 'TypeError: Network request failed',
    })
    expect(esErrorDeRed(respuesta)).toBe(true)
  })

  it('timeout de fetchConTimeout (AbortError): status 0, code vacío, hint del abort', () => {
    const respuesta = respuestaPostgrest({
      status: 0,
      code: '',
      hint: 'Request was aborted (timeout or manual cancellation)',
    })
    expect(esErrorDeRed(respuesta)).toBe(true)
  })

  it('una excepción TypeError con "Network request failed" (no una respuesta de postgrest)', () => {
    expect(esErrorDeRed(new TypeError('Network request failed'))).toBe(true)
  })

  it('TypeError con mayúsculas distintas (la función no distingue mayúsculas/minúsculas)', () => {
    expect(esErrorDeRed(new TypeError('NETWORK REQUEST FAILED'))).toBe(true)
  })

  it('una excepción con name AbortError', () => {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    expect(esErrorDeRed(error)).toBe(true)
  })

  it('un objeto con name AbortError que no es instancia de Error', () => {
    expect(esErrorDeRed({ name: 'AbortError' })).toBe(true)
  })
})

describe('esErrorDeRed: false (no es sin conexión)', () => {
  it('respuesta HTTP 404 con error (status HTTP, no 0)', () => {
    const respuesta = respuestaPostgrest({ status: 404, code: '' })
    expect(esErrorDeRed(respuesta)).toBe(false)
  })

  it('respuesta HTTP 500 (propuesta sin confirmar: se trata como error de siempre, no como sin conexión)', () => {
    const respuesta = respuestaPostgrest({ status: 500, code: '' })
    expect(esErrorDeRed(respuesta)).toBe(false)
  })

  it('code de PostgREST no vacío (PGRST116), aunque el status sea HTTP', () => {
    const respuesta = respuestaPostgrest({ status: 406, code: 'PGRST116' })
    expect(esErrorDeRed(respuesta)).toBe(false)
  })

  it('code de PostgREST no vacío (42501, permisos)', () => {
    const respuesta = respuestaPostgrest({ status: 403, code: '42501' })
    expect(esErrorDeRed(respuesta)).toBe(false)
  })

  it('code de PostgREST no vacío (PGRST205), incluso con status 0: el code manda', () => {
    const respuesta = respuestaPostgrest({ status: 0, code: 'PGRST205' })
    expect(esErrorDeRed(respuesta)).toBe(false)
  })

  it('una respuesta sin error (Promise.resolve({ data: [], error: null }), como en lib/favoritos.ts, sin status)', () => {
    expect(esErrorDeRed({ data: [], error: null })).toBe(false)
  })

  it('null', () => {
    expect(esErrorDeRed(null)).toBe(false)
  })

  it('undefined', () => {
    expect(esErrorDeRed(undefined)).toBe(false)
  })

  it('un string', () => {
    expect(esErrorDeRed('TypeError: Network request failed')).toBe(false)
  })

  it('un número', () => {
    expect(esErrorDeRed(0)).toBe(false)
  })

  it('un objeto vacío', () => {
    expect(esErrorDeRed({})).toBe(false)
  })

  it('un TypeError de otro motivo (no de red)', () => {
    expect(esErrorDeRed(new TypeError('Cannot read properties of undefined'))).toBe(false)
  })
})
