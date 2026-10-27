/**
 * hreflang de las páginas que existen en los dos idiomas (Q3). Va en
 * `alternates.languages` de la metadata de cada página, en las dos versiones.
 * Las rutas son relativas: Next las completa con `metadataBase` del layout.
 */
import { rutaEn } from './rutas'

export function idiomasAlternos(ruta: string): Record<string, string> {
  return {
    'es-AR': ruta,
    en: rutaEn('en', ruta),
    'x-default': ruta,
  }
}
