/**
 * Puerta de entrada de los textos por idioma (Q3). Server y client pueden
 * importar de acá: no depende de React ni de next/*.
 */
import { es, type Diccionario } from './diccionarios/es'
import { en } from './diccionarios/en'
import type { Idioma } from './idiomas'

export type { Diccionario } from './diccionarios/es'
export type { Idioma } from './idiomas'

const DICCIONARIOS: Record<Idioma, Diccionario> = { es, en }

export function textosDe(idioma: Idioma): Diccionario {
  return DICCIONARIOS[idioma]
}

/**
 * Nombre visible de una categoría. En castellano, el de la base (como
 * siempre); en inglés, el del diccionario por slug, y si el slug no está
 * (una categoría nueva), el de la base.
 */
export function nombreCategoria(textos: Diccionario, slug: string, nombreDeLaBase: string): string {
  return textos.portada.nombresCategorias[slug] ?? nombreDeLaBase
}
