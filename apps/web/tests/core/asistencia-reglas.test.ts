/**
 * `packages/core/src/asistencia/index.ts` (R47, tarea 47-a, QPS-197): el
 * tipo único "voy", `textoBotonVoy`, `ORDEN_FILA_ACCIONES` y la regla
 * Guardar/Voy (`pasosDeTocar` / `estadoTrasPasos` / `avisoAlQuitarGuardado`).
 * Sin React, sin Supabase, sin red.
 */
import { describe, expect, it } from 'vitest'
import {
  ORDEN_FILA_ACCIONES,
  TEXTO_SACASTE_GUARDADO_CON_VOY,
  avisoAlQuitarGuardado,
  esTipoAsistencia,
  estadoTrasPasos,
  pasosDeTocar,
  textoBotonVoy,
  type EstadoGuardarVoy,
} from '@qps/core/asistencia'

describe('esTipoAsistencia', () => {
  it.each([
    ['me_interesa', false],
    ['', false],
    [null, false],
    [undefined, false],
    ['VOY', false],
    [0, false],
    [{ tipo: 'voy' }, false],
    ['voy', true],
  ] as const)('%j -> %j', (valor, esperado) => {
    expect(esTipoAsistencia(valor)).toBe(esperado)
  })
})

describe('textoBotonVoy', () => {
  it('0 (debajo del umbral): "Voy"', () => {
    expect(textoBotonVoy(0)).toBe('Voy')
  })

  it('2 (justo debajo del umbral): "Voy"', () => {
    expect(textoBotonVoy(2)).toBe('Voy')
  })

  it('3 (en el umbral): "Voy · 3 van"', () => {
    expect(textoBotonVoy(3)).toBe('Voy · 3 van')
  })

  it('12 (por arriba del umbral): "Voy · 12 van"', () => {
    expect(textoBotonVoy(12)).toBe('Voy · 12 van')
  })

  it('NaN: cantidadVisible da null, así que "Voy"', () => {
    expect(textoBotonVoy(NaN)).toBe('Voy')
  })

  it('-1: "Voy"', () => {
    expect(textoBotonVoy(-1)).toBe('Voy')
  })

  it('2.5 (decimal): "Voy"', () => {
    expect(textoBotonVoy(2.5)).toBe('Voy')
  })
})

describe('ORDEN_FILA_ACCIONES', () => {
  it('es exactamente ["guardar", "voy", "compartir"]', () => {
    expect(ORDEN_FILA_ACCIONES).toEqual(['guardar', 'voy', 'compartir'])
  })
})

describe('pasosDeTocar', () => {
  it('tocar "voy" sin Voy previo, sin guardar: ["guardar", "marcar-voy"]', () => {
    expect(pasosDeTocar('voy', { guardado: false, voy: false })).toEqual(['guardar', 'marcar-voy'])
  })

  it('tocar "voy" sin Voy previo, ya guardado: también ["guardar", "marcar-voy"] (guardar es idempotente)', () => {
    expect(pasosDeTocar('voy', { guardado: true, voy: false })).toEqual(['guardar', 'marcar-voy'])
  })

  it('tocar "voy" con Voy previo: ["quitar-voy"]', () => {
    expect(pasosDeTocar('voy', { guardado: true, voy: true })).toEqual(['quitar-voy'])
  })

  it('tocar "guardar" guardado y con voy: ["quitar-voy", "quitar-guardado"], en ese orden', () => {
    expect(pasosDeTocar('guardar', { guardado: true, voy: true })).toEqual([
      'quitar-voy',
      'quitar-guardado',
    ])
  })

  it('tocar "guardar" guardado y sin voy: ["quitar-guardado"]', () => {
    expect(pasosDeTocar('guardar', { guardado: true, voy: false })).toEqual(['quitar-guardado'])
  })

  it('tocar "guardar" sin guardar: ["guardar"]', () => {
    expect(pasosDeTocar('guardar', { guardado: false, voy: false })).toEqual(['guardar'])
  })
})

describe('estadoTrasPasos: el orden exacto de los pasos', () => {
  it('en pasosDeTocar("voy", sin voy): "guardar" va antes que "marcar-voy"', () => {
    const pasos = pasosDeTocar('voy', { guardado: false, voy: false })
    expect(pasos).toEqual(['guardar', 'marcar-voy'])
    // el prefijo de un solo paso ("guardar") ya deja guardado=true, voy=false
    expect(estadoTrasPasos({ guardado: false, voy: false }, pasos.slice(0, 1))).toEqual({
      guardado: true,
      voy: false,
    })
  })

  it('en pasosDeTocar("guardar", guardado y con voy): "quitar-voy" va antes que "quitar-guardado"', () => {
    const pasos = pasosDeTocar('guardar', { guardado: true, voy: true })
    expect(pasos).toEqual(['quitar-voy', 'quitar-guardado'])
    // el prefijo de un solo paso ("quitar-voy") deja guardado=true, voy=false:
    // todavía respeta el invariante.
    expect(estadoTrasPasos({ guardado: true, voy: true }, pasos.slice(0, 1))).toEqual({
      guardado: true,
      voy: false,
    })
  })

  it('un arreglo vacío devuelve el estado tal cual', () => {
    const estado: EstadoGuardarVoy = { guardado: true, voy: true }
    expect(estadoTrasPasos(estado, [])).toEqual(estado)
  })

  it('si alguien invirtiera el orden (quitar-guardado antes que quitar-voy), el prefijo de un paso rompe el invariante: esta función NO lo tapa', () => {
    const ordenInvertido = ['quitar-guardado', 'quitar-voy'] as const
    const resultado = estadoTrasPasos({ guardado: true, voy: true }, ordenInvertido.slice(0, 1))
    // guardado=false, voy=true: viola voy ⇒ guardado. Es deliberado: avisa
    // del error en quien arma los pasos, no en estadoTrasPasos.
    expect(resultado).toEqual({ guardado: false, voy: true })
  })
})

/** Los tres estados de partida válidos (los que cumplen voy ⇒ guardado). */
const ESTADOS_VALIDOS: EstadoGuardarVoy[] = [
  { guardado: false, voy: false },
  { guardado: true, voy: false },
  { guardado: true, voy: true },
]

function prefijos<T>(arreglo: readonly T[]): T[][] {
  const resultado: T[][] = []
  for (let i = 0; i <= arreglo.length; i++) {
    resultado.push(arreglo.slice(0, i))
  }
  return resultado
}

function cumpleInvariante(estado: EstadoGuardarVoy): boolean {
  return !estado.voy || estado.guardado
}

describe('invariante voy ⇒ guardado: exhaustivo sobre todo prefijo de pasosDeTocar', () => {
  for (const estadoInicial of ESTADOS_VALIDOS) {
    for (const accion of ['guardar', 'voy'] as const) {
      const pasos = pasosDeTocar(accion, estadoInicial)
      for (const prefijo of prefijos(pasos)) {
        it(`estado=${JSON.stringify(estadoInicial)}, accion="${accion}", prefijo=${JSON.stringify(prefijo)}`, () => {
          const resultado = estadoTrasPasos(estadoInicial, prefijo)
          expect(cumpleInvariante(resultado)).toBe(true)
        })
      }
    }
  }
})

describe('avisoAlQuitarGuardado', () => {
  it('estabaAntes con voy=true: el aviso de que también se saca el Voy', () => {
    expect(avisoAlQuitarGuardado({ guardado: true, voy: true })).toBe(TEXTO_SACASTE_GUARDADO_CON_VOY)
  })

  it('estabaAntes con voy=false: null, no hace falta avisar nada', () => {
    expect(avisoAlQuitarGuardado({ guardado: true, voy: false })).toBeNull()
  })
})
