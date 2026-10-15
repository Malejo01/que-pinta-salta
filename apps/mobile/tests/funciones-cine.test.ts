// 28-q, punto 11 (F3, 28-g): `funcionesPorCine` y `urlCompraCineSegura`
// (lib/datos/cines.ts) son puras. `showings` viene de una columna jsonb (sin
// esquema en la base), así que `funcionesPorCine` tiene que aguantar
// cualquier forma rara sin tirar. `urlCompraCineSegura` ya la ejerce
// `tests/aperturas-url.test.ts` por el lado del detector estático de
// `Linking.openURL`; esto prueba la función en sí misma, con los casos que
// pidió la tarea (quedaron pendientes en la pasada anterior porque la
// función no existía todavía).
import { describe, expect, it, vi } from 'vitest'

// `lib/datos/cines.ts` importa `{ supabase }` de `@/lib/supabase`, que a su
// vez importa `react-native` (AppState) y el polyfill de URL: nada de eso
// corre en Vitest (entorno node). `funcionesPorCine` y `urlCompraCineSegura`
// no tocan `supabase` en absoluto, así que alcanza con mockearlo para poder
// cargar el módulo (mismo mock que usa tests/datos-cines.test.ts).
vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { funcionesPorCine, urlCompraCineSegura, type FuncionesDeCine } from '../lib/datos/cines'

describe('funcionesPorCine', () => {
  it('ordena los cines por nombre', () => {
    const showings = {
      cine_z: { name: 'Zeta', booking_url: null, formats: [{ type: '2D', times: ['20:00'] }] },
      cine_a: { name: 'Alfa', booking_url: null, formats: [{ type: '2D', times: ['18:00'] }] },
    }
    const resultado = funcionesPorCine(showings as never)
    expect(resultado.map((c) => c.cine)).toEqual(['Alfa', 'Zeta'])
  })

  it('ordena los horarios de cada formato', () => {
    const showings = {
      cine_a: { name: 'Cine A', booking_url: null, formats: [{ type: '2D', times: ['21:00', '16:00', '18:30'] }] },
    }
    const resultado = funcionesPorCine(showings as never)
    expect(resultado[0].formatos[0].horarios).toEqual(['16:00', '18:30', '21:00'])
  })

  it('un formato sin horarios (times vacío) queda afuera, pero el cine sigue si le queda otro formato', () => {
    const showings = {
      cine_a: {
        name: 'Cine A',
        booking_url: null,
        formats: [
          { type: '2D', times: [] },
          { type: '3D', times: ['20:00'] },
        ],
      },
    }
    const resultado = funcionesPorCine(showings as never)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].formatos).toEqual([{ tipo: '3D', horarios: ['20:00'] }])
  })

  it('un cine sin ningún formato con horarios queda afuera por completo', () => {
    const showings = {
      cine_a: { name: 'Cine A', booking_url: null, formats: [{ type: '2D', times: [] }] },
      cine_b: { name: 'Cine B', booking_url: 'https://cine-b.example.com', formats: [{ type: '2D', times: ['20:00'] }] },
    }
    const resultado = funcionesPorCine(showings as never)
    expect(resultado.map((c) => c.cine)).toEqual(['Cine B'])
  })

  it('conserva el booking_url del cine, y null si no hay', () => {
    const showings = {
      cine_a: { name: 'Cine A', booking_url: 'https://cine-a.example.com/comprar', formats: [{ type: '2D', times: ['20:00'] }] },
      cine_b: { name: 'Cine B', booking_url: null, formats: [{ type: '2D', times: ['21:00'] }] },
    }
    const resultado = funcionesPorCine(showings as never)
    const porNombre = new Map(resultado.map((c) => [c.cine, c] as const))
    expect(porNombre.get('Cine A')?.urlCompra).toBe('https://cine-a.example.com/comprar')
    expect(porNombre.get('Cine B')?.urlCompra).toBeNull()
  })

  it('null o undefined: [], sin tirar', () => {
    expect(funcionesPorCine(null)).toEqual([])
    expect(funcionesPorCine(undefined)).toEqual([])
  })

  it('un objeto vacío: []', () => {
    expect(funcionesPorCine({} as never)).toEqual([])
  })

  it('una forma rara (no es un objeto): [], sin tirar', () => {
    expect(() => funcionesPorCine('no es un objeto' as never)).not.toThrow()
    expect(funcionesPorCine('no es un objeto' as never)).toEqual([])
    expect(funcionesPorCine(42 as never)).toEqual([])
  })

  it('un array en vez de un objeto de cines: [], sin tirar (Object.values de un array da sus elementos)', () => {
    expect(funcionesPorCine([1, 2, 3] as never)).toEqual([])
  })

  it('formats que no es un array, o un detalle de cine que no es un objeto: se descartan sin tirar', () => {
    const showings = {
      cine_a: { name: 'Cine A', formats: 'no es un array' },
      cine_b: null,
      cine_c: 'tampoco es un objeto',
      cine_d: { name: 'Cine D', booking_url: null, formats: [{ type: '2D', times: ['20:00'] }] },
    }
    expect(() => funcionesPorCine(showings as never)).not.toThrow()
    expect(funcionesPorCine(showings as never)).toEqual([{ cine: 'Cine D', urlCompra: null, formatos: [{ tipo: '2D', horarios: ['20:00'] }] }])
  })
})

describe('urlCompraCineSegura', () => {
  it('https: la devuelve igual', () => {
    const url = 'https://ticketera-de-prueba.example.com/comprar'
    expect(urlCompraCineSegura(url)).toBe(url)
  })

  it('http (sin "s"): null', () => {
    expect(urlCompraCineSegura('http://ticketera-de-prueba.example.com/comprar')).toBeNull()
  })

  it('javascript:: null', () => {
    expect(urlCompraCineSegura('javascript:alert(1)')).toBeNull()
  })

  it('una URL inválida: null, sin tirar', () => {
    expect(() => urlCompraCineSegura('no-es-una-url')).not.toThrow()
    expect(urlCompraCineSegura('no-es-una-url')).toBeNull()
  })

  it('vacío: null', () => {
    expect(urlCompraCineSegura('')).toBeNull()
  })

  it('null o undefined: null', () => {
    expect(urlCompraCineSegura(null)).toBeNull()
    expect(urlCompraCineSegura(undefined)).toBeNull()
  })

  it('un esquema distinto disfrazado (data:) también da null', () => {
    expect(urlCompraCineSegura('data:text/html,<script>alert(1)</script>')).toBeNull()
  })
})

// Sanity: el tipo exportado FuncionesDeCine tiene la forma esperada (no es
// un test de verdad, solo asegura que el import de tipos sigue compilando).
const _sanity: FuncionesDeCine = { cine: 'x', urlCompra: null, formatos: [] }
void _sanity
