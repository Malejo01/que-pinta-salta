'use client'

/**
 * Controles de /admin/publicidad (R58, tarea 58-c): solo lo que necesita estado
 * o el portapapeles. Reciben datos ya armados por la página (nada de clientes
 * de Supabase acá) y llaman a las acciones de lib/admin/publicidad-actions.ts.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  aprobarCiclo,
  cambiarAprobacionAutomatica,
  cargarAudienciaYTipoCambio,
  reanudarPushPatrocinado,
} from '@/lib/admin/publicidad-actions'

type Transicion = ReturnType<typeof useTransition>
type Resultado = { ok: boolean; mensaje?: string; aviso?: string }
type MensajeEstado = { texto: string; ok: boolean } | null

/** Si recibe `compartida`, el estado pendiente es el de un contenedor común (un botón bloquea al otro). */
function useAccion(compartida?: Transicion) {
  const router = useRouter()
  const [mensaje, setMensaje] = useState<MensajeEstado>(null)
  const propia = useTransition()
  const [isPending, startTransition] = compartida ?? propia

  const correr = (accion: () => Promise<Resultado>, textoOk: string) => {
    if (isPending) return
    setMensaje(null)
    startTransition(async () => {
      const res = await accion()
      if (res.ok) {
        setMensaje({ texto: res.aviso ?? textoOk, ok: true })
        router.refresh()
      } else {
        setMensaje({ texto: res.mensaje ?? 'No se pudo hacer. Intentá de nuevo.', ok: false })
      }
    })
  }

  return { mensaje, isPending, correr }
}

function Mensaje({ mensaje }: { mensaje: MensajeEstado }) {
  if (mensaje && !mensaje.ok) {
    return (
      <p role="alert" className="min-h-5 text-sm font-medium text-destructive">
        {mensaje.texto}
      </p>
    )
  }
  return (
    <p role="status" className="min-h-5 text-sm text-foreground">
      {mensaje?.texto}
    </p>
  )
}

/**
 * La carga manual y el botón Aprobar comparten el estado pendiente: mientras
 * corre el recálculo no se puede aprobar (y al revés). `faltan` es lo que la
 * página detectó que todavía no se cargó (audiencia o dólar del mes anterior).
 */
export function AccionesCiclo({
  ciclo,
  mes,
  audienciaActual,
  tipoCambioActual,
  faltan,
}: {
  ciclo: string
  mes: string
  audienciaActual: number
  tipoCambioActual: number
  faltan: string[]
}) {
  const compartida = useTransition()
  const [cual, setCual] = useState<'aprobando' | 'recalculando'>('recalculando')
  const aprobar = useAccion(compartida)
  const ocupado = compartida[0]

  return (
    <>
      <FormularioCargaManual
        ciclo={ciclo}
        audienciaActual={audienciaActual}
        tipoCambioActual={tipoCambioActual}
        compartida={compartida}
        alCorrer={() => setCual('recalculando')}
        textoOcupado={ocupado && cual === 'recalculando' ? 'Recalculando…' : 'Recalcular'}
      />

      <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm text-foreground">
          <span className="font-medium">Antes de aprobar: </span>
          {faltan.length === 0 ? 'Todo cargado.' : `falta cargar ${faltan.join(' y ')}.`}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              disabled={ocupado}
              aria-busy={ocupado && cual === 'aprobando'}
              className="min-h-11 w-full px-4 sm:w-fit"
            >
              {ocupado && cual === 'aprobando' ? 'Aprobando…' : 'Aprobar'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Aprobar los precios de {mes}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se publican en Publicitá tu evento.
                {faltan.length > 0 && (
                  <>
                    {' '}
                    <strong className="font-semibold text-foreground">Todavía falta cargar {faltan.join(' y ')}.</strong>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="min-h-11"
                onClick={() => {
                  setCual('aprobando')
                  aprobar.correr(() => aprobarCiclo({ ciclo }), 'Ciclo aprobado')
                }}
              >
                Aprobar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Mensaje mensaje={aprobar.mensaje} />
      </div>
    </>
  )
}

function FormularioCargaManual({
  ciclo,
  audienciaActual,
  tipoCambioActual,
  compartida,
  alCorrer,
  textoOcupado,
}: {
  ciclo: string
  audienciaActual: number
  tipoCambioActual: number
  compartida: Transicion
  alCorrer: () => void
  textoOcupado: string
}) {
  const { mensaje, isPending, correr } = useAccion(compartida)
  const [audiencia, setAudiencia] = useState('')
  const [tipoCambio, setTipoCambio] = useState('')

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    const entrada: Record<string, unknown> = { ciclo }
    if (audiencia.trim() !== '') entrada.audienciaWeb28d = Number(audiencia)
    if (tipoCambio.trim() !== '') entrada.tipoCambio = Number(tipoCambio.replace(',', '.'))
    alCorrer()
    correr(async () => {
      const res = await cargarAudienciaYTipoCambio(entrada)
      if (res.ok && res.sinFila.length > 0) {
        return {
          ok: true,
          aviso: `Recalculado, pero estos productos no tienen fila de precio y no se actualizaron: ${res.sinFila.join(', ')}.`,
        }
      }
      return res
    }, 'Recalculado. Revisá los precios antes de aprobar.')
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">Cargar a mano y recalcular</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="audiencia-web" className="text-xs text-muted-foreground">
            Audiencia web de 28 días (actual: {audienciaActual.toLocaleString('es-AR')})
          </label>
          <Input
            id="audiencia-web"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000000}
            step={1}
            value={audiencia}
            onChange={(e) => setAudiencia(e.target.value)}
            disabled={isPending}
            className="h-11 w-full sm:w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tipo-cambio" className="text-xs text-muted-foreground">
            Tipo de cambio en pesos (actual: {tipoCambioActual.toLocaleString('es-AR')})
          </label>
          <Input
            id="tipo-cambio"
            type="text"
            inputMode="decimal"
            pattern="\s*(([5-9][0-9]{2}|[1-4][0-9]{3})([.,][0-9]+)?|5000([.,]0+)?)\s*"
            title="Un número entre 500 y 5.000, con coma o punto para los decimales. Por ejemplo: 1250,50"
            value={tipoCambio}
            onChange={(e) => setTipoCambio(e.target.value)}
            disabled={isPending}
            className="h-11 w-full sm:w-48"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={isPending || (audiencia === '' && tipoCambio === '')}
          aria-busy={isPending}
          className="min-h-11 px-4"
        >
          {textoOcupado}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Audiencia: el número de visitantes únicos de 28 días de Vercel Analytics. Dejá vacío lo que no quieras cambiar.
      </p>
      <Mensaje mensaje={mensaje} />
    </form>
  )
}

export function InterruptorAutomatico({
  activa,
  ciclosAprobados,
}: {
  activa: boolean
  ciclosAprobados: number
}) {
  const { mensaje, isPending, correr } = useAccion()
  const puedePrender = ciclosAprobados >= 3
  // Apagarla siempre se puede; prenderla, solo con 3 ciclos aprobados a mano.
  const deshabilitado = isPending || (!activa && !puedePrender)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-foreground">
        Aprobación automática: <strong>{activa ? 'prendida' : 'apagada'}</strong>
      </p>
      <Button
        id="interruptor-automatico"
        type="button"
        variant={activa ? 'destructive' : 'outline'}
        disabled={deshabilitado}
        onClick={() =>
          correr(
            () => cambiarAprobacionAutomatica({ activar: !activa }),
            activa ? 'Aprobación automática apagada' : 'Aprobación automática prendida',
          )
        }
        className="min-h-11 w-fit px-4"
      >
        {activa ? 'Apagar' : 'Prender'}
      </Button>
      {!activa && !puedePrender && (
        <p className="text-xs text-muted-foreground">
          Se puede prender después de 3 ciclos aprobados a mano (van {ciclosAprobados}).
        </p>
      )}
      <Mensaje mensaje={mensaje} />
    </div>
  )
}

export function BotonReanudar() {
  const { mensaje, isPending, correr } = useAccion()
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        disabled={isPending}
        onClick={() => correr(() => reanudarPushPatrocinado(), 'Push reanudado')}
        aria-busy={isPending}
        className="min-h-11 w-fit px-4"
      >
        {isPending ? 'Reanudando…' : 'Reanudar'}
      </Button>
      <Mensaje mensaje={mensaje} />
    </div>
  )
}

export function BotonCopiarLink({ ruta, base }: { ruta: string; base: string }) {
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null)

  const copiar = async () => {
    const url = (base || window.location.origin) + ruta
    try {
      await navigator.clipboard.writeText(url)
      setCopiado('si')
    } catch {
      setCopiado('no')
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copiar} className="min-h-11">
      {copiado === 'si' ? 'Copiado' : copiado === 'no' ? 'No se pudo copiar' : 'Copiar link'}
    </Button>
  )
}
