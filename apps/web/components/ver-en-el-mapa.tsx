import Link from "next/link"
import { MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatSaltaDayKey } from "@/lib/date-format"
import { aCoordenada } from "@qps/core/mapa/pines"
import { coordenadasEnSalta } from "@qps/core/mapa/zona"
import type { Venue } from "@/lib/types"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { hrefLangDestino, rutaEn } from "@/lib/i18n/rutas"

interface VerEnElMapaProps {
  /** El lugar del evento (`null`/`undefined` si el evento no tiene uno asignado). */
  venue: Venue | null | undefined
  /** El inicio del evento: de acá sale el `dia` de Salta del link. */
  startDate: Date
  /**
   * Clases del botón, para calzar con los demás CTA del grupo donde se
   * inserta (la ficha y el modal interceptado usan anchos distintos). Por
   * defecto el mismo `flex-1` del modal.
   */
  className?: string
  /** Tamaño del botón: la ficha usa "lg", el modal el tamaño por defecto. */
  size?: "default" | "lg"
  /**
   * Idioma del texto del botón (por prop y no con `useTextos()`: este
   * componente no usa hooks). Por defecto, castellano.
   */
  idioma?: Idioma
}

/**
 * "Ver en el mapa" (R54, tarea 54-c): un link a `/mapa` con el lugar y el día
 * del evento ya elegidos. Server Component puro (sin `"use client"`, sin
 * hooks, sin estado): así se puede probar con `renderToStaticMarkup`, y
 * además la ficha y el modal no cargan MapLibre (es un `Link`, no un mapa).
 * Si el lugar no tiene coordenadas válidas dentro de Salta
 * (`coordenadasEnSalta`), no dibuja nada: ni un contenedor vacío.
 */
export function VerEnElMapa({ venue, startDate, className = "flex-1", size = "default", idioma = "es" }: VerEnElMapaProps) {
  const lat = aCoordenada(venue?.latitude)
  const lng = aCoordenada(venue?.longitude)
  if (!venue || !coordenadasEnSalta(lat, lng)) return null

  // El `dia` del link es el día de Salta, no el de la fecha cruda en UTC: un
  // evento a las 23:30 de Salta queda guardado con la fecha del día
  // siguiente en UTC, y el mapa tiene que abrir en el día que la gente
  // reconoce (el error ya se cometió dos veces en este repo).
  // Los dos valores van codificados, no solo el id: hoy `formatSaltaDayKey`
  // devuelve siempre `AAAA-MM-DD` y codificarlo no cambia nada, pero así el
  // armado de la URL no depende de esa garantía.
  const dia = formatSaltaDayKey(startDate)
  // En inglés, `/mapa` va a `/en/mapa` cuando exista (`rutaEn`); mientras
  // tanto queda en castellano y el link lo avisa con `hrefLang`.
  const rutaEs = `/mapa?cuando=fecha&dia=${encodeURIComponent(dia)}&lugar=${encodeURIComponent(venue.id)}`
  const href = rutaEn(idioma, rutaEs)

  return (
    <Button variant="outline" size={size} className={className} asChild>
      {/* El hrefLang se calcula sobre la ruta sin /en (rutaEs). */}
      <Link href={href} prefetch={false} hrefLang={hrefLangDestino(idioma, rutaEs)}>
        <MapPin className="mr-2 size-4" />
        {textosDe(idioma).ficha.verEnElMapa}
      </Link>
    </Button>
  )
}
