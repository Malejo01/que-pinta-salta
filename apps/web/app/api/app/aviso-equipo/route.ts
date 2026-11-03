import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { crearLimitador, ipDeRequest } from '@/lib/push/limite'
import { respuestaError, respuestaLimite } from '@/lib/push/respuestas'
import { rangoDiaAvisoEquipo } from '@qps/core/notificaciones/equipo'

export const dynamic = 'force-dynamic'

const HORA_MS = 60 * 60 * 1000
/**
 * Generoso por IP: las operadoras móviles comparten IP entre mucha gente y la
 * app consulta solo los jueves (al abrirse o volver al frente). Casi todo lo
 * contesta la CDN (ver `Cache-Control` abajo).
 */
const porIp = crearLimitador({ max: 600, ventanaMs: HORA_MS })

/**
 * Un «sí» no se deshace (el aviso ya salió): se puede guardar un rato largo.
 * Un «no» puede cambiar en cualquier momento del día: un minuto en la CDN y
 * nada en el teléfono.
 */
const CACHE_HUBO = 'public, max-age=300, s-maxage=3600'
const CACHE_NO_HUBO = 'public, max-age=0, s-maxage=60'

/**
 * `GET /api/app/aviso-equipo?dia=AAAA-MM-DD` (Q6-8): ¿el equipo mandó un
 * «Aviso del equipo» ese día de Salta? Responde `{ ok: true, dia, hubo }`.
 *
 * La usa la app el jueves para no dejar programado «Este finde pinta» si el
 * aviso del equipo ya salió (por ejemplo, llegó con la app cerrada y la
 * persona lo descartó sin tocarlo). Es un dato global, igual para todos: sin
 * sesión, sin ids, sin tokens y sin conteos. Solo ayer, hoy o mañana (no sirve
 * para recorrer el historial). Lee `notification_sends` (`kind 'anuncio'`,
 * reservado o enviado) con la service key; nunca loguea nada del pedido.
 *
 * Si algo falla, 500 sin caché: la app lo toma como «no sé» y programa el
 * aviso del finde como siempre.
 */
export async function GET(request: Request) {
  const limite = porIp.permitir(ipDeRequest(request.headers))
  if (!limite.ok) return respuestaLimite(limite.reintentarEnS)

  const dia = new URL(request.url).searchParams.get('dia')
  const rango = rangoDiaAvisoEquipo(dia, new Date())
  if (!rango || dia === null) return respuestaError(400)

  try {
    const { data, error } = await createAdminClient()
      .from('notification_sends')
      .select('id')
      .eq('kind', 'anuncio')
      .in('status', ['SUCCESS', 'PENDIENTE'])
      .gte('sent_at', rango.desde)
      .lt('sent_at', rango.hasta)
      .limit(1)
    if (error) {
      console.error('[app/aviso-equipo] la lectura falló', { code: error.code ?? 'sin-codigo' })
      return respuestaError(500)
    }
    const hubo = Array.isArray(data) && data.length > 0
    return NextResponse.json({ ok: true, dia, hubo }, { status: 200, headers: { 'cache-control': hubo ? CACHE_HUBO : CACHE_NO_HUBO } })
  } catch {
    console.error('[app/aviso-equipo] error inesperado')
    return respuestaError(500)
  }
}
