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

/**
 * Etiqueta del filtro de fecha exacta ("YYYY-MM-DD") de la portada: la misma
 * cuenta que hacía `formatDateLabel` en filters-bar.tsx, con el locale del idioma.
 */
export function fechaDeFiltro(idioma: Idioma, valor: string): string {
  const parsed = new Date(`${valor}T00:00:00`)
  return new Intl.DateTimeFormat(LOCALE_INTL[idioma], {
    dateStyle: 'medium',
    timeZone: 'America/Argentina/Salta',
  }).format(parsed)
}

/** Día de una función en el hover de la tarjeta: misma cuenta que antes en event-card.tsx. */
export function fechaDeFuncion(idioma: Idioma, fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString(LOCALE_INTL[idioma], {
    day: 'numeric',
    month: 'short',
  })
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
  return `${cantidad} · ${proxima.time ? `${dia} ${proxima.time}` : dia}`
}
