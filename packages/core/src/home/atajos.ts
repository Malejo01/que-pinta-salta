/**
 * Atajos de Inicio (app móvil, R25): Hoy, Esta noche, Finde y Semana.
 * Decisiones de Mauro del 13/10 (`ops/rondas/25-inicio-cines/plan.md`). Todo
 * en hora de Salta (UTC-3, sin horario de verano): se usan los helpers de
 * `../date-format` en vez de `Date.getHours()`/`getDay()` de la máquina.
 *
 * Un evento está "en" un atajo si cae en la ventana del atajo (`ventanaDeAtajo`)
 * y, siempre, si está vigente (`isVigente`, la regla de `../events/vigencia`).
 * "Esta noche" tiene además una regla extra para boliches/peñas sin hora.
 */
import { formatSaltaClock, formatSaltaDayKey, saltaWallClockToDate } from '../date-format'
import { hasExplicitTime } from '../event-display'
import { isVigente } from '../events/vigencia'

export type Atajo = 'hoy' | 'esta-noche' | 'finde' | 'semana'

/**
 * Slugs de `categories` de "categorías de noche" para la regla extra de
 * "esta noche" (eventos sin hora explícita). Confirmados en el código:
 * `apps/web/lib/ai/types.ts`, `apps/web/lib/scraper/categorize.ts` y el
 * comentario de `packages/core/src/types.ts` (`EventCategory`) listan
 * exactamente estos dos slugs entre las 16 categorías.
 */
const CATEGORIAS_DE_NOCHE = new Set(['boliches', 'penas'])

/** Lo mínimo que necesita un evento para evaluar un atajo. */
export interface EventoParaAtajo {
  start_date: string
  end_date?: string | null
  /** Slug de `categories` (si el evento trae el join, pasar `category.slug`). */
  category?: string | null
}

/** `YYYY-MM-DD` (día de Salta) +/- `dias` días de calendario. */
function sumarDiasADiaKey(diaKey: string, dias: number): string {
  const fecha = new Date(`${diaKey}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** 00:00 de Salta de ese día, como instante real. */
function inicioDeDiaSalta(diaKey: string): Date {
  return saltaWallClockToDate(`${diaKey}T00:00:00`)
}

/** 23:59:59.999 de Salta de ese día, como instante real. */
function finDeDiaSalta(diaKey: string): Date {
  return saltaWallClockToDate(`${diaKey}T23:59:59.999`)
}

/** Día de la semana (0 domingo ... 6 sábado) de un `YYYY-MM-DD`, sin depender de la zona de la máquina. */
function diaDeLaSemana(diaKey: string): number {
  return new Date(`${diaKey}T00:00:00Z`).getUTCDay()
}

/**
 * Ventana del atajo, en instantes reales (no en strings de día), para
 * `ahora`. No depende de qué eventos haya: solo del reloj.
 */
export function ventanaDeAtajo(atajo: Atajo, ahora: Date): { desde: Date; hasta: Date } {
  const hoyKey = formatSaltaDayKey(ahora)

  if (atajo === 'hoy') {
    // Lo vigente de hoy, incluido lo que ya empezó: es el "hoy" de la web
    // (home/filters), que compara el día de Salta del evento con el de hoy.
    return { desde: inicioDeDiaSalta(hoyKey), hasta: finDeDiaSalta(hoyKey) }
  }

  if (atajo === 'semana') {
    // El "semana" de la web (home/filters): de hoy a hoy + 7 días, por día de
    // calendario (no por 7×24 horas exactas desde el instante actual).
    return { desde: inicioDeDiaSalta(hoyKey), hasta: finDeDiaSalta(sumarDiasADiaKey(hoyKey, 7)) }
  }

  if (atajo === 'esta-noche') {
    // De 19:00 a 05:59:59.999 del día siguiente. Antes de las 06:00 (hora de
    // Salta) todavía estamos en la "cola" de la noche que empezó ayer a las
    // 19:00, así que la base de la ventana es el día anterior.
    const horaSalta = Number(formatSaltaClock(ahora).split(':')[0])
    const diaBaseKey = horaSalta < 6 ? sumarDiasADiaKey(hoyKey, -1) : hoyKey
    return {
      desde: saltaWallClockToDate(`${diaBaseKey}T19:00:00`),
      hasta: saltaWallClockToDate(`${sumarDiasADiaKey(diaBaseKey, 1)}T05:59:59.999`),
    }
  }

  // atajo === 'finde': viernes 19:00 a domingo 23:59:59.999. Si ya estamos en
  // el finde (viernes desde las 19, sábado o domingo), la ventana empieza
  // ahora en vez de en el viernes 19:00 ya pasado.
  const diaSemana = diaDeLaSemana(hoyKey) // 0 domingo ... 5 viernes, 6 sábado
  let offsetViernes: number
  if (diaSemana === 5) offsetViernes = 0
  else if (diaSemana === 6) offsetViernes = -1
  else if (diaSemana === 0) offsetViernes = -2
  else offsetViernes = 5 - diaSemana

  const viernesKey = sumarDiasADiaKey(hoyKey, offsetViernes)
  const domingoKey = sumarDiasADiaKey(viernesKey, 2)
  const viernes1900 = saltaWallClockToDate(`${viernesKey}T19:00:00`)
  const domingo2359 = finDeDiaSalta(domingoKey)

  return {
    desde: ahora.getTime() > viernes1900.getTime() ? ahora : viernes1900,
    hasta: domingo2359,
  }
}

/**
 * `true` si `evento` corresponde al atajo `atajo` en el instante `ahora`:
 * siempre vigente, y dentro de la ventana del atajo — más, solo para "esta
 * noche", la regla extra de boliches/peñas sin hora explícita del día de hoy.
 */
export function eventoEnAtajo(evento: EventoParaAtajo, atajo: Atajo, ahora: Date): boolean {
  if (!isVigente(evento, ahora)) return false

  const inicio = new Date(evento.start_date)
  if (Number.isNaN(inicio.getTime())) return false

  const { desde, hasta } = ventanaDeAtajo(atajo, ahora)
  const enVentana = inicio.getTime() >= desde.getTime() && inicio.getTime() <= hasta.getTime()
  if (enVentana) return true

  if (atajo === 'esta-noche') {
    const esDeNoche = typeof evento.category === 'string' && CATEGORIAS_DE_NOCHE.has(evento.category)
    const esHoySinHora = !hasExplicitTime(inicio) && formatSaltaDayKey(inicio) === formatSaltaDayKey(ahora)
    return esDeNoche && esHoySinHora
  }

  return false
}
