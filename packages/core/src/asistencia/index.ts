/**
 * "Voy" de la ficha de un evento (R38, tareas 38-a y 38-b; reescrito en la
 * R47, tarea 47-a, QPS-197). Lógica pura (sin Supabase, sin React, sin
 * imports de ninguna app): la usan la web (`apps/web/lib/asistencia.ts`,
 * `apps/web/components/botones-asistencia.tsx`) y la app
 * (`apps/mobile/lib/asistencia.ts`, `apps/mobile/components/BotonesAsistencia.tsx`)
 * para que el texto del botón y la regla de marcar/desmarcar sean el mismo
 * código en los dos lados, no una copia.
 *
 * El modelo cambió de dos marcas ("Voy" / "Me interesa", que decían casi lo
 * mismo y confundían en producción) a un solo tipo de asistencia ("Voy") más
 * dos acciones nuevas que viven en otros archivos: Guardar (privado, en
 * `favoritos/mis-eventos.ts`) y Seguir (en `radar/seguimiento.ts`). "Me
 * interesa" desapareció de la interfaz.
 *
 * Regla de datos: acá solo se trabaja con cantidades y con la marca propia
 * del usuario de la sesión (`TipoAsistencia | null`). Nunca con quién marcó
 * cada tipo: eso no sale de la base (`event_attendance_counts` es la vista
 * pública, sin `user_id`; `event_attendance` solo se lee/escribe acotado al
 * usuario de la sesión, nunca para ver la lista de otros).
 */

export type TipoAsistencia = 'voy'

/**
 * N = 3, confirmado por Mauro (17/10, 15:10).
 * Por qué existe un umbral: con pocas marcas, mostrar el número desanima
 * ("Voy · 1" se lee como "nadie más va"); a partir de N la cantidad empieza
 * a funcionar como señal social ("ya va gente"), así que recién ahí vale
 * mostrarla.
 */
export const UMBRAL_CONTADOR_ASISTENCIA = 3

/**
 * La cantidad a mostrar junto al botón: `null` si todavía no llegó al
 * umbral (el botón no muestra número), `n` desde el umbral (inclusive).
 *
 * `n` siempre tiene que ser un entero finito ≥ 0 (así vienen las cantidades
 * de `event_attendance_counts`: un `count()` de Postgres). Si no lo es (NaN,
 * infinito, negativo o decimal) se trata como "sin dato": devuelve `null`,
 * igual que si estuviera debajo del umbral. Es la opción más segura y
 * determinista: nunca se le muestra al usuario un número raro (negativo,
 * con decimales, o `NaN`), y un valor inválido nunca cuenta como señal
 * social.
 */
export function cantidadVisible(n: number): number | null {
  if (!Number.isInteger(n) || n < 0) return null
  return n >= UMBRAL_CONTADOR_ASISTENCIA ? n : null
}

/** El único tipo de asistencia válido es `'voy'`: nada más pasa esta validación. */
export function esTipoAsistencia(x: unknown): x is TipoAsistencia {
  return x === 'voy'
}

export const ETIQUETAS_ASISTENCIA: Record<TipoAsistencia, string> = {
  voy: 'Voy',
}

/**
 * Las cantidades de asistencia de un evento. Reemplaza a las dos copias que
 * tenían la web y la app (cada una con su `meInteresa`): ahora hay un solo
 * campo.
 */
export interface CantidadesAsistencia {
  voy: number
}

/**
 * El texto del botón de "Voy": único lugar donde se arma ("Voy · 5" o
 * "Voy", según `cantidadVisible`). La web
 * (`apps/web/components/botones-asistencia.tsx`) y la app
 * (`apps/mobile/components/BotonesAsistencia.tsx`) llaman a esta misma
 * función. El "✓" es un ícono de la interfaz (lo dibuja cada componente),
 * no forma parte de este texto.
 */
export function textoBotonVoy(cantidad: number): string {
  const visible = cantidadVisible(cantidad)
  return visible === null ? 'Voy' : `Voy · ${visible} van`
}

/** El texto de invitación a entrar cuando no hay sesión (botones de asistencia). */
export const TEXTO_ENTRAR_PARA_MARCAR = 'Entrá para marcar si vas.'

/** El aviso cuando sacar el ♥ de Guardados también saca el ✓ Voy (ver `pasosDeTocar`/`avisoAlQuitarGuardado`). */
export const TEXTO_SACASTE_GUARDADO_CON_VOY =
  'Lo sacaste de tus guardados y ya no figurás como que vas.'

/**
 * El orden de la fila de acciones de una ficha/tarjeta (QPS-197): primero
 * Guardar (♥, privado), después Voy (✓, social), último Compartir. Único
 * lugar donde se fija ese orden.
 */
export const ORDEN_FILA_ACCIONES = ['guardar', 'voy', 'compartir'] as const
export type AccionFila = (typeof ORDEN_FILA_ACCIONES)[number]

/**
 * El estado de Guardar/Voy de un usuario sobre un evento. El invariante que
 * tiene que cumplirse siempre, en la base y en la pantalla, es `voy ⇒
 * guardado`: no puede existir un Voy sin que el evento esté guardado (Voy
 * está *contenido* en Guardados).
 */
export interface EstadoGuardarVoy {
  guardado: boolean
  voy: boolean
}

/**
 * Cada paso es una escritura separada contra la base (no hay una
 * transacción que las una: ver el porqué del orden más abajo).
 */
export type PasoEscritura = 'guardar' | 'marcar-voy' | 'quitar-voy' | 'quitar-guardado'

/**
 * Qué pasos hay que escribir cuando se toca "guardar" o "voy", dado el
 * estado actual.
 *
 * Por qué, cuando se toca "voy" sin Voy previo, los pasos son *siempre*
 * `['guardar', 'marcar-voy']` (aunque `estado.guardado` ya sea `true`):
 * marcar Voy son dos escrituras sin transacción, y el único estado
 * intermedio permitido es "Guardado sin Voy" (que es válido por sí solo:
 * nunca puede quedar un Voy sin Guardado). Pedir "guardar" primero es
 * idempotente en la base (un `23505` de clave duplicada cuenta como éxito),
 * así que no hay costo en pedirlo siempre, y el servidor nunca depende de lo
 * que la pantalla cree que sabe sobre el ♥ (que podría estar desactualizado
 * o ser incorrecto).
 */
export function pasosDeTocar(
  accion: 'guardar' | 'voy',
  estado: EstadoGuardarVoy,
): PasoEscritura[] {
  if (accion === 'voy') {
    if (estado.voy) return ['quitar-voy']
    return ['guardar', 'marcar-voy']
  }

  // accion === 'guardar'
  if (!estado.guardado) return ['guardar']
  if (estado.voy) return ['quitar-voy', 'quitar-guardado']
  return ['quitar-guardado']
}

/**
 * Aplica los pasos uno a uno y en orden, cada uno con su efecto literal.
 * Un arreglo vacío devuelve el estado tal cual (nada se escribió).
 *
 * Importante y deliberado: `quitar-guardado` NO fuerza `voy = false`. Es
 * tentador "arreglar" el estado ahí para que el invariante `voy ⇒ guardado`
 * se cumpla siempre, y sería un error: ese invariante tiene que cumplirse
 * *por el orden de los pasos* que da `pasosDeTocar` (`quitar-voy` siempre
 * antes que `quitar-guardado`), no porque esta función tape el problema. Si
 * alguien invirtiera ese orden (`['quitar-guardado', 'quitar-voy']`), el
 * prefijo de un solo paso tiene que dar el estado inconsistente `{ guardado:
 * false, voy: true }` para que el test de ese orden se ponga en rojo y
 * avise del error en `pasosDeTocar`, en vez de que esta función lo esconda.
 */
export function estadoTrasPasos(
  estado: EstadoGuardarVoy,
  pasosHechos: readonly PasoEscritura[],
): EstadoGuardarVoy {
  let resultado = estado
  for (const paso of pasosHechos) {
    switch (paso) {
      case 'guardar':
        resultado = { ...resultado, guardado: true }
        break
      case 'marcar-voy':
        resultado = { ...resultado, voy: true }
        break
      case 'quitar-voy':
        resultado = { ...resultado, voy: false }
        break
      case 'quitar-guardado':
        resultado = { ...resultado, guardado: false }
        break
    }
  }
  return resultado
}

/**
 * El aviso que se muestra cuando sacar el ♥ también saca el ✓ Voy (porque
 * `estadoAntes.voy` era `true`). `null` si no hacía falta avisar nada.
 */
export function avisoAlQuitarGuardado(estadoAntes: EstadoGuardarVoy): string | null {
  return estadoAntes.voy ? TEXTO_SACASTE_GUARDADO_CON_VOY : null
}
