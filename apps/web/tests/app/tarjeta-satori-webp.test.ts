// 23-d: ¿Satori (detrás de `next/og`, que usa la tarjeta de /api/tarjeta/[id])
// dibuja un WebP? Mauro sospecha que no, y todos los afiches de `flyers_ig`
// son WebP (cambio d, 23-c). Este test genera un WebP y un PNG reales con
// `sharp` (ya es dependencia de producción) y los pasa a un `ImageResponse`
// real, sin mockear `next/og`: lo que se compruebe acá es lo que decide si
// `POSTER_FORMATS` (apps/web/app/api/tarjeta/[id]/route.tsx) suma `webp` en
// una vuelta de 23-c, o si queda un ítem de backlog.
//
// El test fija el comportamiento de HOY (next 16.3.8, sharp 0.35.5): si una
// vuelta de `next/og` cambia cómo decodifica Satori, este test se rompe antes
// que la tarjeta en producción.
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { ImageResponse } from 'next/og'

const WIDTH = 64
const HEIGHT = 64

async function makeDataUrl(format: 'webp' | 'png'): Promise<string> {
  const image = sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      // Rojo liso: un color fijo, fácil de verificar si Satori lo dibujó.
      background: { r: 200, g: 20, b: 20 },
    },
  })
  const buffer = format === 'webp' ? await image.webp().toBuffer() : await image.png().toBuffer()
  const mime = format === 'webp' ? 'image/webp' : 'image/png'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * Arma un `ImageResponse` de 64x64 con `imgDataUrl` como único contenido y
 * consume el cuerpo (`await res.arrayBuffer()`): ahí es donde Satori
 * decodifica la imagen de entrada (la construcción del `ImageResponse` en sí
 * no lanza aunque la imagen de adentro esté rota; el error, si lo hay, sale
 * al leer el cuerpo).
 */
async function render(imgDataUrl: string): Promise<{ ok: true; bytes: number } | { ok: false; error: string }> {
  const element = {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex' },
      children: {
        type: 'img',
        props: {
          src: imgDataUrl,
          width: WIDTH,
          height: HEIGHT,
        },
      },
    },
  }
  const res = new ImageResponse(element as ConstructorParameters<typeof ImageResponse>[0], {
    width: WIDTH,
    height: HEIGHT,
  })

  try {
    const buf = await res.arrayBuffer()
    return { ok: true, bytes: buf.byteLength }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

describe('Satori (next/og) y WebP — qué pasa hoy', () => {
  it('un PNG real se dibuja sin error (control: next/og funciona para el formato que ya usamos)', async () => {
    const dataUrl = await makeDataUrl('png')
    const result = await render(dataUrl)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.bytes).toBeGreaterThan(0)
  })

  it('un WebP real: HOY (next 16.3.8) Satori tira error al decodificarlo, no lo dibuja', async () => {
    // Corrido una vez para observar (ver el informe de la tarea 23-d): Satori
    // no decodifica este WebP y `arrayBuffer()` rechaza con "u2 is not
    // iterable" (código minificado de Satori/Resvg, no un mensaje nuestro).
    // Por eso `POSTER_FORMATS` en app/api/tarjeta/[id]/route.tsx NO incluye
    // 'webp' — queda como ítem de backlog, no como vuelta de 23-c.
    //
    // Si una futura versión de `next`/`next/og` sí lo decodifica, este test
    // se rompe (deja de lanzar) y hay que revisar si corresponde sumar
    // 'webp' a POSTER_FORMATS; si solo cambia el texto del error (por una
    // reminificación), basta actualizar el mensaje esperado.
    const dataUrl = await makeDataUrl('webp')
    const result = await render(dataUrl)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('u2 is not iterable')
  })
})
