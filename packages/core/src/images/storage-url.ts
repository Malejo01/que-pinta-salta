/**
 * Chequeo de "¿esta URL es de nuestro Storage?", con el host exacto en vez de
 * `includes()` (punto débil marcado por el revisor en la R23: un
 * `includes()` de segmento de ruta puede dar falso positivo con un host de
 * un tercero que casualmente repite el mismo path). Puro: no hace red.
 *
 * No reemplaza a `isOwnStorageUrl` de `apps/web/lib/images/external.ts` (ese
 * sigue para la ingesta, que arrastra `sharp` y no puede vivir en
 * packages/core). Esta función es la que usa, por ejemplo, la app móvil para
 * decidir si muestra el afiche de una película de cine.
 */
import { INSTAGRAM_ENGINE_CONFIG } from '../instagram-config'

const PUBLIC_BUCKET_PREFIX = `/storage/v1/object/public/${INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET}/`

/**
 * `true` solo si `url` es `https:`, su host es *exactamente* el host de
 * `supabaseUrl`, y su ruta empieza con `/storage/v1/object/public/<bucket de
 * flyers>/`. Cualquier otro caso (otro protocolo, otro host —aunque sea un
 * subdominio o contenga el mismo texto—, otro bucket, URL inválida o
 * ausente) da `false`.
 */
export function esDeNuestroStorage(url: string | null | undefined, supabaseUrl: string): boolean {
  if (!url) return false

  let parsedUrl: URL
  let parsedSupabaseUrl: URL
  try {
    parsedUrl = new URL(url)
    parsedSupabaseUrl = new URL(supabaseUrl)
  } catch {
    return false
  }

  if (parsedUrl.protocol !== 'https:') return false
  if (parsedUrl.host !== parsedSupabaseUrl.host) return false

  return parsedUrl.pathname.startsWith(PUBLIC_BUCKET_PREFIX)
}
