"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapaDiferido } from "@/components/mapa/mapa-diferido"
import { ListaLugares, idBloqueLugar } from "@/components/mapa/lista-lugares"
import {
  BASE_BOTON,
  BOTON_ACTIVO,
  BOTON_INACTIVO,
  FiltrosQue,
  navegarCon,
  nombresDeFiltrosExtra,
  propsDeChip,
  urlDelMapa,
} from "@/components/mapa/filtros-mapa"
import { AvisoContenidoEs } from "@/components/aviso-contenido-es"
import { formatSaltaDayKey } from "@/lib/date-format"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"
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
  /** Idioma de la interfaz (`/en/mapa` es inglés). Los títulos y nombres de lugares quedan en castellano. */
  idioma?: Idioma
}

/** `AAAA-MM-DD` más `dias` días de calendario (opera sobre el día, sin zonas horarias). */
function sumarDias(diaKey: string, dias: number): string {
  const fecha = new Date(`${diaKey}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** "8 eventos en 5 lugares", "1 evento en 1 lugar". */
function textoDelContador(pines: PinLugar[], idioma: Idioma): string {
  const eventos = pines.reduce((total, pin) => total + pin.eventos.length, 0)
  return textosDe(idioma).mapa.contador(eventos, pines.length)
}

// El alto del mapa y de la lista en la compu: lo que queda de la pantalla
// debajo de la barra, el título, las dos filas de filtros y el contador (24rem,
// con margen para "Quitar filtros" y la línea de "sin ubicación"), así en
// 1280×900 el mapa entra entero; 24rem de mínimo para pantallas bajas. El mismo
// alto está escrito en `loading.tsx` (lo mira `tests/mapa/componentes.test.ts`).
const ALTO_LG = "lg:h-[max(24rem,calc(100dvh-24rem))]"
const ALTO_MAX_LG = "lg:max-h-[max(24rem,calc(100dvh-24rem))]"

function comportamientoDeScroll(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

/** Lo que dice el lector de pantalla al tocar un pin: "Peña La Casona, seleccionado: 3 eventos". */
export function textoDeSeleccion(pin: PinLugar, idioma: Idioma = "es"): string {
  return textosDe(idioma).mapa.seleccionado(pin.nombre, pin.eventos.length)
}

/** Lo que dice el lector de pantalla con "Ver en el mapa". */
export function textoDeCentrado(pin: PinLugar, idioma: Idioma = "es"): string {
  return textosDe(idioma).mapa.centradoEn(pin.nombre)
}

/**
 * `true` si el centro del bloque (donde el mapa deja el pin centrado) está en
 * pantalla, debajo de la barra fija de arriba (su alto es el `scroll-margin-top`
 * del bloque).
 */
function seVeElCentro(elemento: HTMLElement): boolean {
  const caja = elemento.getBoundingClientRect()
  const barra = Number.parseFloat(window.getComputedStyle(elemento).scrollMarginTop) || 0
  const centro = caja.top + caja.height / 2
  return centro >= barra && centro <= window.innerHeight
}

/**
 * El contenido de `/mapa`: los filtros de fecha y "qué" (que cambian la URL y
 * vuelven a pedir la página al servidor), el contador, el mapa diferido y la
 * lista de lugares. Guarda el lugar seleccionado, que comparten el mapa y la
 * lista.
 */
export function MapaContenido({ pines, sinUbicacion, filtro, extra, categorias, lugarInicial, ahoraISO, idioma = "es" }: MapaContenidoProps) {
  const t = textosDe(idioma).mapa
  const router = useRouter()
  const [cambiando, iniciarCambio] = useTransition()
  const [seleccionado, setSeleccionado] = useState<string | null>(lugarInicial)
  // Orden de centrar el mapa: `n` sube en cada pedido, así repetir el mismo lugar vuelve a centrar.
  const [centrar, setCentrar] = useState<{ venueId: string; n: number } | null>(
    lugarInicial ? { venueId: lugarInicial, n: 0 } : null
  )
  const bloqueMapa = useRef<HTMLDivElement>(null)
  const bloqueLista = useRef<HTMLDivElement>(null)
  const chipGratis = useRef<HTMLAnchorElement>(null)
  // Lo que anuncia el lector de pantalla al seleccionar desde el mapa o con
  // "Ver en el mapa" (WCAG 4.1.3). `n` sube en cada anuncio: el mismo texto dos
  // veces seguidas se vuelve a decir (ver abajo).
  const [anuncio, setAnuncio] = useState({ texto: "", n: 0 })
  // Si el mapa no carga, "Ver en el mapa" llevaría al aviso de error: se saca.
  // Vuelve si el mapa carga después (por ejemplo, otro día sin pines desmonta
  // el mapa y al volver arranca bien): `onListo`.
  const [mapaDisponible, setMapaDisponible] = useState(true)
  // El bloque (id) del lugar cuyo "Ver en el mapa" tenía el foco cuando el mapa falló: el foco pasa a su primer evento.
  const rescatarFocoEn = useRef<string | null>(null)
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
    // Solo si el foco quedó en el aire (el botón se fue): si mientras tanto
    // la persona ya pasó a otro control, no se lo sacamos.
    const activo = document.activeElement
    if (activo === null || activo === document.body) chipGratis.current?.focus()
  }, [cambiando])

  // `?lugar=`: el lugar abre seleccionado y la lista lo lleva a la vista, arriba
  // de todo (así se ven sus eventos). Solo si la lista tiene scroll propio (en
  // la compu, al lado del mapa): en el celular el mapa va arriba y ya muestra el
  // pin centrado, y bajar la página hasta la lista lo sacaría de la vista. Se
  // mueve solo la lista (`scrollTo`): `scrollIntoView` también corría la página.
  useEffect(() => {
    const lista = bloqueLista.current
    const lugar = lugarInicial ? document.getElementById(idBloqueLugar(lugarInicial)) : null
    if (!lista || !lugar || lista.scrollHeight <= lista.clientHeight) return
    const caja = lugar.getBoundingClientRect()
    const vista = lista.getBoundingClientRect()
    if (caja.top >= vista.top && caja.bottom <= vista.bottom) return
    lista.scrollTo({ top: lista.scrollTop + caja.top - vista.top, behavior: comportamientoDeScroll() })
    // Solo al abrir la página: después la selección la mueven el mapa y la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mapaDisponible || rescatarFocoEn.current === null) return
    const lugar = document.getElementById(rescatarFocoEn.current)
    rescatarFocoEn.current = null
    const activo = document.activeElement
    if (activo === null || activo === document.body) lugar?.querySelector<HTMLElement>("a[href]")?.focus()
  }, [mapaDisponible])

  // Si el filtro nuevo no trae el lugar seleccionado, no hay nada que resaltar.
  const seleccionVigente = seleccionado && pines.some((pin) => pin.venueId === seleccionado) ? seleccionado : null

  const hoy = formatSaltaDayKey(new Date(ahoraISO))
  const maximo = sumarDias(hoy, DIAS_MAXIMOS_FECHA_MAPA)
  const textoDelFiltro = filtro.tipo === "hoy" ? t.paraHoy : filtro.tipo === "finde" ? t.paraFinde : t.paraFecha
  const conFiltrosExtra = hayFiltrosExtra(extra)
  const urlSinFiltros = urlDelMapa(pedido.filtro, SIN_FILTROS_EXTRA, idioma)
  const urlAgenda = rutaEn(idioma, "/buscar")

  function irA(consulta: string) {
    // Otro filtro, otra lista: el lugar seleccionado no tiene que revivir después.
    setSeleccionado(null)
    setCentrar(null)
    setAnuncio((anterior) => ({ texto: "", n: anterior.n }))
    iniciarCambio(() => {
      router.replace(rutaEn(idioma, `/mapa?${consulta}`), { scroll: false })
    })
  }

  /** Navega a la fecha y los filtros "qué" pedidos; lo que no cambia se conserva. */
  function pedir(filtroNuevo: FiltroMapa, extraNuevo: FiltrosExtraMapa) {
    setPedido({ filtro: filtroNuevo, extra: extraNuevo })
    irA(consultaDelMapa(filtroNuevo, extraNuevo))
  }

  /** El `onNavigate` de los "Quitar filtros" (que son links): navega desde acá, como los chips. */
  function alQuitarFiltros(evento: { preventDefault: () => void }) {
    evento.preventDefault()
    enfocarGratisAlTerminar.current = true
    pedir(pedido.filtro, SIN_FILTROS_EXTRA)
  }

  function ordenarCentrar(venueId: string) {
    setCentrar((anterior) => ({ venueId, n: (anterior?.n ?? 0) + 1 }))
  }

  function anunciar(texto: string) {
    setAnuncio((anterior) => ({ texto, n: anterior.n + 1 }))
  }

  function alSeleccionarEnElMapa(venueId: string) {
    setSeleccionado(venueId)
    ordenarCentrar(venueId)
    const pin = pines.find((candidato) => candidato.venueId === venueId)
    if (pin) anunciar(textoDeSeleccion(pin, idioma))
    document.getElementById(idBloqueLugar(venueId))?.scrollIntoView({ block: "nearest", behavior: comportamientoDeScroll() })
  }

  function alVerEnElMapa(venueId: string) {
    setSeleccionado(venueId)
    ordenarCentrar(venueId)
    const pin = pines.find((candidato) => candidato.venueId === venueId)
    if (pin) anunciar(textoDeCentrado(pin, idioma))
    // En el celular el mapa queda arriba de la lista. Si el centro del mapa (el
    // pin) ya se ve, no se mueve nada y el botón con el foco sigue en pantalla.
    // Si no se ve, se sube la página hasta el mapa y el botón con el foco queda
    // FUERA de la pantalla (a 360×740, desde el 3.er lugar en adelante): el foco
    // no se mueve (sigue en el botón y el próximo Tab sigue desde ahí, que el
    // navegador vuelve a mostrar), y el anuncio "Mapa centrado en …" explica el salto.
    const mapa = bloqueMapa.current
    if (mapa && !seVeElCentro(mapa)) mapa.scrollIntoView({ block: "nearest", behavior: comportamientoDeScroll() })
  }

  function alFallarElMapa() {
    // Si el foco estaba en un "Ver en el mapa" (que se va), no se pierde: pasa al primer evento de ese lugar.
    const activo = document.activeElement
    const lugar = activo instanceof HTMLElement && activo.hasAttribute("data-ver-en-el-mapa") ? activo.closest("li[id]") : null
    if (lugar) rescatarFocoEn.current = lugar.id
    setMapaDisponible(false)
  }

  return (
    <div aria-busy={cambiando}>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{t.titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.bajada}</p>
      {idioma === "en" && <AvisoContenidoEs className="mt-2" />}

      {/*
        Los chips son links a su URL (funcionan sin JavaScript y antes de
        hidratar) presentados como botones de alternar (`propsDeChip`: role
        "button", aria-pressed y Espacio); el día y la categoría, sin JavaScript, se mandan con este
        formulario y los botones de los <noscript>. Con JavaScript el
        formulario no se envía nunca: cada cambio navega desde `pedir`.
      */}
      <form action={rutaEn(idioma, "/mapa")} method="get" onSubmit={(evento) => evento.preventDefault()} className="mt-4 space-y-2">
        <div role="group" aria-label={t.cuando} className="flex flex-wrap items-center gap-2">
          <Link
            href={urlDelMapa({ tipo: "hoy" }, pedido.extra, idioma)}
            prefetch={false}
            {...propsDeChip(filtro.tipo === "hoy")}
            onNavigate={navegarCon(() => pedir({ tipo: "hoy" }, pedido.extra))}
            className={`${BASE_BOTON} ${filtro.tipo === "hoy" ? BOTON_ACTIVO : BOTON_INACTIVO}`}
          >
            {t.hoy}
          </Link>
          <Link
            href={urlDelMapa({ tipo: "finde" }, pedido.extra, idioma)}
            prefetch={false}
            {...propsDeChip(filtro.tipo === "finde")}
            onNavigate={navegarCon(() => pedir({ tipo: "finde" }, pedido.extra))}
            className={`${BASE_BOTON} ${filtro.tipo === "finde" ? BOTON_ACTIVO : BOTON_INACTIVO}`}
          >
            {t.esteFinde}
          </Link>
          <label
            className={`${BASE_BOTON} gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${filtro.tipo === "fecha" ? BOTON_ACTIVO : BOTON_INACTIVO}`}
          >
            <span>{t.elegirFecha}</span>
            <input
              type="date"
              name="dia"
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
          <noscript>
            <button type="submit" name="cuando" value="fecha" className={`${BASE_BOTON} ${BOTON_INACTIVO}`}>
              {t.verEseDia}
            </button>
          </noscript>
        </div>
        <FiltrosQue
          extra={pedido.extra}
          filtro={pedido.filtro}
          categorias={categorias}
          onCambiar={(extraNuevo) => pedir(pedido.filtro, extraNuevo)}
          refGratis={chipGratis}
          idioma={idioma}
        />
      </form>

      <div className={`mt-4 transition-opacity ${cambiando ? "opacity-60" : ""}`}>
        {/* Siempre montado: un aria-live que aparece junto con su texto no siempre se anuncia. */}
        <div className="flex flex-wrap items-center gap-x-3">
          {/* Sin pines lo dice el vacío de abajo: acá queda solo para el lector de pantalla (no se repite a la vista). */}
          <p aria-live="polite" className={pines.length > 0 ? "text-sm font-medium text-foreground" : "sr-only"}>
            {pines.length > 0
              ? textoDelContador(pines, idioma)
              : conFiltrosExtra
                ? t.sinEventosConFiltros
                : t.sinEventosEnFecha(textoDelFiltro)}
          </p>
          {/* Sin pines, el "Quitar filtros" grande del vacío alcanza: no van dos botones iguales. */}
          {conFiltrosExtra && pines.length > 0 ? (
            <Link
              href={urlSinFiltros}
              prefetch={false}
              onNavigate={alQuitarFiltros}
              className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t.quitarFiltros}
            </Link>
          ) : null}
        </div>
        {/* Aparte del contador: qué lugar se eligió en el mapa o dónde se centró (WCAG 4.1.3). */}
        <p aria-live="polite" aria-atomic="true" data-anuncio-mapa="" className="sr-only">
          {anuncio.texto}
          {/* El mismo texto dos veces seguidas no se vuelve a anunciar: un espacio duro alterno lo cambia. */}
          {anuncio.texto && anuncio.n % 2 === 1 ? "\u00a0" : ""}
        </p>
        {sinUbicacion > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t.sinUbicacion(sinUbicacion)}{" "}
            <Link href={urlAgenda} className="font-medium text-primary underline-offset-2 hover:underline">
              {t.verAgendaCompleta}
            </Link>
          </p>
        ) : null}

        {pines.length === 0 && conFiltrosExtra ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center">
            <h2 className="font-semibold text-foreground">{t.vacioConFiltrosTitulo(textoDelFiltro)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.vacioConFiltrosTexto(nombresDeFiltrosExtra(extra, categorias, idioma))}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <Link
                href={urlSinFiltros}
                prefetch={false}
                onNavigate={alQuitarFiltros}
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t.quitarFiltros}
              </Link>
              {/* text-foreground y subrayado: el primario sobre bg-card no llega a 4,5:1 en el tema oscuro. */}
              <Link
                href={urlAgenda}
                className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t.verAgendaCompleta}
              </Link>
            </div>
          </div>
        ) : pines.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-foreground">{t.sinEventosEnFecha(textoDelFiltro)}</p>
            <Link
              href={urlAgenda}
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t.verTodosLosEventos}
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
                onFallo={alFallarElMapa}
                onListo={() => setMapaDisponible(true)}
                className={`h-[45dvh] min-h-64 ${ALTO_LG}`}
                idioma={idioma}
              />
            </div>
            <div ref={bloqueLista} className={`${ALTO_MAX_LG} lg:overflow-y-auto lg:pr-1`}>
              <ListaLugares pines={pines} seleccionado={seleccionVigente} onVerEnElMapa={alVerEnElMapa} mapaDisponible={mapaDisponible} idioma={idioma} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
