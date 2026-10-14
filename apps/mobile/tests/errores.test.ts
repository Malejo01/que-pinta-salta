// Ronda 27, tarea 27-c, punto 2: `clasificarErrorTabla` (lib/errores.ts,
// QPS-131), la generalización de `clasificarErrorAsistencia` (26-c). Es pura
// (sin red, sin Supabase): se prueba directo, sin dobles.
//
// El caso que más importa: `42501` (permiso denegado por RLS) NO puede dar
// "no-disponible" — eso haría que un usuario sin permiso viera "esto todavía
// no existe" en vez de un error real, y ese caso quedó fijado desde la R26
// (ver tests/asistencia.test.ts). Este archivo lo vuelve a fijar contra el
// módulo genérico directamente.
import { describe, expect, it } from 'vitest'
import { clasificarErrorTabla } from '../lib/errores'

describe('clasificarErrorTabla: "no-disponible" (la tabla o vista no existe todavía)', () => {
  it('PGRST205 ("Could not find the table"): no-disponible', () => {
    expect(
      clasificarErrorTabla({ code: 'PGRST205', message: 'Could not find the table "public.notification_preferences"' })
    ).toBe('no-disponible')
  })

  it('42P01 ("relation ... does not exist"): no-disponible', () => {
    expect(clasificarErrorTabla({ code: '42P01', message: 'relation "user_radar_settings" does not exist' })).toBe(
      'no-disponible'
    )
  })

  it.each(['PGRST200', 'PGRST201', 'PGRST202', 'PGRST299'])(
    '%s con "schema cache" en el mensaje: no-disponible',
    (code) => {
      expect(clasificarErrorTabla({ code, message: 'Could not find a relation in the schema cache' })).toBe(
        'no-disponible'
      )
    }
  )

  it('la búsqueda de "schema cache" en el mensaje no distingue mayúsculas', () => {
    expect(clasificarErrorTabla({ code: 'PGRST204', message: 'Not found in the Schema Cache' })).toBe('no-disponible')
  })
})

describe('clasificarErrorTabla: "error" (todo lo demás)', () => {
  it('42501 (permission denied): error, NUNCA no-disponible — este caso quedó fijado desde la R26', () => {
    expect(clasificarErrorTabla({ code: '42501', message: 'permission denied for table notification_preferences' })).toBe(
      'error'
    )
  })

  it('PGRST2xx SIN "schema cache" en el mensaje: error', () => {
    expect(clasificarErrorTabla({ code: 'PGRST204', message: 'Column "radar_channel" not found' })).toBe('error')
  })

  it('PGRST3xx (fuera del rango PGRST2xx): error, aunque el mensaje diga "schema cache"', () => {
    expect(clasificarErrorTabla({ code: 'PGRST301', message: 'JWT expired, in the schema cache' })).toBe('error')
  })

  it('PGRST20 (le falta un dígito, la regex está anclada): error', () => {
    expect(clasificarErrorTabla({ code: 'PGRST20', message: 'algo en la schema cache' })).toBe('error')
  })

  it('pgrst205 en minúscula (sensible a mayúsculas): error', () => {
    expect(clasificarErrorTabla({ code: 'pgrst205', message: 'Could not find the table' })).toBe('error')
  })

  it('error de red sin "code": error', () => {
    expect(clasificarErrorTabla({ message: 'network request failed' })).toBe('error')
    expect(clasificarErrorTabla(new Error('network request failed'))).toBe('error')
  })

  it('un código válido pero sin message (undefined): error, no explota', () => {
    expect(clasificarErrorTabla({ code: 'PGRST204' })).toBe('error')
  })
})

describe('clasificarErrorTabla: entradas mal formadas o potencialmente maliciosas (nunca explota)', () => {
  it('null, undefined, string y número: error', () => {
    expect(clasificarErrorTabla(null)).toBe('error')
    expect(clasificarErrorTabla(undefined)).toBe('error')
    expect(clasificarErrorTabla('algo salió mal')).toBe('error')
    expect(clasificarErrorTabla(42)).toBe('error')
  })

  it('arreglos y funciones: error', () => {
    expect(clasificarErrorTabla([])).toBe('error')
    expect(clasificarErrorTabla(() => {})).toBe('error')
  })

  it('"code" es un objeto en vez de un string (no es "PGRST205" aunque haga toString() a eso): error', () => {
    expect(clasificarErrorTabla({ code: { toString: () => 'PGRST205' }, message: 'schema cache' })).toBe('error')
  })

  it('"code" es un arreglo: error', () => {
    expect(clasificarErrorTabla({ code: ['PGRST205'], message: 'schema cache' })).toBe('error')
  })

  it('"message" es un objeto en vez de un string: no cuenta como "schema cache" aunque su toString() lo diga', () => {
    expect(
      clasificarErrorTabla({ code: 'PGRST204', message: { toString: () => 'schema cache' } })
    ).toBe('error')
  })

  it('objeto con prototipo nulo (Object.create(null)): error, no explota al leer .code/.message', () => {
    expect(clasificarErrorTabla(Object.create(null))).toBe('error')
  })

  it('"code" hereda de Object.prototype con un getter que tira: no explota (igual da error, no revienta el proceso)', () => {
    const malicioso = {}
    Object.defineProperty(malicioso, 'code', {
      get() {
        throw new Error('getter malicioso')
      },
    })
    expect(() => clasificarErrorTabla(malicioso)).toThrow()
    // No es "no-disponible" en ningún caso: si explota, explota, pero nunca
    // da un resultado silenciosamente incorrecto.
  })
})
