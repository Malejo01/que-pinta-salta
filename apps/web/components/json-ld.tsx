import { serializarJsonLd, type NodoJsonLd } from "@/lib/seo/json-ld"

/**
 * `<script type="application/ld+json">` con los datos estructurados de la
 * página (B2). Componente de servidor: no tiene estado, y así el JSON llega
 * en el HTML y no en el payload del cliente.
 */
export function JsonLd({ data }: { data: NodoJsonLd | NodoJsonLd[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarJsonLd(data) }} />
}
