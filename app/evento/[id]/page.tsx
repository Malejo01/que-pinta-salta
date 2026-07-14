import { notFound } from "next/navigation"
import { getEventById } from "@/lib/data"
import { getCategories } from "@/lib/data"
import { EventDetailPage } from "@/components/event-detail-page"
import { createClient } from "@/lib/supabase/server"
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

  // Schema.org Structured Data (JSON-LD) for Google Rich Results
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': event.title,
    'startDate': event.start_date,
    'endDate': event.end_date || event.start_date,
    'eventStatus': event.status === 'CANCELLED' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'location': {
      '@type': 'Place',
      'name': event.venue?.name || 'Lugar por confirmar',
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': event.venue?.address || 'Salta, Argentina',
        'addressLocality': 'Salta',
        'addressCountry': 'AR',
      },
    },
    'image': event.image_url ? [event.image_url] : ['https://www.quepintasalta.com.ar/og-image.png'],
    'description': event.short_description || event.description || '',
    'offers': {
      '@type': 'Offer',
      'url': event.ticket_url || `https://www.quepintasalta.com.ar/evento/${event.id}`,
      'price': event.price_min || 0,
      'priceCurrency': 'ARS',
      'availability': 'https://schema.org/InStock',
      'validFrom': event.created_at,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EventDetailPage 
        event={event} 
        isAdmin={isAdmin} 
        categories={categories} 
        isFavorite={isFavorite}
      />
    </>
  )
}
