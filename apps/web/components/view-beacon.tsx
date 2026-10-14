"use client"

import { useEffect, useRef } from "react"
import type { MetricOrigin } from "@/lib/metricas/links"

interface ViewBeaconProps {
  eventId: string
  origin: MetricOrigin
}

/**
 * Cuenta una vista de evento al montarse la ficha o el modal.
 *
 * Se manda desde el cliente (y no en el render del servidor) para que el
 * prefetch de `<Link>` no infle las vistas. No renderiza nada y nunca rompe
 * la página: cualquier error se ignora.
 */
export function ViewBeacon({ eventId, origin }: ViewBeaconProps) {
  const sentKey = useRef<string | null>(null)

  useEffect(() => {
    // Una sola vez por evento/origen (también frente al doble montaje de StrictMode).
    const key = `${eventId}|${origin}`
    if (sentKey.current === key) return
    sentKey.current = key

    try {
      const body = JSON.stringify({ eventId, origin })
      const queued =
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon("/api/metricas/vista", body)

      if (!queued) {
        void fetch("/api/metricas/vista", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      // Medir nunca debe romper la página.
    }
  }, [eventId, origin])

  return null
}
