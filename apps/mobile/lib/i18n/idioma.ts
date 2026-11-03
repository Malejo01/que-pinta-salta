// Q5-11 · Idioma de la app: castellano (es-AR) o inglés. Puro y sin
// dependencias (no hay expo-localization): el idioma del dispositivo sale de
// `Intl` (Hermes usa el del sistema), y la elección de la persona se guarda
// en el teléfono con el almacén de siempre (AsyncStorage), nunca en el servidor.
// Relativo (no `@/`): la web llega a este archivo por `lib/formato.ts` en sus tests.
import type { Almacen } from '../sin-conexion/almacen'

export type Idioma = 'es' | 'en'
export type PreferenciaIdioma = 'auto' | Idioma

export const IDIOMAS: readonly Idioma[] = ['es', 'en']
export const CLAVE_IDIOMA = 'qps.idioma'

/** El idioma de la app para un locale BCP 47: inglés si empieza con «en», si no castellano. */
export function idiomaDeLocale(locale: string | null | undefined): Idioma {
  return typeof locale === 'string' && /^en\b/i.test(locale.trim()) ? 'en' : 'es'
}

/** El locale del dispositivo (Intl de Hermes); castellano si no se puede leer. */
export function localeDelDispositivo(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'es-AR'
  } catch {
    return 'es-AR'
  }
}

export function idiomaEfectivo(preferencia: PreferenciaIdioma, locale: string = localeDelDispositivo()): Idioma {
  return preferencia === 'auto' ? idiomaDeLocale(locale) : preferencia
}

export function esPreferencia(valor: unknown): valor is PreferenciaIdioma {
  return valor === 'auto' || valor === 'es' || valor === 'en'
}

export async function leerPreferenciaIdioma(almacen: Almacen): Promise<PreferenciaIdioma> {
  try {
    const valor = await almacen.leer(CLAVE_IDIOMA)
    return esPreferencia(valor) ? valor : 'auto'
  } catch {
    return 'auto'
  }
}

export async function guardarPreferenciaIdioma(almacen: Almacen, preferencia: PreferenciaIdioma): Promise<void> {
  try {
    if (preferencia === 'auto') await almacen.borrar(CLAVE_IDIOMA)
    else await almacen.escribir(CLAVE_IDIOMA, preferencia)
  } catch {
    // Si no se pudo guardar, la app sigue en el idioma elegido mientras esté abierta.
  }
}

/**
 * Q6-1 · El idioma efectivo leído del teléfono (preferencia guardada + idioma
 * del dispositivo), para lo que se arma fuera de React: los avisos locales
 * («Mañana: …», «Este finde pinta»).
 */
export async function idiomaGuardado(almacen: Almacen, locale: string = localeDelDispositivo()): Promise<Idioma> {
  return idiomaEfectivo(await leerPreferenciaIdioma(almacen), locale)
}

/** El locale de Intl para fechas y horas: es-AR o en (con 24 h, como en Salta). */
export function localeDeIdioma(idioma: Idioma): string {
  return idioma === 'en' ? 'en-GB' : 'es-AR'
}

const ZONA = 'America/Argentina/Salta'

/** «sábado 7 de noviembre» / «Saturday 7 November», en hora de Salta. */
export function formatearDia(idioma: Idioma, iso: string | Date): string {
  return new Intl.DateTimeFormat(localeDeIdioma(idioma), { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA }).format(new Date(iso))
}

/** «21:30» en los dos idiomas (24 h), en hora de Salta. */
export function formatearHora(idioma: Idioma, iso: string | Date): string {
  return new Intl.DateTimeFormat(localeDeIdioma(idioma), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONA }).format(new Date(iso))
}

/** «7/11/2026» / «07/11/2026». */
export function formatearFechaCorta(idioma: Idioma, iso: string | Date): string {
  return new Intl.DateTimeFormat(localeDeIdioma(idioma), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA }).format(new Date(iso))
}
