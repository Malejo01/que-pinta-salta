import type { Metadata } from "next"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { PaginaDeError } from "@/components/pagina-de-error"
import { getEvents } from "@/lib/data"
import { armarPinesDelMapa, parsearFiltroMapa } from "@qps/core/mapa/pines"
import { MapaContenido } from "./mapa-contenido"

export const metadata: Metadata = {
  title: "Mapa de eventos en Salta",
  description: "Mirá en el mapa dónde pasan los eventos de Salta Capital: peñas, recitales, boliches, ferias y más, hoy, este finde o el día que elijas.",
  alternates: { canonical: "/mapa" },
  openGraph: {
    title: "Mapa de eventos en Salta | Qué Pinta Salta",
    description: "Mirá en el mapa dónde pasan los eventos de Salta Capital, hoy, este finde o el día que elijas.",
    url: "https://www.quepintasalta.com.ar/mapa",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mapa de eventos en Salta | Qué Pinta Salta",
    description: "Mirá en el mapa dónde pasan los eventos de Salta Capital, hoy, este finde o el día que elijas.",
  },
}

type ParametroDeUrl = string | string[] | undefined

interface MapaPageProps {
  searchParams?: Promise<{ cuando?: ParametroDeUrl; dia?: ParametroDeUrl; lugar?: ParametroDeUrl }>
}

/** Un query param repetido (`?a=1&a=2`) llega como arreglo: se toma el primero. */
function primero(valor: ParametroDeUrl): string | null {
  return (Array.isArray(valor) ? valor[0] : valor) ?? null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `/mapa`: pública y igual para todos (sin sesión, favoritos ni nada
 * personal). El servidor arma los pines del filtro y le pasa al cliente solo lo
 * que dibuja (`PinLugar`): ni descripciones ni imágenes.
 */
export default async function MapaPage({ searchParams }: MapaPageProps) {
  const params = (await searchParams) ?? {}
  const ahora = new Date()
  const filtro = parsearFiltroMapa({ cuando: primero(params.cuando), dia: primero(params.dia) }, ahora)

  let eventos: Awaited<ReturnType<typeof getEvents>>
  try {
    eventos = await getEvents({ includeStartedToday: true })
  } catch (error) {
    console.error("Error armando /mapa:", error)
    return (
      <PaginaDeError
        titulo="No pudimos cargar el mapa"
        texto="Tuvimos un problema de nuestro lado. Probá de nuevo en un momento."
      />
    )
  }

  const { pines, sinUbicacion } = armarPinesDelMapa(eventos, filtro, ahora)

  const lugar = primero(params.lugar)
  const lugarInicial = lugar && UUID.test(lugar) && pines.some((pin) => pin.venueId === lugar) ? lugar : null

  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />
      <main className="container mx-auto px-4 py-4 sm:py-8">
        <MapaContenido
          pines={pines}
          sinUbicacion={sinUbicacion}
          filtro={filtro}
          lugarInicial={lugarInicial}
          ahoraISO={ahora.toISOString()}
        />
      </main>
      <MobileNav />
    </div>
  )
}
