/**
 * "Ya pasó" en /admin/revision (hotfix del 13/10).
 *
 * Misma regla que la guarda 5 de `publishDraftEvent` (lib/admin-actions.ts):
 * `isVigente({ start_date, end_date })` de lib/events/vigencia.ts. Si esto
 * dice vencido, el servidor rechaza con "Este evento ya pasó"; antes el
 * rechazo no se veía y el botón parecía no hacer nada.
 */
import { estimatedEnd, isVigente } from '@/lib/events/vigencia'
import { splitSaltaDateTime } from '@/lib/date-format'

type ConFechas = { start_date: string | null | undefined; end_date?: string | null }

export type DraftExpiry = { expired: boolean; endsAt: Date | null; byEndDate: boolean }

/** Vencido según la guarda 5. Sin fecha de inicio no hay nada que decir: no vencido. */
export function draftExpiry(e: ConFechas, now: Date = new Date()): DraftExpiry {
  if (!e.start_date) return { expired: false, endsAt: null, byEndDate: false }
  const row = { start_date: e.start_date, end_date: e.end_date ?? null }
  const fin = estimatedEnd(row)
  const byEndDate = Boolean(e.end_date) && !Number.isNaN(new Date(e.end_date as string).getTime())
  return {
    expired: !isVigente(row, now),
    endsAt: Number.isNaN(fin.getTime()) ? null : fin,
    byEndDate,
  }
}

/** Texto visible debajo de "Aprobar y publicar" cuando el borrador ya pasó. */
export function expiredReason(expiry: DraftExpiry): string {
  if (!expiry.expired) return ''
  if (!expiry.endsAt) return 'Ya pasó: la fecha no es válida. Corregila o rechazá el borrador.'
  const { day, time } = splitSaltaDateTime(expiry.endsAt.toISOString())
  const cuando = `${day.slice(8, 10)}/${day.slice(5, 7)} a las ${time}`
  if (expiry.byEndDate) {
    return `Ya pasó: la fecha de fin cargada es el ${cuando}. Cambiar el inicio no alcanza; si es otra edición, cargala de nuevo. Si no, rechazalo.`
  }
  return `Ya pasó: terminó el ${cuando}. Si es otra edición, cambiá la fecha; si no, rechazalo.`
}

/** Lo que devuelve unmerge_event() (supabase/migrations/20261013090000_unmerge_event.sql). */
export type UnmergeSummary = {
  keep_id: string
  audit_found: boolean
  previous_status: string | null
  flyers_restored: number
  ticket_sources_removed: number
  favorites_moved: number | null
}

/** Texto del aviso de éxito: lo que se revirtió y lo que no se pudo. */
export function unmergeMessage(r: UnmergeSummary): string {
  const partes = ['Fusión deshecha: el borrador volvió a la lista.']
  if (r.flyers_restored > 0) partes.push(`${r.flyers_restored === 1 ? 'Volvió 1 flyer' : `Volvieron ${r.flyers_restored} flyers`}.`)
  if (r.ticket_sources_removed > 0) partes.push(`Se sacaron ${r.ticket_sources_removed} links de compra del evento que quedó.`)
  if (!r.audit_found) partes.push('Era una fusión vieja sin registro: los links de compra del evento que quedó no se tocaron, revisalos.')
  if (r.favorites_moved) partes.push(`${r.favorites_moved} favorito(s) quedan en el evento que quedó.`)
  if (r.previous_status === 'PUBLISHED') partes.push('Antes de la fusión estaba publicado: revisalo y publicalo.')
  return partes.join(' ')
}
