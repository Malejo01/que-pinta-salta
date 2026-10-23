'use client'

/**
 * Control de destacado de un evento (R50, QPS-239/-240, tarea 50-b): muestra
 * el estado ("Destacado hasta el DD/MM" / "Venció el DD/MM" / "Sin
 * destacado"), ofrece las tres duraciones fijas de
 * DURACIONES_DESTACADO_DIAS, un selector de fecha a mano y "Quitar
 * destacado" (solo si está vigente). Llama a destacarEvento()/
 * quitarDestacado() de lib/admin/destacados-actions.ts.
 *
 * Lo monta la tarea 50-c en la ficha del evento (event-detail-page.tsx), en
 * lugar del switch "Destacar Evento" viejo (que usa is_featured, legado);
 * acá se usa solo en /admin/destacados (lista-destacados.tsx).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DURACIONES_DESTACADO_DIAS,
  estaDestacado,
  textoVenceDestacado,
} from '@qps/core/events/destacados'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { destacarEvento, quitarDestacado } from '@/lib/admin/destacados-actions'

export interface ControlDestacadoProps {
  eventId: string
  featuredUntil: string | null
}

const UN_DIA_MS = 24 * 60 * 60 * 1000

/**
 * Día "YYYY-MM-DD" que corresponde a "hoy + `dias` días", calculado EN HORA
 * DE SALTA (no en la zona del navegador de quien administra, que puede
 * estar en cualquier lado): se suman milisegundos exactos a "ahora" (válido
 * porque Argentina no tiene horario de verano desde 2009, así que un día
 * siempre son 24h fijas) y se lee el día resultante con formatSaltaDayKey(),
 * que formatea con el timeZone de Salta en vez de con el del navegador.
 */
function diaEnSaltaDentroDe(dias: number): string {
  return formatSaltaDayKey(new Date(Date.now() + dias * UN_DIA_MS))
}

export function ControlDestacado({ eventId, featuredUntil }: ControlDestacadoProps) {
  const router = useRouter()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [fechaManual, setFechaManual] = useState('')
  const [isPending, startTransition] = useTransition()

  const ahora = new Date()
  const vigente = estaDestacado(featuredUntil, ahora)
  const estado = textoVenceDestacado(featuredUntil, ahora)

  const destacarHasta = (hasta: string) => {
    if (isPending || !hasta) return
    setMensaje(null)
    startTransition(async () => {
      const res = await destacarEvento({ eventId, hasta })
      if (res.ok) {
        // El texto definitivo ("Destacado hasta el DD/MM") lo vuelve a
        // calcular textoVenceDestacado() más arriba, con el featuredUntil
        // que llega como prop después del router.refresh(): no se duplica
        // ese formateo acá.
        setMensaje('Destacado guardado')
        router.refresh()
      } else {
        setMensaje(res.mensaje)
      }
    })
  }

  const handleQuitar = () => {
    if (isPending) return
    setMensaje(null)
    startTransition(async () => {
      const res = await quitarDestacado({ eventId })
      if (res.ok) {
        setMensaje('Destacado quitado')
        router.refresh()
      } else {
        setMensaje(res.mensaje)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">{estado}</p>

      <div className="flex flex-wrap gap-2">
        {DURACIONES_DESTACADO_DIAS.map((dias) => (
          <Button
            key={dias}
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => destacarHasta(diaEnSaltaDentroDe(dias))}
            className="min-h-11 px-4"
            aria-label={`Destacar por ${dias} días`}
          >
            {dias} días
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`fecha-destacado-${eventId}`} className="text-xs text-muted-foreground">
            Destacar hasta esta fecha
          </label>
          <input
            id={`fecha-destacado-${eventId}`}
            type="date"
            value={fechaManual}
            onChange={(e) => setFechaManual(e.target.value)}
            disabled={isPending}
            className="h-11 min-h-11 rounded-md border border-input bg-background px-3 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Button
          type="button"
          disabled={isPending || !fechaManual}
          onClick={() => destacarHasta(fechaManual)}
          className="min-h-11 px-4"
        >
          Destacar hasta…
        </Button>
      </div>

      {vigente && (
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={handleQuitar}
          className="min-h-11 w-fit px-4"
        >
          Quitar destacado
        </Button>
      )}

      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {mensaje}
      </p>
    </div>
  )
}
