"use client"

import { useEffect, useRef, useState, type ComponentType } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import type { PinLugar } from "@qps/core/mapa/pines"

export interface OrdenCentrar {
  venueId: string
  n: number
}

/** Lo que recibe el mapa. `mapa-maplibre.tsx` importa este tipo (solo el tipo: no se carga nada). */
export interface PropsMapa {
  pines: PinLugar[]
  /** El `venueId` seleccionado, o `null`. */
  seleccionado: string | null
  /**
   * Orden de centrar la cámara en un lugar. `n` cambia en cada orden, así que
   * pedir el mismo lugar dos veces la repite (el `venueId` solo no alcanzaría).
   */
  centrar: OrdenCentrar | null
  /** Se tocó un pin. */
  onSeleccionar: (venueId: string) => void
  /** El mapa no pudo arrancar (WebGL apagado, estilo que no carga). */
  onError: () => void
}

interface MapaDiferidoProps extends Omit<PropsMapa, "onError"> {
  /** Alto fijo del contenedor (sin salto de diseño): las clases las pone quien lo usa. */
  className?: string
}

/** Corre `tarea` cuando el navegador está libre (`requestIdleCallback`), o a más tardar en 1 ms con el respaldo de `setTimeout`. Devuelve cómo cancelarla. */
function cuandoEstaLibre(tarea: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(tarea, { timeout: 2000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(tarea, 1)
  return () => window.clearTimeout(id)
}

/**
 * El mapa, cargado de forma diferida: `maplibre-gl` pesa mucho y la página ya
 * muestra la lista (que es lo que importa para el LCP). El módulo
 * `mapa-maplibre` se pide con `import()` recién cuando el contenedor entra en
 * pantalla (con 200 px de margen) y el navegador está libre. Ninguna otra
 * parte del sitio lo importa de forma estática.
 *
 * Si el `import()` falla, o el mapa avisa un error, queda el mensaje de abajo
 * y la lista sigue funcionando.
 */
export function MapaDiferido({ pines, seleccionado, centrar, onSeleccionar, className = "" }: MapaDiferidoProps) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [Mapa, setMapa] = useState<ComponentType<PropsMapa> | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    const elemento = contenedor.current
    if (!elemento) return

    let cancelado = false
    let cancelarEspera: () => void = () => {}

    const cargar = () => {
      cancelarEspera = cuandoEstaLibre(() => {
        // Primero la URL del worker (ver maplibre-worker.ts), después el mapa.
        import("./maplibre-worker")
          .then(() => import("./mapa-maplibre"))
          .then((modulo) => {
            if (!cancelado) setMapa(() => modulo.default)
          })
          .catch(() => {
            if (!cancelado) setFallo(true)
          })
      })
    }

    if (typeof IntersectionObserver === "undefined") {
      cargar()
      return () => {
        cancelado = true
        cancelarEspera()
      }
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          observador.disconnect()
          cargar()
        }
      },
      { rootMargin: "200px" }
    )
    observador.observe(elemento)

    return () => {
      cancelado = true
      observador.disconnect()
      cancelarEspera()
    }
  }, [])

  return (
    <div
      ref={contenedor}
      className={`relative overflow-hidden rounded-2xl border border-border bg-muted ${className}`}
    >
      {fallo ? (
        <div role="status" className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No pudimos cargar el mapa. La lista tiene los mismos lugares.
        </div>
      ) : Mapa ? (
        <Mapa pines={pines} seleccionado={seleccionado} centrar={centrar} onSeleccionar={onSeleccionar} onError={() => setFallo(true)} />
      ) : (
        <Skeleton className="size-full rounded-none" aria-hidden="true" />
      )}
    </div>
  )
}
