/**
 * Qué entra en los `ItemList` de la portada y de /cines (B2). Funciones
 * puras, aparte de las páginas porque un `page.tsx` no puede exportar
 * nada que no sea de Next.
 */
import { isVigente } from '@/lib/events/vigencia'
import { groupEventItems } from '@/lib/home/transform'
import type { EventWithRelations } from '@/lib/home/types'
import type { CinemaMovie } from '@/lib/types'
import { listaJsonLd, type NodoJsonLd } from './json-ld'
import { urlAbsoluta } from './sitio'

export const MAX_EVENTOS_EN_LISTA = 20

/**
 * Los próximos eventos tal como los muestra la agenda de la portada: los
 * vigentes (fin real o estimado todavía no pasó: hoy y lo que viene), con
 * categoría y con las funciones repetidas (mismo título y lugar) juntadas en
 * la primera, igual que `buildDisplayData`. Ordenados por fecha de inicio,
 * los primeros `max`.
 */
export function eventosParaListaDeLaPortada(
  events: EventWithRelations[],
  now: Date,
  max = MAX_EVENTOS_EN_LISTA
): { id: string; titulo: string }[] {
  return groupEventItems(events.filter((e) => isVigente(e, now)))
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
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
 * propia en el sitio, así que cada una va embebida como `Movie` (nombre y
 * afiche), sin `url`. `null` si no hay ninguna.
 */
export function listaDePeliculasJsonLd(peliculas: Pick<CinemaMovie, 'title' | 'poster_url'>[]): NodoJsonLd | null {
  if (peliculas.length === 0) return null
  return listaJsonLd(
    peliculas.map((p) => ({
      item: {
        '@type': 'Movie',
        name: p.title,
        ...(p.poster_url && { image: urlAbsoluta(p.poster_url) }),
      },
    })),
    { nombre: 'Películas en cartel en Salta', url: '/cines' }
  )
}
