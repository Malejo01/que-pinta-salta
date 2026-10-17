"use client"

// "Voy" / "Me interesa" para el modal de Buscar (R38-c): ahí el evento llega
// ya armado en el cliente, sin las cantidades. Este componente las pide al
// servidor (`obtenerAsistencia`) cada vez que el modal se abre, y dibuja los
// botones de siempre (`BotonesAsistencia`). El gate de estado es el mismo de
// la ficha (`debenMostrarseBotonesAsistencia`), nunca una copia.
//
// Mientras carga, o si la lectura falla, no dibuja nada: así no aparece un 0
// que después salta.
import { useEffect, useState } from "react"
import { obtenerAsistencia, type ResultadoAsistencia } from "@/lib/asistencia"
import { debenMostrarseBotonesAsistencia } from "@/lib/asistencia-visibilidad"
import { BotonesAsistencia } from "@/components/botones-asistencia"

export interface BotonesAsistenciaDiferidosProps {
  eventId: string
  /** Sin `status` (flyers de Instagram, películas) no se muestra nada. */
  status?: string
  /** Si el modal está abierto: cerrado, no se pide nada. */
  abierto: boolean
  haySesion: boolean
  className?: string
}

/** `true` solo con el modal abierto y un evento con estado que muestra los botones. */
export function debeCargarAsistencia({ abierto, status }: { abierto: boolean; status?: string }): boolean {
  return abierto && status !== undefined && debenMostrarseBotonesAsistencia(status)
}

export function BotonesAsistenciaDiferidos({
  eventId,
  status,
  abierto,
  haySesion,
  className,
}: BotonesAsistenciaDiferidosProps) {
  // El resultado guarda de qué evento es: si el evento cambiara con el modal
  // abierto, nunca se dibujan las cantidades del anterior.
  const [resultado, setResultado] = useState<{ eventId: string; respuesta: ResultadoAsistencia } | null>(null)

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

  if (!debeCargarAsistencia({ abierto, status })) return null
  if (resultado === null || resultado.eventId !== eventId || !resultado.respuesta.ok) return null
  const { cantidades, propia } = resultado.respuesta

  return (
    <BotonesAsistencia
      key={eventId}
      eventId={eventId}
      cantidadesIniciales={cantidades}
      marcaInicial={propia}
      haySesion={haySesion}
      className={className}
    />
  )
}
