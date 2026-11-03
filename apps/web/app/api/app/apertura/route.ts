import { createAdminClient } from '@/lib/supabase/server'
import { leerCuerpoJson } from '@/lib/push/cuerpo'
import { crearLimitador, ipDeRequest } from '@/lib/push/limite'
import { respuestaError, respuestaLimite, respuestaOk } from '@/lib/push/respuestas'
import { filaDeApertura, validarApertura } from '@/lib/uso/apertura'

export const dynamic = 'force-dynamic'

const HORA_MS = 60 * 60 * 1000
/** Generoso por IP: las operadoras móviles comparten IP entre mucha gente. */
const porIp = crearLimitador({ max: 120, ventanaMs: HORA_MS })
/** La app avisa una vez por día (y al volver al frente): 12 por hora alcanza. */
const porId = crearLimitador({ max: 12, ventanaMs: HORA_MS })

/**
 * `POST /api/app/apertura` (Q5-13): la app avisa que se abrió, para «personas
 * activas por día y por semana» de /admin/uso. Anónimo: el cuerpo es
 * `{ idMetricas, plataforma, version?, conCuenta? }`; `idMetricas` es un id
 * aleatorio que vive solo en el teléfono y el servidor guarda únicamente
 * sus hashes del día y de la semana (lib/uso/apertura.ts).
 *
 * Mismas guardas que `/api/push/registrar`: JSON exacto y chico, límite por
 * IP y por id (en memoria, por instancia), formato estricto, y recién ahí la
 * RPC con la service key. Exige el User-Agent de la app (`QuePintaSaltaApp/`),
 * como la vista de evento: un navegador o un bot no suman. Nunca se loguea el
 * id ni el cuerpo: solo el `code` de un error.
 */
export async function POST(request: Request) {
  if (!/^QuePintaSaltaApp\//.test(request.headers.get('user-agent') ?? '')) return respuestaError(400)

  const leido = await leerCuerpoJson(request, 512)
  if (!leido.ok) return respuestaError(leido.status)

  const limiteIp = porIp.permitir(ipDeRequest(request.headers))
  if (!limiteIp.ok) return respuestaLimite(limiteIp.reintentarEnS)

  const datos = validarApertura(leido.cuerpo)
  if (!datos) return respuestaError(400)

  const limiteId = porId.permitir(datos.idMetricas)
  if (!limiteId.ok) return respuestaLimite(limiteId.reintentarEnS)

  const fila = filaDeApertura(datos, new Date())
  try {
    const { error } = await createAdminClient().rpc('registrar_apertura_app', {
      p_day: fila.day,
      p_hash_dia: fila.hashDia,
      p_hash_semana: fila.hashSemana,
      p_plataforma: datos.plataforma,
      // Sin versión va null (la función no tiene defaults: omitirlo haría fallar la llamada).
      p_version: datos.version as string,
      p_con_cuenta: datos.conCuenta,
    })
    if (error) {
      console.error('[app/apertura] la RPC falló', { code: error.code ?? 'sin-codigo' })
      return respuestaError(500)
    }
  } catch {
    console.error('[app/apertura] error inesperado')
    return respuestaError(500)
  }
  return respuestaOk({})
}
