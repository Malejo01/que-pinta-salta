'use client'

/**
 * Acciones de un par candidato a duplicado en /admin/duplicados (QPS-061,
 * Ronda 19 / 19-c): fusionar (con el selector "Queda: A / B") o marcar como
 * "no son el mismo evento". También exporta el botón "Volver a revisar" para
 * la sección plegada de pares ya marcados (decisión 3 de Mauro, 09/10).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notify } from '@/hooks/notify'
import { Button } from '@/components/ui/button'
import {
  dismissDuplicatePair,
  mergeDuplicatePair,
  restoreDuplicatePair,
} from '@/lib/admin/duplicate-actions'
import type { CanMergeResult } from '@/lib/events/duplicate-candidates'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export interface DuplicatePairEventInfo {
  id: string
  title: string
}

export interface DuplicatePairActionsProps {
  eventA: DuplicatePairEventInfo
  eventB: DuplicatePairEventInfo
  /** Id preseleccionado en "Queda: A / B" (lib/events/duplicate-candidates.ts, defaultKeeper). */
  defaultKeeperId: string
  /** canMerge(A, B): si A queda y B se descarta. */
  canMergeKeepA: CanMergeResult
  /** canMerge(B, A): si B queda y A se descarta. */
  canMergeKeepB: CanMergeResult
  /** pairWarnings(A, B) (hotfix 13/10): lugares o días distintos. Se repiten en la confirmación. */
  warnings?: string[]
}

export function DuplicatePairActions({
  eventA,
  eventB,
  defaultKeeperId,
  canMergeKeepA,
  canMergeKeepB,
  warnings = [],
}: DuplicatePairActionsProps) {
  const router = useRouter()
  const [keeperId, setKeeperId] = useState(defaultKeeperId)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const keepsA = keeperId === eventA.id
  const keep = keepsA ? eventA : eventB
  const drop = keepsA ? eventB : eventA
  const canMerge = keepsA ? canMergeKeepA : canMergeKeepB

  const handleMerge = async () => {
    if (isSubmitting || !canMerge.ok) return

    const resumen = `Queda «${keep.title}». «${drop.title}» pasa a borrador, sus favoritos y flyers pasan a «${keep.title}», y su link redirige a «${keep.title}»`
    const confirmed = window.confirm(
      warnings.length > 0
        ? `ATENCIÓN:\n${warnings.map((w) => `- ${w}`).join('\n')}\n\n¿Seguro que son el mismo evento?\n\n${resumen}`
        : resumen
    )
    if (!confirmed) return
    // Con avisos, una segunda confirmación explícita: el primer "Aceptar" es el reflejo.
    if (warnings.length > 0 && !window.confirm('Confirmá otra vez: fusionar aunque los lugares o los días no coinciden.')) return

    setIsSubmitting(true)
    try {
      const res = await mergeDuplicatePair(keep.id, drop.id)
      if ('error' in res) {
        notify.error(`Error al fusionar: ${res.error}`)
      } else {
        notify.success('Eventos fusionados.')
        router.refresh()
      }
    } catch (err) {
      notify.error(`Excepción fusionando eventos: ${errorMessage(err)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDismiss = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const res = await dismissDuplicatePair(eventA.id, eventB.id)
      if ('error' in res) {
        notify.error(`Error: ${res.error}`)
      } else {
        notify.success('Marcado como distinto: no vuelve a aparecer en esta lista.')
        router.refresh()
      }
    } catch (err) {
      notify.error(`Excepción marcando el par: ${errorMessage(err)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <label htmlFor={`keeper-${eventA.id}-${eventB.id}`} className="shrink-0 text-muted-foreground">
          Queda:
        </label>
        <select
          id={`keeper-${eventA.id}-${eventB.id}`}
          value={keeperId}
          onChange={(e) => setKeeperId(e.target.value)}
          disabled={isSubmitting}
          className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background/60 px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value={eventA.id}>{eventA.title}</option>
          <option value={eventB.id}>{eventB.title}</option>
        </select>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-col items-start gap-1">
          <Button
            onClick={handleMerge}
            disabled={isSubmitting || !canMerge.ok}
            title={!canMerge.ok ? canMerge.reason : undefined}
            // El motivo se ve como texto; `aria-describedby` lo ata al botón,
            // porque en un celular el `title` no se lee ni se puede tocar.
            aria-describedby={!canMerge.ok ? `merge-reason-${eventA.id}-${eventB.id}` : undefined}
            className="h-11 min-h-11 bg-emerald-600 px-4 text-white hover:bg-emerald-700"
          >
            Fusionar
          </Button>
          {!canMerge.ok && (
            <p id={`merge-reason-${eventA.id}-${eventB.id}`} className="max-w-[220px] text-xs text-amber-600">
              {canMerge.reason}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleDismiss}
          disabled={isSubmitting}
          className="h-11 min-h-11 px-4"
        >
          Son distintos
        </Button>
      </div>
    </div>
  )
}

/** "Volver a revisar" (decisión 3 de Mauro, 09/10): sin confirmación, no se pierde nada. */
export function RestorePairButton({ aId, bId }: { aId: string; bId: string }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleRestore = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const res = await restoreDuplicatePair(aId, bId)
      if ('error' in res) {
        notify.error(`Error: ${res.error}`)
      } else {
        notify.success(res.warning ?? 'El par vuelve a la lista de revisión.')
        router.refresh()
      }
    } catch (err) {
      notify.error(`Excepción: ${errorMessage(err)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleRestore}
      disabled={isSubmitting}
      className="h-11 min-h-11 px-3 text-xs"
    >
      Volver a revisar
    </Button>
  )
}
