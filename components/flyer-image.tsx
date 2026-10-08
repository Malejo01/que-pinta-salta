'use client'

import { useState } from 'react'
import Image, { type ImageProps } from 'next/image'
import { flyerVariantUrl, type VariantWidth } from '@/lib/images/variants'

type FlyerImageProps = Omit<ImageProps, 'src'> & {
  src: string
  /** Ancho de la variante WebP a usar (400 o 800). */
  variant: VariantWidth
}

/**
 * Envoltorio de `next/image` para flyers: pide la variante WebP de `variant`
 * px si la imagen es un original del bucket de Instagram, y si no existe
 * (backfill no corrido todavía, falló al generarla, o es otro tipo de
 * imagen) cae una sola vez al original, sin loop.
 */
export function FlyerImage({ src, variant, onError, ...props }: FlyerImageProps) {
  const [useOriginal, setUseOriginal] = useState(false)

  const variantSrc = flyerVariantUrl(src, variant)
  const resolvedSrc = useOriginal ? src : variantSrc

  return (
    // `alt` es obligatorio en ImageProps y viene en el spread; el linter no lo ve porque no está literal.
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image
      {...props}
      src={resolvedSrc}
      onError={(event) => {
        // Sólo cae al original si de verdad estaba pidiendo una variante
        // distinta; si flyerVariantUrl ya devolvió el original (otro host,
        // otro bucket, placeholder), no hay nada a qué caer ni riesgo de loop.
        if (!useOriginal && resolvedSrc !== src) {
          setUseOriginal(true)
          return // se está reintentando con el original; todavía no es un fallo final
        }
        onError?.(event)
      }}
    />
  )
}
