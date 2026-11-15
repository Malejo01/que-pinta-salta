/**
 * Q5-5 · JSON-LD de la ficha de un lugar: `EventVenue` (o `Playground` /
 * `Place` para un lugar permanente para chicos) con su dirección, geo y la
 * lista de sus próximos `Event` (cada uno con su `@id`, el mismo que usa la
 * ficha del evento). Q7-3: cada `Event` lleva `description`, `image` y
 * `offers`, con las mismas funciones que la ficha del evento. Puro.
 */
import type { NodoJsonLd } from '@/lib/seo/json-ld'
import { SITE_URL } from '@/lib/seo/sitio'
import type { EventoDeLugar } from '@qps/core/lugares/ficha'
import type { LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'
import { formatSaltaSchemaDate } from '@/lib/date-format'
import { descripcionParaMeta } from '@/lib/seo/descripcion'
import { imagenJsonLdEvento, ofertaJsonLdEvento, textosJsonLdEvento } from '@/lib/seo/json-ld-evento'

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
      event: d.proximos.map((e) => eventoDeLugarJsonLd(e, { idLugar: id, venue: d.venue, idioma: d.idioma })),
    }),
  }
}

/** Largo máximo de la `description` de cada `Event` anidado: la ficha del lugar lista hasta 30. */
export const MAX_DESCRIPCION_EVENTO_DE_LUGAR = 300

/**
 * Q7-3: un `Event` anidado de la ficha del lugar, con `description`, `image`
 * y `offers` (Search Console los marcaba como faltantes). Usa las mismas
 * funciones que la ficha del evento: la descripción sale de
 * `textosJsonLdEvento` (con su respaldo «<título> en Salta Capital.», así que
 * nunca queda vacía), recortada a `MAX_DESCRIPCION_EVENTO_DE_LUGAR`; la imagen,
 * la del evento o `/og-image.png`; la oferta, con el criterio de precio de la
 * ficha (gratis = 0; pago sin precio, sin `price`).
 *
 * `location` lleva el `@id` del lugar y también su nombre y dirección, para
 * que el `Event` se entienda solo aunque se lea fuera del árbol.
 */
export function eventoDeLugarJsonLd(
  e: EventoDeLugar,
  {
    idLugar,
    venue,
    idioma,
  }: { idLugar: string; venue: { nombre: string; direccion: string }; idioma: 'es' | 'en' }
): NodoJsonLd {
  const urlFicha = `${SITE_URL}${idioma === 'en' ? '/en' : ''}/evento/${e.id}`
  const textos = textosJsonLdEvento(
    {
      title: e.titulo,
      title_en: e.tituloEn,
      description: e.descripcion,
      description_en: e.descripcionEn,
      short_description: e.descripcionCorta,
    },
    idioma
  )
  const descripcion = descripcionParaMeta(textos.description, MAX_DESCRIPCION_EVENTO_DE_LUGAR) ?? `${e.titulo} en Salta Capital.`
  return {
    '@type': 'Event',
    '@id': `${SITE_URL}/evento/${e.id}`,
    url: urlFicha,
    name: textos.name,
    description: descripcion,
    inLanguage: textos.inLanguage,
    startDate: formatSaltaSchemaDate(e.inicio),
    ...(e.fin && { endDate: formatSaltaSchemaDate(e.fin) }),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      '@id': idLugar,
      name: venue.nombre,
      address: {
        '@type': 'PostalAddress',
        streetAddress: venue.direccion || 'Salta, Argentina',
        addressLocality: 'Salta',
        addressRegion: 'Salta',
        addressCountry: 'AR',
      },
    },
    image: imagenJsonLdEvento(e.imagen),
    offers: ofertaJsonLdEvento(
      { is_free: e.gratis, price_min: e.precioMin, ticket_url: e.enlaceEntradas, created_at: e.creado },
      { urlFicha }
    ),
    isAccessibleForFree: e.gratis,
  }
}
