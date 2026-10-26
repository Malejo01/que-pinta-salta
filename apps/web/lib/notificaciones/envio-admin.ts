/**
 * Envío de push desde el panel admin (Ronda 70, tarea 70-b). Módulo de
 * servidor normal (NO `'use server'`): lo importan las server actions de
 * `lib/admin/`. Comparte con el cron (`app/api/cron/notificaciones/route.ts`)
 * la misma regla de "envío real" y el mismo cliente de Expo.
 *
 * Nunca devuelve ni loguea un token hacia afuera salvo `tokensInvalidos` y
 * `tokensConExito`, que existen solo para que quien llama (una action del
 * servidor) borre tokens muertos o marque a quién le llegó, y que jamás deben
 * viajar al navegador.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  enviarLote,
  leerReceipts,
  tokensInvalidos as tokensInvalidosDe,
  type MensajePush,
} from '@/lib/notificaciones/expo-push'

/**
 * Misma regla EXACTA que `modoEnvioReal()` del cron
 * (`app/api/cron/notificaciones/route.ts`): solo `PUSH_ENVIO_REAL === '1'`
 * manda de verdad; cualquier otra cosa es simulacro. Duplicada a propósito (una
 * línea) para no tocar el cron: si cambia allá, cambiar acá.
 */
export function modoEnvioReal(): boolean {
  return process.env.PUSH_ENVIO_REAL === '1'
}

export interface ResumenEnvioAdmin {
  /** `true` si no se llamó a Expo (modo simulado). */
  simulado: boolean
  /** Mensajes (teléfonos) con ticket `ok`. */
  enviados: number
  /** Mensajes sin ticket `ok` (token inválido, lote caído, ticket con error). */
  fallidos: number
  /** Solo para que quien llama los borre de `push_tokens`. No mostrar. */
  tokensInvalidos: string[]
  /** Solo para que quien llama marque a quién le llegó. No mostrar. */
  tokensConExito: string[]
  /** Cantidad de lotes que fallaron enteros. */
  erroresLote: number
}

/**
 * Manda `mensajes` por Expo. En simulado NO hace `fetch` ni escribe nada.
 * En modo real: `enviarLote` + `leerReceipts` + `tokensInvalidos`, igual que el
 * cron. No toca la base: el borrado de tokens y el registro son de quien llama.
 */
export async function enviarPushATokens(mensajes: MensajePush[]): Promise<ResumenEnvioAdmin> {
  if (!modoEnvioReal()) {
    return {
      simulado: true,
      enviados: 0,
      fallidos: 0,
      tokensInvalidos: [],
      tokensConExito: [],
      erroresLote: 0,
    }
  }

  const { tickets, descartados, erroresLote: erroresEnvio } = await enviarLote(mensajes)

  const idsTickets = tickets
    .map((t) => t.ticket)
    .filter((t): t is { status: 'ok'; id: string } => t?.status === 'ok')
    .map((t) => t.id)
  const { receipts, erroresLote: erroresReceipts } = await leerReceipts(idsTickets)

  const tokensConExito = tickets.filter((t) => t.ticket?.status === 'ok').map((t) => t.token)
  if (erroresEnvio.length + erroresReceipts.length > 0) {
    // Los strings de error de expo-push.ts son seguros para loguear (sin tokens).
    console.error('[envio-admin] errores de lote al mandar push:', erroresEnvio.length + erroresReceipts.length)
  }

  return {
    simulado: false,
    enviados: tokensConExito.length,
    fallidos: tickets.length - tokensConExito.length + descartados,
    tokensInvalidos: tokensInvalidosDe(tickets, receipts),
    tokensConExito,
    erroresLote: erroresEnvio.length + erroresReceipts.length,
  }
}

/**
 * Los tokens de UN usuario (`push_tokens.user_id`). Quien llama pasa el
 * `userId` de la sesión, nunca uno que venga de la entrada. `null` si la
 * lectura falló (se loguea solo el código).
 */
export async function tokensDelUsuario(supabase: SupabaseClient, userId: string): Promise<string[] | null> {
  const { data, error } = await supabase.from('push_tokens').select('token').eq('user_id', userId)
  if (error) {
    console.error('[envio-admin] error leyendo push_tokens del usuario:', error.code)
    return null
  }
  return ((data ?? []) as { token: string }[]).map((fila) => fila.token)
}
