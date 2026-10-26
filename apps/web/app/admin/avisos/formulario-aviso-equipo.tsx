'use client'

/**
 * "Aviso del equipo" de /admin/avisos (Ronda 70, tarea 70-b): el formulario
 * para mandar un push manual, con vista previa, "Enviarme una prueba" y
 * "Enviar a todos" con confirmación visible en la página (sin
 * `window.confirm`). La validación real y el envío viven en el servidor
 * (`lib/admin/avisos-equipo-actions.ts`, reglas en
 * `@qps/core/notificaciones/equipo`): acá solo se juntan los datos, se
 * muestran los errores por campo y los conteos que devuelve el servidor.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isUuid } from '@/lib/metricas'
import {
  LARGO_MAXIMO_CUERPO_EQUIPO,
  LARGO_MAXIMO_TITULO_EQUIPO,
} from '@qps/core/notificaciones/equipo'
import {
  contarDestinatariosAvisoEquipo,
  enviarAvisoEquipoATodos,
  enviarmePruebaAvisoEquipo,
} from '@/lib/admin/avisos-equipo-actions'

// Mismo patrón que `extraerEventoId` de `formulario-campania.tsx` (no se
// exporta de ahí): el id solo, o el link de la ficha `/evento/<uuid>`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function extraerEventoId(valor: string): string | null {
  const texto = valor.trim()
  if (!texto) return null
  if (UUID_RE.test(texto)) return texto
  const match = texto.match(/\/evento\/([0-9a-fA-F-]{36})/)
  const candidato = match?.[1] ?? null
  if (candidato && isUuid(candidato)) return candidato
  return null
}

type TipoDestino = 'inicio' | 'cines' | 'evento'

const OPCIONES_DESTINO: { valor: TipoDestino; etiqueta: string }[] = [
  { valor: 'inicio', etiqueta: 'Inicio' },
  { valor: 'cines', etiqueta: 'Cines' },
  { valor: 'evento', etiqueta: 'Un evento' },
]

type Confirmacion = {
  personas: number
  telefonos: number
  excluidos: { sinPermiso: number; silencio: number; tope: number; yaRecibio: number }
}

export function FormularioAvisoEquipo() {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [tipoDestino, setTipoDestino] = useState<TipoDestino>('inicio')
  const [eventoTexto, setEventoTexto] = useState('')
  const [erroresPorCampo, setErroresPorCampo] = useState<Record<string, string>>({})
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null)
  const [isPending, startTransition] = useTransition()

  const eventoId = useMemo(() => extraerEventoId(eventoTexto), [eventoTexto])

  // Cualquier cambio invalida el conteo ya mostrado: hay que volver a pedirlo.
  const cambiar = <T,>(setter: (valor: T) => void) => (valor: T) => {
    setter(valor)
    setConfirmacion(null)
  }

  const armarEntrada = () => ({
    titulo,
    cuerpo,
    destino: tipoDestino === 'evento' ? { tipo: 'evento', eventId: eventoId ?? '' } : { tipo: tipoDestino },
  })

  const mostrarError = (error: string, errores?: { campo: string; mensaje: string }[]) => {
    if (errores && errores.length > 0) {
      const porCampo: Record<string, string> = {}
      for (const e of errores) porCampo[e.campo] = e.mensaje
      setErroresPorCampo(porCampo)
    }
    setMensaje(error)
  }

  const empezar = () => {
    setMensaje(null)
    setErroresPorCampo({})
  }

  const handlePrueba = () => {
    if (isPending) return
    empezar()
    setConfirmacion(null)
    const entrada = armarEntrada()
    startTransition(async () => {
      const resultado = await enviarmePruebaAvisoEquipo(entrada)
      if (!resultado.ok) return mostrarError(resultado.error, resultado.errores)
      setMensaje(
        resultado.simulado
          ? 'Simulado: no se envió. (Habría llegado a tu teléfono.)'
          : `Prueba enviada a ${resultado.telefonos} ${resultado.telefonos === 1 ? 'teléfono tuyo' : 'teléfonos tuyos'}.`,
      )
    })
  }

  const handleContar = () => {
    if (isPending) return
    empezar()
    setConfirmacion(null)
    startTransition(async () => {
      const resultado = await contarDestinatariosAvisoEquipo()
      if (!resultado.ok) return setMensaje(resultado.error)
      if (resultado.yaHuboHoy) return setMensaje('Ya se mandó un aviso del equipo hoy.')
      if (resultado.telefonos === 0) return setMensaje('No hay nadie a quien mandarle un aviso ahora.')
      setConfirmacion({ personas: resultado.personas, telefonos: resultado.telefonos, excluidos: resultado.excluidos })
    })
  }

  const handleConfirmar = () => {
    if (isPending || !confirmacion) return
    empezar()
    const entrada = armarEntrada()
    const telefonosEsperados = confirmacion.telefonos
    startTransition(async () => {
      const resultado = await enviarAvisoEquipoATodos(entrada, { telefonosEsperados })
      if (resultado.ok) {
        setConfirmacion(null)
        setMensaje(
          resultado.simulado
            ? `Simulado: no se envió. (Habría llegado a ${resultado.telefonos} teléfonos.)`
            : resultado.fallidos && resultado.fallidos > 0
              ? `Enviado a ${resultado.telefonos} teléfonos; ${resultado.fallidos} no se pudieron entregar.`
              : `Enviado a ${resultado.telefonos} teléfonos.`,
        )
        router.refresh()
        return
      }
      mostrarError(resultado.error, resultado.errores)
      if (resultado.requiereConfirmar) {
        // Cambió la cantidad: se vuelve a pedir el conteo completo para confirmar de nuevo.
        const nuevo = await contarDestinatariosAvisoEquipo()
        if (nuevo.ok && !nuevo.yaHuboHoy && nuevo.telefonos > 0) {
          setConfirmacion({ personas: nuevo.personas, telefonos: nuevo.telefonos, excluidos: nuevo.excluidos })
        } else {
          setConfirmacion(null)
        }
      } else {
        setConfirmacion(null)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aviso del equipo</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Como mucho 1 aviso del equipo por día. Llega solo a quien tiene prendido «Avisos de Qué Pinta Salta» en
            Cuenta, fuera de su horario de silencio.
          </p>

          <div className="space-y-2">
            <Label htmlFor="aviso-titulo">Título</Label>
            <Input
              id="aviso-titulo"
              value={titulo}
              onChange={(e) => cambiar(setTitulo)(e.target.value)}
              maxLength={LARGO_MAXIMO_TITULO_EQUIPO}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {titulo.length} / {LARGO_MAXIMO_TITULO_EQUIPO}
            </p>
            {erroresPorCampo.titulo && <p className="text-xs text-destructive">{erroresPorCampo.titulo}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="aviso-cuerpo">Texto</Label>
            <Textarea
              id="aviso-cuerpo"
              value={cuerpo}
              onChange={(e) => cambiar(setCuerpo)(e.target.value)}
              maxLength={LARGO_MAXIMO_CUERPO_EQUIPO}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {cuerpo.length} / {LARGO_MAXIMO_CUERPO_EQUIPO}
            </p>
            {erroresPorCampo.cuerpo && <p className="text-xs text-destructive">{erroresPorCampo.cuerpo}</p>}
          </div>

          <fieldset className="space-y-2" disabled={isPending}>
            <legend className="text-sm font-medium text-foreground">Al tocar el aviso, abre</legend>
            <div className="flex flex-wrap gap-4">
              {OPCIONES_DESTINO.map((opcion) => (
                <label key={opcion.valor} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="aviso-destino"
                    value={opcion.valor}
                    checked={tipoDestino === opcion.valor}
                    onChange={() => cambiar(setTipoDestino)(opcion.valor)}
                  />
                  {opcion.etiqueta}
                </label>
              ))}
            </div>
            {erroresPorCampo.destino && <p className="text-xs text-destructive">{erroresPorCampo.destino}</p>}
          </fieldset>

          {tipoDestino === 'evento' && (
            <div className="space-y-2">
              <Label htmlFor="aviso-evento">Evento</Label>
              <Input
                id="aviso-evento"
                placeholder="Pegá el link de la ficha o el id del evento"
                value={eventoTexto}
                onChange={(e) => cambiar(setEventoTexto)(e.target.value)}
                disabled={isPending}
              />
              {eventoTexto.trim().length > 0 && !eventoId && (
                <p className="text-xs text-destructive">No se reconoció un id de evento válido en ese texto.</p>
              )}
              {erroresPorCampo.eventId && <p className="text-xs text-destructive">{erroresPorCampo.eventId}</p>}
            </div>
          )}

          {/* Vista previa, tal como se va a ver el push (sin "Patrocinado") */}
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Vista previa del aviso</p>
            <p className="text-sm font-semibold text-foreground">{titulo.trim() || 'Título del aviso'}</p>
            <p className="text-sm text-muted-foreground">{cuerpo.trim() || 'Texto del aviso'}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={handlePrueba}>
              Enviarme una prueba
            </Button>
            <Button type="button" disabled={isPending} onClick={handleContar}>
              Enviar a todos
            </Button>
          </div>

          {confirmacion && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">
                Va a llegar a {confirmacion.telefonos} teléfonos ({confirmacion.personas} personas).
              </p>
              <p className="text-xs text-muted-foreground">
                Quedan afuera: {confirmacion.excluidos.sinPermiso} sin permiso, {confirmacion.excluidos.silencio} en
                horario de silencio, {confirmacion.excluidos.tope} con el tope del día completo y{' '}
                {confirmacion.excluidos.yaRecibio} que ya lo recibieron.
              </p>
              <div className="flex gap-2">
                <Button type="button" disabled={isPending} onClick={handleConfirmar}>
                  Confirmar envío
                </Button>
                <Button type="button" variant="outline" disabled={isPending} onClick={() => setConfirmacion(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <p aria-live="polite" className="min-h-4 text-sm text-foreground">
            {mensaje}
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
