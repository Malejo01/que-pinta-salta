'use client'

/**
 * Botones «Confirmar» y «Descartar» de la ubicación que sugirió Nominatim
 * para un lugar, en la pestaña «Sin ubicación» de /admin/lugares (Q5-16,
 * decisión nº7). Llama a `confirmarSugerenciaUbicacion` /
 * `descartarSugerenciaUbicacion` de lib/admin/lugares-actions.ts. Mismo
 * patrón que `LugarUbicacionForm` (transición, mensaje en vivo, refresh).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { confirmarSugerenciaUbicacion, descartarSugerenciaUbicacion } from '@/lib/admin/lugares-actions'

export interface LugarSugerenciaAccionesProps {
  venueId: string
  nombre: string
}

export function LugarSugerenciaAcciones({ venueId, nombre }: LugarSugerenciaAccionesProps) {
  const router = useRouter()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleConfirmar = () => {
    if (isPending) return
    setMensaje(null)
    startTransition(async () => {
      const res = await confirmarSugerenciaUbicacion(venueId)
      if (res.ok) {
        setMensaje('Ubicación confirmada')
        router.refresh()
      } else {
        setMensaje(res.error)
      }
    })
  }

  // Confirmación antes de descartar (mismo patrón que «Quitar ubicación»):
  // descartada, la corrida programada no vuelve a mirar el lugar hasta 30 días después.
  const handleDescartar = () => {
    if (isPending) return
    if (!window.confirm(`¿Descartar la ubicación sugerida para ${nombre}?`)) return
    setMensaje(null)
    startTransition(async () => {
      const res = await descartarSugerenciaUbicacion(venueId)
      if (res.ok) {
        setMensaje('Sugerencia descartada')
        router.refresh()
      } else {
        setMensaje(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleConfirmar}
          disabled={isPending}
          aria-label={`Confirmar la ubicación sugerida para ${nombre}`}
          className="h-11 min-h-11 flex-1 px-4 sm:flex-none"
        >
          Confirmar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleDescartar}
          disabled={isPending}
          aria-label={`Descartar la ubicación sugerida para ${nombre}`}
          className="h-11 min-h-11 flex-1 px-4 sm:flex-none"
        >
          Descartar
        </Button>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {mensaje}
      </p>
    </div>
  )
}
