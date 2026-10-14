import { beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'
import { VARIANT_WIDTHS, flyerVariantUrl, variantPath } from '@/lib/images/variants'
import { makeVariants } from '@/lib/images/variants-server'

describe('variantPath', () => {
  it('.jpg -> .w400.webp / .w800.webp', () => {
    expect(variantPath('cuenta_de_prueba/post123.jpg', 400)).toBe('cuenta_de_prueba/post123.w400.webp')
    expect(variantPath('cuenta_de_prueba/post123.jpg', 800)).toBe('cuenta_de_prueba/post123.w800.webp')
  })

  it('es case-insensitive para la extensión', () => {
    expect(variantPath('cuenta_de_prueba/post123.JPG', 400)).toBe('cuenta_de_prueba/post123.w400.webp')
  })

  it('no .jpg -> null (webp de peñas, png, sin extensión)', () => {
    expect(variantPath('penas/flyer-de-prueba.webp', 400)).toBeNull()
    expect(variantPath('cuenta_de_prueba/post123.png', 400)).toBeNull()
    expect(variantPath('cuenta_de_prueba/post123', 400)).toBeNull()
  })
})

const BUCKET = INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET
const publicUrl = (path: string, host = 'proyecto-de-prueba.supabase.co') =>
  `https://${host}/storage/v1/object/public/${BUCKET}/${path}`

describe('flyerVariantUrl', () => {
  it('URL pública .jpg del bucket de flyers: cambia a la variante pedida', () => {
    const url = publicUrl('cuenta_de_prueba/post123.jpg')
    expect(flyerVariantUrl(url, 400)).toBe(publicUrl('cuenta_de_prueba/post123.w400.webp'))
    expect(flyerVariantUrl(url, 800)).toBe(publicUrl('cuenta_de_prueba/post123.w800.webp'))
  })

  it('conserva el query string (token de firma, etc.)', () => {
    const url = `${publicUrl('cuenta_de_prueba/post123.jpg')}?token=de-prueba-123`
    expect(flyerVariantUrl(url, 400)).toBe(`${publicUrl('cuenta_de_prueba/post123.w400.webp')}?token=de-prueba-123`)
  })

  it('funciona igual sin importar el host (local vs. producción)', () => {
    const local = publicUrl('cuenta_de_prueba/post123.jpg', '127.0.0.1:54321')
    expect(flyerVariantUrl(local, 400)).toBe(publicUrl('cuenta_de_prueba/post123.w400.webp', '127.0.0.1:54321'))
  })

  it('otro host sin el segmento del bucket de flyers: no toca la URL', () => {
    const url = 'https://otro-host.ejemplo.test/cuenta_de_prueba/post123.jpg'
    expect(flyerVariantUrl(url, 400)).toBe(url)
  })

  it('otro bucket: no toca la URL', () => {
    const url = `https://proyecto-de-prueba.supabase.co/storage/v1/object/public/otro-bucket/cuenta_de_prueba/post123.jpg`
    expect(flyerVariantUrl(url, 400)).toBe(url)
  })

  it('penas/*.webp: no toca la URL (ya es webp, de otro flujo de ingesta)', () => {
    const url = publicUrl('penas/flyer-de-prueba.webp')
    expect(flyerVariantUrl(url, 400)).toBe(url)
  })

  it('placeholder (no es una URL del bucket): no toca la URL', () => {
    const url = '/placeholder-flyer.svg'
    expect(flyerVariantUrl(url, 400)).toBe(url)
  })
})

describe('makeVariants', () => {
  // Imágenes generadas en el test (sharp con `create`), nunca flyers reales.
  let flyerBuffer: Buffer
  let chicaBuffer: Buffer

  beforeAll(async () => {
    flyerBuffer = await sharp({
      create: { width: 1200, height: 1800, channels: 3, background: { r: 10, g: 40, b: 90 } },
    })
      .jpeg()
      .toBuffer()

    chicaBuffer = await sharp({
      create: { width: 300, height: 450, channels: 3, background: { r: 200, g: 120, b: 30 } },
    })
      .jpeg()
      .toBuffer()
  }, 20_000)

  it('genera las variantes 400 y 800 en webp a partir de un flyer de 1200x1800', async () => {
    const variants = await makeVariants(flyerBuffer)

    expect(Object.keys(variants).map(Number).sort()).toEqual([...VARIANT_WIDTHS].sort())

    for (const width of VARIANT_WIDTHS) {
      const meta = await sharp(variants[width]).metadata()
      expect(meta.format).toBe('webp')
      expect(meta.width).toBe(width)
    }
  }, 20_000)

  it('con una imagen de 300px (más chica que 400 y 800): no la agranda', async () => {
    const variants = await makeVariants(chicaBuffer)

    const meta400 = await sharp(variants[400]).metadata()
    const meta800 = await sharp(variants[800]).metadata()

    expect(meta400.format).toBe('webp')
    expect(meta800.format).toBe('webp')
    // withoutEnlargement: el ancho de origen (300) es menor que 400 y 800,
    // así que las dos variantes se quedan en 300, no se agrandan.
    expect(meta400.width).toBe(300)
    expect(meta800.width).toBe(300)
  }, 20_000)
})
