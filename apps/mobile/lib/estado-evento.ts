// QPS-195 (R56, tarea 56-b): hoy marcar Voy o Guardar no verifica el estado
// del evento — con el UUID de un borrador se podía escribir igual. Este
// módulo contesta esa única pregunta ("¿este evento admite que alguien
// agregue una marca?"), para que `lib/asistencia.ts` y `lib/favoritos.ts` la
// consulten antes de cualquier escritura que AGREGUE (marcar Voy, Guardar).
// Sacar una marca (quitar Voy, desmarcar) nunca pasa por acá: si algo ya
// estaba escrito, sacarlo tiene que funcionar siempre, pase lo que pase con
// el evento (ver el encargo de 56-b).
//
// El cliente que se usa para el `select` es el de la SESIÓN del usuario
// (`./supabase`), nunca uno privilegiado: la RLS de `events` ya hace la
// mitad del trabajo acá. Esa RLS solo deja ver eventos `PUBLISHED` a quien no
// es dueño/admin, así que un borrador (`DRAFT`) le responde a esta consulta
// exactamente "no existe ninguna fila" — lo mismo que respondería un id que
// no es de ningún evento. No hace falta (ni conviene) un cliente que vea más:
// un service role vería el `status` real de un borrador ajeno, y ese dato no
// tiene por qué llegar nunca a este código.
//
// `clasificarErrorTabla` (lib/errores.ts) no se usa acá: esa función separa
// `'no-disponible'` (la tabla todavía no existe en este entorno) de
// `'error'`, una distinción que le sirve a quien tiene un tercer estado para
// eso (`obtenerAsistencia`, `obtenerFavoritos`). Acá el tipo de retorno es
// nada más `'si' | 'no' | 'error'`: cualquier error de la consulta (de red,
// de permisos, o de una tabla que no existe todavía) cae igual en `'error'`,
// así que no hay nada que esa clasificación cambiaría.
import { supabase } from './supabase'

/**
 * `'si'` solo si `eventId` es un evento `PUBLISHED`. `'no'` para cualquier
 * otro caso que la consulta pueda devolver sin error: sin fila (la RLS oculta
 * los borradores — un id de borrador y un id que no existe llegan acá
 * EXACTAMENTE igual, sin fila) o un `status` que no sea `PUBLISHED` (por si
 * algún día la RLS cambiara y dejara ver otros estados). `'error'` para un
 * error de verdad (red, permisos, tabla que todavía no existe en este
 * entorno).
 *
 * El resultado nunca filtra el estado real del evento: no hay forma de
 * distinguir, desde afuera de esta función, un borrador de un id inventado.
 */
export async function estadoPermiteAgregar(eventId: string): Promise<'si' | 'no' | 'error'> {
  if (!supabase) return 'error'

  try {
    const { data, error } = await supabase.from('events').select('status').eq('id', eventId).maybeSingle()

    if (error) return 'error'

    return data?.status === 'PUBLISHED' ? 'si' : 'no'
  } catch {
    return 'error'
  }
}
