'use client'

/**
 * Panel para ubicar un lugar arrastrando un pin (R65, tarea 65-a). El mapa de
 * MapLibre se carga SOLO con `import()` al montar (nunca import estático) y se
 * guarda con la server action `guardarUbicacionManual`. La alternativa sin mapa
 * es `LugarUbicacionForm` (pegar coordenadas).
 */
import { useEffect, useRef, useState, useTransition, type ComponentType, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CENTRO_SALTA_CAPITAL } from '@qps/core/mapa/zona'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { buscarDireccionLugar, guardarUbicacionManual } from '@/lib/admin/lugares-actions'

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
  /** Pestaña actual de la página (`?ver=`): llega por prop para no leer la URL en el cliente. */
  ver: string
}

const ESPERA_ENTRE_BUSQUEDAS_MS = 1000

interface ResultadoDireccion {
  lat: number
  lng: number
  etiqueta: string
}

const MENSAJE_ERROR_MAPA = 'No pudimos cargar el mapa. Pegá las coordenadas abajo.'

export function LugarMapaUbicar({ venueId, nombre, latitude, longitude, ver }: LugarMapaUbicarProps) {
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
  const [direccion, setDireccion] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [enfriando, setEnfriando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoDireccion[]>([])
  const posicionRef = useRef<PosicionPin>(inicial)
  const enfriamientoRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cuenta las búsquedas: sirve de parte de la key de los resultados.
  const [numeroBusqueda, setNumeroBusqueda] = useState(0)

  // Para no hacer `setState` si el panel se desmontó mientras la búsqueda estaba en vuelo.
  const montadoRef = useRef(false)
  // Generación de la posición: sube al arrastrar el pin o elegir un resultado, para descartar
  // los resultados de una búsqueda que quedó vieja.
  const generacionRef = useRef(0)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      if (enfriamientoRef.current) clearTimeout(enfriamientoRef.current)
    }
  }, [])

  const aplicarPosicion = (nueva: PosicionPin) => {
    posicionRef.current = nueva
    setPosicion(nueva)
  }

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
    const enviada = posicion
    startTransition(async () => {
      try {
        const res = await guardarUbicacionManual(venueId, `${enviada.lat}, ${enviada.lng}`)
        if (res.ok) {
          const actual = posicionRef.current
          if (actual.lat !== enviada.lat || actual.lng !== enviada.lng) {
            // El pin se movió mientras se guardaba: el panel sigue abierto y `movido`
            // en true para no perder ese movimiento. Sin `refresh`: en "Sin ubicación" el
            // lugar pasaría a "A mano", la página dejaría de listarlo y el panel se desmontaría.
            // El guardado siguiente es el que cierra y refresca.
            setMensaje('Guardado. Moviste el pin mientras se guardaba: guardá de nuevo.')
          } else {
            setMovido(false)
            setMensaje('Guardado')
            // `guardado` hace que la página muestre el aviso (este panel se desmonta).
            router.replace(`/admin/lugares?ver=${encodeURIComponent(ver)}&guardado=${venueId}`, { scroll: false })
            router.refresh()
          }
        } else {
          setMensaje(res.error)
        }
      } catch {
        setMensaje('No se pudo guardar. Probá de nuevo.')
      }
    })
  }

  const handleBuscar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (buscando || enfriando || direccion.trim().length < 3) return
    setBuscando(true)
    setResultados([])
    setNumeroBusqueda((n) => n + 1)
    setMensaje('Buscando…')
    // Un timer anterior (si lo hubiera) no debe pisar al nuevo.
    if (enfriamientoRef.current) clearTimeout(enfriamientoRef.current)
    const generacion = generacionRef.current
    try {
      const res = await buscarDireccionLugar(direccion)
      if (!montadoRef.current || generacionRef.current !== generacion) return
      if (res.ok) {
        setResultados(res.resultados)
        setMensaje(res.resultados.length === 0 ? 'Sin resultados en Salta' : null)
      } else {
        setMensaje(res.error)
      }
    } catch {
      if (montadoRef.current && generacionRef.current === generacion) setMensaje('No se pudo buscar. Probá de nuevo.')
    } finally {
      if (montadoRef.current) {
        setBuscando(false)
        setEnfriando(true)
        enfriamientoRef.current = setTimeout(() => setEnfriando(false), ESPERA_ENTRE_BUSQUEDAS_MS)
      }
    }
  }

  const elegirResultado = (r: ResultadoDireccion) => {
    generacionRef.current += 1
    aplicarPosicion({ lat: r.lat, lng: r.lng })
    setMovido(true)
    setResultados([])
    setMensaje(null)
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
              generacionRef.current += 1
              aplicarPosicion(nueva)
              setMovido(true)
              setResultados([])
              setMensaje(null)
            }}
            onError={() => setFalloMapa(true)}
          />
        ) : (
          <Skeleton className="size-full" />
        )}
      </div>
      <form onSubmit={handleBuscar} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Dirección
          <input
            type="text"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            maxLength={200}
            autoComplete="off"
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>
        <Button type="submit" disabled={buscando || enfriando} className="min-h-11 px-4">
          Buscar
        </Button>
      </form>
      {resultados.length > 0 && (
        <ul className="flex flex-col gap-1">
          {resultados.map((r, i) => (
            <li key={`busqueda-${numeroBusqueda}-${i}`}>
              <button
                type="button"
                onClick={() => elegirResultado(r)}
                className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {r.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}
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
      <p className="text-[11px] text-muted-foreground">
        Búsqueda:{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          © colaboradores de OpenStreetMap
        </a>
      </p>
    </div>
  )
}
