/**
 * SOLO SERVIDOR. `sharp` es un binario nativo: no puede alcanzarse desde el
 * grafo de módulos de un componente cliente sin arriesgar romper `next
 * build` (y por lo tanto la preview de Vercel). Por eso `makeVariants` vive
 * en este archivo separado, nunca importado por `components/flyer-image.tsx`
 * ni por ningún otro `'use client'` — solo por `lib/instagram/process-apify-payload.ts`
 * ('use server'), `lib/images/backfill.ts` y `scripts/imagenes-variantes.ts`.
 *
 * `lib/images/variants.ts` (la parte pura: `VARIANT_WIDTHS`, `variantPath`,
 * `flyerVariantUrl`) no debe importar nada de este archivo, y este archivo
 * reexporta lo que necesita de `variants.ts` en vez de al revés, para que no
 * haya ninguna dependencia transitiva de un componente cliente hacia `sharp`.
 */

import sharp from 'sharp'
import { VARIANT_WIDTHS, type VariantWidth } from './variants'

/** Variantes generadas por `makeVariants`, una por ancho. */
export type Variants = Record<VariantWidth, Buffer>

/**
 * Genera las variantes WebP de un flyer a partir del buffer del original.
 * `rotate()` respeta la orientación EXIF (fotos de celular), `resize` nunca
 * agranda una imagen más chica que el ancho pedido, y la calidad 75 es la
 * misma que ya usa `imagen-penas.mjs` para este tipo de flyer vertical.
 * No se toca `limitInputPixels`: queda el límite por defecto de sharp.
 */
export async function makeVariants(buffer: Buffer): Promise<Variants> {
  const entries = await Promise.all(
    VARIANT_WIDTHS.map(async (width) => {
      const out = await sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer()
      return [width, out] as const
    })
  )

  return Object.fromEntries(entries) as Variants
}
