// Q4-11: «Este finde pinta: N planes, M gratis», notificación LOCAL de los
// jueves a las 18:00 (Salta). Puro: cuándo, qué texto y si corresponde.
//
// - Se calcula al abrir la app con la agenda en caché: el conteo usa el mismo
//   criterio que el atajo «Finde» de Inicio (`eventoEnAtajo` de core: viernes
//   19:00 a domingo 23:59), evaluado en el jueves del aviso.
// - Sin datos frescos (la agenda guardada hace más de 24 h) no se programa.
// - Sin planes, no se programa.
// - Si ese día llegó un «Aviso del equipo», no se manda (no duplica).
import { formatSaltaDayKey, saltaWallClockToDate } from '@qps/core/date-format'
import { eventoEnAtajo, type EventoParaAtajo } from '@qps/core/home/atajos'
import type { Idioma } from '@/lib/i18n/idioma'
import { textosDe } from '@/lib/i18n/textos'

export const IDENTIFICADOR_FINDE = 'finde-pinta'
export const TIPO_FINDE = 'finde-pinta'
export const HORA_FINDE = '18:00'
export const FRESCURA_MAXIMA_MS = 24 * 60 * 60 * 1000

export interface EventoParaFinde {
  paraAtajo: EventoParaAtajo
  gratis: boolean
}

function diaDeLaSemana(clave: string): number {
  const [a, m, d] = clave.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

function sumarDias(clave: string, dias: number): string {
  const [a, m, d] = clave.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** El próximo jueves a las 18:00 de Salta (hoy, si es jueves y todavía no son las 18). */
export function proximoJueves18(ahora: Date): Date {
  const hoy = formatSaltaDayKey(ahora)
  const faltan = (4 - diaDeLaSemana(hoy) + 7) % 7
  const hoyA18 = saltaWallClockToDate(`${hoy}T${HORA_FINDE}:00`)
  if (faltan === 0 && ahora < hoyA18) return hoyA18
  return saltaWallClockToDate(`${sumarDias(hoy, faltan === 0 ? 7 : faltan)}T${HORA_FINDE}:00`)
}

/** Planes del finde que sigue al jueves `jueves`, y cuántos son gratis. */
export function contarFinde(eventos: EventoParaFinde[], jueves: Date): { planes: number; gratis: number } {
  let planes = 0
  let gratis = 0
  for (const e of eventos) {
    if (!eventoEnAtajo(e.paraAtajo, 'finde', jueves)) continue
    planes++
    if (e.gratis) gratis++
  }
  return { planes, gratis }
}

// Q6-1: el texto sale del diccionario (`avisos.finde`), en el idioma elegido.
export function textoFinde(planes: number, gratis: number, idioma: Idioma = 'es'): string {
  return textosDe(idioma).avisos.finde(planes, gratis)
}

export type DecisionFinde =
  | { programar: true; cuando: Date; titulo: string; cuerpo: string }
  | { programar: false; motivo: 'apagado' | 'sin-datos-frescos' | 'sin-planes' | 'aviso-del-equipo' }

export function decidirFinde({
  ahora,
  activo,
  eventos,
  guardadoEn,
  diaAvisoEquipo,
  idioma = 'es',
}: {
  ahora: Date
  activo: boolean
  eventos: EventoParaFinde[] | null
  /** Cuándo se guardó la agenda en caché. */
  guardadoEn: Date | null
  /** `AAAA-MM-DD` (Salta) del último «Aviso del equipo» que llegó al teléfono. */
  diaAvisoEquipo: string | null
  /** Q6-1: el idioma del aviso (castellano si no se pasa). */
  idioma?: Idioma
}): DecisionFinde {
  if (!activo) return { programar: false, motivo: 'apagado' }
  if (!eventos || !guardadoEn || ahora.getTime() - guardadoEn.getTime() > FRESCURA_MAXIMA_MS) {
    return { programar: false, motivo: 'sin-datos-frescos' }
  }
  const cuando = proximoJueves18(ahora)
  if (diaAvisoEquipo && diaAvisoEquipo === formatSaltaDayKey(cuando)) return { programar: false, motivo: 'aviso-del-equipo' }
  const { planes, gratis } = contarFinde(eventos, cuando)
  if (planes === 0) return { programar: false, motivo: 'sin-planes' }
  return { programar: true, cuando, titulo: textoFinde(planes, gratis, idioma), cuerpo: textosDe(idioma).avisos.findeCuerpo }
}
