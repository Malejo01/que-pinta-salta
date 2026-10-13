/**
 * Decisión de qué URL de imagen mostrar en la app (R25, punto 2 de 25-b):
 * solo afiches/flyers de nuestro Storage, y siempre la variante WebP 400.
 * Para cualquier otro caso (host de terceros, sin URL, sin configuración de
 * Supabase) devuelve `null`: quien la use muestra un espacio vacío con la
 * marca, sin pedirle nada al host del tercero.
 *
 * Pura: no importa `react-native` ni hace red. `esDeNuestroStorage` y
 * `flyerVariantUrl` son de `@qps/core/images`; esta función es el único
 * punto por el que tiene que pasar cualquier URL de imagen antes de llegar a
 * un `<Image>` de la app.
 */
import { esDeNuestroStorage } from '@qps/core/images/storage-url'
import { flyerVariantUrl } from '@qps/core/images/variants'

/**
 * `null` si `url` no es de nuestro Storage (o si falta `supabaseUrl`, o si
 * `url` está vacía): en ese caso no hay nada seguro para pedir. Si es de
 * nuestro Storage, la URL de la variante WebP 400.
 */
export function urlDeImagenSegura(url: string | null | undefined, supabaseUrl: string | null | undefined): string | null {
  if (!supabaseUrl) return null
  if (!esDeNuestroStorage(url, supabaseUrl)) return null
  return flyerVariantUrl(url as string, 400)
}
