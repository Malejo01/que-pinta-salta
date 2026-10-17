/**
 * Reglas puras de notificación de la app (R39, tarea 39-a): cuándo mandar el
 * recordatorio de favoritos, cuándo una notificación cae en horario de
 * silencio, cuánto queda del tope diario, cómo se agrupan las novedades de
 * lo que el usuario sigue, y a qué canal manda el Radar. Sin React, sin
 * Supabase, sin `fetch`, sin leer `process.env`: todo lo que depende del
 * reloj entra como `ahora: Date` por parámetro.
 *
 * Quien manda de verdad los push/emails (consulta la base, encola, llama a
 * Expo/Resend) es otra capa (39-b/39-d, `apps/web/lib/notificaciones/`); este
 * archivo solo decide sí/no y arma las claves de dedupe.
 */
import { formatSaltaClock, formatSaltaDayKey, saltaWallClockToDate } from '../date-format'
import { hasExplicitTime } from '../event-display'
import type { CanalRadar, PreferenciasNotificacion } from './preferencias'

// ---------------------------------------------------------------------------
// Helpers de fecha/hora de Salta (calendario, no reloj de la máquina)
// ---------------------------------------------------------------------------

/**
 * `YYYY-MM-DD` (día de Salta) menos un día de calendario. Aritmética sobre el
 * string del día, igual que `sumarDiasADiaKey` de `../home/atajos`: se ancla
 * a UTC con `Z` únicamente para no depender de la zona de la máquina que
 * corre el proceso, no para leer la hora real de nada.
 */
function diaAnteriorSalta(diaKey: string): string {
  const fecha = new Date(`${diaKey}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() - 1)
  return fecha.toISOString().slice(0, 10)
}

/** Minutos desde las 00:00, a partir de un `"HH:mm"`. */
function minutosDesdeMedianoche(hhmm: string): number {
  const [horas, minutos] = hhmm.split(':').map(Number)
  return horas * 60 + minutos
}

// ---------------------------------------------------------------------------
// Recordatorio de favoritos
// ---------------------------------------------------------------------------

/**
 * QPS-113, sin confirmar: cuántas horas antes del inicio del evento sale el
 * recordatorio de favoritos, cuando el evento tiene hora explícita.
 */
export const HORAS_ANTES_RECORDATORIO_FAVORITO = 3

/**
 * QPS-113, sin confirmar: a qué hora de Salta, el día anterior, sale el
 * recordatorio de favoritos cuando el evento NO tiene hora explícita (no hay
 * "3 horas antes" que calcular si no hay hora).
 */
export const HORA_RECORDATORIO_FAVORITO_SIN_HORA_EXPLICITA = '18:00'

/** Lo mínimo que necesita un evento para calcular el momento del recordatorio. */
export interface EventoParaRecordatorioFavorito {
  start_date: string
}

/**
 * Instante (real, no hora de pared) en el que corresponde mandar el
 * recordatorio de favoritos de `evento`. Con hora explícita, son
 * `HORAS_ANTES_RECORDATORIO_FAVORITO` antes del inicio; sin hora explícita
 * (`hasExplicitTime` de `../event-display`), es el día anterior al del
 * evento a las `HORA_RECORDATORIO_FAVORITO_SIN_HORA_EXPLICITA` de Salta.
 *
 * Si `evento.start_date` no es una fecha parseable, devuelve un `Date`
 * inválido (`getTime()` da `NaN`): no se valida ni se tira excepción acá.
 * `debeEnviarRecordatorioFavorito` lo resuelve solo porque `ahora.getTime()
 * >= NaN` siempre es `false`, así que ese caso nunca manda el recordatorio
 * (tampoco revienta).
 */
export function momentoRecordatorioFavorito(evento: EventoParaRecordatorioFavorito): Date {
  const inicio = new Date(evento.start_date)
  // Fecha que no parsea: devolvemos el Date inválido tal cual (en vez de
  // seguir a formatSaltaDayKey, que tira RangeError con una fecha inválida).
  if (Number.isNaN(inicio.getTime())) return inicio

  if (hasExplicitTime(inicio)) {
    return new Date(inicio.getTime() - HORAS_ANTES_RECORDATORIO_FAVORITO * 60 * 60 * 1000)
  }

  const diaAnterior = diaAnteriorSalta(formatSaltaDayKey(inicio))
  return saltaWallClockToDate(`${diaAnterior}T${HORA_RECORDATORIO_FAVORITO_SIN_HORA_EXPLICITA}:00`)
}

/** Lo que hace falta para decidir si el recordatorio de favoritos de un evento/usuario va ahora. */
export interface DecisionRecordatorioFavorito {
  evento: EventoParaRecordatorioFavorito
  ahora: Date
  /**
   * Si ya existe un envío registrado para este evento y este usuario (ver
   * `claveDedupe`). Esta función no consulta `notification_sends`: quien la
   * llama hace esa búsqueda y pasa el resultado acá.
   */
  yaEnviado: boolean
}

/**
 * `true` si, en el instante `ahora`, ya corresponde mandar el recordatorio de
 * favoritos: llegó (o pasó) el momento calculado por `momentoRecordatorioFavorito`
 * y todavía no se mandó. Es `>=` (no un rango exacto) porque el proceso que
 * manda corre cada tanto (cron), no en el instante exacto: una corrida
 * atrasada todavía tiene que mandarlo, nunca uno adelantado.
 *
 * Si `evento.start_date` es basura (no parsea), `momentoRecordatorioFavorito`
 * da un `Date` inválido y la comparación `>=` con `NaN` siempre es `false`:
 * da `false` sin romper, nunca manda el recordatorio de ese evento.
 */
export function debeEnviarRecordatorioFavorito({
  evento,
  ahora,
  yaEnviado,
}: DecisionRecordatorioFavorito): boolean {
  if (yaEnviado) return false
  return ahora.getTime() >= momentoRecordatorioFavorito(evento).getTime()
}

// ---------------------------------------------------------------------------
// Horario de silencio
// ---------------------------------------------------------------------------

/**
 * `true` si `momento` cae dentro del horario de silencio `[quiet_start,
 * quiet_end)` de Salta: el borde de inicio está adentro (silenciado), el de
 * fin ya está afuera (se puede mandar). La ventana puede cruzar la
 * medianoche (p. ej. 23:00 a 09:00, el default) o no (p. ej. 13:00 a 15:00):
 * si `quiet_start` es mayor que `quiet_end` se asume que cruza. Si son
 * iguales, el intervalo `[x, x)` es vacío por definición: no hay silencio
 * nunca (ver el `if` de abajo; sin ese caso aparte, la rama de "cruza la
 * medianoche" da el resultado opuesto: silenciado las 24 h). Un mensaje que
 * cae adentro se descarta (no se reprograma): decidirlo es trabajo de quien
 * llama.
 *
 * `quiet_start`/`quiet_end` llegan como `"HH:MM"` en los tipos de
 * `PreferenciasNotificacion`, pero la columna de la base es `time`: el
 * cliente de Supabase devuelve `"HH:MM:SS"` (p. ej. `"23:00:00"`). Acepta
 * las dos formas: `minutosDesdeMedianoche` solo mira las dos primeras partes
 * del string separado por `:` y descarta el resto.
 */
export function estaEnHorarioDeSilencio(
  momento: Date,
  prefs: Pick<PreferenciasNotificacion, 'quiet_start' | 'quiet_end'>,
): boolean {
  const actual = minutosDesdeMedianoche(formatSaltaClock(momento))
  const inicio = minutosDesdeMedianoche(prefs.quiet_start)
  const fin = minutosDesdeMedianoche(prefs.quiet_end)

  // quiet_start === quiet_end: ventana vacía, nunca hay silencio. Aparte de
  // las otras dos ramas porque con `||` el caso `inicio === fin` cae siempre
  // en una de las dos comparaciones (da silenciado las 24 h, lo contrario).
  if (inicio === fin) return false

  if (inicio < fin) {
    // No cruza la medianoche: una sola franja del mismo día.
    return actual >= inicio && actual < fin
  }

  // Cruza la medianoche: silenciado desde `inicio` hasta la medianoche, y
  // desde la medianoche hasta `fin`.
  return actual >= inicio || actual < fin
}

// ---------------------------------------------------------------------------
// Tope diario
// ---------------------------------------------------------------------------

/** Lo mínimo de un envío ya registrado para contarlo en el tope diario. */
export interface EnvioRegistradoParaTope {
  sent_at: string | Date
}

/**
 * Cuántos de `envios` cayeron en el mismo día de Salta que `ahora`
 * (`formatSaltaDayKey`, nunca el día UTC ni el de la máquina): un envío a
 * las 22:00 de Salta y otro a las 02:00 UTC del día siguiente son el mismo
 * día de Salta.
 */
export function contarEnviosDelDiaSalta(envios: EnvioRegistradoParaTope[], ahora: Date): number {
  const hoyKey = formatSaltaDayKey(ahora)
  return envios.filter((envio) => formatSaltaDayKey(envio.sent_at) === hoyKey).length
}

/**
 * `true` si todavía hay lugar en el tope diario (`daily_cap` de las
 * preferencias del usuario, no un valor hardcodeado acá: viene de la base,
 * con default 4 en `PREFERENCIAS_POR_DEFECTO`). El tope es "menor que", no
 * "menor o igual": con `dailyCap` 4, el cuarto envío del día todavía entra,
 * pero ya no hay lugar para un quinto.
 */
export function hayLugarEnTopeDiario(cantidadEnviosHoy: number, dailyCap: number): boolean {
  return cantidadEnviosHoy < dailyCap
}

// ---------------------------------------------------------------------------
// Novedades de lo que el usuario sigue
// ---------------------------------------------------------------------------

/**
 * QPS-113, sin confirmar: tamaño de la ventana para agrupar novedades, en
 * minutos. 60 = por hora de reloj de Salta (no una ventana deslizante desde
 * la primera novedad): dos novedades a las 10:05 y a las 10:55 agrupan
 * juntas; una a las 10:59 y otra a las 11:01, no.
 */
export const VENTANA_AGRUPACION_NOVEDADES_MINUTOS = 60

/** QPS-113, sin confirmar: como mucho esta cantidad de avisos de novedades por día de Salta. */
export const MAX_NOVEDADES_POR_DIA = 3

/** Lo mínimo de una novedad (algo nuevo de un evento/venue que el usuario sigue) para agruparla. */
export interface NovedadParaAgrupar {
  id: string
  /** Instante en el que se generó la novedad (no necesariamente el inicio del evento). */
  momento: string | Date
}

/** Un grupo de novedades que entran en la misma hora de Salta: un solo aviso para todas. */
export interface GrupoDeNovedades {
  /** `"YYYY-MM-DDTHH"` del bucket de hora de Salta (ver `VENTANA_AGRUPACION_NOVEDADES_MINUTOS`). */
  claveHora: string
  novedades: NovedadParaAgrupar[]
}

/** `"YYYY-MM-DDTHH"` del bucket de hora de Salta al que cae `momento`. */
function claveHoraSalta(momento: string | Date): string {
  const dia = formatSaltaDayKey(momento)
  const minutos = minutosDesdeMedianoche(formatSaltaClock(momento))
  const bucket = Math.floor(minutos / VENTANA_AGRUPACION_NOVEDADES_MINUTOS)
  return `${dia}T${String(bucket).padStart(2, '0')}`
}

/** Agrupa `novedades` por hora de Salta: varias novedades de la misma hora quedan en un solo grupo (un solo aviso). */
export function agruparNovedadesPorHora(novedades: NovedadParaAgrupar[]): GrupoDeNovedades[] {
  const grupos = new Map<string, NovedadParaAgrupar[]>()

  for (const novedad of novedades) {
    const clave = claveHoraSalta(novedad.momento)
    const lista = grupos.get(clave)
    if (lista) lista.push(novedad)
    else grupos.set(clave, [novedad])
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([claveHora, novedadesDelGrupo]) => ({ claveHora, novedades: novedadesDelGrupo }))
}

/**
 * De `grupos` (ya agrupados por hora, en orden cronológico), descarta los que
 * sobrepasan `maxPorDia` avisos en su día de Salta (`claveHora.slice(0, 10)`).
 * Se queda con los primeros del día, no con los últimos: son grupos ya
 * ordenados cronológicamente por `agruparNovedadesPorHora`.
 */
export function limitarNovedadesPorDia(
  grupos: GrupoDeNovedades[],
  maxPorDia: number = MAX_NOVEDADES_POR_DIA,
): GrupoDeNovedades[] {
  const avisosPorDia = new Map<string, number>()
  const resultado: GrupoDeNovedades[] = []

  for (const grupo of grupos) {
    const dia = grupo.claveHora.slice(0, 10)
    const cantidad = avisosPorDia.get(dia) ?? 0
    if (cantidad >= maxPorDia) continue
    avisosPorDia.set(dia, cantidad + 1)
    resultado.push(grupo)
  }

  return resultado
}

/** `agruparNovedadesPorHora` + `limitarNovedadesPorDia`, para el caso común de aplicar las dos reglas juntas. */
export function prepararNovedadesParaEnviar(
  novedades: NovedadParaAgrupar[],
  maxPorDia: number = MAX_NOVEDADES_POR_DIA,
): GrupoDeNovedades[] {
  return limitarNovedadesPorDia(agruparNovedadesPorHora(novedades), maxPorDia)
}

// ---------------------------------------------------------------------------
// Canal del Radar
// ---------------------------------------------------------------------------

/** `true` si el canal del Radar (`radar_channel` de las preferencias) incluye push. */
export function debeMandarPush(canal: CanalRadar): boolean {
  return canal === 'push' || canal === 'ambos'
}

/** `true` si el canal del Radar (`radar_channel` de las preferencias) incluye email. */
export function debeMandarEmail(canal: CanalRadar): boolean {
  return canal === 'email' || canal === 'ambos'
}

// ---------------------------------------------------------------------------
// Clave de dedupe
// ---------------------------------------------------------------------------

/** Tipo de envío, igual que la columna `kind` de `notification_sends` (texto libre en la base, acá una lista cerrada). */
export type TipoEnvioNotificacion = 'favorito' | 'novedad' | 'radar' | 'anuncio'

export interface ClaveDedupeInput {
  kind: TipoEnvioNotificacion
  userId: string
  /** El evento, cuando el envío es sobre un evento puntual (favoritos; novedades si son de un solo evento). */
  eventId?: string | null
  /**
   * Lo que distingue dos envíos del mismo `kind`+usuario que NO son
   * "el mismo evento": p. ej. la `claveHora` de un grupo de novedades, o el
   * día de Salta de un envío del Radar/anuncio.
   */
  extra?: string | null
}

/**
 * Arma la clave de `notification_sends.dedupe_key`. Siempre lleva `userId`
 * adentro: el `unique` de la tabla (`notification_sends_dedupe_key_key`) es
 * de toda la tabla, no por usuario. Si la clave fuera, por ejemplo,
 * `favorito:<eventId>` sin el usuario, el segundo usuario que tuviera ese
 * mismo evento en favoritos chocaría contra la fila del primero y su
 * recordatorio nunca se insertaría.
 */
export function claveDedupe({ kind, userId, eventId, extra }: ClaveDedupeInput): string {
  const partes = [kind, userId]
  if (eventId) partes.push(eventId)
  if (extra) partes.push(extra)
  return partes.join(':')
}
