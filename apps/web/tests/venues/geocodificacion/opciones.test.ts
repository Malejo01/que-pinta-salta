import { describe, expect, it } from 'vitest'
import { leerOpciones } from '@/lib/venues/geocodificacion/opciones'

describe('leerOpciones: valores por defecto', () => {
  it('sin ninguna bandera', () => {
    expect(leerOpciones([])).toEqual({
      apply: false,
      limite: 200,
      rehacerNominatim: false,
      sinCache: false,
      salida: undefined,
      cache: undefined,
    })
  })
})

describe('leerOpciones: banderas booleanas', () => {
  it('--apply', () => {
    expect(leerOpciones(['--apply']).apply).toBe(true)
  })

  it('--rehacer-nominatim', () => {
    expect(leerOpciones(['--rehacer-nominatim']).rehacerNominatim).toBe(true)
  })

  it('--sin-cache', () => {
    expect(leerOpciones(['--sin-cache']).sinCache).toBe(true)
  })

  it('las tres juntas, en cualquier orden', () => {
    const opciones = leerOpciones(['--sin-cache', '--apply', '--rehacer-nominatim'])
    expect(opciones.apply).toBe(true)
    expect(opciones.rehacerNominatim).toBe(true)
    expect(opciones.sinCache).toBe(true)
  })

  it('una bandera booleana con "=valor" es un error', () => {
    expect(() => leerOpciones(['--apply=si'])).toThrow()
  })
})

describe('leerOpciones: --limite', () => {
  it('--limite <n> (separado)', () => {
    expect(leerOpciones(['--limite', '20']).limite).toBe(20)
  })

  it('--limite=<n> (con igual)', () => {
    expect(leerOpciones(['--limite=20']).limite).toBe(20)
  })

  it('--limite abc: error', () => {
    expect(() => leerOpciones(['--limite', 'abc'])).toThrow()
  })

  it('--limite 0: error', () => {
    expect(() => leerOpciones(['--limite', '0'])).toThrow()
  })

  it('--limite -5: error', () => {
    expect(() => leerOpciones(['--limite', '-5'])).toThrow()
  })

  it('--limite 3.5 (no entero): error', () => {
    expect(() => leerOpciones(['--limite', '3.5'])).toThrow()
  })

  it('--limite sin valor (es el último argumento): error', () => {
    expect(() => leerOpciones(['--limite'])).toThrow()
  })

  it('--limite seguido de otra bandera (sin valor propio): error', () => {
    expect(() => leerOpciones(['--limite', '--apply'])).toThrow()
  })
})

describe('leerOpciones: --salida y --cache', () => {
  it('--salida <carpeta> (separado)', () => {
    expect(leerOpciones(['--salida', 'ops/otra']).salida).toBe('ops/otra')
  })

  it('--salida=<carpeta> (con igual)', () => {
    expect(leerOpciones(['--salida=ops/otra']).salida).toBe('ops/otra')
  })

  it('--cache <archivo> (separado)', () => {
    expect(leerOpciones(['--cache', 'ops/mi-cache.json']).cache).toBe('ops/mi-cache.json')
  })

  it('--cache=<archivo> (con igual)', () => {
    expect(leerOpciones(['--cache=ops/mi-cache.json']).cache).toBe('ops/mi-cache.json')
  })

  it('--salida sin valor: error', () => {
    expect(() => leerOpciones(['--salida'])).toThrow()
  })

  it('--cache sin valor: error', () => {
    expect(() => leerOpciones(['--cache'])).toThrow()
  })
})

describe('leerOpciones: todas las banderas juntas', () => {
  it('apply + rehacer-nominatim + sin-cache + limite + salida + cache', () => {
    const opciones = leerOpciones([
      '--apply',
      '--rehacer-nominatim',
      '--sin-cache',
      '--limite=5',
      '--salida=ops/x',
      '--cache=ops/y.json',
    ])
    expect(opciones).toEqual({
      apply: true,
      rehacerNominatim: true,
      sinCache: true,
      limite: 5,
      salida: 'ops/x',
      cache: 'ops/y.json',
    })
  })
})

describe('leerOpciones: bandera desconocida', () => {
  it('--aply (typo de --apply): error que nombra las banderas válidas', () => {
    expect(() => leerOpciones(['--aply'])).toThrowError(
      /--apply.*--rehacer-nominatim.*--sin-cache.*--limite.*--salida.*--cache/,
    )
  })

  it('una bandera que no existe en absoluto: error', () => {
    expect(() => leerOpciones(['--no-existe'])).toThrow()
  })

  it('un argumento que no empieza con "--": error', () => {
    expect(() => leerOpciones(['algo-suelto'])).toThrow()
  })

  it('--aply nunca cae en modo apply silenciosamente (no suma a los valores por defecto)', () => {
    // Si leerOpciones tratara --aply como ignorable en vez de tirar, esta
    // corrida seguiría en modo consulta (apply: false) sin que quien la usó
    // se enterara de que la bandera que escribió no existe. Por eso tiene
    // que tirar, no devolver valores por defecto silenciosamente.
    expect(() => leerOpciones(['--aply'])).toThrow()
  })
})
