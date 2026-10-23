"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapaDiferido } from "@/components/mapa/mapa-diferido"
import { ListaLugares, idBloqueLugar } from "@/components/mapa/lista-lugares"
import { formatSaltaDayKey } from "@/lib/date-format"
import { DIAS_MAXIMOS_FECHA_MAPA, type FiltroMapa, type PinLugar } from "@qps/core/mapa/pines"

interface MapaContenidoProps {
  pines: PinLugar[]
  /** Eventos del filtro cuyo lugar no tiene ubicación válida: no tienen pin. */
  sinUbicacion: number
  filtro: FiltroMapa
  /** El lugar que abre seleccionado (`?lugar=`), ya validado por el servidor. */
  lugarInicial: string | null
  /** El "ahora" del servidor: de ahí salen el mínimo y el máximo del selector de fecha. */
  ahoraISO: string
}

/** `AAAA-MM-DD` más `dias` días de calendario (opera sobre el día, sin zonas horarias). */
function sumarDias(diaKey: string, dias: number): string {
  const fecha = new Date(`${diaKey}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

function comportamientoDeScroll(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

const BASE_BOTON = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
const BOTON_ACTIVO = "border-primary bg-primary text-primary-foreground"
const BOTON_INACTIVO = "border-input bg-background text-foreground hover:bg-muted"

/**
 * El contenido de `/mapa`: los filtros (que cambian la URL y vuelven a pedir la
 * página al servidor), el mapa diferido y la lista de lugares. Guarda el lugar
 * seleccionado, que comparten el mapa y la lista.
 */
export function MapaContenido({ pines, sinUbicacion, filtro, lugarInicial, ahoraISO }: MapaContenidoProps) {
  const router = useRouter()
  const [cambiando, iniciarCambio] = useTransition()
  const [seleccionado, setSeleccionado] = useState<string | null>(lugarInicial)
  // Orden de centrar el mapa: `n` sube en cada pedido, así repetir el mismo lugar vuelve a centrar.
  const [centrar, setCentrar] = useState<{ venueId: string; n: number } | null>(
    lugarInicial ? { venueId: lugarInicial, n: 0 } : null
  )
  const bloqueMapa = useRef<HTMLDivElement>(null)

  // El día del selector de fecha vive acá para que no se borre mientras el
  // servidor responde; se resincroniza cuando el filtro cambia (por ejemplo,
  // si el servidor volvió a "hoy" porque el día era inválido).
  const diaDelFiltro = filtro.tipo === "fecha" ? filtro.dia : ""
  const [diaElegido, setDiaElegido] = useState(diaDelFiltro)
  const [diaDelFiltroVisto, setDiaDelFiltroVisto] = useState(diaDelFiltro)
  const [cambiandoVisto, setCambiandoVisto] = useState(cambiando)
  if (diaDelFiltroVisto !== diaDelFiltro || (cambiandoVisto && !cambiando)) {
    setDiaDelFiltroVisto(diaDelFiltro)
    setDiaElegido(diaDelFiltro)
  }
  if (cambiandoVisto !== cambiando) setCambiandoVisto(cambiando)

  // Si el filtro nuevo no trae el lugar seleccionado, no hay nada que resaltar.
  const seleccionVigente = seleccionado && pines.some((pin) => pin.venueId === seleccionado) ? seleccionado : null

  const hoy = formatSaltaDayKey(new Date(ahoraISO))
  const maximo = sumarDias(hoy, DIAS_MAXIMOS_FECHA_MAPA)
  const textoDelFiltro = filtro.tipo === "hoy" ? "hoy" : filtro.tipo === "finde" ? "este finde" : "esta fecha"

  function irA(consulta: string) {
    // Otro filtro, otra lista: el lugar seleccionado no tiene que revivir después.
    setSeleccionado(null)
    setCentrar(null)
    iniciarCambio(() => {
      router.replace(`/mapa?${consulta}`, { scroll: false })
    })
  }

  function ordenarCentrar(venueId: string) {
    setCentrar((anterior) => ({ venueId, n: (anterior?.n ?? 0) + 1 }))
  }

  function alSeleccionarEnElMapa(venueId: string) {
    setSeleccionado(venueId)
    ordenarCentrar(venueId)
    document.getElementById(idBloqueLugar(venueId))?.scrollIntoView({ block: "nearest", behavior: comportamientoDeScroll() })
  }

  function alVerEnElMapa(venueId: string) {
    setSeleccionado(venueId)
    ordenarCentrar(venueId)
    // En el celular el mapa queda arriba de la lista: se lo trae a la vista.
    bloqueMapa.current?.scrollIntoView({ block: "nearest", behavior: comportamientoDeScroll() })
  }

  return (
    <div aria-busy={cambiando}>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Mapa de eventos en Salta</h1>
      <p className="mt-1 text-sm text-muted-foreground">Mirá dónde pasa cada plan y elegí por día.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={filtro.tipo === "hoy"}
          onClick={() => irA("cuando=hoy")}
          className={`${BASE_BOTON} ${filtro.tipo === "hoy" ? BOTON_ACTIVO : BOTON_INACTIVO}`}
        >
          Hoy
        </button>
        <button
          type="button"
          aria-pressed={filtro.tipo === "finde"}
          onClick={() => irA("cuando=finde")}
          className={`${BASE_BOTON} ${filtro.tipo === "finde" ? BOTON_ACTIVO : BOTON_INACTIVO}`}
        >
          Este finde
        </button>
        <label
          className={`${BASE_BOTON} gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${filtro.tipo === "fecha" ? BOTON_ACTIVO : BOTON_INACTIVO}`}
        >
          <span>Elegir fecha</span>
          <input
            type="date"
            min={hoy}
            max={maximo}
            value={diaElegido}
            onChange={(evento) => {
              const dia = evento.target.value
              setDiaElegido(dia)
              // Solo con el día completo y en rango: tipear el año no dispara navegaciones parciales.
              if (dia && dia >= hoy && dia <= maximo) irA(`cuando=fecha&dia=${encodeURIComponent(dia)}`)
            }}
            className="rounded bg-background px-2 py-1 text-foreground"
          />
        </label>
      </div>

      <div className={`mt-4 transition-opacity ${cambiando ? "opacity-60" : ""}`}>
        {pines.length > 0 ? (
          <p aria-live="polite" className="text-sm font-medium text-foreground">
            {pines.length} {pines.length === 1 ? "lugar con eventos" : "lugares con eventos"}
          </p>
        ) : null}
        {sinUbicacion > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {sinUbicacion} {sinUbicacion === 1 ? "evento no aparece" : "eventos no aparecen"} en el mapa porque{" "}
            {sinUbicacion === 1 ? "su lugar todavía no tiene ubicación" : "sus lugares todavía no tienen ubicación"}.{" "}
            <Link href="/buscar" className="font-medium text-primary underline-offset-2 hover:underline">
              Ver la agenda completa
            </Link>
          </p>
        ) : null}

        {pines.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-foreground">No hay eventos con ubicación para {textoDelFiltro}</p>
            <Link
              href="/buscar"
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Ver todos los eventos
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-6 lg:space-y-0">
            <div ref={bloqueMapa} className="scroll-mt-20">
              <MapaDiferido
                pines={pines}
                seleccionado={seleccionVigente}
                centrar={centrar}
                onSeleccionar={alSeleccionarEnElMapa}
                className="h-[45dvh] min-h-64 lg:h-[70vh]"
              />
            </div>
            <div className="lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
              <ListaLugares pines={pines} seleccionado={seleccionVigente} onVerEnElMapa={alVerEnElMapa} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
