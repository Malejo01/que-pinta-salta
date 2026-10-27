/**
 * Fechas (y precios) de la portada y de cines en el idioma de la página
 * (Q3). En castellano dan exactamente lo mismo que antes: llaman a las mismas
 * funciones de `@qps/core/date-format` sin pasarles el locale.
 */
import {
  formatEventDate,
  formatEventDateShort,
  formatEventDayMonth,
  formatSaltaDayKey,
  saltaWallClockToDate,
} from '@qps/core/date-format'
import { summarizeOccurrences, type OccurrenceSummaryInput } from '@qps/core/events/occurrences-summary'
import { LOCALE_INTL, type Idioma } from './idiomas'
import { textosDe } from './index'

/** "viernes, 12 de octubre" / "Friday, October 12" (hero de la portada). */
export function fechaLarga(idioma: Idioma, input: string | Date, conAnio = false): string {
  return idioma === 'es' ? formatEventDate(input, conAnio) : formatEventDate(input, conAnio, LOCALE_INTL[idioma])
}

/** "vie, 12 oct" / "Fri, Oct 12" (tarjeta). */
export function fechaCorta(idioma: Idioma, input: string | Date): string {
  return idioma === 'es' ? formatEventDateShort(input) : formatEventDateShort(input, LOCALE_INTL[idioma])
}

/** "12 oct" / "Oct 12". */
export function diaMes(idioma: Idioma, input: string | Date): string {
  return idioma === 'es' ? formatEventDayMonth(input) : formatEventDayMonth(input, LOCALE_INTL[idioma])
}

const ZONA_SALTA = 'America/Argentina/Salta'

/**
 * Un día calendario "YYYY-MM-DD" como instante: el mediodía de ese día en
 * Salta. Antes se parseaba `${valor}T00:00:00` (medianoche en la zona de la
 * máquina) y se formateaba en Salta, así que en un servidor UTC o en un
 * navegador de Europa `?dateExact=2026-10-30` decía 29. Al mediodía, con la
 * zona explícita, el día no se corre en ninguna zona horaria.
 */
function mediodiaEnSalta(dia: string): Date {
  return new Date(`${dia}T12:00:00-03:00`)
}

/** Etiqueta del filtro de fecha exacta ("YYYY-MM-DD") de la portada ("30 oct 2026" / "Oct 30, 2026"). */
export function fechaDeFiltro(idioma: Idioma, valor: string): string {
  return new Intl.DateTimeFormat(LOCALE_INTL[idioma], {
    dateStyle: 'medium',
    timeZone: ZONA_SALTA,
  }).format(mediodiaEnSalta(valor))
}

/** Día de una función en el hover de la tarjeta ("16 oct" / "Oct 16"). */
export function fechaDeFuncion(idioma: Idioma, fecha: string): string {
  return mediodiaEnSalta(fecha).toLocaleDateString(LOCALE_INTL[idioma], {
    day: 'numeric',
    month: 'short',
    timeZone: ZONA_SALTA,
  })
}

/**
 * Una hora de pared "HH:mm" (como las guarda el sitio: eventos, funciones de
 * cine). En castellano queda igual ("19:00"); en inglés va en 12 horas
 * ("7:00 PM"). Si el texto no tiene esa forma, se devuelve tal cual.
 */
export function hora(idioma: Idioma, hhmm: string): string {
  if (idioma === 'es') return hhmm
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return hhmm
  const h = Number(m[1])
  if (h > 23) return hhmm
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Precio en pesos. En castellano, "$5.000" como siempre. En inglés va
 * "ARS 5,000": un "$" solo, para un turista, se lee como dólares.
 */
export function precio(idioma: Idioma, monto: number): string {
  return idioma === 'es' ? `$${monto.toLocaleString('es-AR')}` : `ARS ${monto.toLocaleString(LOCALE_INTL[idioma])}`
}

function instanteDeFuncion(occ: OccurrenceSummaryInput): number {
  return saltaWallClockToDate(`${occ.date}T${occ.time || '00:00'}:00`).getTime()
}

/**
 * Pie de la tarjeta con varias funciones: "+3 fechas · 12 oct 21:00". En
 * castellano es `summarizeOccurrences` de core, sin cambios. En inglés se arma
 * acá con la misma regla (qué función es la próxima: con hora, que el instante
 * no haya pasado; sin hora, que el día sea hoy o después), porque core está
 * fuera del alcance de este cambio. `tests/i18n/fechas.test.ts` compara las
 * dos versiones para que no se separen.
 */
export function resumenFunciones(idioma: Idioma, funciones: OccurrenceSummaryInput[], ahora: Date): string | null {
  if (idioma === 'es') return summarizeOccurrences(funciones, ahora)
  if (!funciones || funciones.length <= 1) return null

  const textos = textosDe(idioma)
  const hoy = formatSaltaDayKey(ahora)
  const proximas = funciones
    .filter((occ) => (occ.time ? instanteDeFuncion(occ) >= ahora.getTime() : occ.date >= hoy))
    .sort((a, b) => instanteDeFuncion(a) - instanteDeFuncion(b))

  const cantidad = textos.portada.masFechas(funciones.length)
  if (proximas.length === 0) return cantidad

  const proxima = proximas[0]
  const dia = diaMes(idioma, proxima.date)
  return `${cantidad} · ${proxima.time ? `${dia} ${hora(idioma, proxima.time)}` : dia}`
}
