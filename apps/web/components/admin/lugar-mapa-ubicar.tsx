'use client'

/**
 * Panel para ubicar un lugar arrastrando un pin (R65, tarea 65-a). El mapa de
 * MapLibre se carga SOLO con `import()` al montar (nunca import estático) y se
 * guarda con la server action `guardarUbicacionManual`. La alternativa sin mapa
 * es `LugarUbicacionForm` (pegar coordenadas).
 */
import { useEffect, useState, useTransition, type ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import { CENTRO_SALTA_CAPITAL } from '@qps/core/mapa/zona'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { guardarUbicacionManual } from '@/lib/admin/lugares-actions'

export interface PosicionPin {
  lat: number
  lng: number
}

export interface PropsMapaPin {
  /** Posición del pin, controlada desde afuera. */
  posicion: PosicionPin
  /** Zoom inicial (16 con coordenadas, 13 sin). */
  zoom?: number
  /** Al soltar el pin (redondeado a 6 decimales). */
  onMover: (posicion: PosicionPin) => void
  /** El mapa no arrancó (WebGL apagado, estilo que no carga). */
  onError: () => void
}

export interface LugarMapaUbicarProps {
  venueId: string
  nombre: string
  latitude: number | null
  longitude: number | null
}

const MENSAJE_ERROR_MAPA = 'No pudimos cargar el mapa. Pegá las coordenadas abajo.'

export function LugarMapaUbicar({ venueId, nombre, latitude, longitude }: LugarMapaUbicarProps) {
  const router = useRouter()
  const tieneCoordenadas = latitude !== null && longitude !== null
  const [inicial] = useState<PosicionPin>(() =>
    tieneCoordenadas ? { lat: latitude, lng: longitude } : { lat: CENTRO_SALTA_CAPITAL.lat, lng: CENTRO_SALTA_CAPITAL.lng }
  )
  const [posicion, setPosicion] = useState<PosicionPin>(inicial)
  const [movido, setMovido] = useState(false)
  const [Mapa, setMapa] = useState<ComponentType<PropsMapaPin> | null>(null)
  const [falloMapa, setFalloMapa] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let activo = true
    import('@/components/mapa/mapa-pin-maplibre')
      .then((modulo) => {
        if (activo) setMapa(() => modulo.default)
      })
      .catch(() => {
        if (activo) setFalloMapa(true)
      })
    return () => {
      activo = false
    }
  }, [])

  const handleGuardar = () => {
    if (isPending || !movido) return
    setMensaje(null)
    startTransition(async () => {
      const res = await guardarUbicacionManual(venueId, `${posicion.lat}, ${posicion.lng}`)
      if (res.ok) {
        setMensaje('Guardado')
        setMovido(false)
        router.refresh()
      } else {
        setMensaje(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="h-72 w-full overflow-hidden rounded-md border border-border">
        {falloMapa ? (
          <p className="flex size-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {MENSAJE_ERROR_MAPA}
          </p>
        ) : Mapa ? (
          <Mapa
            posicion={posicion}
            zoom={tieneCoordenadas ? 16 : 13}
            onMover={(nueva) => {
              setPosicion(nueva)
              setMovido(true)
              setMensaje(null)
            }}
            onError={() => setFalloMapa(true)}
          />
        ) : (
          <Skeleton className="size-full" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {nombre}: {posicion.lat}, {posicion.lng}
        {tieneCoordenadas || movido ? '' : ' (centro de la ciudad: arrastrá el pin al lugar)'}
      </p>
      <div>
        <Button type="button" onClick={handleGuardar} disabled={isPending || !movido} className="min-h-11 px-4">
          Guardar ubicación
        </Button>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {mensaje}
      </p>
    </div>
  )
}
