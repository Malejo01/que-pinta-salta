"use client"

/**
 * Q5-2 · La sección «Lugares para chicos» de la lista de /mapa (propuesta §4.3
 * y §4.6). Es la alternativa completa a la capa del mapa: todo lo que está en
 * el mapa está acá, y funciona aunque MapLibre no cargue.
 *
 * «Cerca de casa», SOLO en el navegador:
 *  - «Cerca mío» pide `getCurrentPosition` únicamente al tocar el botón (nunca
 *    al cargar), sin alta precisión, sin `watchPosition` y con timeout.
 *  - «O elegí tu barrio» usa los puntos aproximados de @qps/core/datos/barrios.
 *  - La posición o el barrio viven en el estado de React mientras la página
 *    está abierta: no van a la URL, al servidor, a ningún almacenamiento ni a
 *    la analítica. Este archivo no importa nada que escriba a la red (lo fija
 *    tests/lugares-chicos/cerca-de-casa.test.ts).
 */
import { useState } from "react"
import { MapPin, Navigation } from "lucide-react"
import { BARRIOS_SALTA_CAPITAL, barrioPorId } from "@qps/core/datos/barrios"
import { formatSaltaDayKey } from "@qps/core/date-format"
import {
  ATRIBUCION_OSM,
  ETIQUETA_ACCESO,
  ETIQUETA_TECHADO,
  ETIQUETA_TIPO,
  URL_LICENCIA_OSM,
  accesibilidadVerificada,
  estadoDeRevision,
  textoDistancia,
  textoEdades,
  textoHorarioDeHoy,
} from "@qps/core/lugares/permanentes"
import { idBloqueLugarChicos, ordenarPorDistancia, type LugarChicosMapa } from "@qps/core/mapa/lugares-chicos"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"

type Origen = { tipo: "posicion"; lat: number; lng: number } | { tipo: "barrio"; id: string; nombre: string; lat: number; lng: number }

const BOTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
const ENLACE =
  "inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

/** «Cómo llegar»: abre Google Maps con la dirección del lugar (no le pasa la ubicación de nadie). */
export function urlComoLlegar(lugar: Pick<LugarChicosMapa, "nombre" | "direccion">): string {
  const consulta = `${lugar.nombre}, ${lugar.direccion}, Salta`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`
}

function fechaCorta(iso: string): string {
  const [a, m, d] = formatSaltaDayKey(iso).split("-")
  return `${d}/${m}/${a}`
}

interface Props {
  lugares: LugarChicosMapa[]
  /** El «ahora» del servidor (sin desfase de hidratación en «Hoy: …»). */
  ahoraISO: string
  seleccionado: string | null
  /** Lugares de la capa que además tienen eventos en el mapa. */
  conEventos: ReadonlySet<string>
  onVerEnElMapa: (venueId: string) => void
  mapaDisponible: boolean
  idioma: Idioma
}

export function SeccionLugaresChicos({ lugares, ahoraISO, seleccionado, conEventos, onVerEnElMapa, mapaDisponible, idioma }: Props) {
  const t = textosDe(idioma).lugaresChicos
  const ahora = new Date(ahoraISO)
  const [origen, setOrigen] = useState<Origen | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState("")
  const langContenido = idioma === "es" ? undefined : "es"

  function alTocarCercaMio() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setAviso(t.sinPermiso)
      return
    }
    setBuscando(true)
    setAviso(t.buscandoPosicion)
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setBuscando(false)
        setOrigen({ tipo: "posicion", lat: posicion.coords.latitude, lng: posicion.coords.longitude })
        setAviso(t.ordenadoDesdeTuPosicion)
      },
      () => {
        setBuscando(false)
        setAviso(t.sinPermiso)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  function alElegirBarrio(id: string) {
    const barrio = barrioPorId(id)
    if (!barrio) {
      setOrigen(null)
      setAviso("")
      return
    }
    setOrigen({ tipo: "barrio", id: barrio.id, nombre: barrio.nombre, lat: barrio.lat, lng: barrio.lng })
    setAviso(t.ordenadoDesdeBarrio(barrio.nombre))
  }

  const ordenados = ordenarPorDistancia(lugares, origen)

  return (
    <section aria-labelledby="titulo-lugares-chicos" className="mt-6">
      <h2 id="titulo-lugares-chicos" className="text-lg font-semibold text-foreground">
        {t.titulo}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.bajada}</p>

      <div role="group" aria-label={t.cercaTitulo} className="mt-3 flex flex-wrap items-end gap-2">
        <button type="button" onClick={alTocarCercaMio} disabled={buscando} aria-busy={buscando} className={BOTON}>
          <Navigation className="size-4" aria-hidden="true" />
          {t.cercaMio}
        </button>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
          {t.oElegiBarrio}
          <select
            value={origen?.tipo === "barrio" ? origen.id : ""}
            onChange={(evento) => alElegirBarrio(evento.target.value)}
            className="h-11 min-w-0 rounded-md border border-input bg-background px-2 text-foreground"
          >
            <option value="">{t.ningunBarrio}</option>
            {BARRIOS_SALTA_CAPITAL.map((barrio) => (
              <option key={barrio.id} value={barrio.id} lang={langContenido}>
                {barrio.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
        {aviso}
      </p>
      <p className="text-xs text-muted-foreground">{t.privacidadCerca}</p>

      {ordenados.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.vacio}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {ordenados.map((lugar) => {
            const esSeleccionado = lugar.venueId === seleccionado
            const accesibilidad = accesibilidadVerificada(
              { tiene_rampa: lugar.tieneRampa, tiene_bano_adaptado: lugar.tieneBanoAdaptado, tiene_cambiador: lugar.tieneCambiador },
              idioma,
            )
            const revision = estadoDeRevision(lugar.tipo, lugar.verificadoAt, ahora)
            return (
              <li
                key={lugar.venueId}
                id={idBloqueLugarChicos(lugar.venueId)}
                aria-current={esSeleccionado ? "true" : undefined}
                className={`scroll-mt-24 scroll-mb-24 rounded-2xl border bg-card p-4 transition-colors ${
                  esSeleccionado ? "border-primary ring-1 ring-primary" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 lang={langContenido} className="text-base font-semibold text-foreground">
                      {/* Q5-5: el nombre lleva a la ficha del lugar. */}
                      {lugar.slug ? (
                        <a href={rutaEn(idioma, `/lugar/${lugar.slug}`)} className="rounded-sm hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                          {lugar.nombre}
                        </a>
                      ) : (
                        lugar.nombre
                      )}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {ETIQUETA_TIPO[idioma][lugar.tipo]} · {textoEdades(lugar.edadMin, lugar.edadMax, idioma)}
                      {lugar.metros !== null ? ` · ${textoDistancia(lugar.metros, idioma)}` : ""}
                    </p>
                    <p lang={langContenido} className="text-sm text-muted-foreground">
                      {lugar.direccion}
                    </p>
                  </div>
                  {mapaDisponible ? (
                    <button type="button" data-ver-en-el-mapa="" onClick={() => onVerEnElMapa(lugar.venueId)} className={`${BOTON} shrink-0`}>
                      <MapPin className="size-4" aria-hidden="true" />
                      <span>
                        {textosDe(idioma).mapa.verEnElMapa}
                        {" "}
                        <span lang={langContenido} className="sr-only">{lugar.nombre}</span>
                      </span>
                    </button>
                  ) : null}
                </div>

                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  <li>{textoHorarioDeHoy(lugar.horarios, ahora, idioma)}</li>
                  <li>
                    {ETIQUETA_ACCESO[idioma][lugar.acceso]}
                    {lugar.notaPrecio ? <span lang={langContenido}> · {lugar.notaPrecio}</span> : null}
                    {lugar.techado ? ` · ${ETIQUETA_TECHADO[idioma][lugar.techado]}` : ""}
                  </li>
                  {accesibilidad.length > 0 ? <li>{accesibilidad.join(" · ")}</li> : null}
                  {lugar.descripcion ? (
                    <li lang={langContenido} className="text-muted-foreground">
                      {lugar.descripcion}
                    </li>
                  ) : null}
                  {lugar.verificadoAt ? <li className="text-muted-foreground">{t.verificadoEl(fechaCorta(lugar.verificadoAt))}</li> : null}
                  {revision === "puede_haber_cambiado" ? <li className="font-medium">{t.puedeHaberCambiado}</li> : null}
                  {conEventos.has(lugar.venueId) ? <li className="text-muted-foreground">{t.tambienTieneEventos}</li> : null}
                </ul>

                <div className="mt-2 flex flex-wrap gap-x-4">
                  <a href={urlComoLlegar(lugar)} target="_blank" rel="noopener noreferrer" className={ENLACE}>
                    {t.comoLlegar}
                    {" "}
                        <span lang={langContenido} className="sr-only">{lugar.nombre}</span>
                  </a>
                  {lugar.web ? (
                    <a href={lugar.web} target="_blank" rel="noopener noreferrer nofollow" className={ENLACE}>
                      {t.web}
                    </a>
                  ) : null}
                  {lugar.instagram ? (
                    <a href={lugar.instagram} target="_blank" rel="noopener noreferrer nofollow" className={ENLACE}>
                      {t.instagram}
                    </a>
                  ) : null}
                  {lugar.telefono ? (
                    <a href={`tel:${lugar.telefono.replace(/[^0-9+]/g, "")}`} className={ENLACE}>
                      {t.llamar}
                    </a>
                  ) : null}
                </div>
                {lugar.deOsm ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <a href={URL_LICENCIA_OSM} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {ATRIBUCION_OSM[idioma]}
                    </a>
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t.leyenda}</p>
      {/* Q5-3: el formulario público para sumar un lugar. */}
      <a href={rutaEn(idioma, "/lugares-chicos/sumar")} className={ENLACE}>
        {textosDe(idioma).sumarLugar.linkDesdeMapa}
      </a>
    </section>
  )
}
