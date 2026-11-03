// Q5-11 · Idioma de la app: lógica pura (preferencia, idioma del
// dispositivo, fechas con Intl), diccionarios con las mismas claves, y el
// DETECTOR: en las pantallas migradas no queda texto visible fuera del
// diccionario (ni texto suelto entre etiquetas, ni etiquetas de
// accesibilidad, títulos o placeholders con un literal).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { describe, expect, it } from 'vitest'
import { en } from '../lib/i18n/diccionarios/en'
import { es } from '../lib/i18n/diccionarios/es'
import {
  CLAVE_IDIOMA,
  formatearDia,
  formatearFechaCorta,
  formatearHora,
  guardarPreferenciaIdioma,
  idiomaDeLocale,
  idiomaEfectivo,
  leerPreferenciaIdioma,
} from '../lib/i18n/idioma'
import type { Almacen } from '../lib/sin-conexion/almacen'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))

/**
 * Las pantallas y componentes ya migrados al diccionario. Q5-12 suma los que
 * faltan: un archivo nuevo en esta lista tiene que pasar el detector.
 */
export const PANTALLAS_MIGRADAS = [
  'app/lugares-chicos/index.tsx',
  'app/lugares-chicos/[id].tsx',
  'components/AccesoLugaresChicos.tsx',
  'components/SelectorIdioma.tsx',
]

/** Textos visibles con un literal: entre etiquetas, o en props que se leen o se ven. */
export function textosSueltos(codigo: string): string[] {
  const sin = quitarComentarios(codigo)
  const hallados: string[] = []
  // Texto entre etiquetas JSX: «>Hola<» (con al menos una letra).
  for (const m of sin.matchAll(/>\s*([^<>{}\n]*[A-Za-zÁÉÍÓÚáéíóúÑñ¿¡][^<>{}\n]*)\s*</g)) {
    const texto = m[1]!.trim()
    // Código entre dos etiquetas (`) : cond ? (`) no es texto visible.
    if (texto && !/^[=&|?:)\]]/.test(texto) && !/^\w+\s*=>/.test(texto)) hallados.push(texto)
  }
  // Props visibles o leídas por TalkBack con un string literal.
  for (const m of sin.matchAll(/\b(accessibilityLabel|accessibilityHint|placeholder|title|mensaje|textoAccion|texto|etiqueta)=["']([^"']+)["']/g)) {
    hallados.push(`${m[1]}="${m[2]}"`)
  }
  return hallados
}

describe('el detector (con ejemplos en memoria)', () => {
  it('encuentra texto suelto y props literales', () => {
    expect(textosSueltos('<Texto>Hola mundo</Texto>')).toEqual(['Hola mundo'])
    expect(textosSueltos('<Pressable accessibilityLabel="Cerrar" />')).toEqual(['accessibilityLabel="Cerrar"'])
    expect(textosSueltos('<Vacio mensaje="Nada" />')).toEqual(['mensaje="Nada"'])
  })
  it('no marca lo que sale del diccionario ni las expresiones', () => {
    expect(textosSueltos('<Texto>{t.titulo}</Texto>')).toEqual([])
    expect(textosSueltos('<Texto>{a ? t.x : t.y}</Texto>')).toEqual([])
    expect(textosSueltos('<Texto accessibilityLabel={t.x} />')).toEqual([])
  })
})

describe('las pantallas migradas no tienen texto fuera del diccionario', () => {
  it.each(PANTALLAS_MIGRADAS)('%s', (archivo) => {
    expect(textosSueltos(readFileSync(join(RAIZ, archivo), 'utf8'))).toEqual([])
  })
})

function hojas(o: unknown, camino = ''): string[] {
  if (typeof o === 'string' || typeof o === 'function') return [camino]
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => hojas(v, camino ? `${camino}.${k}` : k))
  return []
}

describe('diccionarios', () => {
  it('las mismas claves en los dos idiomas', () => {
    expect(hojas(en).sort()).toEqual(hojas(es).sort())
  })
  it('lo que debe traducirse no quedó igual (salvo los nombres de los idiomas y las marcas)', () => {
    const iguales = new Set(['idioma.castellano', 'idioma.ingles', 'lugaresChicos.instagram'])
    const plano = (o: unknown, c = ''): [string, unknown][] =>
      typeof o === 'string' ? [[c, o]] : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => plano(v, c ? `${c}.${k}` : k)) : []
    const esMapa = new Map(plano(es))
    for (const [clave, valor] of plano(en)) if (!iguales.has(clave)) expect(valor, clave).not.toBe(esMapa.get(clave))
  })
  it('las funciones arman el texto en cada idioma', () => {
    expect(es.lugaresChicos.conteo(1)).toBe('1 lugar')
    expect(en.lugaresChicos.conteo(3)).toBe('3 places')
    expect(en.lugaresChicos.cercaDe('Centro')).toBe('Near Centro')
  })
})

describe('idioma: dispositivo, preferencia y fechas', () => {
  it('el idioma del dispositivo: inglés solo si el locale es en-*', () => {
    expect(idiomaDeLocale('en-US')).toBe('en')
    expect(idiomaDeLocale('en')).toBe('en')
    expect(idiomaDeLocale('es-AR')).toBe('es')
    expect(idiomaDeLocale('pt-BR')).toBe('es')
    expect(idiomaDeLocale(null)).toBe('es')
    expect(idiomaEfectivo('auto', 'en-GB')).toBe('en')
    expect(idiomaEfectivo('es', 'en-GB')).toBe('es')
  })
  it('la preferencia se guarda en el teléfono; «auto» borra la clave; un valor raro es «auto»', async () => {
    const datos = new Map<string, string>()
    const almacen: Almacen = {
      leer: async (k) => datos.get(k) ?? null,
      escribir: async (k, v) => void datos.set(k, v),
      borrar: async (k) => void datos.delete(k),
      claves: async () => [...datos.keys()],
      borrarVarias: async (ks) => ks.forEach((k) => datos.delete(k)),
    }
    expect(await leerPreferenciaIdioma(almacen)).toBe('auto')
    await guardarPreferenciaIdioma(almacen, 'en')
    expect(datos.get(CLAVE_IDIOMA)).toBe('en')
    expect(await leerPreferenciaIdioma(almacen)).toBe('en')
    await guardarPreferenciaIdioma(almacen, 'auto')
    expect(datos.has(CLAVE_IDIOMA)).toBe(false)
    datos.set(CLAVE_IDIOMA, 'fr')
    expect(await leerPreferenciaIdioma(almacen)).toBe('auto')
  })
  it('fechas y horas con Intl, en hora de Salta y en 24 h', () => {
    const sabado2130 = '2026-11-08T00:30:00.000Z' // sábado 7/11 21:30 en Salta
    expect(formatearHora('es', sabado2130)).toBe('21:30')
    expect(formatearHora('en', sabado2130)).toBe('21:30')
    expect(formatearDia('es', sabado2130)).toBe('sábado, 7 de noviembre')
    expect(formatearDia('en', sabado2130)).toBe('Saturday 7 November')
    expect(formatearFechaCorta('es', sabado2130)).toBe('07/11/2026')
  })
})

describe('cableado', () => {
  it('el provider envuelve la app y el selector está en Cuenta (con y sin sesión)', () => {
    expect(readFileSync(join(RAIZ, 'app', '_layout.tsx'), 'utf8')).toContain('<IdiomaProvider>')
    const cuenta = readFileSync(join(RAIZ, 'app', '(tabs)', 'cuenta.tsx'), 'utf8')
    expect(cuenta.split('<SelectorIdioma />').length - 1).toBe(2)
  })
  it('la preferencia no viaja al servidor: lib/i18n no importa supabase ni fetch', () => {
    for (const f of ['idioma.ts', 'index.tsx']) {
      const s = quitarComentarios(readFileSync(join(RAIZ, 'lib', 'i18n', f), 'utf8'))
      expect(s).not.toMatch(/supabase|fetch\(/)
    }
  })
})
