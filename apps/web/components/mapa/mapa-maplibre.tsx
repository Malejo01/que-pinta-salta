"use client"

import { useEffect, useId, useRef } from "react"
import { LngLatBounds, Map as MapaDeMapLibre, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useTheme } from "@/components/theme-provider"
import { CENTRO_SALTA_CAPITAL } from "@qps/core/mapa/zona"
import { pinesAGeoJson } from "@qps/core/mapa/pines"
import { estiloSegunTema } from "@qps/core/mapa/estilos"
import type { PropsMapa } from "./mapa-diferido"
import { TEXTOS_ES } from "./textos-maplibre"

// El único archivo del sitio que importa `maplibre-gl` (y su CSS). Solo se
// carga con `import()` desde `mapa-diferido.tsx`.
//
// La atribución de OpenFreeMap / OpenStreetMap la dibuja el control de
// atribución de MapLibre, que sale del propio estilo: NO se apaga nunca
// (compacto vale). Los datos de OpenStreetMap son ODbL.
//
// Nada de HTML en el mapa: no hay ventanas emergentes con HTML. El detalle de un
// lugar es la lista de la página (React), así un título scrapeado no puede
// inyectar nada. Las propiedades de cada pin son solo `venueId` y `cantidad`.

const FUENTE = "lugares"
const CAPA_PINES = "lugares-pines"
/** Círculo invisible, más grande que el pin: el área de toque (alcanza el dedo). */
const CAPA_TOQUE = "lugares-toque"
const CAPA_SELECCION = "lugares-seleccion"
const ZOOM_INICIAL = 13
const ZOOM_AL_SELECCIONAR = 15
/** Respaldo si no se puede leer `--primary` (rojo del tema claro). */
const COLOR_RESPALDO = "rgb(168, 29, 24)"

/** Transiciones de cámara sin movimiento si la persona lo pidió en su sistema. */
function sinMovimiento(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * El color de la variable CSS `--primary`, leído una vez por estilo. El sitio la
 * define en `oklch(...)`, que MapLibre no siempre entiende: se lo pasa por un
 * canvas para que el navegador lo convierta a `rgb(...)`.
 */
function colorPrimario(): string {
  try {
    const crudo = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()
    if (!crudo) return COLOR_RESPALDO
    const lienzo = document.createElement("canvas")
    lienzo.width = 1
    lienzo.height = 1
    const contexto = lienzo.getContext("2d", { willReadFrequently: true })
    if (!contexto) return COLOR_RESPALDO
    const centinela = "#010203"
    contexto.fillStyle = centinela
    contexto.fillStyle = crudo
    // Si el navegador no entendió el color, el fillStyle quedó en el centinela.
    if (contexto.fillStyle === centinela) return COLOR_RESPALDO
    contexto.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = contexto.getImageData(0, 0, 1, 1).data
    return a === 0 ? COLOR_RESPALDO : `rgb(${r}, ${g}, ${b})`
  } catch {
    return COLOR_RESPALDO
  }
}

/** Filtro de la capa de selección: solo el pin del `venueId` (o ninguno). */
function filtroSeleccion(seleccionado: string | null) {
  return ["==", ["get", "venueId"], seleccionado ?? ""] as ["==", ["get", string], string]
}

/** Agrega la fuente y las capas si faltan (después de cada carga de estilo). */
function agregarFuenteYCapas(mapa: MapaDeMapLibre, pines: PropsMapa["pines"], seleccionado: string | null) {
  if (!mapa.getSource(FUENTE)) {
    mapa.addSource(FUENTE, { type: "geojson", data: pinesAGeoJson(pines) })
  }
  const color = colorPrimario()
  if (!mapa.getLayer(CAPA_PINES)) {
    mapa.addLayer({
      id: CAPA_PINES,
      type: "circle",
      source: FUENTE,
      paint: {
        "circle-color": color,
        // Más eventos, más grande el círculo.
        "circle-radius": ["interpolate", ["linear"], ["get", "cantidad"], 1, 9, 10, 16],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    })
  }
  if (!mapa.getLayer(CAPA_TOQUE)) {
    mapa.addLayer({
      id: CAPA_TOQUE,
      type: "circle",
      source: FUENTE,
      paint: {
        "circle-color": color,
        "circle-opacity": 0,
        "circle-radius": 22,
        "circle-stroke-width": 0,
      },
    })
  }
  if (!mapa.getLayer(CAPA_SELECCION)) {
    mapa.addLayer({
      id: CAPA_SELECCION,
      type: "circle",
      source: FUENTE,
      filter: filtroSeleccion(seleccionado),
      paint: {
        "circle-color": color,
        "circle-opacity": 0,
        "circle-radius": ["interpolate", ["linear"], ["get", "cantidad"], 1, 15, 10, 22],
        "circle-stroke-width": 3,
        "circle-stroke-color": color,
      },
    })
  }
}

/** Encuadra todos los pines (o centra el único). Sin pines, deja la vista donde está. */
function encuadrar(mapa: MapaDeMapLibre, pines: PropsMapa["pines"]) {
  if (pines.length === 0) return
  if (pines.length === 1) {
    mapa.jumpTo({ center: [pines[0].lng, pines[0].lat], zoom: ZOOM_AL_SELECCIONAR })
    return
  }
  const limites = new LngLatBounds()
  for (const pin of pines) limites.extend([pin.lng, pin.lat])
  mapa.fitBounds(limites, { padding: 48, maxZoom: ZOOM_AL_SELECCIONAR, duration: 0 })
}

/**
 * El mapa de `/mapa`: OpenFreeMap (estilo claro u oscuro según el tema) con un
 * círculo por lugar. Tocar un pin selecciona el lugar; el detalle lo muestra
 * la lista de la página.
 */
export default function MapaMaplibre({ pines, seleccionado, centrar, onSeleccionar, onError }: PropsMapa) {
  const { resolvedTheme } = useTheme()
  const idAyuda = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<MapaDeMapLibre | null>(null)
  const estiloAplicado = useRef<string | null>(null)

  // Lo último que llegó por props, para los manejadores del mapa (que se
  // registran una sola vez y no tienen que quedar con valores viejos).
  const ultimo = useRef({ pines, seleccionado, onSeleccionar, onError })
  useEffect(() => {
    ultimo.current = { pines, seleccionado, onSeleccionar, onError }
  })
  const temaInicial = useRef(resolvedTheme)

  // Crear el mapa al montar, destruirlo al desmontar.
  useEffect(() => {
    const elemento = contenedor.current
    if (!elemento) return

    let mapa: MapaDeMapLibre
    try {
      const estilo = estiloSegunTema(temaInicial.current)
      estiloAplicado.current = estilo
      mapa = new MapaDeMapLibre({
        container: elemento,
        style: estilo,
        center: [CENTRO_SALTA_CAPITAL.lng, CENTRO_SALTA_CAPITAL.lat],
        zoom: ZOOM_INICIAL,
        attributionControl: { compact: true },
        // Un dedo sobre el mapa mueve la página; con dos dedos (o Ctrl/⌘ + scroll) se mueve el mapa.
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

    let estiloCargado = false
    mapa.on("style.load", () => {
      estiloCargado = true
      agregarFuenteYCapas(mapa, ultimo.current.pines, ultimo.current.seleccionado)
    })
    // Los errores de un tile suelto no tumban el mapa: solo cuenta que el estilo no cargue.
    mapa.on("error", () => {
      if (!estiloCargado) ultimo.current.onError()
    })
    // La capa del canvas no recibe teclado: la alternativa para teclado y lector
    // de pantalla es el botón "Ver en el mapa" de cada lugar en la lista.
    mapa.on("click", CAPA_TOQUE, (evento: MapLayerMouseEvent) => {
      const venueId = evento.features?.[0]?.properties?.venueId
      if (typeof venueId === "string") ultimo.current.onSeleccionar(venueId)
    })
    mapa.on("mouseenter", CAPA_TOQUE, () => {
      mapa.getCanvas().style.cursor = "pointer"
    })
    mapa.on("mouseleave", CAPA_TOQUE, () => {
      mapa.getCanvas().style.cursor = ""
    })

    return () => {
      mapa.remove()
      mapaRef.current = null
      estiloAplicado.current = null
    }
  }, [])

  // Cambió el tema: otro estilo, y al cargarlo `style.load` vuelve a poner fuente y capas.
  useEffect(() => {
    const mapa = mapaRef.current
    const estilo = estiloSegunTema(resolvedTheme)
    if (!mapa || estiloAplicado.current === estilo) return
    estiloAplicado.current = estilo
    mapa.setStyle(estilo)
  }, [resolvedTheme])

  // Cambiaron los pines (otro filtro): nuevos datos y nuevo encuadre.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    const fuente = mapa.getSource(FUENTE) as GeoJSONSource | undefined
    fuente?.setData(pinesAGeoJson(pines))
    if (!seleccionado) encuadrar(mapa, pines)
    // El encuadre solo depende de los pines: `seleccionado` no tiene que reencuadrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pines])

  // Cambió el lugar seleccionado: se resalta su pin (la cámara no se mueve acá).
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    if (mapa.getLayer(CAPA_SELECCION)) mapa.setFilter(CAPA_SELECCION, filtroSeleccion(seleccionado))
  }, [seleccionado])

  // Llegó una orden de centrar (cada orden trae un `n` nuevo, aunque el lugar sea el mismo).
  // Si llega antes de que cargue el mapa, este efecto corre igual al montar.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !centrar) return
    const pin = ultimo.current.pines.find((candidato) => candidato.venueId === centrar.venueId)
    if (!pin) return
    mapa.easeTo({
      center: [pin.lng, pin.lat],
      zoom: Math.max(mapa.getZoom(), ZOOM_AL_SELECCIONAR),
      duration: sinMovimiento() ? 0 : 600,
    })
  }, [centrar])

  return (
    <div className="size-full">
      <div
        ref={contenedor}
        role="region"
        aria-label="Mapa de lugares con eventos"
        aria-describedby={idAyuda}
        className="size-full"
      />
      <p id={idAyuda} className="sr-only">
        La lista de lugares de esta página tiene los mismos lugares y eventos que el mapa.
      </p>
    </div>
  )
}
