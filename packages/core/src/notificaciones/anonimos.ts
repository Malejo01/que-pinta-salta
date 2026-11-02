/**
 * Avisos a teléfonos SIN cuenta (R82 / Q4-2). Puro: convierte una fila anónima
 * de `push_tokens` (user_id nulo) en los mismos tipos que ya consumen
 * `armarTanda` (cron) y `destinatariosAvisoEquipo` (aviso del equipo), así no
 * hay una segunda lógica de silencio, tope ni dedupe.
 *
 * - Quién manda (decisión 1): en una fila anónima, `avisos_equipo` y
 *   `avisos_patrocinados`; con cuenta, `notification_preferences`. Por eso la
 *   lectura de usuarios filtra `user_id is not null` y la de anónimos
 *   `user_id is null`: como el token es único en la tabla, un token no puede
 *   salir dos veces. `sinTokensRepetidos` lo garantiza igual en memoria.
 * - Un anónimo nunca recibe recordatorios de favoritos, novedades de lo que
 *   sigue ni Radar (requieren cuenta).
 * - El «id» de un anónimo en la tanda es el id de su fila de `push_tokens`:
 *   las claves de dedupe (`claveDedupe*`) reciben un string, y un uuid de
 *   token no choca con uno de usuario. Al registrar el envío, quien llama
 *   escribe `push_token_id` en vez de `user_id` (`filaDeEnvio`).
 * - Falla cerrado: cualquier interruptor que no sea `true` estricto cuenta
 *   como apagado.
 */
import type { UsuarioParaAvisoEquipo } from './equipo'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from './preferencias'
import type { EnvioRegistradoParaTanda, UsuarioParaTanda } from './tanda'

export interface FilaTokenAnonimo {
  /** `push_tokens.id` */
  id: string
  token: string
  avisos_equipo: boolean | null
  avisos_patrocinados: boolean | null
}

export function preferenciasDeAnonimo(fila: Pick<FilaTokenAnonimo, 'avisos_equipo' | 'avisos_patrocinados'>): PreferenciasNotificacion {
  return {
    ...PREFERENCIAS_POR_DEFECTO,
    radar_channel: 'email',
    favorite_reminders: false,
    follow_news: false,
    announcements: fila.avisos_equipo === true,
    sponsored: fila.avisos_patrocinados === true,
  }
}

export function usuarioParaTandaDeAnonimo(fila: FilaTokenAnonimo, enviosRegistrados: EnvioRegistradoParaTanda[]): UsuarioParaTanda {
  return {
    userId: fila.id,
    preferencias: preferenciasDeAnonimo(fila),
    tokens: [fila.token],
    favoritos: [],
    novedades: [],
    enviosRegistrados,
  }
}

export function usuarioParaAvisoEquipoDeAnonimo(
  fila: FilaTokenAnonimo,
  enviosRegistrados: { dedupe_key: string; sent_at: string | Date }[],
): UsuarioParaAvisoEquipo {
  return {
    userId: fila.id,
    preferencias: preferenciasDeAnonimo(fila),
    tokens: [fila.token],
    enviosRegistrados,
  }
}

/**
 * Las filas anónimas cuyo token NO está ya entre los tokens con cuenta. Con la
 * base sana no descarta nada (el token es único); es la red por si una lectura
 * vieja y una nueva se cruzan a mitad de un vínculo.
 */
export function sinTokensRepetidos<T extends { token: string }>(anonimos: T[], tokensConCuenta: Iterable<string>): T[] {
  const vistos = new Set(tokensConCuenta)
  const resultado: T[] = []
  for (const fila of anonimos) {
    if (vistos.has(fila.token)) continue
    vistos.add(fila.token)
    resultado.push(fila)
  }
  return resultado
}

/** Destinatario de la fila de `notification_sends`: `user_id` o, para un anónimo, `push_token_id`. */
export function destinatarioDeEnvio(id: string, idsAnonimos: ReadonlySet<string>): { user_id: string | null; push_token_id?: string } {
  return idsAnonimos.has(id) ? { user_id: null, push_token_id: id } : { user_id: id }
}
