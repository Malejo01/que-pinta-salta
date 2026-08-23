import { notFound } from "next/navigation"
import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventDetailPage } from "@/components/event-detail-page"
import { createClient } from "@/lib/supabase/server"
import { formatSaltaSchemaDate } from "@/lib/date-format"
import type { Metadata } from "next"

interface EventPageProps {
  params: Promise<{ id: string }>
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

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [event, categories, userResult] = await Promise.all([
    getEventById(id),
    getCategories(),
    supabase.auth.getUser(),
  ])

  let isAdmin = false
  let isFavorite = false
  const user = userResult.data.user

  if (user) {
    const [profileRes, favoriteRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single(),
      supabase
        .from('user_favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('event_id', id)
        .maybeSingle()
    ])

    isAdmin = profileRes.data?.role === 'ADMIN'
    isFavorite = !!favoriteRes.data
  }

  if (!event) {
    notFound()
  }

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
      />
    </>
  )
}
