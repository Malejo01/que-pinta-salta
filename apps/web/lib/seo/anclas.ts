/**
 * Ancla de cada película en /cines (B2): el `id` de su tarjeta y el `url`
 * de su `Movie` en el ItemList (`/cines#pelicula-<slug>`). Las películas no
 * tienen página propia, así que el ancla es la URL de cada una.
 *
 * `cinema_movies.slug` es único (constraint `cinema_movies_slug_key`) y el
 * scraper lo arma con minúsculas, números y guiones. Igual se normaliza, por
 * si entra uno a mano: un `id` de HTML no puede tener espacios. El prefijo
 * evita chocar con otros `id` de la página.
 */
export function anclaDePelicula(slug: string): string {
  const limpio = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `pelicula-${limpio}`
}
