import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { MapPin, Navigation } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { JsonLd } from "@/components/json-ld"
import { BotonSeguir } from "@/components/boton-seguir"
import { AvisoContenidoEs } from "@/components/aviso-contenido-es"
import { BotonCompartirLugar } from "@/components/lugares/boton-compartir-lugar"
import { MapaChicoLugar } from "@/components/lugares/mapa-chico-lugar"
import { createClient } from "@/lib/supabase/server"
import { obtenerFichaLugar } from "@/lib/lugares/ficha"
import { lugarJsonLd } from "@/lib/seo/json-ld-lugar"
import { SITE_URL } from "@/lib/seo/sitio"
import { idiomasAlternos } from "@/lib/i18n/seo"
import { textosDe } from "@/lib/i18n"
import { diaMes, hora } from "@/lib/i18n/fechas"
import type { Idioma } from "@/lib/i18n/idiomas"
import { rutaEn } from "@/lib/i18n/rutas"
import { formatEventTime, formatSaltaClock } from "@/lib/date-format"
import { fichaLugarIndexable, type EventoDeLugar } from "@qps/core/lugares/ficha"
import {
  ATRIBUCION_OSM,
  ETIQUETA_ACCESO,
  ETIQUETA_TIPO,
  URL_LICENCIA_OSM,
  accesibilidadVerificada,
  filasDeHorarios,
  textoEdades,
  textoHorarioDeHoy,
} from "@qps/core/lugares/permanentes"
import { urlComoLlegar } from "@qps/core/metricas/links"

export interface PaginaLugarProps {
  params: Promise<{ slug: string }>
}

/** Metadata compartida (/lugar y /en/place): canonical, hreflang y noindex si la ficha es flaca. */
export async function metadataDeLugar({ params }: PaginaLugarProps, idioma: Idioma): Promise<Metadata> {
  const { slug } = await params
  const ficha = await obtenerFichaLugar(slug).catch(() => null)
  const t = textosDe(idioma).fichaLugar
  if (!ficha || ficha.tipo !== "ok") return { title: t.noEncontrado, robots: { index: false, follow: true } }
  const ruta = `/lugar/${ficha.venue.slug}`
  const indexable = fichaLugarIndexable({
    proximos: ficha.proximos.length,
    pasados: ficha.pasados.length,
    permanente: ficha.permanente !== null,
  })
  const descripcion = t.metaDescripcion(ficha.venue.nombre, ficha.proximos.length)
  return {
    title: idioma === "en" ? { absolute: `${ficha.venue.nombre}, Salta | Qué Pinta Salta` } : `${ficha.venue.nombre}, Salta`,
    description: descripcion,
    alternates: { canonical: rutaEn(idioma, ruta), languages: idiomasAlternos(ruta) },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      url: rutaEn(idioma, ruta),
      title: `${ficha.venue.nombre} | Qué Pinta Salta`,
      description: descripcion,
      ...(idioma === "en" ? { locale: "en_US", alternateLocale: ["es_AR"] } : {}),
    },
  }
}

async function seguimientoDelLugar(venueId: string): Promise<{ haySesion: boolean; siguiendo: boolean }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { haySesion: false, siguiendo: false }
    const { data } = await supabase
      .from("user_followed_venues")
      .select("venue_id")
      .eq("user_id", user.id)
      .eq("venue_id", venueId)
      .maybeSingle()
    return { haySesion: true, siguiendo: data !== null }
  } catch {
    return { haySesion: false, siguiendo: false }
  }
}

function ListaEventos({ eventos, idioma }: { eventos: EventoDeLugar[]; idioma: Idioma }) {
  const t = textosDe(idioma).fichaLugar
  const langContenido = idioma === "es" ? undefined : "es"
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {eventos.map((e) => (
        <li key={e.id} className="flex items-baseline gap-3 px-4 py-3">
          <time dateTime={e.inicio} className="min-w-28 shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
            {diaMes(idioma, e.inicio)} · {idioma === "es" ? formatEventTime(e.inicio) : hora(idioma, formatSaltaClock(e.inicio))}
          </time>
          <Link
            href={rutaEn(idioma, `/evento/${e.id}`)}
            lang={langContenido}
            className="min-w-0 rounded-sm text-sm font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {e.titulo}
          </Link>
          {e.gratis ? <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">{t.gratis}</span> : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * Q5-5 · La ficha pública de un lugar: nombre, dirección, mapa chico,
 * próximos eventos y recientes, horarios si es un lugar permanente para
 * chicos, «Cómo llegar», «Seguir lugar» y compartir. JSON-LD con la lista de
 * eventos. `/lugar/<uuid>` y slugs viejos o de venues fusionados redirigen
 * (308) al slug canónico.
 */
export async function PaginaLugar({ params, idioma }: PaginaLugarProps & { idioma: Idioma }) {
  const { slug } = await params
  const ficha = await obtenerFichaLugar(slug)
  if (ficha.tipo === "no-existe") notFound()
  if (ficha.tipo === "redirigir") permanentRedirect(rutaEn(idioma, `/lugar/${ficha.slug}`))

  const textos = textosDe(idioma)
  const t = textos.fichaLugar
  const { venue, proximos, pasados, permanente } = ficha
  const ruta = `/lugar/${venue.slug}`
  const url = `${SITE_URL}${rutaEn(idioma, ruta)}`
  const ahora = new Date()
  const llegar = urlComoLlegar({ address: `${venue.nombre}, ${venue.direccion}, Salta` })
  const seguimiento = await seguimientoDelLugar(venue.id)
  const langContenido = idioma === "es" ? undefined : "es"
  const accesibilidad = permanente
    ? accesibilidadVerificada(
        { tiene_rampa: permanente.tieneRampa, tiene_bano_adaptado: permanente.tieneBanoAdaptado, tiene_cambiador: permanente.tieneCambiador },
        idioma,
      )
    : []
  const tieneUbicacion = venue.lat !== null && venue.lng !== null

  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <JsonLd data={lugarJsonLd({ venue, url, proximos, permanente, idioma })} />
      <Navbar />
      <main id="contenido" tabIndex={-1} className="container mx-auto max-w-3xl px-4 py-6 sm:py-10 focus:outline-none">
        <h1 lang={langContenido} className="text-2xl font-bold text-foreground sm:text-3xl">
          {venue.nombre}
        </h1>
        <p lang={langContenido} className="mt-1 flex items-start gap-2 text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {venue.direccion}
        </p>
        {permanente ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t.lugarParaChicos}: {ETIQUETA_TIPO[idioma][permanente.tipo]} · {textoEdades(permanente.edadMin, permanente.edadMax, idioma)}
          </p>
        ) : null}
        {idioma === "en" && <AvisoContenidoEs className="mt-2" />}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {llegar ? (
            <a
              href={llegar}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Navigation className="size-4" aria-hidden="true" />
              {t.comoLlegar}
            </a>
          ) : null}
          <BotonSeguir tipo="lugar" id={venue.id} etiqueta={venue.nombre} siguiendoInicial={seguimiento.siguiendo} haySesion={seguimiento.haySesion} />
          <BotonCompartirLugar titulo={venue.nombre} url={url} idioma={idioma} />
          {tieneUbicacion ? (
            <Link
              href={rutaEn(idioma, `/mapa?cuando=hoy&lugar=${venue.id}${permanente ? "&capa=chicos" : ""}`)}
              className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t.verEnElMapa}
            </Link>
          ) : null}
        </div>

        <section aria-label={t.mapaDelLugar(venue.nombre)} className="mt-6">
          {tieneUbicacion ? (
            <>
              <MapaChicoLugar venueId={venue.id} nombre={venue.nombre} direccion={venue.direccion} lat={venue.lat!} lng={venue.lng!} permanente={permanente} idioma={idioma} />
              <p className="sr-only">{t.ayudaMapa}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t.sinUbicacion}</p>
          )}
        </section>

        {permanente ? (
          <section aria-labelledby="titulo-horarios" className="mt-8">
            <h2 id="titulo-horarios" className="text-lg font-semibold text-foreground">
              {t.horarios}
            </h2>
            <p className="mt-1 text-sm font-medium text-foreground">{textoHorarioDeHoy(permanente.horarios, ahora, idioma)}</p>
            {!permanente.horarios.siempre_abierto && !permanente.horarios.solo_con_reserva ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {filasDeHorarios(permanente.horarios, idioma).map((fila) => (
                  <div key={fila.dia} className="contents">
                    <dt className="text-muted-foreground">{fila.etiqueta}</dt>
                    <dd className="text-foreground">{fila.texto}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="mt-2 text-sm text-foreground">
              {ETIQUETA_ACCESO[idioma][permanente.acceso]}
              {accesibilidad.length > 0 ? ` · ${accesibilidad.join(" · ")}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{textos.lugaresChicos.leyenda}</p>
            {permanente.deOsm ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <a href={URL_LICENCIA_OSM} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {ATRIBUCION_OSM[idioma]}
                </a>
              </p>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="titulo-proximos" className="mt-8">
          <h2 id="titulo-proximos" className="text-lg font-semibold text-foreground">
            {t.proximos}
          </h2>
          <div className="mt-3">
            {proximos.length > 0 ? <ListaEventos eventos={proximos} idioma={idioma} /> : <p className="text-sm text-muted-foreground">{t.sinProximos}</p>}
          </div>
        </section>

        {pasados.length > 0 ? (
          <section aria-labelledby="titulo-pasados" className="mt-8">
            <h2 id="titulo-pasados" className="text-lg font-semibold text-foreground">
              {t.pasados}
            </h2>
            <div className="mt-3">
              <ListaEventos eventos={pasados} idioma={idioma} />
            </div>
          </section>
        ) : null}
      </main>
      <MobileNav />
    </div>
  )
}
