/**
 * Datos del sitio que comparten los metadatos de las páginas y el JSON-LD (B2).
 *
 * El layout (`app/layout.tsx`) tiene estos mismos valores escritos a mano y es
 * de otra sesión, así que no se puede hacer que los importe: el test
 * `tests/seo/json-ld.test.ts` compara los dos para que no se separen.
 */

/** Host canónico (www), el mismo que `metadataBase` del layout. */
export const SITE_URL = 'https://www.quepintasalta.com.ar'

/** Con la misma grafía que el `og:site_name` y la plantilla de título del layout. */
export const SITE_NAME = 'Que pinta Salta'

/**
 * La imagen Open Graph por defecto del layout. Hace falta repetirla en cada
 * página que declara su propio `openGraph`: Next reemplaza el bloque entero
 * del layout (no lo mezcla), y sin esto la página se queda sin `og:image`
 * (pasaba en /cines, ver la auditoría B1).
 */
export const IMAGEN_OG_POR_DEFECTO = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Que pinta Salta - Agenda de Eventos y Peñas en Salta Capital',
} as const

/**
 * Título para `openGraph` y `twitter`, que no pasan por la plantilla
 * `%s | Que pinta Salta` del layout. El `title` de la página va SIN marca:
 * la plantilla ya la agrega (antes quedaba dos veces).
 */
export function tituloConMarca(titulo: string): string {
  return `${titulo} | ${SITE_NAME}`
}

/** URL absoluta en el host canónico. Las que ya son absolutas quedan igual. */
export function urlAbsoluta(rutaOUrl: string): string {
  if (/^https?:\/\//i.test(rutaOUrl)) return rutaOUrl
  return `${SITE_URL}${rutaOUrl.startsWith('/') ? '' : '/'}${rutaOUrl}`
}
