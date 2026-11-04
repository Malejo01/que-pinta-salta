/**
 * Q6-4 · El pedido de clasificación por categoría de `scripts/revisar-calidad.ts --ia`
 * (Q5-8), sacado del script para que el banco de evaluación (`lib/ia/evaluacion`)
 * arme exactamente el mismo prompt. Mismo texto y mismo esquema que antes.
 */
import type { EsquemaJson } from '@/lib/ia/tipos'

export const INSTRUCCION_CLASIFICACION =
  'Clasificás eventos culturales de Salta (Argentina) en UNA categoría de la lista. Respondé solo el slug.'

export const MAX_TOKENS_CLASIFICACION = 256

export function esquemaClasificacion(slugs: string[]): EsquemaJson {
  return { type: 'object', properties: { slug: { type: 'string', enum: slugs } }, required: ['slug'] }
}

export function textoClasificacion(titulo: string, descripcion: string): string {
  return `Título: ${titulo}\nDescripción: ${descripcion}`
}
