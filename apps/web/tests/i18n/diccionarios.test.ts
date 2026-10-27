/**
 * Diccionarios de la interfaz (Q3, base en inglés): `es` y `en` tienen las
 * mismas claves (también anidadas), ningún texto vacío, y los textos con
 * número o con un valor son funciones que devuelven texto. `satisfies
 * Diccionario` ya lo frena en tsc; esto cubre lo que el tipo no ve (un
 * string vacío, una función que devuelve "").
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { es } from '@/lib/i18n/diccionarios/es'
import { en } from '@/lib/i18n/diccionarios/en'
import { langDeCategoria, nombreCategoria, textosDe } from '@/lib/i18n'

/** El mapa de categorías por slug es abierto a propósito (en castellano va vacío). */
const CLAVES_ABIERTAS = new Set(['portada.nombresCategorias'])

type Hoja = { ruta: string; valor: unknown }

function hojas(objeto: Record<string, unknown>, prefijo = ''): Hoja[] {
  return Object.entries(objeto).flatMap(([clave, valor]) => {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave
    if (CLAVES_ABIERTAS.has(ruta)) return [{ ruta, valor }]
    if (valor && typeof valor === 'object') return hojas(valor as Record<string, unknown>, ruta)
    return [{ ruta, valor }]
  })
}

const DICCIONARIOS = { es, en } as const

describe('diccionarios: mismas claves en es y en', () => {
  it('las mismas rutas de clave, en el mismo orden', () => {
    expect(hojas(en).map((h) => h.ruta)).toEqual(hojas(es).map((h) => h.ruta))
  })

  it('cada hoja es del mismo tipo en los dos (string con string, función con función)', () => {
    const tiposEs = hojas(es).map((h) => [h.ruta, typeof h.valor])
    const tiposEn = hojas(en).map((h) => [h.ruta, typeof h.valor])
    expect(tiposEn).toEqual(tiposEs)
  })

  it('el recorrido no está vacío (si da 0, el test no mira nada)', () => {
    expect(hojas(es).length).toBeGreaterThan(80)
  })
})

describe.each(Object.entries(DICCIONARIOS))('diccionario %s', (_nombre, dic) => {
  const lista = hojas(dic).filter((h) => !CLAVES_ABIERTAS.has(h.ruta))

  it.each(lista.filter((h) => typeof h.valor === 'string'))('$ruta no está vacío', ({ valor }) => {
    expect((valor as string).trim().length).toBeGreaterThan(0)
  })

  it.each(lista.filter((h) => typeof h.valor === 'function'))('$ruta devuelve un texto no vacío', ({ valor }) => {
    const fn = valor as (x: never) => unknown
    for (const argumento of [1, 3, 'Teatro Provincial']) {
      const resultado = fn(argumento as never)
      expect(typeof resultado).toBe('string')
      expect((resultado as string).trim().length).toBeGreaterThan(0)
    }
  })

  it('no hay hojas de otro tipo (números, null…)', () => {
    expect(lista.filter((h) => typeof h.valor !== 'string' && typeof h.valor !== 'function')).toEqual([])
  })
})

describe('plurales', () => {
  it('cantidad de cines: singular y plural en los dos idiomas', () => {
    expect(es.cines.cantidadCines(1)).toBe('1 Cine')
    expect(es.cines.cantidadCines(3)).toBe('3 Cines')
    expect(en.cines.cantidadCines(1)).toBe('1 Cinema')
    expect(en.cines.cantidadCines(3)).toBe('3 Cinemas')
    expect(en.portada.cinesDeSalta(1)).toBe('1 cinema in Salta')
    expect(en.portada.cinesDeSalta(2)).toBe('2 cinemas in Salta')
  })
})

describe('textosDe y nombreCategoria', () => {
  it('textosDe devuelve el diccionario de cada idioma', () => {
    expect(textosDe('es')).toBe(es)
    expect(textosDe('en')).toBe(en)
  })

  it('en castellano el nombre de la categoría es el de la base, siempre', () => {
    expect(nombreCategoria(es, 'penas', 'Peñas')).toBe('Peñas')
    expect(nombreCategoria(es, 'slug-nuevo', 'Algo nuevo')).toBe('Algo nuevo')
  })

  it('en inglés sale del diccionario por slug, con el de la base como respaldo', () => {
    expect(nombreCategoria(en, 'boliches', 'Boliches')).toBe('Nightclubs')
    expect(nombreCategoria(en, 'slug-nuevo', 'Algo nuevo')).toBe('Algo nuevo')
  })

  // La lista real de slugs: la que el clasificador puede asignar (lib/ai/types.ts).
  function slugsReales(): string[] {
    const fuente = readFileSync(join(__dirname, '..', '..', 'lib', 'ai', 'types.ts'), 'utf8')
    const inicio = fuente.indexOf('export type GeminiCategorySlug')
    const bloque = fuente.slice(inicio, fuente.indexOf('\n\n', inicio))
    return [...bloque.matchAll(/\|\s*'([a-z]+)'/g)].map((m) => m[1])
  }

  it('todos los slugs reales (GeminiCategorySlug de lib/ai/types.ts) tienen nombre en inglés', () => {
    const slugs = slugsReales()
    // Sanidad: si el recorte de la fuente se rompe, esto no puede pasar en verde con 0.
    expect(slugs.length).toBeGreaterThanOrEqual(16)
    expect(slugs).toContain('congresos')
    expect(slugs).toContain('automovilismo')
    expect(slugs.filter((slug) => !(slug in en.portada.nombresCategorias))).toEqual([])
  })

  it('y los de lib/category-icons.ts también', () => {
    const fuente = readFileSync(join(__dirname, '..', '..', 'lib', 'category-icons.ts'), 'utf8')
    const bloque = fuente.slice(fuente.indexOf('const categoryIcons'), fuente.indexOf('export function'))
    const slugs = [...bloque.matchAll(/^\s+([a-z]+):/gm)].map((m) => m[1])
    expect(slugs.length).toBeGreaterThanOrEqual(14)
    expect(slugs.filter((slug) => !(slug in en.portada.nombresCategorias))).toEqual([])
  })

  it('langDeCategoria: "es" solo en inglés y cuando el nombre quedó el de la base', () => {
    expect(langDeCategoria('es', 'penas')).toBeUndefined()
    expect(langDeCategoria('es', 'slug-nuevo')).toBeUndefined()
    expect(langDeCategoria('en', 'penas')).toBeUndefined()
    expect(langDeCategoria('en', 'slug-nuevo')).toBe('es')
  })
})
