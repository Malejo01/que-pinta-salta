import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { PaginaDeError } from "@/components/pagina-de-error"
import { getEvents } from "@/lib/data"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { parsearFiltroMapa } from "@qps/core/mapa/pines"
import { armarMapaFiltrado, categoriasDeLosEventos, parsearFiltrosExtraMapa } from "@qps/core/mapa/filtros"
import { MapaContenido } from "@/app/mapa/mapa-contenido"

type ParametroDeUrl = string | string[] | undefined

export interface MapaPageProps {
  searchParams?: Promise<{
    cuando?: ParametroDeUrl
    dia?: ParametroDeUrl
    lugar?: ParametroDeUrl
    gratis?: ParametroDeUrl
    chicos?: ParametroDeUrl
    categoria?: ParametroDeUrl
  }>
}

/** Un query param repetido (`?a=1&a=2`) llega como arreglo: se toma el primero. */
function primero(valor: ParametroDeUrl): string | null {
  return (Array.isArray(valor) ? valor[0] : valor) ?? null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * La página de `/mapa` y `/en/mapa` (compartida; cada una pone su metadata).
 * Pública y igual para todos (sin sesión, favoritos ni nada personal). El
 * servidor arma los pines del filtro (fecha más Gratis, Para chicos y
 * categoría) y le pasa al cliente solo lo que dibuja (`PinLugar`): ni
 * descripciones ni imágenes. Los nombres de los query params son los mismos en
 * los dos idiomas.
 *
 * Se llama como función desde `app/mapa/page.tsx` y `app/en/mapa/page.tsx`
 * (no como elemento JSX), así lo que devuelve es el árbol de la página.
 */
export async function PaginaMapa({ searchParams, idioma }: MapaPageProps & { idioma: Idioma }) {
  const params = (await searchParams) ?? {}
  const ahora = new Date()
  const filtro = parsearFiltroMapa({ cuando: primero(params.cuando), dia: primero(params.dia) }, ahora)

  let eventos: Awaited<ReturnType<typeof getEvents>>
  try {
    eventos = await getEvents({ includeStartedToday: true })
  } catch (error) {
    console.error("Error armando /mapa:", error)
    const t = textosDe(idioma).mapa
    return <PaginaDeError titulo={t.errorTitulo} texto={t.errorTexto} idioma={idioma} />
  }

  const slugsValidos = new Set(categoriasDeLosEventos(eventos).map((categoria) => categoria.slug))
  const extra = parsearFiltrosExtraMapa(
    { gratis: primero(params.gratis), chicos: primero(params.chicos), categoria: primero(params.categoria) },
    slugsValidos
  )
  const { pines, sinUbicacion, categorias } = armarMapaFiltrado(eventos, filtro, extra, ahora)

  const lugar = primero(params.lugar)
  const lugarInicial = lugar && UUID.test(lugar) && pines.some((pin) => pin.venueId === lugar) ? lugar : null

  return (
    // `data-pagina-mapa`: sin JavaScript, el <noscript> de `loading.tsx` muestra la página con esto.
    <div data-pagina-mapa="" className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />
      <main className="container mx-auto px-4 py-4 sm:py-8">
        <MapaContenido
          pines={pines}
          sinUbicacion={sinUbicacion}
          filtro={filtro}
          extra={extra}
          categorias={categorias}
          lugarInicial={lugarInicial}
          ahoraISO={ahora.toISOString()}
          idioma={idioma}
        />
      </main>
      <MobileNav />
    </div>
  )
}
