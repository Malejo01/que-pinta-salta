/**
 * Q7-3 · Las partes del `Event` de schema.org que comparten la ficha del
 * evento (`app/evento/[id]/page.tsx`) y los `Event` anidados de la ficha del
 * lugar (`lib/seo/json-ld-lugar.ts`): la descripción, la imagen y la oferta.
 *
 * Search Console marcaba los `Event` de /lugar/<slug> sin `description`,
 * `offers` ni `image`. Con estas funciones los dos lugares salen con la misma
 * regla, y ninguno puede quedar sin esos tres campos.
 *
 * Puro: sin red ni base.
 */
import type { NodoJsonLd } from './json-ld'
import { IMAGEN_OG_POR_DEFECTO, urlAbsoluta } from './sitio'

export { textosJsonLdEvento } from './json-ld-evento-idioma'

/**
 * `image` del `Event`: la del evento (absoluta) o, si no tiene, la imagen por
 * defecto del sitio. Siempre una lista con un elemento.
 */
export function imagenJsonLdEvento(imagen: string | null | undefined): string[] {
  const propia = imagen?.trim()
  return [urlAbsoluta(propia || IMAGEN_OG_POR_DEFECTO.url)]
}

export interface DatosOfertaEvento {
  is_free?: boolean | null
  price_min?: number | null
  ticket_url?: string | null
  created_at?: string | null
}

/**
 * `offers` del `Event`, con el criterio de precio de la ficha del evento (B2):
 *   - gratis: `price: 0` en ARS;
 *   - pago con precio (`price_min` > 0): ese precio en ARS;
 *   - pago sin precio (o `price_min` 0, que el sitio muestra «A confirmar»):
 *     sin `price` ni `priceCurrency` (para Google, 0 es «gratis»).
 * `url` es la de la entrada si hay, si no la de la ficha. Un evento
 * cancelado va como agotado.
 */
export function ofertaJsonLdEvento(
  evento: DatosOfertaEvento,
  { urlFicha, cancelado = false }: { urlFicha: string; cancelado?: boolean }
): NodoJsonLd {
  return {
    '@type': 'Offer',
    name: evento.is_free ? 'Entrada libre y gratuita' : 'Entrada',
    url: evento.ticket_url || urlFicha,
    ...(evento.is_free
      ? { price: 0, priceCurrency: 'ARS' }
      : typeof evento.price_min === 'number' && evento.price_min > 0
        ? { price: evento.price_min, priceCurrency: 'ARS' }
        : {}),
    availability: cancelado ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
    ...(evento.created_at && { validFrom: evento.created_at }),
  }
}
