// 46-e: `scripts/pesos/analizar.ts` es pura (sin red, sin leer `dist` ni
// `dist-analisis`). Los source maps de estos tests son inventados a mano,
// chicos, para poder calcular el resultado esperado dígito a dígito.
import { describe, expect, it } from 'vitest'
import {
  bytesPorFuente,
  decodificarVLQ,
  paqueteDe,
  quienMenciona,
  resumen,
  type MapaFuente,
} from '../scripts/pesos/analizar'

describe('decodificarVLQ', () => {
  it("'A' es 0", () => {
    expect(decodificarVLQ('A')).toBe(0)
  })

  it("'C' es 1", () => {
    expect(decodificarVLQ('C')).toBe(1)
  })

  it("'D' es -1", () => {
    expect(decodificarVLQ('D')).toBe(-1)
  })

  it("'gB' es 16 (dos dígitos, con bit de continuación)", () => {
    expect(decodificarVLQ('gB')).toBe(16)
  })
})

describe('bytesPorFuente', () => {
  // Línea 0: dos fuentes. El primer segmento ("AAAA") apunta a sources[0]
  // en la columna 0; el segundo ("KCAA") suma +5 de columna y +1 de índice
  // de fuente (-> sources[1]), en la columna 5. Línea de 30 caracteres:
  // a.js se queda con [0,5) = 5 bytes, b.js con [5,30) = 25 bytes. b.js es
  // el ÚLTIMO segmento de la línea y el más pesado (el caso que pide la
  // tarea para no olvidarse del final de línea).
  // Línea 1: un solo segmento ("ADAA"), que resta 1 al índice de fuente
  // acumulado (vuelve a sources[0] = a.js) y ocupa toda la línea (15
  // caracteres): prueba que el índice de fuente se arrastra ENTRE líneas y
  // que una misma fuente se puede repartir en más de una línea.
  const mapa: MapaFuente = {
    version: 3,
    sources: ['a.js', 'b.js'],
    names: [],
    mappings: 'AAAA,KCAA;ADAA',
  }
  const largoDeCadaLinea = [30, 15]

  it('reparte dos fuentes en una misma línea (la última, hasta el final de línea, es la más pesada)', () => {
    const resultado = bytesPorFuente(mapa, largoDeCadaLinea)
    expect(resultado['b.js']).toBe(25)
  })

  it('una misma fuente se acumula en dos líneas distintas', () => {
    const resultado = bytesPorFuente(mapa, largoDeCadaLinea)
    // 5 (parte de la línea 0) + 15 (toda la línea 1) = 20.
    expect(resultado['a.js']).toBe(20)
  })

  it('un segmento de un solo campo no se atribuye a nadie', () => {
    // "A": solo columna (sin fuente). "KAAA": columna 5, fuente sources[0].
    const mapaConUnoSinFuente: MapaFuente = {
      version: 3,
      sources: ['x.js'],
      names: [],
      mappings: 'A,KAAA',
    }
    const resultado = bytesPorFuente(mapaConUnoSinFuente, [10])
    expect(resultado).toEqual({ 'x.js': 5 })
  })
})

describe('paqueteDe', () => {
  it('node_modules/@scope/x/a.js -> @scope/x (un scope cuenta dos segmentos)', () => {
    expect(paqueteDe('node_modules/@scope/x/a.js')).toBe('@scope/x')
  })

  it('node_modules anidado -> el ÚLTIMO node_modules de la ruta', () => {
    expect(paqueteDe('node_modules/foo/node_modules/bar/index.js')).toBe('bar')
  })

  it('apps/mobile/lib/a.ts -> app', () => {
    expect(paqueteDe('apps/mobile/lib/a.ts')).toBe('app')
  })

  it('packages/core/src/b.ts -> @qps/core', () => {
    expect(paqueteDe('packages/core/src/b.ts')).toBe('@qps/core')
  })

  it('normaliza rutas con \\ (Windows) y prefijos ../../', () => {
    expect(paqueteDe('..\\..\\node_modules\\lucide-react-native\\a.js')).toBe('lucide-react-native')
  })

  it('lo que no matchea ninguna regla es (otro)', () => {
    expect(paqueteDe('alguna/otra/cosa.ts')).toBe('(otro)')
  })
})

describe('resumen', () => {
  const bytesPorNombre: Record<string, number> = {
    'node_modules/react-native/index.js': 500,
    'node_modules/lucide-react-native/a.js': 300,
    'node_modules/lucide-react-native/b.js': 150,
    'apps/mobile/lib/a.ts': 40,
    'packages/core/src/b.ts': 10,
  }

  it('ordena los paquetes de mayor a menor', () => {
    const { paquetes } = resumen(bytesPorNombre, 10)
    expect(paquetes.map((p) => p.nombre)).toEqual(['react-native', 'lucide-react-native', 'app', '@qps/core'])
    expect(paquetes[0].bytes).toBe(500)
    expect(paquetes[1].bytes).toBe(450) // lucide-react-native: 300 + 150, de dos módulos
  })

  it('ordena los módulos de mayor a menor', () => {
    const { modulos } = resumen(bytesPorNombre, 10)
    expect(modulos.map((m) => m.bytes)).toEqual([500, 300, 150, 40, 10])
  })

  it('el total es la suma de todos los módulos', () => {
    const { total } = resumen(bytesPorNombre, 10)
    expect(total).toBe(1000)
  })

  it('los porcentajes de paquetes suman 100 ± 0,1 (cubriendo todas las entradas con n grande)', () => {
    const { paquetes } = resumen(bytesPorNombre, 10)
    const suma = paquetes.reduce((acumulado, p) => acumulado + p.porcentaje, 0)
    expect(suma).toBeGreaterThan(99.9)
    expect(suma).toBeLessThan(100.1)
  })

  it('los porcentajes de módulos suman 100 ± 0,1', () => {
    const { modulos } = resumen(bytesPorNombre, 10)
    const suma = modulos.reduce((acumulado, m) => acumulado + m.porcentaje, 0)
    expect(suma).toBeGreaterThan(99.9)
    expect(suma).toBeLessThan(100.1)
  })

  it('recorta a los primeros n', () => {
    const { paquetes, modulos } = resumen(bytesPorNombre, 2)
    expect(paquetes).toHaveLength(2)
    expect(modulos).toHaveLength(2)
  })
})

describe('quienMenciona', () => {
  const mapa: MapaFuente = {
    version: 3,
    sources: ['node_modules/expo-symbols/index.js', 'otro.js'],
    names: [],
    mappings: '',
    sourcesContent: [
      // El NOMBRE de esta fuente sí trae "expo-symbols", pero su contenido no.
      'contenido sin esa palabra',
      // El nombre de esta otra fuente no trae "MaterialSymbols", pero su contenido sí.
      'código que adentro usa MaterialSymbols en algún require',
    ],
  }

  it('busca en sourcesContent, no en el nombre de la fuente', () => {
    expect(quienMenciona(mapa, 'expo-symbols')).toEqual([])
  })

  it('encuentra una fuente cuyo contenido menciona el texto, aunque su nombre no lo tenga', () => {
    expect(quienMenciona(mapa, 'MaterialSymbols')).toEqual(['otro.js'])
  })

  it('sin sourcesContent, no encuentra nada (no explota)', () => {
    const sinContenido: MapaFuente = { version: 3, sources: ['a.js'], names: [], mappings: '' }
    expect(quienMenciona(sinContenido, 'lo que sea')).toEqual([])
  })
})
