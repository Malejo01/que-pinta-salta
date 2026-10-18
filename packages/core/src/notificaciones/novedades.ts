/**
 * Las novedades de lo que cada usuario sigue (R41, tarea 41-a): la ventana
 * de tiempo en la que mirar `events.created_at`, y el cruce de esos eventos
 * nuevos con lo que el usuario sigue (categorías, lugares, cuentas de
 * Instagram). Pura: sin Supabase, sin `fetch`, sin `process.env`, sin React.
 * Ninguna hora de pared se calcula acá con `new Date()` sin argumentos ni con
 * `getHours()`/`getDate()`: lo que hace falta de reloj de Salta sale de
 * `./reglas` (`estaEnHorarioDeSilencio`), que a su vez usa `../date-format`.
 *
 * Interpreta la respuesta 01-r39 de Mauro (opción 1: `events.created_at`
 * posterior a la última corrida OK de notificaciones, sin migración nueva,
 * con el dedupe de `notification_sends`), con el ajuste por usuario que
 * describe el `plan.md` de la R41: la ventana arranca en la última corrida
 * OK en la que ESE usuario no estaba en silencio, no en la última corrida OK
 * a secas (si no, la ingesta de la madrugada, que cae dentro del silencio
 * por defecto, nunca generaría novedades: la corrida de las 05:05 las
 * descartaría a todos por silencio y correría la ventana, y a las 09:05 ya
 * no estarían).
 *
 * Limitación que queda así, a propósito: "nuevo en la base, no nuevo para
 * esta persona". En concreto:
 *   - empezar a seguir algo hoy no trae lo que se cargó ayer: la ventana
 *     mira `created_at`, no cuándo el usuario empezó a seguir eso;
 *   - lo que se descarta por silencio en la última corrida no silenciosa, o
 *     por el tope diario de novedades (`./tanda`, `candidatosDeNovedades`),
 *     no se reprograma: no queda marcado como "pendiente" en ningún lado;
 *   - la tabla de novedades por usuario (que resolvería las dos cosas de
 *     arriba) quedó para más adelante (respuesta 01-r39, opción 2; va al
 *     backlog como un QPS nuevo).
 */
import { estaEnHorarioDeSilencio } from './reglas'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from './preferencias'
import type { NovedadParaTanda } from './tanda'

// ---------------------------------------------------------------------------
// Ventana: desde dónde mirar `events.created_at`
// ---------------------------------------------------------------------------

/**
 * QPS-113, sin confirmar: si no hay ninguna corrida OK previa (sin silencio)
 * en las últimas horas, la ventana arranca en `ahora` menos esta cantidad.
 * 41-b también la importa, para no pedirle a la base corridas más viejas que
 * esto al armar `corridasOk`.
 */
export const VENTANA_MAXIMA_NOVEDADES_HORAS = 24

/** Una corrida OK (`SUCCESS` o `PARTIAL`) anterior de notificaciones, lo mínimo para calcular la ventana. */
export interface CorridaOkParaVentana {
  /**
   * El `ahora` que usó esa corrida al buscar novedades:
   * `job_runs.details.novedadesHasta`, o el `started_at` de la corrida si
   * no lo tiene (lo resuelve quien llama, 41-b, antes de pasar la lista
   * acá). Viene de una columna JSON libre de la base: puede ser basura, así
   * que se valida como fecha antes de usarse.
   */
  hasta: string
}

export interface InicioVentanaNovedadesInput {
  corridasOk: CorridaOkParaVentana[]
  /** `null` si el usuario no tiene fila de preferencias: se usan `PREFERENCIAS_POR_DEFECTO`, nunca se duplican los defaults acá. */
  preferencias: PreferenciasNotificacion | null
  ahora: Date
}

/**
 * Desde dónde mirar `events.created_at` para las novedades de este usuario:
 * el `hasta` más reciente de `corridasOk` que sea anterior a `ahora`, que no
 * tenga más de `VENTANA_MAXIMA_NOVEDADES_HORAS` y en el que el usuario NO
 * estuviera en horario de silencio (así la ingesta de la madrugada, que cae
 * en silencio por defecto, no se pierde para siempre: la corrida de las
 * 09:05, la primera fuera de silencio, mira desde la última corrida sin
 * silencio —las 22:05 del día anterior—, no desde la de las 08:05, que
 * también estaba en silencio).
 *
 * Si ninguna corrida cumple las tres condiciones (no hay corridas, todas son
 * más viejas que la ventana máxima, o todas caen en silencio), devuelve
 * `ahora` menos `VENTANA_MAXIMA_NOVEDADES_HORAS`: el tope para cuando no hay
 * corrida previa utilizable.
 *
 * Cada `hasta` se valida como fecha ANTES de llamar a
 * `estaEnHorarioDeSilencio`, que tira `RangeError` con un `Date` inválido:
 * como `corridasOk` viene de `job_runs.details` (una columna JSON libre de la
 * base), una fila con un `details` corrupto no puede tumbar toda la corrida
 * (y el cron entero) con un 500.
 */
export function inicioVentanaNovedades({
  corridasOk,
  preferencias,
  ahora,
}: InicioVentanaNovedadesInput): Date {
  const prefs = preferencias ?? PREFERENCIAS_POR_DEFECTO
  const limiteVentana = ahora.getTime() - VENTANA_MAXIMA_NOVEDADES_HORAS * 60 * 60 * 1000

  let masReciente: number | null = null

  for (const corrida of corridasOk) {
    const fecha = new Date(corrida.hasta)
    // `hasta` corrupto (no parsea): se descarta acá, nunca llega a
    // estaEnHorarioDeSilencio, que tiraría RangeError con un Date inválido.
    if (Number.isNaN(fecha.getTime())) continue

    const momento = fecha.getTime()
    if (momento >= ahora.getTime()) continue // tiene que ser anterior a `ahora`, no igual ni posterior.
    if (momento < limiteVentana) continue // no más de VENTANA_MAXIMA_NOVEDADES_HORAS de antigüedad.
    if (estaEnHorarioDeSilencio(fecha, prefs)) continue // el usuario estaba en silencio en el momento de esa corrida.

    if (masReciente === null || momento > masReciente) masReciente = momento
  }

  return masReciente === null ? new Date(limiteVentana) : new Date(masReciente)
}

// ---------------------------------------------------------------------------
// Cruce de eventos nuevos con lo que el usuario sigue
// ---------------------------------------------------------------------------

/** Lo mínimo de un evento nuevo para cruzarlo con lo que cada usuario sigue. */
export interface EventoParaNovedades {
  id: string
  title: string
  /** Solo `created_at`, nunca `updated_at` (opción 1 de 01-r39). `null` o lo que no parsea queda afuera. */
  created_at: string | Date | null
  category_id: string | null
  venue_id: string | null
  /** Cuentas de Instagram cuyo flyer apunta a este evento. */
  instagramAccountIds: string[]
}

/** Lo que un usuario sigue, en las tres listas por las que puede coincidir una novedad. */
export interface SigueParaNovedades {
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}

export interface NovedadesDeUsuarioInput {
  eventos: EventoParaNovedades[]
  sigue: SigueParaNovedades
  /** El resultado de `inicioVentanaNovedades` para este usuario (o `ahora - 24h` si no hubo corrida previa utilizable). */
  desde: Date
  ahora: Date
}

/**
 * Los eventos de `eventos` que son novedad para este usuario: `created_at`
 * no nulo, `desde < created_at <= ahora`, y coinciden con al menos una de las
 * tres listas de `sigue` (su categoría, su lugar, o una cuenta de Instagram
 * cuyo flyer apunta a él). Un evento que coincide por dos caminos (p. ej. su
 * categoría Y su venue) sale una sola vez: el filtro se evalúa una vez por
 * evento, no una vez por criterio.
 *
 * Cada novedad lleva `momento = ahora` (R41, no su `created_at`): así cada
 * corrida arma un solo grupo por usuario en `agruparNovedadesPorHora`
 * (`./reglas`, llamada desde `./tanda`), sin que el dedupe por hora se coma
 * eventos detectados tarde por el atraso del cron. Devuelve en orden de
 * `created_at` (más viejo primero), aunque `momento` sea el mismo para
 * todas: por si a quien llama le importa el orden del cuerpo del mensaje
 * (`cuerpoNovedades` de `./tanda` toma los primeros dos).
 *
 * `created_at` nulo o que no parsea no entra: se valida de forma explícita
 * (no alcanza con dejar que la comparación de abajo dé `false` con `NaN` por
 * casualidad, aunque el resultado final sería el mismo).
 */
export function novedadesDeUsuario({
  eventos,
  sigue,
  desde,
  ahora,
}: NovedadesDeUsuarioInput): NovedadParaTanda[] {
  const categorias = new Set(sigue.categoryIds)
  const venues = new Set(sigue.venueIds)
  const cuentas = new Set(sigue.instagramAccountIds)

  function coincide(evento: EventoParaNovedades): boolean {
    if (evento.category_id && categorias.has(evento.category_id)) return true
    if (evento.venue_id && venues.has(evento.venue_id)) return true
    return evento.instagramAccountIds.some((cuentaId) => cuentas.has(cuentaId))
  }

  const candidatos: Array<{ evento: EventoParaNovedades; createdAt: number }> = []

  for (const evento of eventos) {
    if (evento.created_at == null) continue

    const createdAt = new Date(evento.created_at)
    if (Number.isNaN(createdAt.getTime())) continue // created_at que no parsea: afuera, de forma explícita.

    const momentoCreacion = createdAt.getTime()
    if (!(momentoCreacion > desde.getTime() && momentoCreacion <= ahora.getTime())) continue
    if (!coincide(evento)) continue

    candidatos.push({ evento, createdAt: momentoCreacion })
  }

  candidatos.sort((a, b) => a.createdAt - b.createdAt)

  return candidatos.map(({ evento }) => ({
    id: evento.id,
    eventId: evento.id,
    title: evento.title,
    momento: ahora,
  }))
}
