/**
 * Config declarativa de los eventos recurrentes. Copiada de
 * scripts/cargar-penas.mjs y scripts/cargar-museos.mjs: no se inventa nada.
 * Días: 0 = domingo … 6 = sábado.
 */

export const CATEGORIA_PENAS = 'f8fa78e3-b961-4fea-9026-8829ca4cc86d'
export const CATEGORIA_MUSEOS = '93cf95bd-d4c3-4d0e-b390-5816029da2f0'

export const HORIZONTE_PENAS_DIAS = 14
export const HORIZONTE_MUSEOS_DIAS = 7

export type RecurrentePena = {
  tipo: 'pena'
  /** Nombre con que se resuelve el venue (resolveVenueId, sin autocrear). */
  venue: string
  titulo: string
  descripcion: string
  resumen: string
  dias: readonly number[]
  hora: string
  /**
   * Hora de cierre ("HH:MM", hora de Salta). Si es menor o igual que `hora`,
   * es del día siguiente (abre 22:00, cierra 02:00). Sin definir, no hay
   * fecha de cierre (como hoy).
   */
  cierre?: string
  ticketUrl: string | null
}

export type RecurrenteMuseo = {
  tipo: 'museo'
  venue: string
  /** Prefijo del id canónico esperado; si no coincide, se saltea y se reporta. */
  venueIdPrefijo: string
  titulo: string
  dias: readonly number[]
  hora: string
  /**
   * Hora de cierre ("HH:MM", hora de Salta). Si es menor o igual que `hora`,
   * es del día siguiente. Sin definir, no hay fecha de cierre (como hoy).
   */
  cierre?: string
}

export type Recurrente = RecurrentePena | RecurrenteMuseo

export const PENAS: RecurrentePena[] = [
  {
    tipo: 'pena',
    venue: 'Balderrama',
    titulo: 'Peña folklórica en Balderrama',
    descripcion:
      'Peña folklórica con música en vivo en Balderrama, sobre Av. San Martín, en Salta Capital. ' +
      'El show arranca a las 21 hs, de miércoles a domingo. ' +
      'Conviene confirmar la cartelera y los precios directamente con el local antes de ir.',
    resumen: 'Peña con música folklórica en vivo, de miércoles a domingo desde las 21 hs.',
    dias: [3, 4, 5, 6, 0],
    hora: '21:00',
    // [COMPLETAR: hora de cierre]
    ticketUrl: null,
  },
  {
    tipo: 'pena',
    venue: 'La Vieja Estación',
    titulo: 'Peña folklórica en La Vieja Estación',
    descripcion:
      'Peña folklórica con show en vivo en La Vieja Estación, sobre calle Balcarce, en Salta Capital. ' +
      'El espectáculo comienza a las 22 hs, todos los días. ' +
      'Conviene confirmar la cartelera y los precios directamente con el local antes de ir.',
    resumen: 'Peña con show folklórico en vivo, todos los días a las 22 hs.',
    dias: [0, 1, 2, 3, 4, 5, 6],
    hora: '22:00',
    // [COMPLETAR: hora de cierre]
    ticketUrl: 'https://www.laviejaestacion.com.ar',
  },
]

/** Martes a domingo: el lunes cierran. Cachi y Cafayate quedan afuera a propósito. */
const DIAS_MUSEOS = [2, 3, 4, 5, 6, 0] as const

export const MUSEOS: RecurrenteMuseo[] = [
  { tipo: 'museo', venue: 'Museo de Arqueología de Alta Montaña', venueIdPrefijo: '48f05894', titulo: 'Museo de Arqueología de Alta Montaña', dias: DIAS_MUSEOS, hora: '11:00' }, // [COMPLETAR: hora de cierre]
  { tipo: 'museo', venue: 'Museo Güemes', venueIdPrefijo: 'a6368e1a', titulo: 'Museo Güemes', dias: DIAS_MUSEOS, hora: '11:00' }, // [COMPLETAR: hora de cierre]
  { tipo: 'museo', venue: 'Complejo Museológico Explora Salta', venueIdPrefijo: '8ee81049', titulo: 'Explora Salta', dias: DIAS_MUSEOS, hora: '10:00' }, // [COMPLETAR: hora de cierre]
  { tipo: 'museo', venue: 'Museo de Bellas Artes', venueIdPrefijo: '81915a94', titulo: 'Museo de Bellas Artes LOLA MORA - MBA', dias: DIAS_MUSEOS, hora: '10:00' }, // [COMPLETAR: hora de cierre]
  { tipo: 'museo', venue: 'Museo de Arte MAC', venueIdPrefijo: '1d472943', titulo: 'Museo de Arte MAC', dias: DIAS_MUSEOS, hora: '10:00' }, // [COMPLETAR: hora de cierre]
  { tipo: 'museo', venue: 'Museo Antropológico', venueIdPrefijo: '31a6a4be', titulo: 'Museo de Antropologia - MAS', dias: DIAS_MUSEOS, hora: '10:00' }, // [COMPLETAR: hora de cierre]
]
