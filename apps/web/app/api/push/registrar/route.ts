import { createAdminClient } from '@/lib/supabase/server'
import { leerCuerpoJson } from '@/lib/push/cuerpo'
import { crearLimitador, ipDeRequest } from '@/lib/push/limite'
import { respuestaError, respuestaLimite, respuestaOk } from '@/lib/push/respuestas'
import { validarRegistro } from '@/lib/push/validacion'

export const dynamic = 'force-dynamic'

const HORA_MS = 60 * 60 * 1000
/** Generoso por IP: las operadoras móviles comparten IP entre mucha gente. */
const porIp = crearLimitador({ max: 60, ventanaMs: HORA_MS })
/**
 * Q5-16 (decisión nº5 de Mauro sobre la Q4): 6 por hora por dispositivo, como
 * decía la propuesta (antes, 20). La app registra al arrancar; si pasa el
 * límite, recibe 429 y sigue con el registro que ya tenía (motivo «limite»).
 */
const MAX_REGISTROS_POR_HORA = 6
const porDispositivo = crearLimitador({ max: MAX_REGISTROS_POR_HORA, ventanaMs: HORA_MS })

/**
 * `POST /api/push/registrar` (R82 / Q4-2): alta o renovación del token de push
 * de un teléfono, CON O SIN sesión. Es pública a propósito: no usa
 * `hasBearerSecret` ni cookie. Solo `POST` (sin `OPTIONS`: un navegador ajeno
 * no pasa el preflight; la app nativa no lo necesita) y sin `Access-Control-*`.
 *
 * Cuerpo: `{ token, plataforma: 'android' | 'ios', deviceId?, idioma? }`.
 * Si no viene `deviceId`, lo genera el servidor (decisión 3) y lo devuelve: el
 * teléfono lo guarda y lo manda de ahí en más. Es la «contraseña» de la fila
 * anónima: sin él no se pueden cambiar sus interruptores.
 *
 * Orden de las guardas (nada toca la base antes del paso 5):
 *  1. Content-Type JSON exacto (415), cuerpo ≤ 2 KB (413), JSON válido (400).
 *  2. Límite por IP (429 + Retry-After).
 *  3. Forma y formato (400 genérico, sin decir qué campo).
 *  4. Límite por dispositivo (o por token en el primer registro).
 *  5. RPC `register_anon_push_token` con la service key (EXECUTE solo service_role).
 *
 * Respuestas:
 *  - 200 `{ ok, registrado: true, deviceId, avisosEquipo, avisosPatrocinados }`.
 *  - 200 `{ ok, registrado: false }` si el token ya es de OTRO dispositivo: no
 *    confirma ni niega nada más (la app no reintenta en bucle).
 *  - 500 genérico si falla la base. Se loguea solo el `code` del error: nunca
 *    el token, el deviceId ni el `message`.
 */
export async function POST(request: Request) {
  const leido = await leerCuerpoJson(request)
  if (!leido.ok) return respuestaError(leido.status)

  const limiteIp = porIp.permitir(ipDeRequest(request.headers))
  if (!limiteIp.ok) return respuestaLimite(limiteIp.reintentarEnS)

  const validado = validarRegistro(leido.cuerpo)
  if (!validado.ok) return respuestaError(400)
  const { token, plataforma, idioma } = validado.datos

  const limiteDispositivo = porDispositivo.permitir(validado.datos.deviceId ?? `token:${token}`)
  if (!limiteDispositivo.ok) return respuestaLimite(limiteDispositivo.reintentarEnS)

  const deviceId = validado.datos.deviceId ?? crypto.randomUUID()

  try {
    const admin = createAdminClient()
    const { data: registrado, error } = await admin.rpc('register_anon_push_token', {
      p_token: token,
      p_device_id: deviceId,
      p_platform: plataforma,
      p_idioma: idioma ?? undefined,
    })
    if (error) {
      console.error('[push/registrar] la RPC falló', { code: error.code ?? 'sin-codigo' })
      return respuestaError(500)
    }
    if (registrado !== true) return respuestaOk({ registrado: false })

    const { data: fila, error: errorLectura } = await admin
      .from('push_tokens')
      .select('user_id, avisos_equipo, avisos_patrocinados')
      .eq('token', token)
      .eq('device_id', deviceId)
      .maybeSingle()
    // R-4: con cuenta (`user_id` no nulo), los interruptores de la fila no
    // valen (mandan las preferencias de la cuenta, decisión 1): no se
    // devuelven, para que la app no los tome como «el estado sin cuenta».
    if (errorLectura || !fila || fila.user_id !== null) {
      return respuestaOk({ registrado: true, deviceId })
    }
    return respuestaOk({
      registrado: true,
      deviceId,
      avisosEquipo: fila.avisos_equipo === true,
      avisosPatrocinados: fila.avisos_patrocinados === true,
    })
  } catch {
    console.error('[push/registrar] error inesperado')
    return respuestaError(500)
  }
}
