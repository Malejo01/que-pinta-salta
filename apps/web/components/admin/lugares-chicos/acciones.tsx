'use client'

/**
 * Q5-1 · Verificar y cambiar el estado de una ficha (publicar, vencido,
 * borrador, archivar con motivo). Dos formularios chicos con su propio
 * mensaje en vivo.
 */
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  cambiarEstadoLugarChicos,
  verificarLugarChicos,
  type EstadoAccionLugar,
} from '@/lib/admin/lugares-chicos-actions'
import { MOTIVOS_ARCHIVO } from '@/lib/lugares-chicos/formulario'
import { ETIQUETA_FUENTE, FUENTES_PARA_ELEGIR } from '@/lib/lugares-chicos/textos-admin'

const CAMPO = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Mensaje({ estado, id }: { estado: EstadoAccionLugar; id: string }) {
  return (
    <p id={id} role="status" aria-live="polite" className={estado?.ok === false ? 'text-sm text-error' : 'text-sm text-muted-foreground'}>
      {estado?.mensaje ?? ''}
    </p>
  )
}

export function AccionesLugarChicos({ id, estadoActual }: { id: string; estadoActual: string }) {
  const [verif, accionVerificar, verificando] = useActionState<EstadoAccionLugar, FormData>(verificarLugarChicos, null)
  const [cambio, accionEstado, cambiando] = useActionState<EstadoAccionLugar, FormData>(cambiarEstadoLugarChicos, null)

  return (
    <div className="flex flex-col gap-6">
      <form action={accionVerificar} className="flex flex-col gap-3 rounded-md border border-border p-4" aria-describedby="verificar-estado">
        <h3 className="text-sm font-semibold">Verificar hoy</h3>
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Cómo lo confirmaste
            <select name="fuente" required defaultValue="" className={CAMPO}>
              <option value="" disabled>
                Elegí una
              </option>
              {FUENTES_PARA_ELEGIR.map((f) => (
                <option key={f} value={f}>
                  {ETIQUETA_FUENTE[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Detalle (link o nota)
            <input name="fuente_detalle" maxLength={300} className={CAMPO} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={verificando} className="h-11 min-h-11 px-4">
            Marcar verificado hoy
          </Button>
          <Mensaje estado={verif} id="verificar-estado" />
        </div>
      </form>

      <form action={accionEstado} className="flex flex-col gap-3 rounded-md border border-border p-4" aria-describedby="estado-estado">
        <h3 className="text-sm font-semibold">Estado</h3>
        <input type="hidden" name="id" value={id} />
        <div className="flex flex-wrap gap-2">
          {estadoActual !== 'publicado' ? (
            <Button type="submit" name="accion" value="publicar" disabled={cambiando} className="h-11 min-h-11 px-4">
              Publicar
            </Button>
          ) : null}
          {estadoActual === 'publicado' ? (
            <Button type="submit" name="accion" value="vencido" variant="outline" disabled={cambiando} className="h-11 min-h-11 px-4">
              Marcar vencido (deja de verse)
            </Button>
          ) : null}
          {estadoActual !== 'borrador' ? (
            <Button type="submit" name="accion" value="borrador" variant="outline" disabled={cambiando} className="h-11 min-h-11 px-4">
              Volver a borrador
            </Button>
          ) : null}
        </div>
        {estadoActual !== 'archivado' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
              Motivo para archivar
              <input name="motivo_archivo" list="motivos-archivo" maxLength={200} className={CAMPO} />
              <datalist id="motivos-archivo">
                {MOTIVOS_ARCHIVO.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <Button type="submit" name="accion" value="archivar" variant="destructive" disabled={cambiando} className="h-11 min-h-11 px-4">
              Archivar
            </Button>
          </div>
        ) : null}
        <Mensaje estado={cambio} id="estado-estado" />
      </form>
    </div>
  )
}
