/**
 * Qué entra en los `ItemList` de la portada y de /cines (B2). Funciones
 * puras, aparte de las páginas porque un `page.tsx` no puede exportar
 * nada que no sea de Next.
 */
import { buildDisplayData } from '@/lib/home/transform'
import type { EventWithRelations } from '@/lib/home/types'
import type { CinemaMovie } from '@/lib/types'
import { anclaDePelicula } from './anclas'
import { listaJsonLd, type NodoJsonLd } from './json-ld'
import { SITE_URL, urlAbsoluta } from './sitio'

export const MAX_EVENTOS_EN_LISTA = 20

/**
 * Los próximos eventos tal como los muestra la agenda de la portada. Usa el
 * mismo `buildDisplayData` que `HomeContent` (es puro, sin hooks), así la
 * lista no se puede separar de lo que se ve: los vigentes (fin real o
 * estimado todavía no pasó: hoy y lo que viene), con categoría y con las
 * funciones repetidas (mismo título y lugar) juntadas en la primera. Sin
 * flyers ni películas: no tienen ficha `/evento/<id>`. Ordenados por fecha
 * de inicio, los primeros `max`.
 */
export function eventosParaListaDeLaPortada(
  events: EventWithRelations[],
  now: Date,
  max = MAX_EVENTOS_EN_LISTA
): { id: string; titulo: string }[] {
  // El mapa de nombres de categoría solo lo usan los flyers, que acá no van.
  return buildDisplayData(events, [], [], new Map(), now)
    .all.sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
    .slice(0, max)
    .map((e) => ({ id: e.id, titulo: e.title }))
}

/** `ItemList` de fichas (`/evento/<id>`). `null` si no hay ninguna: no se publica una lista vacía. */
export function listaDeEventosJsonLd(eventos: { id: string; titulo: string }[]): NodoJsonLd | null {
  if (eventos.length === 0) return null
  return listaJsonLd(eventos.map((e) => ({ url: `/evento/${e.id}`, nombre: e.titulo })))
}

/**
 * `ItemList` de las películas en cartel. Las películas no tienen página
 * propia en el sitio, así que cada una va embebida como `Movie` con su
 * nombre, su afiche y como `url` el ancla de su tarjeta en /cines
 * (`anclaDePelicula`, el mismo `id` que le pone `components/cines-view.tsx`).
 *
 * Quedan afuera las que no tienen un afiche usable (`null` o vacío: el
 * scraper guarda '' cuando el afiche no responde): Google pide `image` en
 * cada `Movie` del carrusel. `null` si no queda ninguna.
 */
export function listaDePeliculasJsonLd(
  peliculas: Pick<CinemaMovie, 'title' | 'poster_url' | 'slug'>[]
): NodoJsonLd | null {
  const conAfiche = peliculas.filter((p) => p.poster_url?.trim())
  if (conAfiche.length === 0) return null
  return listaJsonLd(
    conAfiche.map((p) => ({
      item: {
        '@type': 'Movie',
        name: p.title,
        url: `${SITE_URL}/cines#${anclaDePelicula(p.slug)}`,
        image: urlAbsoluta(p.poster_url!.trim()),
      },
    })),
    { nombre: 'Películas en cartel en Salta', url: '/cines' }
  )
}
