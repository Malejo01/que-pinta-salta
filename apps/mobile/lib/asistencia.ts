// "✓ Voy" de la ficha de un evento (R26, tarea 26-b, QPS-110 en
// ops/alcance-app-v1.md; reescrito en la R47, tarea 47-e, QPS-197). La
// cantidad es pública (`event_attendance_counts`); la marca propia solo con
// sesión (`event_attendance`, acotada por su RLS a la fila del usuario —
// nunca se filtra por `user_id` a mano). El `user_id` que se manda en el
// upsert es siempre el de la sesión, nunca un dato de la pantalla, y nunca
// se muestra quién marcó: solo la cantidad.
//
// `event_attendance`/`event_attendance_counts` recién llegan a producción el
// jueves: hasta entonces, PostgREST devuelve "la tabla/vista no existe"
// (`PGRST205`, `42P01`) o un `PGRST2xx` con "schema cache" en el mensaje.
// `clasificarErrorAsistencia` es pura (sin red, sin Supabase) para que 26-c
// la pruebe sin mockear nada. QPS-131 (R27, 27-b): la lógica se generalizó a
// `clasificarErrorTabla` (lib/errores.ts), y este módulo la reexporta con el
// nombre viejo para no romper esos tests.
//
// R47, tarea 47-e (QPS-197): el modelo cambió de dos marcas ("Voy" / "Me
// interesa") a un solo tipo ("Voy") más dos acciones nuevas que viven en
// otros módulos: ♥ Guardar (privado, `lib/favoritos.ts`) y + Seguir
// (`lib/radar.ts`). "Me interesa" desapareció de la interfaz: ningún camino
// la escribe. `TipoAsistencia`, `CantidadesAsistencia`, `esTipoAsistencia`,
// `EstadoGuardarVoy` y `pasosDeTocar`/`estadoTrasPasos` vienen de
// `@qps/core/asistencia`, para que la web y la app compartan exactamente la
// misma lógica. `siguienteMarca` ya no existe: la reemplaza `pasosDeTocar` +
// `estadoTrasPasos`, porque marcar Voy ahora son DOS escrituras sin
// transacción (ver `marcarAsistencia` más abajo), no una sola.
import {
  esTipoAsistencia,
  estadoTrasPasos,
  pasosDeTocar,
  type CantidadesAsistencia,
  type EstadoGuardarVoy,
  type PasoEscritura,
  type TipoAsistencia,
} from '@qps/core/asistencia'
import { obtenerEsFavorito, marcarFavorito } from './favoritos'
import { clasificarErrorTabla } from './errores'
import { MENSAJE_SIN_CONFIGURACION } from './mensajes'
import { supabase } from './supabase'

export { MENSAJE_SIN_CONFIGURACION }
export const MENSAJE_ERROR = 'No pudimos cargar esta sección. Probá de nuevo.'
export const MENSAJE_NO_DISPONIBLE = 'Pronto vas a poder marcar si vas.'
// "Mensaje de la casa" para una entrada inválida en marcarAsistencia (nunca
// un dato de Supabase: ni siquiera se llega a tocar la base en ese caso).
export const MENSAJE_TIPO_INVALIDO = 'Esa acción no es válida.'

export type { TipoAsistencia, CantidadesAsistencia, EstadoGuardarVoy }

export type EstadoAsistencia =
  | { tipo: 'ok'; cantidades: CantidadesAsistencia; propia: TipoAsistencia | null; guardado: boolean }
  | { tipo: 'no-disponible' }
  | { tipo: 'error'; error: string }

export type ResultadoMarcar =
  | { tipo: 'ok'; guardado: boolean }
  | { tipo: 'no-disponible'; guardado: boolean }
  | { tipo: 'error'; error: string; guardado: boolean }

/**
 * Clasifica un error de PostgREST sobre `event_attendance` /
 * `event_attendance_counts`. Mismo nombre y misma lógica de siempre, ahora
 * en `clasificarErrorTabla` (lib/errores.ts): `'no-disponible'` si la tabla
 * o la vista todavía no existen en este entorno (`PGRST205`, `42P01`, o un
 * `PGRST2xx` con "schema cache" en el mensaje); `'error'` para cualquier
 * otro caso (por ejemplo `42501`, o un error de red sin `code`).
 */
export const clasificarErrorAsistencia = clasificarErrorTabla

function resultadoDeError(error: unknown): { tipo: 'no-disponible' } | { tipo: 'error'; error: string } {
  return clasificarErrorAsistencia(error) === 'no-disponible'
    ? { tipo: 'no-disponible' }
    : { tipo: 'error', error: MENSAJE_ERROR }
}

/** `resultadoDeError`, pero con el campo `guardado` que necesita `ResultadoMarcar` en sus tres variantes. */
function resultadoMarcarDeError(error: unknown, guardado: boolean): ResultadoMarcar {
  return { ...resultadoDeError(error), guardado }
}

/**
 * Cantidad pública de `eventId` y, si `userId` no es `null`, la marca propia
 * y si el evento está guardado. Sin sesión (`userId` null), `propia` es
 * siempre `null`, `guardado` siempre `false`, y nunca se consulta
 * `event_attendance` ni `user_favorites`.
 */
export async function obtenerAsistencia(eventId: string, userId: string | null): Promise<EstadoAsistencia> {
  if (!supabase) {
    return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION }
  }

  try {
    const { data: fila, error: errorCantidades } = await supabase
      .from('event_attendance_counts')
      .select('voy')
      .eq('event_id', eventId)
      .maybeSingle()

    if (errorCantidades) {
      return resultadoDeError(errorCantidades)
    }

    const cantidades: CantidadesAsistencia = { voy: fila?.voy ?? 0 }

    if (!userId) {
      return { tipo: 'ok', cantidades, propia: null, guardado: false }
    }

    // La marca propia y si está guardado se piden juntas (mismo Promise.all):
    // `obtenerEsFavorito` ya hace su propia consulta a `user_favorites`
    // (acotada por RLS al usuario), así que no se repite esa consulta acá.
    const [resultadoPropia, resultadoFavorito] = await Promise.all([
      supabase.from('event_attendance').select('kind').eq('event_id', eventId).maybeSingle(),
      obtenerEsFavorito(eventId, userId),
    ])

    const { data: filaPropia, error: errorPropia } = resultadoPropia

    if (errorPropia) {
      return resultadoDeError(errorPropia)
    }

    // Solo `kind`: nunca `user_id` en el select, aunque la RLS ya acota esta
    // consulta a la fila propia (filtrar por event_id alcanza). Una fila con
    // un kind distinto de 'voy' (por ejemplo, un 'me_interesa' viejo) se lee
    // como "sin marca propia".
    const propia: TipoAsistencia | null = esTipoAsistencia(filaPropia?.kind) ? filaPropia.kind : null

    // Decisión de esta tarea (no estaba en el encargo tal cual): si
    // `obtenerEsFavorito` falla pero la cantidad y la marca propia salieron
    // bien, no devolvemos 'error' — eso haría desaparecer toda la fila de
    // acciones de la ficha. En cambio asumimos `guardado: false` y seguimos
    // con `tipo: 'ok'`. Un ♥ que se ve vacío cuando en realidad está
    // guardado solo hace que el siguiente toque reintente, y guardar es
    // idempotente (`23505` de `marcarFavorito` cuenta como éxito), así que
    // el costo de este camino es mucho menor que tirar abajo toda la ficha.
    const guardado = resultadoFavorito.ok ? resultadoFavorito.marcado : false

    return { tipo: 'ok', cantidades, propia, guardado }
  } catch (excepcion) {
    return resultadoDeError(excepcion)
  }
}

/**
 * Marca o desmarca "Voy" para `eventId`, a partir de `actual`
 * (`EstadoGuardarVoy`, el estado único que tiene la pantalla: `{ guardado,
 * voy }`). Qué escrituras hacer las decide `pasosDeTocar('voy', actual)` (de
 * `@qps/core/asistencia`), en el orden que da esa función — nunca al revés —
 * y se ejecutan una por una, deteniéndose en la primera que falle:
 *   - `'guardar'` → `marcarFavorito` (lib/favoritos.ts; un `23505` ya cuenta
 *     como éxito ahí);
 *   - `'marcar-voy'` → upsert de `event_attendance` con `kind: 'voy'`;
 *   - `'quitar-voy'` → delete de la fila propia (acotada por su RLS,
 *     filtrando solo por `event_id`).
 * El `userId` es siempre el que la pantalla leyó de `useSession()`, nunca un
 * parámetro de ruta.
 *
 * `tipo` llega como `unknown` porque hoy el único valor válido es `'voy'`,
 * pero esta firma no cambia si en el futuro aparece otro tipo: si no es
 * `'voy'` (`esTipoAsistencia`), es un error de la propia app (la pantalla
 * mandó algo que no debería) y nunca se llega a tocar Supabase.
 *
 * `guardado`, en las tres variantes del resultado, sale de
 * `estadoTrasPasos(actual, pasosYaHechos)`: el estado real después de los
 * pasos que SÍ se alcanzaron a escribir (puede ser distinto de `actual` aun
 * cuando el resultado es `'error'`, si el paso que falló no fue el primero).
 */
export async function marcarAsistencia(
  eventId: string,
  userId: string,
  tipo: unknown,
  actual: EstadoGuardarVoy
): Promise<ResultadoMarcar> {
  if (!esTipoAsistencia(tipo)) {
    return { tipo: 'error', error: MENSAJE_TIPO_INVALIDO, guardado: actual.guardado }
  }

  if (!supabase) {
    return { tipo: 'error', error: MENSAJE_SIN_CONFIGURACION, guardado: actual.guardado }
  }

  const pasos = pasosDeTocar('voy', actual)
  const pasosHechos: PasoEscritura[] = []

  try {
    for (const paso of pasos) {
      if (paso === 'guardar') {
        const resultado = await marcarFavorito(eventId, userId)
        if (!resultado.ok) {
          return { tipo: 'error', error: MENSAJE_ERROR, guardado: estadoTrasPasos(actual, pasosHechos).guardado }
        }
      } else if (paso === 'marcar-voy') {
        const { error } = await supabase
          .from('event_attendance')
          .upsert({ user_id: userId, event_id: eventId, kind: 'voy' }, { onConflict: 'user_id,event_id' })
        if (error) {
          return resultadoMarcarDeError(error, estadoTrasPasos(actual, pasosHechos).guardado)
        }
      } else if (paso === 'quitar-voy') {
        // La RLS ("eliminación del dueño") ya acota esto a la fila propia.
        const { error } = await supabase.from('event_attendance').delete().eq('event_id', eventId)
        if (error) {
          return resultadoMarcarDeError(error, estadoTrasPasos(actual, pasosHechos).guardado)
        }
      }

      pasosHechos.push(paso)
    }

    return { tipo: 'ok', guardado: estadoTrasPasos(actual, pasosHechos).guardado }
  } catch (excepcion) {
    return resultadoMarcarDeError(excepcion, estadoTrasPasos(actual, pasosHechos).guardado)
  }
}
