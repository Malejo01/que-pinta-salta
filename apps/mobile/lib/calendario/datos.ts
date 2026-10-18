/**
 * Datos puros de "Agregar al calendario" (R42, tarea 42-a; plan
 * `ops/rondas/42-ficha-completa/plan.md`). Sin `react-native` ni `expo-*`:
 * solo `@qps/core`, para que el adaptador nativo de 42-c (`lib/calendario/dispositivo.ts`)
 * reciba un objeto ya armado y el orquestador se pueda testear sin RN.
 *
 * Reglas, todas del plan de la R42 (sección "Reglas") o de funciones ya
 * existentes en `@qps/core`, nunca reescritas acá:
 * - el horario sale de `hasExplicitTime`/`estimatedEnd`-like (@qps/core/event-display,
 *   @qps/core/date-format): con hora explícita, inicio = `start_date` y fin =
 *   `end_date` si es válido y posterior, si no inicio + `DURACION_CALENDARIO_HORAS`;
 *   sin hora explícita, día completo en la zona de Salta;
 * - `puedeAgregarseAlCalendario` delega entera la vigencia en `isVigente`
 *   (@qps/core/events/vigencia): no se reimplementa nada de esa cuenta;
 * - el lugar nunca muestra "Lugar por confirmar": con `is_placeholder`, sin
 *   venue, o sin nombre ni dirección, va `undefined` (el botón/adaptador
 *   decide qué hacer con un lugar vacío, no esta función);
 * - el link de las notas es `urlEvento(id, 'app')` (@qps/core/metricas/links):
 *   mismo origen que el resto de los links de la app, nunca un dato de la
 *   sesión (`session`, `email`, `user`).
 *
 * El día completo se devuelve como día de Salta ("YYYY-MM-DD"), no como
 * `Date`: construir un `Date` de medianoche ahora obligaría a elegir una zona
 * (la de la máquina, que no es la de Salta) antes de que el adaptador sepa
 * para qué plataforma es. La conversión a medianoche **UTC** que pide
 * `CalendarContract` en Android (si no, el evento se corre un día) es del
 * adaptador de 42-c, no de este módulo.
 */
import { hasExplicitTime } from '@qps/core/event-display'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { isVigente } from '@qps/core/events/vigencia'
import { normalizeFilterText } from '@qps/core/home/filters'
import { urlEvento } from '@qps/core/metricas/links'

// Misma cifra que DURACION_ESTIMADA_HORAS (@qps/core/events/vigencia), en
// constante propia para cambiarla sin tocar la vigencia (plan R42, decisión 1).
// [COMPLETAR/confirmar Mauro]
export const DURACION_CALENDARIO_HORAS = 4

const HORA_MS = 60 * 60 * 1000

export interface VenueParaCalendario {
  name?: string | null
  address?: string | null
  is_placeholder?: boolean | null
}

/** Lo mínimo de `EventoDetalle` (lib/datos/eventos.ts) que necesita esta pantalla. */
export interface EventoParaCalendario {
  id: string
  title: string
  start_date: string
  end_date?: string | null
  venue?: VenueParaCalendario | null
}

export type HorarioCalendario =
  | { tipo: 'con-hora'; inicio: Date; fin: Date }
  | { tipo: 'dia-completo'; dia: string; diaFin: string }

interface DatosCalendarioComunes {
  titulo: string
  lugar?: string
  notas: string
  url: string
  zonaHoraria: 'America/Argentina/Salta'
}

export type DatosCalendario = DatosCalendarioComunes & HorarioCalendario

/** Fecha válida (no NaN), tal como la devuelve `new Date(input)`. */
function esFechaValida(valor: string | null | undefined): boolean {
  if (!valor) return false
  return !Number.isNaN(new Date(valor).getTime())
}

/**
 * "<nombre>, <dirección>", o solo el que haya si falta uno, o solo la
 * dirección si ya contiene el nombre (sin mayúsculas ni tildes). `undefined`
 * con `is_placeholder`, sin venue, o con los dos vacíos/solo espacios.
 * Nunca "Lugar por confirmar": eso lo decide la pantalla, no el calendario.
 */
function calcularLugar(venue: VenueParaCalendario | null | undefined): string | undefined {
  if (!venue || venue.is_placeholder) return undefined

  const nombre = (venue.name ?? '').trim()
  const direccion = (venue.address ?? '').trim()

  if (!nombre && !direccion) return undefined
  if (!nombre) return direccion
  if (!direccion) return nombre

  if (normalizeFilterText(direccion).includes(normalizeFilterText(nombre))) {
    return direccion
  }
  return `${nombre}, ${direccion}`
}

function calcularHorarioConHora(inicio: Date, endDate: string | null | undefined): HorarioCalendario {
  if (endDate && esFechaValida(endDate)) {
    const fin = new Date(endDate)
    if (fin.getTime() > inicio.getTime()) {
      return { tipo: 'con-hora', inicio, fin }
    }
  }
  return { tipo: 'con-hora', inicio, fin: new Date(inicio.getTime() + DURACION_CALENDARIO_HORAS * HORA_MS) }
}

function calcularHorarioDiaCompleto(startDate: string, endDate: string | null | undefined): HorarioCalendario {
  const dia = formatSaltaDayKey(startDate)
  let diaFin = dia
  if (endDate && esFechaValida(endDate)) {
    const diaDelFin = formatSaltaDayKey(endDate)
    if (diaDelFin > dia) diaFin = diaDelFin
  }
  return { tipo: 'dia-completo', dia, diaFin }
}

/**
 * Los datos puros de un evento para el calendario del teléfono, o `null` si
 * `id` no es un uuid (`urlEvento` da `null`) o si `start_date` es inválido.
 *
 * Importante: `start_date` se valida ACÁ, antes de llamar a cualquier otro
 * helper de fecha. `hasExplicitTime` da `false` también con una fecha
 * inválida (no solo con 00:00 de Salta), y `formatSaltaDayKey` tira
 * `RangeError` con una fecha inválida: si se ramificara antes de validar, una
 * fecha basura caería silenciosamente en "día completo" y después rompería.
 */
export function datosCalendario(evento: EventoParaCalendario, ahora?: Date): DatosCalendario | null {
  void ahora // sin uso hoy: la firma queda estable para quien la llame junto a `puedeAgregarseAlCalendario`.
  const url = urlEvento(evento.id, 'app')
  if (!url) return null

  if (!esFechaValida(evento.start_date)) return null

  const tituloRecortado = (evento.title ?? '').trim()
  const titulo = tituloRecortado || 'Evento en Qué Pinta Salta'
  const lugar = calcularLugar(evento.venue)
  const notas = `Ficha en Qué Pinta Salta: ${url}`

  const horario = hasExplicitTime(evento.start_date)
    ? calcularHorarioConHora(new Date(evento.start_date), evento.end_date)
    : calcularHorarioDiaCompleto(evento.start_date, evento.end_date)

  return {
    titulo,
    lugar,
    notas,
    url,
    zonaHoraria: 'America/Argentina/Salta',
    ...horario,
  }
}

/** Un evento ya terminado (`isVigente` falso) no muestra el botón de calendario. */
export function puedeAgregarseAlCalendario(
  evento: Pick<EventoParaCalendario, 'start_date' | 'end_date'>,
  ahora: Date = new Date()
): boolean {
  return isVigente(evento, ahora)
}
