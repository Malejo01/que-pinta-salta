/**
 * El único archivo de la app que importa `expo-calendar` (R42, 42-c). Arma
 * las `deps` de `lib/calendario/agregar.ts` (el orquestador, puro) y mapea
 * los `DatosCalendario` de 42-a (`lib/calendario/datos.ts`) a los campos
 * reales de `expo-calendar@57.0.5`.
 *
 * CORRECCIÓN DEL LEAD (17/10): se leyó `expo-calendar/build/Calendar.d.ts`,
 * `ExpoCalendar.types.d.ts` y `legacyWarnings.d.ts` de la versión instalada.
 * La raíz del paquete expone la API "Next" (`getCalendars`,
 * `requestCalendarPermissions`, `getCalendarPermissions`, la clase
 * `ExpoCalendar` con métodos de instancia `createEvent`/`addEventWithForm`),
 * no la legacy. Los nombres `*Async` que nombraba el plan
 * (`createEventInCalendarAsync`, etc.) existen en la raíz pero cada uno
 * **tira en tiempo de ejecución** (ver el comentario de `agregar.ts`): no se
 * usa ninguno.
 */
import * as Calendar from 'expo-calendar'
import type { CalendarioParaCrear, DepsCalendario, EstadoPermisoCalendario } from './agregar'
import type { DatosCalendario } from './datos'

/**
 * El mapeo de `DatosCalendario` (puro, 42-a) a los campos de
 * `Calendar.ExpoCalendar.createEvent` (`Omit<Partial<ExpoCalendarEvent>, 'id'|'organizer'>`).
 * Pura y exportada para testearla aparte, sin tocar ningún calendario real.
 */
export function aEventoExpo(datos: DatosCalendario): Parameters<Calendar.ExpoCalendar['createEvent']>[0] {
  const comunes = {
    title: datos.titulo,
    notes: datos.notas,
    // `url` es `@platform ios` en `ExpoCalendarEvent` (`ExpoCalendar.types.d.ts`):
    // en Android no se guarda. Por eso el link va SIEMPRE en `notes` también
    // (arriba), y acá se setea igual porque en iOS sí se usa.
    url: datos.url,
    ...(datos.lugar ? { location: datos.lugar } : {}),
  }

  if (datos.tipo === 'con-hora') {
    return {
      ...comunes,
      startDate: datos.inicio,
      endDate: datos.fin,
      timeZone: 'America/Argentina/Salta',
      allDay: false,
    }
  }

  // Día completo: `CalendarContract` de Android exige medianoche UTC (si no,
  // el evento se corre un día). Se parsea 'YYYY-MM-DD' a mano con split('-')
  // y Number() en vez de `new Date('YYYY-MM-DD')` + `getUTCFullYear()...`:
  // es explícito y no depende de cómo cada motor de JS interpreta ese string.
  const [anioInicio, mesInicio, diaInicio] = datos.dia.split('-').map(Number)
  const [anioFin, mesFin, diaFin] = datos.diaFin.split('-').map(Number)

  return {
    ...comunes,
    // `diaFin` es INCLUSIVO (42-a); `endDate` de un evento de día completo
    // es exclusivo, así que va la medianoche UTC del día SIGUIENTE a
    // `diaFin`. `Date.UTC` normaliza el desborde de `diaFin + 1` (por
    // ejemplo, el 31 de un mes de 30 días cae en el 1 del mes siguiente),
    // así que no hace falta sumar milisegundos a mano.
    startDate: new Date(Date.UTC(anioInicio, mesInicio - 1, diaInicio)),
    endDate: new Date(Date.UTC(anioFin, mesFin - 1, diaFin + 1)),
    timeZone: 'UTC',
    allDay: true,
  }
}

function aEstadoPermiso(respuesta: Calendar.PermissionResponse): EstadoPermisoCalendario {
  return { concedido: respuesta.granted, puedeVolverAPreguntar: respuesta.canAskAgain }
}

/** El calendario editable: el principal (Android) si es editable, si no el
 * primero editable, si no `null`. `EntityTypes.EVENT` filtra los de
 * eventos (no recordatorios). */
async function calendarioEditable(): Promise<CalendarioParaCrear | null> {
  const calendarios = await Calendar.getCalendars(Calendar.EntityTypes.EVENT)
  const editables = calendarios.filter((c) => c.allowsModifications)
  const principal = editables.find((c) => c.isPrimary)
  const calendario = principal ?? editables[0]
  if (!calendario) return null

  return {
    crearEvento: async (datos: DatosCalendario) => {
      await calendario.createEvent(aEventoExpo(datos))
    },
  }
}

/**
 * Las `deps` reales de `agregarAlCalendario` (42-c). El permiso se pide SIN
 * `writeOnly`: write-only no alcanza porque `calendarioEditable` necesita
 * leer los calendarios con `getCalendars()`, no solo escribir.
 */
export function depsDelDispositivo(): DepsCalendario {
  return {
    leerPermiso: async () => aEstadoPermiso(await Calendar.getCalendarPermissions()),
    pedirPermiso: async () => aEstadoPermiso(await Calendar.requestCalendarPermissions()),
    calendarioEditable,
  }
}
