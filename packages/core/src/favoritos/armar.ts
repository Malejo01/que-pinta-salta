/**
 * La regla de /favoritos. La usan la web y la app: el test de equivalencia
 * de la R29 lo controla.
 *
 * Lee las tres columnas de `user_favorites` (`event_id`, `instagram_flyer_id`,
 * `cinema_movie_id`), ya resueltas a sus filas por `web`/`app` con el mismo
 * select público de siempre, y aplica el mismo filtro y el mismo armado que
 * hoy tiene `/favoritos` de la web:
 *   - eventos: `status = 'PUBLISHED'` y `isVigente`; sin categoría no se
 *     descartan (a diferencia de la home/Buscar), se muestran como "Sin
 *     categorizar" (si tienen categoría, el resultado es exactamente el de
 *     `transformEvent`, sin ningún cambio);
 *   - flyers de Instagram: `status = 'ACTIVE'`, con `transformFlyer`;
 *   - películas: `is_currently_showing`, con el mismo mapeo que usa la
 *     portada (`buildDisplayData` en `home/transform.ts`).
 * `flexibles` son las películas y los flyers (sin fecha fija); `porDia`
 * agrupa los eventos por su `date` (YYYY-MM-DD). Todo con un orden estable
 * (fecha, después `startDateTime`, después `id`): ni la web ni la app
 * pueden depender del orden en que Postgres devuelve las filas de un `.in()`.
 */
import type { Category, CinemaMovie, Event, Venue } from '../types'
import type { FlyerWithAccount } from '../instagram-config'
import { ageChip, cleanDescription, formatEventTimeDisplay } from '../event-display'
import { isVigente } from '../events/vigencia'
import { estaDestacado } from '../events/destacados'
import { formatDateInSalta, transformEvent, transformFlyer } from '../home/transform'
import type { DisplayEvent, EventWithRelations } from '../home/types'
import { SITIO } from '../metricas/links'

/** Fila cruda de `user_favorites` (las tres columnas, cualquiera puede ser null). */
export interface FilaFavorito {
  event_id: string | null
  instagram_flyer_id: string | null
  cinema_movie_id: string | null
}

export interface IdsDeFavoritos {
  eventIds: string[]
  flyerIds: string[]
  movieIds: string[]
}

function idsUnicos(valores: (string | null)[]): string[] {
  const vistos = new Set<string>()
  const resultado: string[] = []
  for (const valor of valores) {
    if (typeof valor !== 'string' || valor.length === 0) continue
    if (vistos.has(valor)) continue
    vistos.add(valor)
    resultado.push(valor)
  }
  return resultado
}

/** Los ids de cada tabla, sin repetidos y sin los `null`. */
export function idsDeFavoritos(filas: FilaFavorito[]): IdsDeFavoritos {
  return {
    eventIds: idsUnicos(filas.map((fila) => fila.event_id)),
    flyerIds: idsUnicos(filas.map((fila) => fila.instagram_flyer_id)),
    movieIds: idsUnicos(filas.map((fila) => fila.cinema_movie_id)),
  }
}

/**
 * Evento favorito con su join de categoría y venue (el mismo que trae
 * `PUBLIC_EVENT_SELECT`). A diferencia de `EventWithRelations` (que la
 * home/Buscar sí exige), `category` puede ser `null`: un evento sin
 * categoría tiene que aparecer en Favoritos igual, como "Sin categorizar".
 */
export type EventoFavorito = Event & { category: Category | null; venue: Venue | null }

export interface GrupoPorDia {
  dia: string
  items: DisplayEvent[]
}

export interface ResultadoFavoritosArmados {
  flexibles: DisplayEvent[]
  porDia: GrupoPorDia[]
}

export interface InsumosFavoritos {
  eventos: EventoFavorito[]
  flyers: FlyerWithAccount[]
  peliculas: CinemaMovie[]
  /** slug -> nombre, para el `categoryName` de los flyers (como `transformFlyer` pide). */
  categoryNameBySlug?: Map<string, string>
}

/** Igual que `transformEvent`, pero sin categoría cae a "Sin categorizar" en vez de exigirla. */
function transformEventoFavorito(event: EventoFavorito): DisplayEvent {
  if (event.category) {
    return transformEvent(event as EventWithRelations)
  }

  const startDate = new Date(event.start_date)
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    venue: event.venue?.name || 'Lugar por confirmar',
    date: formatDateInSalta(startDate),
    time: formatEventTimeDisplay(startDate) ?? '',
    category: 'uncategorized',
    categoryName: 'Sin categorizar',
    price: event.is_free ? ('gratis' as const) : event.price_min === 0 ? ('confirmar' as const) : event.price_min,
    image: event.image_url || '/placeholder.svg?height=600&width=400',
    description: cleanDescription(event.description) ?? cleanDescription(event.short_description) ?? '',
    address: event.venue?.address || '',
    startDateTime: event.start_date,
    ticketUrl: event.ticket_url || undefined,
    vibe: ageChip(event.age_restriction),
    // QPS-239: las dos ramas de esta función tienen que devolver el mismo
    // `DisplayEvent` salvo en la categoría, así que `featuredUntil` también
    // se copia acá (la rama de arriba lo hace vía `transformEvent`).
    featuredUntil: event.featured_until ?? null,
    isFeatured: estaDestacado(event.featured_until, new Date()),
  }
}

/** Mismo mapeo de película que `buildDisplayData`/la página de favoritos de la web: se proyecta siempre "hoy" (en Salta, según `ahora`). */
function transformPeliculaFavorita(movie: CinemaMovie, ahora: Date): DisplayEvent {
  const showCount = Object.keys(movie.showings || {}).length
  return {
    id: `movie-${movie.id}`,
    slug: movie.slug,
    title: movie.title,
    venue: `${showCount} ${showCount === 1 ? 'Cine' : 'Cines'} de Salta`,
    date: formatDateInSalta(ahora),
    time: '',
    category: 'cine',
    categoryName: 'Cine',
    price: 'confirmar' as const,
    image: movie.poster_url || '/placeholder.svg?height=600&width=400',
    description: '',
    address: '',
    startDateTime: movie.created_at,
    isFeatured: false,
    isCinemaMovie: true,
    showings: movie.showings,
  }
}

/** Orden estable: fecha, después startDateTime, después id. */
function compararEstable(a: DisplayEvent, b: DisplayEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const diferenciaInicio = new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
  if (!Number.isNaN(diferenciaInicio) && diferenciaInicio !== 0) return diferenciaInicio
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

export function armarFavoritos(
  { eventos, flyers, peliculas, categoryNameBySlug }: InsumosFavoritos,
  ahora: Date = new Date(),
): ResultadoFavoritosArmados {
  const mapaCategorias = categoryNameBySlug ?? new Map<string, string>()

  const eventosDisplay = eventos
    .filter((evento) => evento.status === 'PUBLISHED' && isVigente(evento, ahora))
    .map(transformEventoFavorito)

  const flyersDisplay = flyers
    .filter((flyer) => flyer.status === 'ACTIVE')
    .map((flyer) => transformFlyer(flyer, mapaCategorias))

  const peliculasDisplay = peliculas
    .filter((pelicula) => pelicula.is_currently_showing)
    .map((pelicula) => transformPeliculaFavorita(pelicula, ahora))

  const flexibles = [...flyersDisplay, ...peliculasDisplay].sort(compararEstable)

  const porDiaMap = new Map<string, DisplayEvent[]>()
  for (const evento of eventosDisplay) {
    const items = porDiaMap.get(evento.date)
    if (items) {
      items.push(evento)
    } else {
      porDiaMap.set(evento.date, [evento])
    }
  }

  const porDia: GrupoPorDia[] = [...porDiaMap.entries()]
    .sort(([diaA], [diaB]) => (diaA < diaB ? -1 : diaA > diaB ? 1 : 0))
    .map(([dia, items]) => ({ dia, items: [...items].sort(compararEstable) }))

  return { flexibles, porDia }
}

/**
 * Mensaje para "Compartir agenda por WhatsApp" (29-i, §3.7): el mismo texto,
 * emoji por emoji, que `handleShareWhatsApp` en `apps/web/app/favoritos/favoritos-list.tsx`,
 * movido a core porque 29-a ya estaba commiteada cuando se escribió esta
 * función (si no, habría quedado duplicada en `favoritos.tsx` con una nota
 * para 29-q). La web sigue armándolo inline con `window.location.origin`
 * (no tiene ese dato en runtime de servidor, y esta función es la que usa la
 * app, que no tiene `window`): queda pendiente que la web también importe
 * esta función en vez de repetirla — no se tocó `favoritos-list.tsx` (de
 * solo lectura para 29-i).
 *
 * `items` es la lista completa de favoritos, en cualquier orden: la función
 * separa por tipo (evento con fecha / película / flyer) y arma las tres
 * secciones siempre en el mismo orden, así que el orden de entrada no
 * cambia el resultado. `sitio` por defecto es `SITIO`
 * (`https://www.quepintasalta.com.ar`, el mismo dominio que usa `urlEvento`)
 * en vez de `window.location.origin`, que no existe en React Native.
 */
export function armarMensajeWhatsApp(items: DisplayEvent[], sitio: string = SITIO): string {
  const datedEvents = items.filter((item) => !item.isCinemaMovie && !item.isInstagramFlyer)
  const movies = items.filter((item) => item.isCinemaMovie)
  const flyers = items.filter((item) => item.isInstagramFlyer)

  let message = '¡Che! Este es mi plan para el finde en Salta:\n\n'

  if (datedEvents.length > 0) {
    message += '📅 *Eventos:*\n'
    for (const item of datedEvents) {
      const [, m, d] = item.date.split('-')
      const url = `${sitio}/evento/${item.id}`
      message += `- *${item.title}* (${d}/${m} en ${item.venue})\n  🔗 ${url}\n`
    }
    message += '\n'
  }

  if (movies.length > 0) {
    message += '🎬 *Cine:*\n'
    for (const item of movies) {
      const url = `${sitio}/cines`
      message += `- *${item.title}*\n  🔗 ${url}\n`
    }
    message += '\n'
  }

  if (flyers.length > 0) {
    message += '🍻 *Boliches / Salidas:*\n'
    for (const item of flyers) {
      const url = `${sitio}/flyer/${item.flyerId}`
      message += `- *${item.title}* (en ${item.venue})\n  🔗 ${url}\n`
    }
    message += '\n'
  }

  message += 'Organizá tu salida en quepintasalta.com.ar 🎸'

  return message
}
