/**
 * Decisiones puras sobre el tamaño de las imágenes de `Afiche.tsx` (R46-h).
 *
 * No importa `react-native`: ni `metodoDeRedimension` ni `dimensionesPng`
 * necesitan el runtime nativo, así se pueden probar con Vitest sin montar
 * componentes.
 */
import type { VariantWidth } from '@qps/core/images/variants'

export interface OpcionesRedimension {
  /** Igual que la prop `llenar` de `Afiche`: la tarjeta a sangre. */
  llenar?: boolean
  /** Igual que la prop `ancho` de `Afiche`: la variante WebP pedida. */
  ancho?: VariantWidth
}

/**
 * `resizeMethod` para la `<Image>` remota de `Afiche` (Android: en `resize`
 * decodifica al tamaño de la vista; en `auto` lo decide el motor nativo, y
 * conviene cuando la imagen se ve a todo el ancho).
 *
 * - sin `llenar` (la miniatura de 64×64) → `'resize'`: la vista es chica,
 *   decodificar al tamaño del archivo original (que puede pesar mucho, los
 *   PNG/WebP de terceros sin variante) sería desperdiciar memoria.
 * - `llenar` sin `ancho`, o con `ancho` 400 (tarjetas) → `'resize'`: mismo
 *   motivo, la vista sigue siendo chica frente al original.
 * - `llenar` con `ancho` 800 (ficha y Hero) → `'auto'`: la imagen ocupa
 *   todo el ancho de la pantalla, cerca del tamaño del archivo.
 */
export function metodoDeRedimension({ ancho }: OpcionesRedimension): 'resize' | 'auto' {
  return ancho === 800 ? 'auto' : 'resize'
}

/** Firma fija de 8 bytes de todo archivo PNG (RFC 2083 §3.1). */
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Cuántos bytes hacen falta para llegar al final del bloque IHDR (ancho y alto incluidos). */
const BYTES_HASTA_IHDR = 24

export interface DimensionesPng {
  ancho: number
  alto: number
}

/**
 * Ancho y alto de un PNG a partir de sus bytes: la firma (8 bytes), la
 * longitud del primer chunk (4 bytes) y el tipo `IHDR` (4 bytes) se
 * descartan; el ancho está en los bytes 16-19 y el alto en los 20-23,
 * big-endian (IHDR, RFC 2083 §4.1.1).
 *
 * Tira si `bytes` es más corto que el bloque que hace falta leer, o si los
 * primeros 8 bytes no son la firma de un PNG: en los dos casos devolver un
 * número cualquiera sería peor que avisar.
 */
export function dimensionesPng(bytes: Uint8Array): DimensionesPng {
  if (bytes.length < BYTES_HASTA_IHDR) {
    throw new Error(
      `dimensionesPng: se necesitan al menos ${BYTES_HASTA_IHDR} bytes, llegaron ${bytes.length}`,
    )
  }

  for (let i = 0; i < FIRMA_PNG.length; i++) {
    if (bytes[i] !== FIRMA_PNG[i]) {
      throw new Error('dimensionesPng: la firma no es de un PNG')
    }
  }

  const ancho = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0
  const alto = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0

  return { ancho, alto }
}
