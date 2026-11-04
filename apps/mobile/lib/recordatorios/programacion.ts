// Q4-10: recordatorios locales de lo que la persona guardó o marcó «Voy».
// Puro (sin expo-notifications ni almacenamiento): qué notificaciones tienen
// que quedar programadas. Lo aplica `./index.ts`.
//
// - «Mañana: <evento> a las <hora>», a las 18:00 (Salta) del día anterior.
// - Solo eventos publicados y futuros: los cancelados no llegan (la lectura de
//   favoritos trae solo PUBLISHED) y, si llegaran con `status`, se descartan.
// - Nunca películas ni flyers (no tienen una fecha de función propia).
// - Si las 18:00 del día anterior ya pasaron, no se programa (no se avisa tarde).
import { formatSaltaDayKey, saltaWallClockToDate } from '@qps/core/date-format'
import { textoEnIdioma } from '@qps/core/events/traduccion'
import type { DisplayEvent } from '@qps/core/home/types'
import type { Idioma } from '@/lib/i18n/idioma'
import { textosDe } from '@/lib/i18n/textos'

export const HORA_RECORDATORIO = '18:00'
/** Android limita las alarmas por app: con 40 sobra para lo que se guarda. */
export const MAX_RECORDATORIOS = 40
export const PREFIJO_RECORDATORIO = 'recordatorio-guardado:'
export const TIPO_RECORDATORIO = 'recordatorio-guardado'

export interface RecordatorioPlanificado {
  /** Identificador estable de la notificación local (`recordatorio-guardado:<eventId>`). */
  identificador: string
  eventId: string
  cuando: Date
  titulo: string
  cuerpo: string
}

/** El día anterior a un `AAAA-MM-DD`, en el calendario (sin husos). */
export function diaAnterior(clave: string): string {
  const [a, m, d] = clave.split('-').map(Number)
  const fecha = new Date(Date.UTC(a, m - 1, d - 1))
  return fecha.toISOString().slice(0, 10)
}

/** Las 18:00 de Salta del día anterior al evento. */
export function momentoDelRecordatorio(inicio: string): Date {
  return saltaWallClockToDate(`${diaAnterior(formatSaltaDayKey(inicio))}T${HORA_RECORDATORIO}:00`)
}

/** «Mañana: <evento> a las <hora>», o sin la hora si el evento no la tiene. */
export function textoDelRecordatorio(titulo: string, hora: string | null | undefined, idioma: Idioma = 'es'): string {
  // Q6-1: «Mañana: …» / «Tomorrow: …», del diccionario (`avisos.recordatorio`).
  return textosDe(idioma).avisos.recordatorio(titulo.trim(), hora && hora.trim() ? hora.trim() : null)
}

function esEventoDeVerdad(evento: DisplayEvent): boolean {
  if (evento.isInstagramFlyer || evento.isCinemaMovie) return false
  return !evento.id.startsWith('movie-') && !evento.id.startsWith('ig-')
}

export function planificarRecordatorios(
  eventos: DisplayEvent[],
  ahora: Date,
  max = MAX_RECORDATORIOS,
  idioma: Idioma = 'es',
): RecordatorioPlanificado[] {
  const t = textosDe(idioma).avisos
  const vistos = new Set<string>()
  const plan: RecordatorioPlanificado[] = []
  for (const evento of eventos) {
    if (!esEventoDeVerdad(evento) || vistos.has(evento.id)) continue
    if (evento.status && evento.status !== 'PUBLISHED') continue
    const inicio = new Date(evento.startDateTime)
    if (Number.isNaN(inicio.getTime()) || inicio <= ahora) continue
    const cuando = momentoDelRecordatorio(evento.startDateTime)
    if (cuando <= ahora) continue
    vistos.add(evento.id)
    plan.push({
      identificador: `${PREFIJO_RECORDATORIO}${evento.id}`,
      eventId: evento.id,
      cuando,
      // En inglés, el título traducido si lo hay (`title_en`); si no, el original.
      titulo: textoDelRecordatorio(textoEnIdioma(evento.title, evento.titleEn, idioma).texto, evento.time, idioma),
      cuerpo: evento.venue && evento.venue !== 'Lugar por confirmar' ? evento.venue : t.recordatorioCuerpo,
    })
  }
  return plan.sort((a, b) => a.cuando.getTime() - b.cuando.getTime()).slice(0, max)
}

/**
 * ¿Están activos? La preferencia guardada manda; sin preferencia, solo si la
 * persona ya dio el permiso de notificaciones (nunca se pide en frío).
 */
export function recordatoriosActivos(preferencia: '1' | '0' | null, permisoConcedido: boolean): boolean {
  if (!permisoConcedido) return false
  return preferencia !== '0'
}
