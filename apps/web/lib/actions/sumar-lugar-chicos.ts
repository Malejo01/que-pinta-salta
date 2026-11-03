'use server'

/**
 * Q5-3 · La server action del formulario público «Sumá un lugar para chicos».
 *
 * Orden (nada toca la base antes del paso 4):
 *  1. Anti-spam: honeypot y tiempo mínimo (lib/lugares-chicos/pedido.ts). Un
 *     bot recibe «gracias» igual y no se guarda nada.
 *  2. Límite por IP en memoria: 5 pedidos por hora (por instancia, ver
 *     lib/push/limite.ts).
 *  3. Validación (errores como códigos; el texto lo pone la interfaz).
 *  4. Insert con la service key: la tabla no tiene policy de INSERT.
 *
 * No se loguea nada de lo que escribió la persona (ni el contacto ni la IP):
 * solo el `code` de un error de la base.
 */
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { crearLimitador, ipDeRequest } from '@/lib/push/limite'
import { evaluarAntiSpam, validarPedido, type CodigoPedido } from '@/lib/lugares-chicos/pedido'

export type EstadoPedido = { estado: 'inicial' } | { estado: 'enviado' } | { estado: 'error'; codigo: CodigoPedido }

const porIp = crearLimitador({ max: 5, ventanaMs: 60 * 60 * 1000 })

export async function sumarLugarChicos(_prev: EstadoPedido, fd: FormData): Promise<EstadoPedido> {
  const leer = (clave: string) => {
    const v = fd.get(clave)
    return typeof v === 'string' ? v : null
  }

  const antiSpam = evaluarAntiSpam(leer, Date.now())
  if (antiSpam === 'bot') return { estado: 'enviado' }
  if (antiSpam === 'vencido') return { estado: 'error', codigo: 'vencido' }

  const limite = porIp.permitir(ipDeRequest(await headers()))
  if (!limite.ok) return { estado: 'error', codigo: 'limite' }

  const validado = validarPedido(leer)
  if (!validado.ok) return { estado: 'error', codigo: validado.codigo }

  const idioma = leer('idioma') === 'en' ? 'en' : 'es'
  try {
    const { error } = await createAdminClient()
      .from('lugares_chicos_pedidos')
      .insert({ ...validado.datos, idioma })
    if (error) {
      console.error('[sumar-lugar-chicos] no se pudo guardar', error.code ?? 'sin-codigo')
      return { estado: 'error', codigo: 'servidor' }
    }
  } catch {
    console.error('[sumar-lugar-chicos] error inesperado')
    return { estado: 'error', codigo: 'servidor' }
  }
  return { estado: 'enviado' }
}
