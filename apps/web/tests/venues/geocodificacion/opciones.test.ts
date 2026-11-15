import { describe, expect, it } from 'vitest'
import { leerOpciones } from '@/lib/venues/geocodificacion/opciones'

describe('leerOpciones: valores por defecto', () => {
  it('sin ninguna bandera', () => {
    expect(leerOpciones([])).toEqual({
      apply: false,
      limite: 200,
      rehacerNominatim: false,
      sinCache: false,
      todos: false,
      salida: undefined,
      cache: undefined,
      programado: false,
      seco: false,
      prioridadEventos: false,
    })
  })
})

describe('leerOpciones: --programado (Q4-3)', () => {
  it('implica apply y --prioridad-eventos, sin --todos y como mucho 20 lugares (Q7-2)', () => {
    expect(leerOpciones(['--programado'])).toMatchObject({
      programado: true,
      apply: true,
      todos: false,
      rehacerNominatim: false,
      limite: 20,
      prioridadEventos: true,
      seco: false,
    })
    expect(leerOpciones(['--programado', '--limite', '50']).limite).toBe(20)
    expect(leerOpciones(['--programado', '--limite', '3']).limite).toBe(3)
  })

  it('Q7-2: el tope sale de GEOCODIFICACION_TOPE, sin pasar de 30', () => {
    expect(leerOpciones(['--programado'], { GEOCODIFICACION_TOPE: '12' }).limite).toBe(12)
    expect(leerOpciones(['--programado'], { GEOCODIFICACION_TOPE: '500' }).limite).toBe(30)
    expect(leerOpciones(['--programado'], { GEOCODIFICACION_TOPE: '' }).limite).toBe(20)
    expect(leerOpciones(['--programado'], { GEOCODIFICACION_TOPE: 'mucho' }).limite).toBe(20)
    expect(leerOpciones(['--programado'], { GEOCODIFICACION_TOPE: '0' }).limite).toBe(20)
    // --limite solo puede bajarlo.
    expect(leerOpciones(['--programado', '--limite', '5'], { GEOCODIFICACION_TOPE: '25' }).limite).toBe(5)
    expect(leerOpciones(['--programado', '--limite', '28'], { GEOCODIFICACION_TOPE: '25' }).limite).toBe(25)
  })

  it('Q7-2: con --seco no escribe (apply false), para ver la corrida de mañana', () => {
    expect(leerOpciones(['--programado', '--seco'])).toMatchObject({ programado: true, seco: true, apply: false, limite: 20 })
  })

  it('no se combina con lo que afloja sus reglas', () => {
    expect(() => leerOpciones(['--programado', '--todos'])).toThrow(/--programado/)
    expect(() => leerOpciones(['--programado', '--rehacer-nominatim'])).toThrow(/--programado/)
  })
})

describe('leerOpciones: --seco y --prioridad-eventos (Q7-2)', () => {
  it('--seco --prioridad-eventos: no escribe y mira todos, primero los con eventos', () => {
    expect(leerOpciones(['--seco', '--prioridad-eventos'])).toMatchObject({ seco: true, prioridadEventos: true, apply: false, todos: false })
  })

  it('--seco no se combina con --apply ni --aplicar', () => {
    expect(() => leerOpciones(['--seco', '--apply'])).toThrow(/--seco/)
    expect(() => leerOpciones(['--aplicar', '--seco'])).toThrow(/--seco/)
  })

  it('no llevan valor', () => {
    expect(() => leerOpciones(['--seco=si'])).toThrow()
    expect(() => leerOpciones(['--prioridad-eventos=1'])).toThrow()
  })
})

describe('leerOpciones: banderas booleanas', () => {
  it('--apply', () => {
    expect(leerOpciones(['--apply']).apply).toBe(true)
  })

  it('--aplicar es un alias de --apply', () => {
    expect(leerOpciones(['--aplicar']).apply).toBe(true)
    expect(() => leerOpciones(['--aplicar=si'])).toThrow()
  })

  it('--todos (por defecto es false)', () => {
    expect(leerOpciones([]).todos).toBe(false)
    expect(leerOpciones(['--todos']).todos).toBe(true)
    expect(() => leerOpciones(['--todos=si'])).toThrow()
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
      todos: false,
      limite: 5,
      salida: 'ops/x',
      cache: 'ops/y.json',
      programado: false,
      seco: false,
      prioridadEventos: false,
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
