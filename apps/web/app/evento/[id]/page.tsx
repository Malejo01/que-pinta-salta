import { notFound, permanentRedirect } from "next/navigation"
import { findMergeRedirect } from "@/lib/events/merged"

import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventDetailPage } from "@/components/event-detail-page"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { formatSaltaSchemaDate } from "@/lib/date-format"
import { parseOrigin } from "@/lib/metricas/links"
import { esEventoFavorito } from "@/lib/favoritos/es-favorito"
import { obtenerAsistencia } from "@/lib/asistencia"
import { debenMostrarseBotonesAsistencia } from "@/lib/asistencia-visibilidad"
import { obtenerSeguimientoDeEvento } from "@/lib/actions/radar"
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

  const title = `${event.title} - Que pinta Salta`
  const description = event.short_description || event.description?.substring(0, 160) || `Descubre el evento ${event.title} en Salta Capital.`
  const imageUrl = event.image_url || '/og-image.png'

  return {
    title,
    description,
    // Canónica sin ?o= (el origen de la métrica): una sola URL por evento.
    alternates: { canonical: `/evento/${id}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `https://www.quepintasalta.com.ar/evento/${id}`,
      images: [
        {
          url: imageUrl,
          alt: event.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
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

  const [event, categories, userResult, resultadoAsistencia, seguimiento] = await Promise.all([
    getEventById(id),
    getCategories(),
    supabase.auth.getUser(),
    obtenerAsistencia(id),
    obtenerSeguimientoDeEvento(id),
  ])

  let isAdmin = false
  let isFavorite = false
  const user = userResult.data.user

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
  // dentro de `obtenerAsistencia`).
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
  const eventUrl = `https://www.quepintasalta.com.ar/evento/${event.id}`
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
      'price': event.is_free ? 0 : (event.price_min ?? 0),
      'priceCurrency': 'ARS',
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

  return (
    <>
      {isIndexable && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // Escapamos "<" para que un título con "</script>" no rompa el documento.
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
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
