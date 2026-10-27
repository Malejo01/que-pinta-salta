/**
 * B3: cómo carga una imagen de grilla (pósters de /cines, tarjetas de
 * /favoritos). Por defecto `next/image` pone `loading="lazy"`, y en la primera
 * fila eso retrasa el LCP: el navegador espera al layout para pedirla.
 *
 * - `diferida`: lo de siempre (lazy). Es el default para no cambiar nada en
 *   las filas de la portada ni en las grillas que no lo piden.
 * - `ansiosa`: `loading="eager"`, para lo que se ve sin scrollear.
 * - `prioritaria`: además `fetchPriority="high"`, solo para la imagen que es
 *   el LCP (una por página; si se marcan varias, compiten entre sí).
 *
 * No usa `preload` a propósito: son grillas, el <img> ya viene en el HTML
 * del servidor y alcanza con que no sea lazy.
 */
export type CargaImagen = 'diferida' | 'ansiosa' | 'prioritaria'

export type PistasDeCarga =
  | { loading: 'eager'; fetchPriority?: 'high' }
  | Record<string, never>

export function pistasDeCarga(carga: CargaImagen = 'diferida'): PistasDeCarga {
  if (carga === 'prioritaria') return { loading: 'eager', fetchPriority: 'high' }
  if (carga === 'ansiosa') return { loading: 'eager' }
  return {}
}

/**
 * Carga para la tarjeta número `indice` (desde 0) de la primera grilla
 * visible: las `ansiosas` primeras van sin lazy y la primera, además, con
 * prioridad alta.
 */
export function cargaPorIndice(indice: number, ansiosas = 2): CargaImagen {
  if (indice === 0) return 'prioritaria'
  if (indice < ansiosas) return 'ansiosa'
  return 'diferida'
}
