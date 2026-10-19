"use client"

// Fila de acciones (♥ Guardar / ✓ Voy / Compartir) y botones de "+ Seguir"
// para el modal de Buscar (R38-c; reescrito en la R47, tarea 47-c,
// QPS-197/QPS-199): ahí el evento llega ya armado en el cliente, sin las
// cantidades de asistencia ni el seguimiento. Este archivo las pide al
// servidor cada vez que el modal se abre.
//
// Dos componentes, cada uno con su propio `useEffect` + bandera de
// cancelación (mismo patrón que el `BotonesAsistenciaDiferidos` de antes de
// esta tarea), porque van en dos lugares distintos de `event-modal.tsx`: la
// fila debajo de "Comprar tickets" y los botones de Seguir junto al lugar.
// El gate de los dos es el mismo, `debeCargarAsistencia` (abierto + un
// `status` que muestra los botones): con flyers o películas (sin `status`)
// ninguno de los dos pide nada ni se dibuja.
//
// Diferencia clave con el comportamiento de antes: el ♥ (ahora parte de
// `FilaAccionesEvento`) SIEMPRE se dibuja, incluso mientras la asistencia
// todavía no cargó o el evento no tiene `status` (flyer/película) — antes
// toda la fila esperaba a `cantidadesAsistencia` y, sin eso, no se dibujaba
// nada. El `isFavorite` que ya trae `/buscar` (la lista de favoritos leída
// una sola vez) es el valor inicial del ♥, y se corrige con el `guardado`
// de `obtenerAsistencia` en cuanto esa lectura llega (remonta la fila con
// una `key` distinta para que tome el valor fresco, porque `FilaAccionesEvento`
// solo lee sus props iniciales una vez).
import { useEffect, useState } from "react"
import { obtenerAsistencia, type CantidadesAsistencia } from "@/lib/asistencia"
import { obtenerSeguimientoDeEvento } from "@/lib/actions/radar"
import { debenMostrarseBotonesAsistencia } from "@/lib/asistencia-visibilidad"
import { FilaAccionesEvento } from "@/components/fila-acciones-evento"
import { BotonSeguir } from "@/components/boton-seguir"
import { cn } from "@/lib/utils"

type SeguimientoEvento = Awaited<ReturnType<typeof obtenerSeguimientoDeEvento>>

/** `true` solo con el modal abierto y un evento con estado que muestra los botones. */
export function debeCargarAsistencia({ abierto, status }: { abierto: boolean; status?: string }): boolean {
  return abierto && status !== undefined && debenMostrarseBotonesAsistencia(status)
}

export interface BotonesAsistenciaDiferidosProps {
  eventId: string
  titulo: string
  /** Sin `status` (flyers de Instagram, películas) no se pide ni se muestra Voy, pero el ♥ sigue. */
  status?: string
  /** Si el modal está abierto: cerrado, no se pide nada. */
  abierto: boolean
  haySesion: boolean
  /** El ♥ que `/buscar` ya trae (lista de favoritos leída una sola vez): valor inicial, corregido cuando llega `obtenerAsistencia`. */
  isFavorite?: boolean
  /** El servidor confirmó un cambio de Guardado (QPS-158): también cuando cambia por un Voy. */
  onFavoriteChange?: (eventId: string, favorited: boolean) => void
  className?: string
}

export function BotonesAsistenciaDiferidos({
  eventId,
  titulo,
  status,
  abierto,
  haySesion,
  isFavorite = false,
  onFavoriteChange,
  className,
}: BotonesAsistenciaDiferidosProps) {
  // El resultado guarda de qué evento es: si el evento cambiara con el modal
  // abierto, nunca se dibujan las cantidades del anterior.
  const [resultado, setResultado] = useState<
    { eventId: string; respuesta: Awaited<ReturnType<typeof obtenerAsistencia>> } | null
  >(null)

  useEffect(() => {
    if (!debeCargarAsistencia({ abierto, status })) return

    let cancelado = false
    obtenerAsistencia(eventId)
      .then((respuesta) => {
        if (!cancelado) setResultado({ eventId, respuesta })
      })
      .catch((err) => {
        if (cancelado) return
        console.error("[BotonesAsistenciaDiferidos] no se pudo leer la asistencia", err)
      })

    return () => {
      // Cerrar el modal o cambiar de evento: se ignora la respuesta que
      // todavía no volvió y se descarta la anterior (cada apertura relee).
      cancelado = true
      setResultado(null)
    }
  }, [abierto, eventId, status])

  let guardadoInicial = isFavorite
  let voyInicial = false
  let cantidadesIniciales: CantidadesAsistencia = { voy: 0 }
  let mostrarVoy = false

  if (resultado !== null && resultado.eventId === eventId && resultado.respuesta.ok) {
    guardadoInicial = resultado.respuesta.guardado
    voyInicial = resultado.respuesta.propia === "voy"
    cantidadesIniciales = resultado.respuesta.cantidades
    mostrarVoy = true
  }

  return (
    <FilaAccionesEvento
      // Remonta cuando pasa de "sin datos" a "cargado" (o cambia de evento):
      // `FilaAccionesEvento` solo lee sus props *Inicial* una vez, así que
      // sin esto el ♥ se quedaría con el valor de `isFavorite` para siempre.
      key={`${eventId}-${mostrarVoy ? "cargado" : "inicial"}`}
      eventId={eventId}
      titulo={titulo}
      guardadoInicial={guardadoInicial}
      voyInicial={voyInicial}
      cantidadesIniciales={cantidadesIniciales}
      haySesion={haySesion}
      mostrarVoy={mostrarVoy}
      onGuardadoChange={onFavoriteChange ? (guardado) => onFavoriteChange(eventId, guardado) : undefined}
      className={className}
    />
  )
}

export interface BotonesSeguirDiferidosProps {
  eventId: string
  /** Sin `status` (flyers de Instagram, películas) no se pide ni se muestra nada. */
  status?: string
  abierto: boolean
  haySesion: boolean
  className?: string
}

/** Los botones de "+ Seguir" (lugar y, si hay, cuenta de Instagram) para el modal de Buscar. */
export function BotonesSeguirDiferidos({ eventId, status, abierto, haySesion, className }: BotonesSeguirDiferidosProps) {
  const [resultado, setResultado] = useState<{ eventId: string; seguimiento: SeguimientoEvento } | null>(null)

  useEffect(() => {
    if (!debeCargarAsistencia({ abierto, status })) return

    let cancelado = false
    obtenerSeguimientoDeEvento(eventId)
      .then((seguimiento) => {
        if (!cancelado) setResultado({ eventId, seguimiento })
      })
      .catch((err) => {
        if (cancelado) return
        console.error("[BotonesSeguirDiferidos] no se pudo leer el seguimiento", err)
      })

    return () => {
      cancelado = true
      setResultado(null)
    }
  }, [abierto, eventId, status])

  if (!debeCargarAsistencia({ abierto, status })) return null
  if (resultado === null || resultado.eventId !== eventId) return null

  const { lugar, cuenta } = resultado.seguimiento
  if (!lugar && !cuenta) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {lugar && (
        <BotonSeguir
          tipo="lugar"
          id={lugar.id}
          etiqueta={lugar.nombre}
          siguiendoInicial={lugar.siguiendo}
          haySesion={haySesion}
        />
      )}
      {cuenta && (
        <BotonSeguir
          tipo="cuenta"
          id={cuenta.id}
          etiqueta={cuenta.username}
          siguiendoInicial={cuenta.siguiendo}
          haySesion={haySesion}
        />
      )}
    </div>
  )
}
