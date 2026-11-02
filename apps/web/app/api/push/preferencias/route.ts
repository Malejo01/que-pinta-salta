import { createAdminClient } from '@/lib/supabase/server'
import { leerCuerpoJson } from '@/lib/push/cuerpo'
import { crearLimitador, ipDeRequest } from '@/lib/push/limite'
import { respuestaError, respuestaLimite, respuestaOk } from '@/lib/push/respuestas'
import { validarPreferencias } from '@/lib/push/validacion'

export const dynamic = 'force-dynamic'

const HORA_MS = 60 * 60 * 1000
const porIp = crearLimitador({ max: 120, ventanaMs: HORA_MS })
const porDispositivo = crearLimitador({ max: 30, ventanaMs: HORA_MS })

/**
 * `POST /api/push/preferencias` (R82 / Q4-2): prende o apaga los avisos del
 * equipo y los patrocinados de un teléfono SIN cuenta. Pública, solo `POST`,
 * sin CORS (ver `registrar`).
 *
 * Cuerpo: `{ token, deviceId, avisosEquipo?, avisosPatrocinados? }` (al menos
 * un booleano). Regla estricta (decisión 2): token y deviceId tienen que
 * coincidir con la fila, y la fila tiene que ser anónima (con cuenta mandan
 * las preferencias de la cuenta).
 *
 * Responde SIEMPRE 200 `{ ok: true }` si el pedido tiene buena forma, haya
 * cambiado algo o no (token inexistente, otro deviceId, fila con cuenta): no
 * sirve para averiguar qué tokens existen. Los únicos 4xx son de forma (400),
 * tipo (415), tamaño (413) y límite (429).
 */
export async function POST(request: Request) {
  const leido = await leerCuerpoJson(request)
  if (!leido.ok) return respuestaError(leido.status)

  const limiteIp = porIp.permitir(ipDeRequest(request.headers))
  if (!limiteIp.ok) return respuestaLimite(limiteIp.reintentarEnS)

  const validado = validarPreferencias(leido.cuerpo)
  if (!validado.ok) return respuestaError(400)
  const { token, deviceId, avisosEquipo, avisosPatrocinados } = validado.datos

  const limiteDispositivo = porDispositivo.permitir(deviceId)
  if (!limiteDispositivo.ok) return respuestaLimite(limiteDispositivo.reintentarEnS)

  try {
    const { error } = await createAdminClient().rpc('set_push_preferences', {
      p_token: token,
      p_device_id: deviceId,
      p_avisos_equipo: avisosEquipo ?? undefined,
      p_avisos_patrocinados: avisosPatrocinados ?? undefined,
    })
    if (error) {
      console.error('[push/preferencias] la RPC falló', { code: error.code ?? 'sin-codigo' })
      return respuestaError(500)
    }
    return respuestaOk({})
  } catch {
    console.error('[push/preferencias] error inesperado')
    return respuestaError(500)
  }
}
