/**
 * Decisión de qué URLs de imagen pedir para un flyer/afiche (R28, 28-e):
 * la misma regla que la web — variante WebP (400 por defecto, o 800 para la
 * ficha, R29 §3.4) → original → marca de hoy si no queda ninguna — también
 * para los hosts de ticketeras y cines que ya acepta la CSP de la web. Esto
 * **revierte** la decisión de la R25 ("sin pedirle nada al host del
 * tercero"): ahora el teléfono le pide la imagen a la ticketera, igual que
 * el navegador en la web.
 *
 * Pura: no importa `react-native` ni hace red. `esHostDeImagenPermitido` y
 * `flyerVariantUrl` son de `@qps/core/images`; `fuentesDeImagen` es el
 * único punto por el que tiene que pasar cualquier URL de imagen antes de
 * llegar a un `<Image>` de la app.
 */
import { esHostDeImagenPermitido } from '@qps/core/images/hosts-imagenes'
import { flyerVariantUrl, type VariantWidth } from '@qps/core/images/variants'

const FLYERS_IG_PREFIX = '/storage/v1/object/public/flyers_ig/'
const FLYERS_PREFIX = '/storage/v1/object/public/flyers/'
const JPG_EXTENSION = /\.jpg$/i

/**
 * Las URLs a intentar, en orden, para `url`:
 * - `https` + host exacto de `supabaseUrl` + bucket `flyers_ig` + `.jpg`:
 *   `[variante `ancho`, original]`; con otra extensión: `[original]`;
 * - `https` + host exacto de `supabaseUrl` + bucket `flyers`: `[original]`;
 * - `https` + `esHostDeImagenPermitido(host)`: `[original]`;
 * - cualquier otro caso (sin URL, URL inválida, `http`, otro bucket de
 *   Storage, otro host, Storage sin `supabaseUrl` configurado): `[]`.
 *
 * `ancho` (400 u 800, R29 §3.4): qué variante WebP pedir primero para
 * `flyers_ig`, como en la web (`FlyerImage`, `lib/images/variants.ts`).
 * Por defecto 400 (la tarjeta y el resto de los usos de hoy): así ningún
 * llamador existente cambia de comportamiento con solo recompilar. La ficha
 * (`app/evento/[id].tsx`) pide 800 explícitamente.
 */
export function fuentesDeImagen(
  url: string | null | undefined,
  supabaseUrl: string | null | undefined,
  ancho: VariantWidth = 400,
): string[] {
  if (!url) return []

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return []
  }

  if (parsedUrl.protocol !== 'https:') return []

  if (supabaseUrl) {
    let supabaseHost: string | null = null
    try {
      supabaseHost = new URL(supabaseUrl).host
    } catch {
      supabaseHost = null
    }

    if (supabaseHost && parsedUrl.host === supabaseHost) {
      if (parsedUrl.pathname.startsWith(FLYERS_IG_PREFIX)) {
        return JPG_EXTENSION.test(parsedUrl.pathname) ? [flyerVariantUrl(url, ancho), url] : [url]
      }
      if (parsedUrl.pathname.startsWith(FLYERS_PREFIX)) {
        return [url]
      }
      // Mismo host que nuestro Supabase, pero otro bucket: nada seguro.
      return []
    }
  }

  if (esHostDeImagenPermitido(parsedUrl.host)) {
    return [url]
  }

  return []
}

/** La fuente siguiente a `indice` en `fuentes`, o `null` si no quedan. */
export function siguienteFuente(fuentes: string[], indice: number): string | null {
  return fuentes[indice + 1] ?? null
}
