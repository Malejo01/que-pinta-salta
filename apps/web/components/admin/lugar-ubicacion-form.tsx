'use client'

/**
 * Formulario de ubicación a mano de un lugar, en /admin/lugares (R53, tarea
 * 53-c): pegar coordenadas o un link de OpenStreetMap, guardarlas, o quitar
 * la ubicación que tenga. Llama a las dos server actions de
 * lib/admin/lugares-actions.ts.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { guardarUbicacionManual, quitarUbicacion } from '@/lib/admin/lugares-actions'

export interface LugarUbicacionFormProps {
  venueId: string
}

export function LugarUbicacionForm({ venueId }: LugarUbicacionFormProps) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleGuardar = () => {
    if (isPending) return
    setMensaje(null)
    startTransition(async () => {
      const res = await guardarUbicacionManual(venueId, texto)
      if (res.ok) {
        setMensaje('Guardado')
        setTexto('')
        router.refresh()
      } else {
        setMensaje(res.error)
      }
    })
  }

  // Confirmación antes de quitar (decisión de la tarea: window.confirm, mismo
  // patrón que "Fusionar" / "Son distintos" en duplicate-pair-actions.tsx).
  const handleQuitar = () => {
    if (isPending) return
    if (!window.confirm('¿Quitar la ubicación de este lugar?')) return
    setMensaje(null)
    startTransition(async () => {
      const res = await quitarUbicacion(venueId)
      if (res.ok) {
        setMensaje('Ubicación quitada')
        router.refresh()
      } else {
        setMensaje(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          aria-label="Coordenadas o link de OpenStreetMap"
          placeholder="-24.7883, -65.4106 o un link de OpenStreetMap"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={isPending}
          className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex gap-2">
          <Button type="button" onClick={handleGuardar} disabled={isPending} className="h-11 min-h-11 px-4">
            Guardar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleQuitar}
            disabled={isPending}
            className="h-11 min-h-11 px-4"
          >
            Quitar ubicación
          </Button>
        </div>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {mensaje}
      </p>
    </div>
  )
}
