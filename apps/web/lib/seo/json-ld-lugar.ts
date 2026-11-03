/**
 * Q5-5 · JSON-LD de la ficha de un lugar: `EventVenue` (o `Playground` /
 * `Place` para un lugar permanente para chicos) con su dirección, geo y la
 * lista de sus próximos `Event` (cada uno con su `@id`, el mismo que usa la
 * ficha del evento). Puro.
 */
import type { NodoJsonLd } from '@/lib/seo/json-ld'
import { SITE_URL } from '@/lib/seo/sitio'
import type { EventoDeLugar } from '@qps/core/lugares/ficha'
import type { LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'
import { formatSaltaSchemaDate } from '@/lib/date-format'

export function lugarJsonLd(d: {
  venue: { nombre: string; direccion: string; slug: string; lat: number | null; lng: number | null }
  url: string
  proximos: readonly EventoDeLugar[]
  permanente: LugarChicosMapa | null
  idioma: 'es' | 'en'
}): NodoJsonLd {
  const id = `${SITE_URL}/lugar/${d.venue.slug}`
  const tipo = d.permanente ? (d.permanente.tipo === 'plaza_juegos' ? 'Playground' : 'Place') : 'EventVenue'
  return {
    '@context': 'https://schema.org',
    '@type': tipo,
    '@id': id,
    url: d.url,
    name: d.venue.nombre,
    address: {
      '@type': 'PostalAddress',
      streetAddress: d.venue.direccion,
      addressLocality: 'Salta',
      addressRegion: 'Salta',
      addressCountry: 'AR',
    },
    ...(d.venue.lat !== null && d.venue.lng !== null && {
      geo: { '@type': 'GeoCoordinates', latitude: d.venue.lat, longitude: d.venue.lng },
    }),
    ...(d.permanente && {
      isAccessibleForFree: d.permanente.acceso === 'gratis',
      ...(d.permanente.descripcion && { description: d.permanente.descripcion }),
    }),
    ...(d.proximos.length > 0 && {
      event: d.proximos.map((e) => ({
        '@type': 'Event',
        '@id': `${SITE_URL}/evento/${e.id}`,
        url: `${SITE_URL}${d.idioma === 'en' ? '/en' : ''}/evento/${e.id}`,
        name: e.titulo,
        startDate: formatSaltaSchemaDate(e.inicio),
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: { '@id': id },
        ...(e.gratis && { isAccessibleForFree: true }),
      })),
    }),
  }
}
