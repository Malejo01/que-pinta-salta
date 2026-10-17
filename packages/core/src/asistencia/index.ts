/**
 * "Voy" / "Me interesa" de la ficha de un evento (R38, tarea 38-a). Lógica
 * pura (sin Supabase, sin React, sin imports de ninguna app): la usan la web
 * y la app para que el texto del botón y la regla de marcar/desmarcar sean
 * exactamente los mismos en los dos lugares, probado por un test de
 * equivalencia.
 *
 * Regla de datos: acá solo se trabaja con cantidades y con la marca propia
 * del usuario de la sesión (`TipoAsistencia | null`). Nunca con quién marcó
 * cada tipo: eso no sale de la base (`event_attendance_counts` es la vista
 * pública, sin `user_id`; `event_attendance` solo se lee/escribe acotado al
 * usuario de la sesión, nunca para ver la lista de otros).
 */

export type TipoAsistencia = 'voy' | 'me_interesa'

/**
 * [COMPLETAR: confirmar N con Mauro, propuesta 3]
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

/**
 * Qué marca queda después de tocar `tocado`, dado que la marca propia era
 * `actual`: tocar la misma que ya estaba la saca (vuelve a `null`); tocar la
 * otra, o tocar la primera marca (sin marca previa), la deja en `tocado`.
 */
export function siguienteMarca(actual: TipoAsistencia | null, tocado: TipoAsistencia): TipoAsistencia | null {
  return actual === tocado ? null : tocado
}

export const ETIQUETAS_ASISTENCIA: Record<TipoAsistencia, string> = {
  voy: 'Voy',
  me_interesa: 'Me interesa',
}

/**
 * El texto del botón: único lugar donde se arma ("Voy · 5" o "Voy", según
 * `cantidadVisible`). La web y la app llaman a esta misma función, así que
 * un test de equivalencia alcanza para probar que muestran lo mismo.
 */
export function textoBoton(tipo: TipoAsistencia, cantidad: number): string {
  const visible = cantidadVisible(cantidad)
  return visible === null ? ETIQUETAS_ASISTENCIA[tipo] : `${ETIQUETAS_ASISTENCIA[tipo]} · ${visible}`
}

/** El texto de invitación a entrar cuando no hay sesión (botones de asistencia). */
export const TEXTO_ENTRAR_PARA_MARCAR = 'Entrá para marcar si vas.'
