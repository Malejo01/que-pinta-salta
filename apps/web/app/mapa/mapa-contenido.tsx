"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapaDiferido } from "@/components/mapa/mapa-diferido"
import { ListaLugares, idBloqueLugar } from "@/components/mapa/lista-lugares"
import { BASE_BOTON, BOTON_ACTIVO, BOTON_INACTIVO, FiltrosQue, nombresDeFiltrosExtra } from "@/components/mapa/filtros-mapa"
import { formatSaltaDayKey } from "@/lib/date-format"
import { DIAS_MAXIMOS_FECHA_MAPA, type FiltroMapa, type PinLugar } from "@qps/core/mapa/pines"
import {
  SIN_FILTROS_EXTRA,
  consultaDelMapa,
  hayFiltrosExtra,
  type CategoriaDelMapa,
  type FiltrosExtraMapa,
} from "@qps/core/mapa/filtros"

interface MapaContenidoProps {
  pines: PinLugar[]
  /** Eventos del filtro cuyo lugar no tiene ubicación válida: no tienen pin. */
  sinUbicacion: number
  filtro: FiltroMapa
  /** Los filtros "qué" (Gratis, Para chicos, categoría) que ya aplicó el servidor. */
  extra: FiltrosExtraMapa
  /** Las categorías del selector, con cuántos eventos tienen; la elegida está siempre (aunque tenga 0). */
  categorias: CategoriaDelMapa[]
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

/** "8 eventos en 5 lugares", "1 evento en 1 lugar". */
function textoDelContador(pines: PinLugar[]): string {
  const eventos = pines.reduce((total, pin) => total + pin.eventos.length, 0)
  return `${eventos} ${eventos === 1 ? "evento" : "eventos"} en ${pines.length} ${pines.length === 1 ? "lugar" : "lugares"}`
}

function comportamientoDeScroll(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

/**
 * El contenido de `/mapa`: los filtros de fecha y "qué" (que cambian la URL y
 * vuelven a pedir la página al servidor), el contador, el mapa diferido y la
 * lista de lugares. Guarda el lugar seleccionado, que comparten el mapa y la
 * lista.
 */
export function MapaContenido({ pines, sinUbicacion, filtro, extra, categorias, lugarInicial, ahoraISO }: MapaContenidoProps) {
  const router = useRouter()
  const [cambiando, iniciarCambio] = useTransition()
  const [seleccionado, setSeleccionado] = useState<string | null>(lugarInicial)
  // Orden de centrar el mapa: `n` sube en cada pedido, así repetir el mismo lugar vuelve a centrar.
  const [centrar, setCentrar] = useState<{ venueId: string; n: number } | null>(
    lugarInicial ? { venueId: lugarInicial, n: 0 } : null
  )
  const bloqueMapa = useRef<HTMLDivElement>(null)
  const chipGratis = useRef<HTMLButtonElement>(null)
  // "Quitar filtros" desaparece cuando ya no hay filtros: el foco se pasa al chip "Gratis" al terminar.
  const enfocarGratisAlTerminar = useRef(false)

  // El día del selector de fecha vive acá para que no se borre mientras el
  // servidor responde; se resincroniza cuando el filtro cambia (por ejemplo,
  // si el servidor volvió a "hoy" porque el día era inválido).
  const diaDelFiltro = filtro.tipo === "fecha" ? filtro.dia : ""
  const [diaElegido, setDiaElegido] = useState(diaDelFiltro)
  const [diaDelFiltroVisto, setDiaDelFiltroVisto] = useState(diaDelFiltro)
  const [cambiandoVisto, setCambiandoVisto] = useState(cambiando)
  const terminoElCambio = cambiandoVisto && !cambiando
  if (diaDelFiltroVisto !== diaDelFiltro || terminoElCambio) {
    setDiaDelFiltroVisto(diaDelFiltro)
    setDiaElegido(diaDelFiltro)
  }

  // Lo último que se pidió (fecha y filtros "qué"): cada cambio arma la URL a
  // partir de acá y no de las props, así dos toques seguidos antes de que el
  // servidor conteste se suman en vez de pisarse (Gratis y enseguida Para
  // chicos, o Este finde y enseguida Gratis). Se resincroniza igual que el día.
  const consultaDelServidor = consultaDelMapa(filtro, extra)
  const [pedido, setPedido] = useState({ filtro, extra })
  const [consultaVista, setConsultaVista] = useState(consultaDelServidor)
  if (consultaVista !== consultaDelServidor || terminoElCambio) {
    setConsultaVista(consultaDelServidor)
    setPedido({ filtro, extra })
  }
  if (cambiandoVisto !== cambiando) setCambiandoVisto(cambiando)

  useEffect(() => {
    if (cambiando || !enfocarGratisAlTerminar.current) return
    enfocarGratisAlTerminar.current = false
    chipGratis.current?.focus()
  }, [cambiando])

  // Si el filtro nuevo no trae el lugar seleccionado, no hay nada que resaltar.
  const seleccionVigente = seleccionado && pines.some((pin) => pin.venueId === seleccionado) ? seleccionado : null

  const hoy = formatSaltaDayKey(new Date(ahoraISO))
  const maximo = sumarDias(hoy, DIAS_MAXIMOS_FECHA_MAPA)
  const textoDelFiltro = filtro.tipo === "hoy" ? "hoy" : filtro.tipo === "finde" ? "este finde" : "esta fecha"
  const conFiltrosExtra = hayFiltrosExtra(extra)

  function irA(consulta: string) {
    // Otro filtro, otra lista: el lugar seleccionado no tiene que revivir después.
    setSeleccionado(null)
    setCentrar(null)
    iniciarCambio(() => {
      router.replace(`/mapa?${consulta}`, { scroll: false })
    })
  }

  /** Navega a la fecha y los filtros "qué" pedidos; lo que no cambia se conserva. */
  function pedir(filtroNuevo: FiltroMapa, extraNuevo: FiltrosExtraMapa) {
    setPedido({ filtro: filtroNuevo, extra: extraNuevo })
    irA(consultaDelMapa(filtroNuevo, extraNuevo))
  }

  function quitarFiltros() {
    enfocarGratisAlTerminar.current = true
    pedir(pedido.filtro, SIN_FILTROS_EXTRA)
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

      <div className="mt-4 space-y-2">
        <div role="group" aria-label="Cuándo" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={filtro.tipo === "hoy"}
            onClick={() => pedir({ tipo: "hoy" }, pedido.extra)}
            className={`${BASE_BOTON} ${filtro.tipo === "hoy" ? BOTON_ACTIVO : BOTON_INACTIVO}`}
          >
            Hoy
          </button>
          <button
            type="button"
            aria-pressed={filtro.tipo === "finde"}
            onClick={() => pedir({ tipo: "finde" }, pedido.extra)}
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
                if (dia && dia >= hoy && dia <= maximo) pedir({ tipo: "fecha", dia }, pedido.extra)
              }}
              className="rounded bg-background px-2 py-1 text-foreground"
            />
          </label>
        </div>
        <FiltrosQue
          extra={pedido.extra}
          categorias={categorias}
          onCambiar={(extraNuevo) => pedir(pedido.filtro, extraNuevo)}
          refGratis={chipGratis}
        />
      </div>

      <div className={`mt-4 transition-opacity ${cambiando ? "opacity-60" : ""}`}>
        {/* Siempre montado: un aria-live que aparece junto con su texto no siempre se anuncia. */}
        <div className="flex flex-wrap items-center gap-x-3">
          <p aria-live="polite" className="text-sm font-medium text-foreground">
            {pines.length > 0
              ? textoDelContador(pines)
              : conFiltrosExtra
                ? "Ningún evento con estos filtros"
                : `No hay eventos con ubicación para ${textoDelFiltro}`}
          </p>
          {/* Sin pines, el "Quitar filtros" grande del vacío alcanza: no van dos botones iguales. */}
          {conFiltrosExtra && pines.length > 0 ? (
            <button
              type="button"
              onClick={quitarFiltros}
              className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Quitar filtros
            </button>
          ) : null}
        </div>
        {sinUbicacion > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {sinUbicacion} {sinUbicacion === 1 ? "evento no aparece" : "eventos no aparecen"} en el mapa porque{" "}
            {sinUbicacion === 1 ? "su lugar todavía no tiene ubicación" : "sus lugares todavía no tienen ubicación"}.{" "}
            <Link href="/buscar" className="font-medium text-primary underline-offset-2 hover:underline">
              Ver la agenda completa
            </Link>
          </p>
        ) : null}

        {pines.length === 0 && conFiltrosExtra ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center">
            <h2 className="font-semibold text-foreground">No hay eventos con estos filtros para {textoDelFiltro}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Filtros: {nombresDeFiltrosExtra(extra, categorias)}. Probá con otra fecha o sacá alguno.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={quitarFiltros}
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Quitar filtros
              </button>
              <Link
                href="/buscar"
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Ver la agenda completa
              </Link>
            </div>
          </div>
        ) : pines.length === 0 ? (
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
