import Link from "next/link"
import { MapPin } from "lucide-react"
import { formatEventDayMonth, formatEventTime } from "@/lib/date-format"
import type { PinLugar } from "@qps/core/mapa/pines"

// Sin "use client": no usa estado, efectos ni APIs del navegador. Lo importa
// `app/mapa/mapa-contenido.tsx` (que sí es cliente) y le llega la función
// `onVerEnElMapa` por props; el componente solo la llama desde un `onClick`.

/** El id del bloque de un lugar en la lista: `mapa-contenido` lo usa para llevarlo a la vista. */
export function idBloqueLugar(venueId: string): string {
  return `lugar-${venueId}`
}

interface ListaLugaresProps {
  pines: PinLugar[]
  /** El `venueId` resaltado (el que se tocó en el mapa o con "Ver en el mapa"), o `null`. */
  seleccionado: string | null
  /** "Ver en el mapa" de un lugar: selecciona el lugar y centra el mapa en su pin. */
  onVerEnElMapa: (venueId: string) => void
  /**
   * `false` si el mapa no cargó: "Ver en el mapa" llevaría al aviso de error,
   * así que no se muestra. Sin JavaScript tampoco (lo saca el `<noscript>`).
   */
  mapaDisponible?: boolean
}

/** Sin JavaScript "Ver en el mapa" no hace nada: se esconde (el mapa tampoco está). */
const SIN_JS_SIN_VER_EN_EL_MAPA = "[data-ver-en-el-mapa]{display:none}"

/**
 * La lista de lugares con sus eventos. Es la alternativa accesible al mapa y
 * funciona aunque `maplibre-gl` no cargue. Los títulos y nombres son texto
 * scrapeado: se dibujan siempre como texto de React, nunca como HTML.
 */
export function ListaLugares({ pines, seleccionado, onVerEnElMapa, mapaDisponible = true }: ListaLugaresProps) {
  return (
    <>
      <noscript>
        <style>{SIN_JS_SIN_VER_EN_EL_MAPA}</style>
      </noscript>
      <ul className="space-y-3">
        {pines.map((pin) => {
          const esSeleccionado = pin.venueId === seleccionado
          return (
            <li
              key={pin.venueId}
              id={idBloqueLugar(pin.venueId)}
              aria-current={esSeleccionado ? "true" : undefined}
              className={`scroll-mt-24 scroll-mb-24 rounded-2xl border bg-card p-4 transition-colors ${
                esSeleccionado ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{pin.nombre}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{pin.direccion}</p>
                </div>
                {mapaDisponible ? (
                  <button
                    type="button"
                    data-ver-en-el-mapa=""
                    onClick={() => onVerEnElMapa(pin.venueId)}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <MapPin className="size-4" aria-hidden="true" />
                    <span>
                      Ver en el mapa<span className="sr-only"> {pin.nombre}</span>
                    </span>
                  </button>
                ) : null}
              </div>

              <ul className="mt-3 divide-y divide-border border-t border-border">
                {pin.eventos.map((evento) => (
                  <li key={evento.id} className="flex items-baseline gap-3 py-2">
                    <time dateTime={evento.inicio} className="min-w-28 shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                      {formatEventDayMonth(evento.inicio)} · {formatEventTime(evento.inicio)}
                    </time>
                    <Link
                      href={`/evento/${evento.id}`}
                      className="min-w-0 rounded-sm text-sm font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {evento.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </>
  )
}
