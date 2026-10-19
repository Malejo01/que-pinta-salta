'use client'

/**
 * Formulario de /admin/avisos (D2/Ronda 51, tarea 51-c): cargar o editar una
 * campaña patrocinada, con su vista previa, y el botón de "Cancelar" de cada
 * fila de la lista. Las dos cosas viven en este único archivo cliente
 * porque es el único archivo `"use client"` permitido en esta tarea.
 *
 * La validación real (largos, palabras que imitan al sistema, la ventana de
 * fechas y sus cruces) la hace `validarCampania` de
 * `@qps/core/notificaciones/patrocinados` DEL LADO DEL SERVIDOR
 * (`guardarCampania`, en `lib/admin/avisos-patrocinados-actions.ts`): este
 * formulario solo junta los datos, los manda, y muestra los errores que esa
 * función devuelve por campo. La vista previa usa `tituloAvisoPatrocinado`
 * de ese mismo paquete (no un string armado a mano), para que el "Patrocinado
 * · " se vea exactamente igual que en el push real.
 */
import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isUuid } from '@/lib/metricas'
import { formatSaltaInputValue, saltaWallClockToUtcISO } from '@/lib/date-format'
import {
  DIAS_MAXIMOS_VENTANA,
  LARGO_MAXIMO_CUERPO,
  LARGO_MAXIMO_TITULO,
  TEXTO_BOTON_BAJA,
  tituloAvisoPatrocinado,
} from '@qps/core/notificaciones/patrocinados'
import { cancelarCampania, guardarCampania } from '@/lib/admin/avisos-patrocinados-actions'

/**
 * Saca el uuid de un evento de lo que pegue el admin: el id solo, o el link
 * completo de la ficha (`/evento/<uuid>`, con o sin dominio, con o sin lo
 * que venga después). No se encontró un helper reutilizable del lado web
 * para esto: `isUuid` (lib/metricas) y `esUuid` (core) solo VALIDAN un uuid,
 * no lo extraen de un link — por eso este helper chico vive acá, como pide
 * el encargo.
 */
// Mismo patrón que UUID_RE de lib/metricas/url.ts (que es donde vive
// `isUuid`): se repite acá, en vez de llamar a `isUuid(texto)`, porque
// `texto` ya es `string` y el predicado `value is string` de `isUuid` sobre
// un valor YA angostado a `string` deja el resto de la función en `never`
// para TypeScript (el predicado "resta" `string` de `string`).
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

export interface CampaniaInicial {
  id: string
  titulo: string
  cuerpo: string
  eventoId: string | null
  url: string | null
  startsAt: string
  endsAt: string
}

export interface FormularioCampaniaProps {
  campaniaInicial?: CampaniaInicial | null
}

export function FormularioCampania({ campaniaInicial = null }: FormularioCampaniaProps) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(campaniaInicial?.titulo ?? '')
  const [cuerpo, setCuerpo] = useState(campaniaInicial?.cuerpo ?? '')
  const [eventoTexto, setEventoTexto] = useState(campaniaInicial?.eventoId ?? '')
  const [url, setUrl] = useState(campaniaInicial?.url ?? '')
  const [desde, setDesde] = useState(campaniaInicial ? formatSaltaInputValue(campaniaInicial.startsAt) : '')
  const [hasta, setHasta] = useState(campaniaInicial ? formatSaltaInputValue(campaniaInicial.endsAt) : '')
  const [erroresPorCampo, setErroresPorCampo] = useState<Record<string, string>>({})
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const eventoId = useMemo(() => extraerEventoId(eventoTexto), [eventoTexto])
  const tituloVistaPrevia = tituloAvisoPatrocinado(titulo.trim() || 'Título de la campaña')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (isPending) return
    setMensaje(null)
    setErroresPorCampo({})

    const entrada = {
      ...(campaniaInicial ? { id: campaniaInicial.id } : {}),
      titulo,
      cuerpo,
      eventId: eventoId,
      url: url.trim() ? url.trim() : null,
      startsAt: desde ? saltaWallClockToUtcISO(desde) : null,
      endsAt: hasta ? saltaWallClockToUtcISO(hasta) : null,
    }

    startTransition(async () => {
      const resultado = await guardarCampania(entrada)
      if (resultado.ok) {
        setMensaje(campaniaInicial ? 'Campaña actualizada.' : 'Campaña cargada.')
        if (!campaniaInicial) {
          setTitulo('')
          setCuerpo('')
          setEventoTexto('')
          setUrl('')
          setDesde('')
          setHasta('')
        }
        router.refresh()
      } else {
        const porCampo: Record<string, string> = {}
        for (const error of resultado.errores) {
          porCampo[error.campo] = error.mensaje
        }
        setErroresPorCampo(porCampo)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{campaniaInicial ? 'Editar campaña' : 'Nueva campaña'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={LARGO_MAXIMO_TITULO}
              disabled={isPending}
              required
            />
            <p className="text-xs text-muted-foreground">
              {titulo.length} / {LARGO_MAXIMO_TITULO}
            </p>
            {erroresPorCampo.titulo && <p className="text-xs text-destructive">{erroresPorCampo.titulo}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cuerpo">Cuerpo</Label>
            <Textarea
              id="cuerpo"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              maxLength={LARGO_MAXIMO_CUERPO}
              disabled={isPending}
              required
            />
            <p className="text-xs text-muted-foreground">
              {cuerpo.length} / {LARGO_MAXIMO_CUERPO}
            </p>
            {erroresPorCampo.cuerpo && <p className="text-xs text-destructive">{erroresPorCampo.cuerpo}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="evento">Evento</Label>
            <Input
              id="evento"
              placeholder="Pegá el link de la ficha o el id del evento"
              value={eventoTexto}
              onChange={(e) => setEventoTexto(e.target.value)}
              disabled={isPending}
              required
            />
            {eventoTexto.trim().length > 0 && !eventoId && (
              <p className="text-xs text-destructive">No se reconoció un id de evento válido en ese texto.</p>
            )}
            {erroresPorCampo.eventId && <p className="text-xs text-destructive">{erroresPorCampo.eventId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">Link (opcional)</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isPending}
            />
            {erroresPorCampo.url && <p className="text-xs text-destructive">{erroresPorCampo.url}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="desde">Desde</Label>
              <Input
                id="desde"
                type="datetime-local"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                disabled={isPending}
                required
              />
              {erroresPorCampo.startsAt && <p className="text-xs text-destructive">{erroresPorCampo.startsAt}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="hasta">Hasta</Label>
              <Input
                id="hasta"
                type="datetime-local"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                disabled={isPending}
                required
              />
              {erroresPorCampo.endsAt && <p className="text-xs text-destructive">{erroresPorCampo.endsAt}</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            La ventana tiene que durar de 1 a {DIAS_MAXIMOS_VENTANA} días.
          </p>

          {erroresPorCampo.general && <p className="text-sm text-destructive">{erroresPorCampo.general}</p>}

          {/* Vista previa, tal como se va a ver el push */}
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Vista previa del aviso</p>
            <p className="text-sm font-semibold text-foreground">{tituloVistaPrevia}</p>
            <p className="text-sm text-muted-foreground">{cuerpo || 'Cuerpo de la campaña'}</p>
            <Button type="button" variant="outline" size="sm" disabled className="mt-2 text-xs">
              {TEXTO_BOTON_BAJA}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {campaniaInicial ? 'Guardar cambios' : 'Cargar campaña'}
            </Button>
            {campaniaInicial && (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => router.push('/admin/avisos')}
              >
                Cancelar edición
              </Button>
            )}
          </div>

          <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
            {mensaje}
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export interface BotonCancelarCampaniaProps {
  id: string
}

/**
 * Botón de "Cancelar" de una fila de la lista (en /admin/avisos, un Server
 * Component): necesita interactividad (confirmación + llamar a la server
 * action), así que vive en este mismo archivo cliente.
 */
export function BotonCancelarCampania({ id }: BotonCancelarCampaniaProps) {
  const router = useRouter()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleCancelar = () => {
    if (isPending) return
    if (!window.confirm('¿Cancelar esta campaña?')) return
    setMensaje(null)
    startTransition(async () => {
      const resultado = await cancelarCampania(id)
      if (resultado.ok) {
        router.refresh()
      } else {
        setMensaje(resultado.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleCancelar}>
        Cancelar
      </Button>
      {mensaje && <p className="text-xs text-destructive">{mensaje}</p>}
    </div>
  )
}
