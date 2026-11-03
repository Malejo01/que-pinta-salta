"use client"

/**
 * Q5-5 · El mapa chico de la ficha de un lugar: el mismo mapa diferido de
 * /mapa (MapLibre se carga solo cuando el bloque entra en pantalla), con un
 * solo pin. Si es un lugar permanente para chicos, con la casita de la capa.
 * La alternativa accesible es la dirección y «Cómo llegar», que están arriba.
 */
import { MapaDiferido } from "@/components/mapa/mapa-diferido"
import type { LugarChicosMapa } from "@qps/core/mapa/lugares-chicos"
import type { Idioma } from "@/lib/i18n/idiomas"

const SIN_ACCION = () => {}

export function MapaChicoLugar({
  venueId,
  nombre,
  direccion,
  lat,
  lng,
  permanente,
  idioma,
}: {
  venueId: string
  nombre: string
  direccion: string
  lat: number
  lng: number
  permanente: LugarChicosMapa | null
  idioma: Idioma
}) {
  return (
    <MapaDiferido
      pines={permanente ? [] : [{ venueId, nombre, direccion, lat, lng, eventos: [] }]}
      lugaresChicos={permanente ? [permanente] : undefined}
      seleccionado={null}
      centrar={{ venueId, n: 0 }}
      onSeleccionar={SIN_ACCION}
      className="h-56 sm:h-72"
      idioma={idioma}
    />
  )
}
