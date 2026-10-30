import { notFound, permanentRedirect } from "next/navigation"
import { findMergeRedirect } from "@/lib/events/merged"

import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventDetailPage } from "@/components/event-detail-page"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { formatSaltaSchemaDate } from "@/lib/date-format"
import { parseOrigin } from "@/lib/metricas/links"
import { esEventoFavorito } from "@/lib/favoritos/es-favorito"
import { leerAsistencia } from "@/lib/asistencia-lectura"
import { debenMostrarseBotonesAsistencia } from "@/lib/asistencia-visibilidad"
import { obtenerSeguimientoDeEvento } from "@/lib/actions/radar"
import { idiomasAlternos } from "@/lib/i18n/seo"
import { JsonLd } from "@/components/json-ld"
import { conContexto, migasJsonLd } from "@/lib/seo/json-ld"
import { descripcionParaMeta } from "@/lib/seo/descripcion"
import { SITE_NAME, SITE_URL, tituloConMarca } from "@/lib/seo/sitio"
import type { Metadata } from "next"

interface EventPageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ o?: string | string[] }>
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params
  const event = await getEventById(id)

  if (!event) {
    return {
      title: 'Evento no encontrado',
    }
  }

  // B2: el `title` va sin marca porque la plantilla del layout
  // (`%s | Que pinta Salta`) ya la agrega; antes quedaba dos veces. Open
  // Graph y Twitter no pasan por la plantilla: ahí la marca va a mano.
  const title = event.title
  const socialTitle = tituloConMarca(event.title)
  // Sin emojis ni saltos de línea y cortada en palabra (el caption de
  // Instagram crudo quedaba como descripción). Si la corta queda vacía (solo
  // emojis), la larga; si no, el texto de respaldo.
  const description =
    descripcionParaMeta(event.short_description) ??
    descripcionParaMeta(event.description) ??
    `Descubrí el evento ${event.title} en Salta Capital.`
  const imageUrl = event.image_url || '/og-image.png'

  return {
    title,
    description,
    // Canónica sin ?o= (el origen de la métrica): una sola URL por evento.
    alternates: { canonical: `/evento/${id}`, languages: idiomasAlternos(`/evento/${id}`) },
    openGraph: {
      title: socialTitle,
      description,
      type: 'article',
      url: `${SITE_URL}/evento/${id}`,
      // El bloque de la página reemplaza al del layout entero: sin esto se
      // perdían og:site_name y og:locale (B2).
      siteName: SITE_NAME,
      locale: 'es_AR',
      images: [
        {
          url: imageUrl,
          alt: event.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [imageUrl],
    },
  }
}

export default async function EventPage({ params, searchParams }: EventPageProps) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const origin = parseOrigin(Array.isArray(sp.o) ? sp.o[0] : sp.o)
  const supabase = await createClient()

  const [event, categories, userResult, seguimiento] = await Promise.all([
    getEventById(id),
    getCategories(),
    supabase.auth.getUser(),
    obtenerSeguimientoDeEvento(id),
  ])

  let isAdmin = false
  let isFavorite = false
  const user = userResult.data.user

  // R56 (56-a, QPS-196): el MISMO cliente y el MISMO auth.getUser() de
  // arriba, sin crear un segundo cliente ni volver a autenticar (antes,
  // `obtenerAsistencia(id)` hacía las dos cosas de nuevo).
  const resultadoAsistencia = await leerAsistencia(supabase, user?.id ?? null, id)

  if (user) {
    const [profileRes, favoriteResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single(),
      esEventoFavorito(supabase, user.id, id)
    ])

    isAdmin = profileRes.data?.role === 'ADMIN'
    isFavorite = favoriteResult
  }

  if (!event) {
    // Evento fusionado: 308 al que quedó (solo el id sale del lookup admin).
    let to: string | null = null
    try {
      to = await findMergeRedirect(createAdminClient(), id)
    } catch (err) {
      console.error('[evento] no se pudo seguir la fusión:', err instanceof Error ? err.message : err)
    }
    if (to) {
      const rawOrigin = Array.isArray(sp.o) ? sp.o[0] : sp.o
      const validOrigin = rawOrigin && parseOrigin(rawOrigin) === rawOrigin ? rawOrigin : null
      permanentRedirect(`/evento/${to}${validOrigin ? `?o=${validOrigin}` : ''}`)
    }
    notFound()
  }

  // "Voy" (bloqueante 2, vuelta 1): si la lectura de asistencia falla, la
  // ficha sigue funcionando: no se muestra el botón de Voy, pero la fila de
  // ♥ Guardar/Compartir se dibuja igual (el `console.error` ya quedó
  // dentro de `leerAsistencia`).
  // Además, solo se pasan las cantidades si el evento está PUBLISHED: la
  // vista `event_attendance_counts` solo agrega votos de eventos
  // PUBLISHED, así que en un evento CANCELLED o PAST el contador quedaría
  // clavado en 0 aunque se pudiera tocar el botón. El día que se quiera
  // contar también en PAST/CANCELLED hace falta una migración que cambie
  // esa vista, no alcanza con sacar este chequeo.
  const cantidadesAsistencia =
    resultadoAsistencia.ok && debenMostrarseBotonesAsistencia(event.status) ? resultadoAsistencia.cantidades : undefined
  const marcaAsistencia = resultadoAsistencia.ok ? resultadoAsistencia.propia : null

  // Schema.org Structured Data (JSON-LD) for Google Rich Results.
  // Sólo para eventos que realmente están publicados: emitir schema de un
  // borrador o de algo pendiente de revisión sería datos estructurados de
  // contenido que el público no debería estar viendo.
  const isIndexable = ['PUBLISHED', 'CANCELLED', 'PAST'].includes(event.status)
  const eventUrl = `${SITE_URL}/evento/${event.id}`
  const venue = event.venue
  const hasCoords = typeof venue?.latitude === 'number' && typeof venue?.longitude === 'number'
  const isCancelled = event.status === 'CANCELLED'

  /**
   * `events.tags` mezcla dos cosas: nombres de artista cargados por la IA de
   * Instagram ("La Joaqui", "Tomy Wahl"), que sí son keywords legítimas, y
   * marcas internas de la ingesta ("scraped", "norteticket", "instagram-ai"),
   * que no tienen por qué ser públicas — decían cómo entró el dato, no de qué
   * se trata el evento.
   *
   * Se filtran por lista negra y no por lista blanca porque los nombres de
   * artista son abiertos: no se pueden enumerar de antemano.
   */
  const INTERNAL_TAGS = new Set([
    'scraped',
    'norteticket',
    'entradauno',
    'alpogo',
    'vamos',
    'instagram-ai',
    'instagram',
    'manual',
    'cines',
    'cinema',
  ])

  const publicKeywords = (event.tags ?? [])
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && !INTERNAL_TAGS.has(tag.toLowerCase()))
    .join(', ')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': eventUrl,
    'url': eventUrl,
    'name': event.title,
    'startDate': formatSaltaSchemaDate(event.start_date),
    // Sólo si hay una fecha de fin de verdad. Antes se repetía `start_date`
    // cuando faltaba, y un evento que empieza y termina en el mismo instante
    // es una duración de cero: Google lo marca en el informe de Eventos.
    // Omitir el campo es válido en schema.org y no dispara el aviso.
    ...(event.end_date && { 'endDate': formatSaltaSchemaDate(event.end_date) }),
    'eventStatus': isCancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'inLanguage': 'es-AR',
    'isAccessibleForFree': !!event.is_free,
    'location': {
      '@type': 'Place',
      'name': venue?.name || 'Lugar por confirmar',
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': venue?.address || 'Salta, Argentina',
        'addressLocality': 'Salta',
        'addressRegion': 'Salta',
        'addressCountry': 'AR',
      },
      ...(hasCoords && {
        'geo': {
          '@type': 'GeoCoordinates',
          'latitude': venue!.latitude,
          'longitude': venue!.longitude,
        },
      }),
      ...(venue?.google_maps_url && { 'hasMap': venue.google_maps_url }),
    },
    'image': event.image_url ? [event.image_url] : ['https://www.quepintasalta.com.ar/og-image.png'],
    'description': event.short_description || event.description || `${event.title} en Salta Capital.`,
    'offers': {
      '@type': 'Offer',
      'name': event.is_free ? 'Entrada libre y gratuita' : 'Entrada',
      'url': event.ticket_url || eventUrl,
      // B2: precio 0 solo si es gratis. Antes un evento pago sin precio
      // cargado decía 0, que para Google es «gratis». Sin precio conocido no
      // va ni `price` ni `priceCurrency`. Un `price_min` de 0 en un evento
      // pago también es «sin precio»: el sitio lo muestra como «A confirmar»
      // (`transformEvent` en @qps/core/home/transform).
      ...(event.is_free
        ? { 'price': 0, 'priceCurrency': 'ARS' }
        : typeof event.price_min === 'number' && event.price_min > 0
          ? { 'price': event.price_min, 'priceCurrency': 'ARS' }
          : {}),
      'availability': isCancelled
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      'validFrom': event.created_at,
    },
    ...(event.category?.name && {
      'about': { '@type': 'Thing', 'name': event.category.name },
    }),
    ...(publicKeywords && { 'keywords': publicKeywords }),
  }

  // Migas (B2): Inicio → categoría → el evento. La categoría solo si tiene
  // una URL que funcione: la portada filtra con `?category=<slug>`
  // (`components/home-content.tsx` compara contra `category.slug`). Va en
  // un bloque aparte para que el `Event` de arriba quede igual que antes.
  const migas = migasJsonLd([
    { nombre: 'Inicio', url: '/' },
    ...(event.category?.slug && event.category?.name
      ? [{ nombre: event.category.name, url: `/?category=${encodeURIComponent(event.category.slug)}` }]
      : []),
    { nombre: event.title, url: eventUrl },
  ])

  return (
    <>
      {isIndexable && (
        <>
          {/* JsonLd escapa "<": un título con "</script>" no rompe el documento. */}
          <JsonLd data={jsonLd} />
          <JsonLd data={conContexto(migas)} />
        </>
      )}
      <EventDetailPage
        event={event}
        isAdmin={isAdmin}
        categories={categories}
        isFavorite={isFavorite}
        origin={origin}
        cantidadesAsistencia={cantidadesAsistencia}
        marcaAsistencia={marcaAsistencia}
        seguimiento={seguimiento}
        haySesion={!!user}
      />
    </>
  )
}
