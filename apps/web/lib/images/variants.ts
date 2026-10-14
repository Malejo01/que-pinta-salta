/**
 * Variantes WebP de los flyers (QPS-004 §5) — parte 100% pura.
 *
 * Este módulo se importa tanto desde el servidor (ingesta, backfill) como
 * desde un componente cliente (`FlyerImage`), así que NO puede mencionar
 * `sharp` en ninguna forma, ni siquiera con import dinámico: que quede
 * afuera del bundle del cliente depende del tree-shaking del bundler, no
 * del lenguaje, y `sharp` es un binario nativo que puede romper `next
 * build`. La generación de variantes (`makeVariants`, con `sharp` importado
 * a nivel de módulo) vive en `lib/images/variants-server.ts`, que solo
 * importan módulos de servidor.
 */

import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'

/** Anchos de las variantes que se generan para cada flyer original. */
export const VARIANT_WIDTHS = [400, 800] as const

export type VariantWidth = (typeof VARIANT_WIDTHS)[number]

/**
 * `Cache-Control` (en segundos, como string: así lo espera `FileOptions` del
 * cliente de Storage) que se usa en **todo** `upload()` de imágenes de este
 * motor: originales de Instagram y sus variantes WebP. Un año: los flyers
 * son inmutables una vez subidos (la ingesta nunca pisa un `ig_post_id` ya
 * existente, y una variante generada no cambia), así que cachear agresivo no
 * arriesga servir una versión vieja y ahorra lecturas de Storage/CDN.
 */
export const STORAGE_CACHE_CONTROL = '31536000'

const JPG_EXTENSION = /\.jpg$/i

/**
 * `a/b.jpg` -> `a/b.w400.webp`. Sólo tiene sentido para los originales que
 * sube la ingesta de Instagram, que siempre son `.jpg` (ver
 * `buildStoragePath` en `lib/instagram/process-apify-payload.ts`). Para
 * cualquier otro path (por ejemplo los `.webp` que sube `imagen-penas.mjs`
 * directo a otro bucket) no hay variante: devuelve `null`.
 */
export function variantPath(storagePath: string, width: VariantWidth): string | null {
  if (!JPG_EXTENSION.test(storagePath)) return null
  return storagePath.replace(JPG_EXTENSION, `.w${width}.webp`)
}

/**
 * Prefijo de la URL pública de un objeto del bucket de flyers de Instagram,
 * sin depender del host: funciona igual contra producción
 * (`*.supabase.co`) que contra la base local, y es más fácil de testear sin
 * mockear `NEXT_PUBLIC_SUPABASE_URL`.
 */
const PUBLIC_BUCKET_SEGMENT = `/storage/v1/object/public/${INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET}/`

/**
 * Da la URL de la variante de `width` si `url` es la URL pública de un
 * `.jpg` del bucket de flyers de Instagram. Para cualquier otro caso (otro
 * host, otro bucket, un `.webp` de peñas, el placeholder) devuelve `url` sin
 * tocar. Pura: no hace red ni toca el filesystem.
 */
export function flyerVariantUrl(url: string, width: VariantWidth): string {
  const segmentStart = url.indexOf(PUBLIC_BUCKET_SEGMENT)
  if (segmentStart === -1) return url

  const pathStart = segmentStart + PUBLIC_BUCKET_SEGMENT.length
  const rest = url.slice(pathStart)
  const queryIndex = rest.indexOf('?')
  const storagePath = queryIndex === -1 ? rest : rest.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : rest.slice(queryIndex)

  const variant = variantPath(storagePath, width)
  if (!variant) return url

  return url.slice(0, pathStart) + variant + query
}
