import { NextResponse } from 'next/server'

/**
 * Respuestas de las rutas públicas de push. Mensajes genéricos a propósito: un
 * 400 no dice qué campo falló y un 500 no dice qué pasó en la base.
 * `Cache-Control: no-store` siempre (son respuestas por dispositivo).
 */
const SIN_CACHE = { 'cache-control': 'no-store' }

export function respuestaError(status: 400 | 413 | 415 | 500): NextResponse {
  const error =
    status === 500 ? 'No se pudo completar' : status === 413 ? 'Pedido demasiado grande' : status === 415 ? 'Tipo de contenido no admitido' : 'Pedido inválido'
  return NextResponse.json({ error }, { status, headers: SIN_CACHE })
}

export function respuestaLimite(reintentarEnS: number): NextResponse {
  return NextResponse.json(
    { error: 'Demasiados pedidos' },
    { status: 429, headers: { ...SIN_CACHE, 'retry-after': String(reintentarEnS) } },
  )
}

export function respuestaOk(cuerpo: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: true, ...cuerpo }, { status: 200, headers: SIN_CACHE })
}
