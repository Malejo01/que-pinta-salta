/**
 * `images/variants.ts` movido a `packages/core/src` (R25, tarea 25-a): mismos
 * casos que `apps/web/tests/images/variants.test.ts` (la parte pura, sin
 * `sharp`), importando desde `@qps/core/images/variants` en vez de `@/lib`,
 * más un caso de una imagen de `externas/` (QPS-004 §5: las que no se
 * pudieron copiar a nuestro Storage, la web las muestra igual sin variante).
 */
import { describe, expect, it } from 'vitest'
import { INSTAGRAM_ENGINE_CONFIG } from '@qps/core/instagram-config'
import { flyerVariantUrl, variantPath } from '@qps/core/images/variants'

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

  it('imagen de un cine en externas/ (no se pudo copiar a nuestro Storage): no toca la URL', () => {
    // QPS-004 §5 / plan R25: los afiches de cine que falló `copyExternalImage`
    // se sirven con la URL original del tercero. No es nuestro bucket, así
    // que flyerVariantUrl la deja intacta (misma regla que "otro host").
    const url = 'https://cdn.cine-de-prueba.test/externas/afiche-pelicula-de-prueba.jpg'
    expect(flyerVariantUrl(url, 400)).toBe(url)
  })
})
