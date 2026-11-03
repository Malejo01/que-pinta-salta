/**
 * Slug de un lugar nuevo, con el mismo criterio que `public.venue_slugify`
 * (minúsculas, sin tildes, palabras separadas por guiones, hasta 100).
 */
export function slugDeLugar(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '')
}
