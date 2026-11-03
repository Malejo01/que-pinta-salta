'use client'

/**
 * Q5-3 · Los pedidos del formulario público en /admin/lugares-chicos:
 * pasarlos a borrador, descartarlos o borrar el contacto de quien pidió.
 */
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  borrarContactoPedido,
  descartarPedido,
  pasarPedidoABorrador,
  type EstadoAccionLugar,
} from '@/lib/admin/lugares-chicos-actions'
import { ETIQUETA_TIPO, TIPOS_LUGAR, esTipoLugar } from '@qps/core/lugares/permanentes'

export type PedidoAdmin = {
  id: string
  nombre: string
  direccion: string
  tipo: string | null
  comentario: string | null
  link: string | null
  contacto: string | null
  idioma: string
  estado: string
  created_at: string
}

const CAMPO = 'h-11 rounded-md border border-input bg-background px-3 text-sm'

function Mensaje({ estado }: { estado: EstadoAccionLugar }) {
  return (
    <p role="status" aria-live="polite" className={estado?.ok === false ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
      {estado?.mensaje ?? ''}
    </p>
  )
}

export function PedidoLugarChicos({ pedido }: { pedido: PedidoAdmin }) {
  const [pasado, pasar, pasando] = useActionState<EstadoAccionLugar, FormData>(pasarPedidoABorrador, null)
  const [descartado, descartar, descartando] = useActionState<EstadoAccionLugar, FormData>(descartarPedido, null)
  const [borrado, borrar, borrando] = useActionState<EstadoAccionLugar, FormData>(borrarContactoPedido, null)
  const nuevo = pedido.estado === 'nuevo'
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm">
      <p className="font-semibold">
        {pedido.nombre} <span className="font-normal text-muted-foreground">· {pedido.direccion}</span>
      </p>
      <p className="text-muted-foreground">
        {esTipoLugar(pedido.tipo) ? ETIQUETA_TIPO.es[pedido.tipo] : 'Sin tipo'} · {pedido.idioma === 'en' ? 'en inglés' : 'en castellano'} ·{' '}
        {new Date(pedido.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Salta' })}
      </p>
      {pedido.comentario ? <p className="whitespace-pre-line">{pedido.comentario}</p> : null}
      {pedido.link ? (
        <p>
          <a href={pedido.link} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
            {pedido.link}
          </a>
        </p>
      ) : null}
      {pedido.contacto ? <p>Contacto (no se publica): {pedido.contacto}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        {nuevo ? (
          <form action={pasar} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={pedido.id} />
            <label className="flex flex-col gap-1 text-xs font-medium">
              Tipo
              <select name="tipo" defaultValue={esTipoLugar(pedido.tipo) ? pedido.tipo : ''} className={CAMPO}>
                <option value="">Elegí uno</option>
                {TIPOS_LUGAR.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO.es[t]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={pasando} className="h-11 min-h-11 px-4">
              Pasar a borrador
            </Button>
          </form>
        ) : null}
        {nuevo ? (
          <form action={descartar}>
            <input type="hidden" name="id" value={pedido.id} />
            <Button type="submit" variant="outline" disabled={descartando} className="h-11 min-h-11 px-4">
              Descartar
            </Button>
          </form>
        ) : null}
        {pedido.contacto ? (
          <form action={borrar}>
            <input type="hidden" name="id" value={pedido.id} />
            <Button type="submit" variant="outline" disabled={borrando} className="h-11 min-h-11 px-4">
              Borrar contacto
            </Button>
          </form>
        ) : null}
      </div>
      <Mensaje estado={pasado ?? descartado ?? borrado} />
    </li>
  )
}
