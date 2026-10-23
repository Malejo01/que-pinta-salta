/**
 * Orquestador puro de "Agregar al calendario" (R42, tarea 42-c; plan
 * `ops/rondas/42-ficha-completa/plan.md`). Sin `react-native` ni `expo-*`:
 * recibe `DatosCalendario` (42-a, `lib/calendario/datos.ts`) y las `deps`
 * inyectadas, así que corre en Vitest con dobles, sin RN.
 *
 * CORRECCIÓN DEL LEAD (17/10): el plan original tenía dos caminos — A, la
 * pantalla del sistema sin pedir permiso (`createEventInCalendarAsync`), y
 * B de respaldo. Leído el `.d.ts` real de `expo-calendar@57.0.5` instalada,
 * A no existe en esta versión: `createEventInCalendarAsync` (y el resto de
 * los nombres `*Async` de la API "legacy") están re-exportados por
 * `build/legacyWarnings.d.ts`, pero cada uno **tira en tiempo de ejecución**
 * (su propio `@deprecated` lo dice: "This method will throw in runtime").
 * `ExpoCalendar.addEventWithForm` (lo más parecido) es un método de una
 * instancia ya atada a un calendario (no deja elegir) y pide permiso igual
 * ("Requires at minimum write-only calendar permission"): los dos motivos
 * por los que el plan recomendaba A se caen. Por eso este contrato no tiene
 * ningún `abrirPantallaDelSistema`: sería una rama sin llamador, código
 * muerto con test. Solo queda el camino B (plan: "Si A no existe en esta
 * versión, solo va B").
 */
import type { DatosCalendario } from './datos'

export interface EstadoPermisoCalendario {
  concedido: boolean
  puedeVolverAPreguntar: boolean
}

/** Un calendario editable ya resuelto: el adaptador (`dispositivo.ts`)
 * cierra sobre la instancia nativa, así este módulo no conoce ningún tipo
 * de `expo-calendar`. */
export interface CalendarioParaCrear {
  crearEvento: (datos: DatosCalendario) => Promise<void>
}

export interface DepsCalendario {
  leerPermiso: () => Promise<EstadoPermisoCalendario>
  pedirPermiso: () => Promise<EstadoPermisoCalendario>
  calendarioEditable: () => Promise<CalendarioParaCrear | null>
}

export type ResultadoAgregar =
  | { tipo: 'agregado' }
  | { tipo: 'sin-permiso'; puedeAbrirAjustes: boolean }
  | { tipo: 'sin-calendario' }
  | { tipo: 'error' }

/**
 * El orden (único lugar donde se pide el permiso, y solo corre porque la
 * persona tocó el botón):
 * 1. `leerPermiso()`. Si no está concedido y `puedeVolverAPreguntar`, se
 *    llama a `pedirPermiso()`. Si ya venía `puedeVolverAPreguntar: false`,
 *    NO se llama a `pedirPermiso` (ya lo negó para siempre).
 * 2. Si sigue sin conceder: `sin-permiso`, con `puedeAbrirAjustes` igual a
 *    `!puedeVolverAPreguntar` del estado MÁS RECIENTE que se tenga (el de
 *    `pedirPermiso` si se llamó, si no el de `leerPermiso`).
 * 3. `calendarioEditable()`. `null` → `sin-calendario`.
 * 4. `crearEvento(datos)` → `agregado`.
 * 5. Cualquier excepción en cualquier punto → `error`. Nunca tira.
 */
export async function agregarAlCalendario(datos: DatosCalendario, deps: DepsCalendario): Promise<ResultadoAgregar> {
  try {
    let permiso = await deps.leerPermiso()

    if (!permiso.concedido && permiso.puedeVolverAPreguntar) {
      permiso = await deps.pedirPermiso()
    }

    if (!permiso.concedido) {
      return { tipo: 'sin-permiso', puedeAbrirAjustes: !permiso.puedeVolverAPreguntar }
    }

    const calendario = await deps.calendarioEditable()
    if (!calendario) {
      return { tipo: 'sin-calendario' }
    }

    await calendario.crearEvento(datos)
    return { tipo: 'agregado' }
  } catch {
    return { tipo: 'error' }
  }
}
