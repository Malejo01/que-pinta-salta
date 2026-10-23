"use client"

import { useEffect, useId, useRef } from "react"
import { Map as MapaDeMapLibre, Marker, NavigationControl } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useTheme } from "@/components/theme-provider"
import { estiloSegunTema } from "@qps/core/mapa/estilos"
import type { PropsMapaPin } from "@/components/admin/lugar-mapa-ubicar"
import { TEXTOS_ES } from "./textos-maplibre"

// El segundo (y último) archivo del sitio que importa `maplibre-gl` y su CSS.
// Solo se carga con `import()` desde `components/admin/lugar-mapa-ubicar.tsx`.
//
// Mismo estilo que `/mapa` (OpenFreeMap según el tema). La atribución del
// estilo no se apaga nunca (compacta vale). Sin ventanas emergentes ni HTML de
// datos externos: solo un pin arrastrable.

const ZOOM_SIN_COORDENADAS = 13

function sinMovimiento(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function redondear(valor: number): number {
  return Math.round(valor * 1e6) / 1e6
}

/** El mapa del admin para ubicar un lugar: un pin que se arrastra y avisa dónde quedó. */
export default function MapaPinMaplibre({ posicion, zoom = ZOOM_SIN_COORDENADAS, onMover, onError }: PropsMapaPin) {
  const { resolvedTheme } = useTheme()
  const idAyuda = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<MapaDeMapLibre | null>(null)
  const pinRef = useRef<Marker | null>(null)
  const estiloAplicado = useRef<string | null>(null)

  const ultimo = useRef({ posicion, onMover, onError })
  useEffect(() => {
    ultimo.current = { posicion, onMover, onError }
  })
  const inicial = useRef({ posicion, zoom, tema: resolvedTheme })

  useEffect(() => {
    const elemento = contenedor.current
    if (!elemento) return

    let mapa: MapaDeMapLibre
    try {
      const estilo = estiloSegunTema(inicial.current.tema)
      estiloAplicado.current = estilo
      mapa = new MapaDeMapLibre({
        container: elemento,
        style: estilo,
        center: [inicial.current.posicion.lng, inicial.current.posicion.lat],
        zoom: inicial.current.zoom,
        attributionControl: { compact: true },
        cooperativeGestures: true,
        locale: TEXTOS_ES,
      })
    } catch {
      // WebGL apagado o no disponible.
      ultimo.current.onError()
      return
    }
    mapaRef.current = mapa
    mapa.addControl(new NavigationControl({ showCompass: false }), "top-right")

    const pin = new Marker({ draggable: true })
      .setLngLat([inicial.current.posicion.lng, inicial.current.posicion.lat])
      .addTo(mapa)
    pinRef.current = pin
    pin.on("dragend", () => {
      const { lat, lng } = pin.getLngLat()
      ultimo.current.onMover({ lat: redondear(lat), lng: redondear(lng) })
    })

    let estiloCargado = false
    mapa.on("style.load", () => {
      estiloCargado = true
    })
    // Los errores de un tile suelto no tumban el mapa: solo cuenta que el estilo no cargue.
    mapa.on("error", () => {
      if (!estiloCargado) ultimo.current.onError()
    })

    return () => {
      pin.remove()
      mapa.remove()
      pinRef.current = null
      mapaRef.current = null
      estiloAplicado.current = null
    }
  }, [])

  // Cambió el tema: otro estilo.
  useEffect(() => {
    const mapa = mapaRef.current
    const estilo = estiloSegunTema(resolvedTheme)
    if (!mapa || estiloAplicado.current === estilo) return
    estiloAplicado.current = estilo
    mapa.setStyle(estilo)
  }, [resolvedTheme])

  // La posición cambió desde afuera (p. ej. el buscador de dirección): mover el pin y centrar.
  useEffect(() => {
    const mapa = mapaRef.current
    const pin = pinRef.current
    if (!mapa || !pin) return
    const actual = pin.getLngLat()
    if (redondear(actual.lat) === posicion.lat && redondear(actual.lng) === posicion.lng) return
    pin.setLngLat([posicion.lng, posicion.lat])
    mapa.easeTo({ center: [posicion.lng, posicion.lat], duration: sinMovimiento() ? 0 : 600 })
  }, [posicion])

  return (
    <div className="size-full">
      <div
        ref={contenedor}
        role="region"
        aria-label="Mapa para ubicar el lugar: arrastrá el pin a la ubicación correcta"
        aria-describedby={idAyuda}
        className="size-full"
      />
      <p id={idAyuda} className="sr-only">
        También podés pegar las coordenadas en el campo de abajo, sin usar el mapa.
      </p>
    </div>
  )
}
