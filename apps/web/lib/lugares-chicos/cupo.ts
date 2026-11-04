/**
 * Q6-7 · Cupo diario de «Sumá un lugar para chicos» EN LA BASE (migración
 * 20261104020000_q6_revision_q5.sql), además del límite en memoria de
 * lib/push/limite.ts, que es por instancia: en Vercel cada instancia tiene el
 * suyo y se pierde en cada arranque en frío.
 *
 * A la base nunca llega la IP: llega `claveDeCupo`, un HMAC-SHA256 de la IP
 * con el día de Salta, con una clave que la base no tiene (la service key, que
 * solo vive en el servidor). Con la clave de un día no se puede seguir a nadie
 * al día siguiente, y sin el secreto no se puede recorrer el espacio de IPs
 * para dar vuelta el hash.
 *
 * Si la RPC falla (por ejemplo, la migración todavía no está aplicada), el
 * pedido sigue: el límite en memoria, el honeypot y el tiempo mínimo siguen
 * en pie, y medir no puede dejar sin formulario a la gente. Solo se loguea el
 * `code` del error.
 */
import { createHmac } from 'node:crypto'
import { formatSaltaDayKey } from '@qps/core/date-format'

/** Pedidos por día desde una misma conexión (IP). */
export const MAX_PEDIDOS_POR_CLAVE_DIA = 10
/** Pedidos por día en total: frena un ataque desde muchas IPs. */
export const MAX_PEDIDOS_POR_DIA = 100

/** La clave del cupo: 64 hex. Distinta cada día para la misma IP. */
export function claveDeCupo(ip: string, ahora: Date, secreto: string): string {
  return createHmac('sha256', secreto).update(`qps:cupo-pedido-lugar-chicos:v1:${formatSaltaDayKey(ahora)}:${ip}`).digest('hex')
}

/** El secreto del HMAC: la service key (si falta, tampoco se podría guardar el pedido). */
export function secretoDeCupo(): string | null {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return s ? s : null
}

type ClienteRpc = {
  rpc: (
    fn: 'tomar_cupo_pedido_lugar_chicos',
    args: { p_clave: string; p_max_por_clave: number; p_max_por_dia: number },
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>
}

/** `'agotado'` solo si la base dijo que no; cualquier falla deja pasar (ver arriba). */
export async function tomarCupoPedido(cliente: ClienteRpc, clave: string): Promise<'ok' | 'agotado'> {
  try {
    const { data, error } = await cliente.rpc('tomar_cupo_pedido_lugar_chicos', {
      p_clave: clave,
      p_max_por_clave: MAX_PEDIDOS_POR_CLAVE_DIA,
      p_max_por_dia: MAX_PEDIDOS_POR_DIA,
    })
    if (error) {
      console.error('[sumar-lugar-chicos] el cupo diario falló', error.code ?? 'sin-codigo')
      return 'ok'
    }
    return data === false ? 'agotado' : 'ok'
  } catch {
    console.error('[sumar-lugar-chicos] el cupo diario falló (inesperado)')
    return 'ok'
  }
}
