"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Heart, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EventCard } from "@/components/event-card"
import { MovieModal } from "@/components/movie-modal"
import { useDonation } from "@/components/donation-context"
import type { DisplayEvent } from "@/components/home-content"
import { cargaPorIndice, type CargaImagen } from "@/lib/images/carga"

// El agrupado ("Plan flexible" + por día) ya lo calcula `armarFavoritos`
// (packages/core/src/favoritos/armar.ts, compartida con la app): este
// componente solo recibe el resultado y lo pinta, sin volver a agrupar nada.
interface GrupoPorDia {
  dia: string
  items: DisplayEvent[]
}

interface FavoritosListProps {
  /** ✓ Voy (R47, QPS-197): ya viene separado y ordenado por `separarMisEventos` (core). No se reordena acá. */
  voy: DisplayEvent[]
  flexibles: DisplayEvent[]
  porDia: GrupoPorDia[]
}

/**
 * Une dos listas de `DisplayEvent` sin repetir `id` (conserva el orden:
 * primero `a`, después lo nuevo de `b`). La usan tanto el total como el
 * mensaje de WhatsApp (`initialFavorites`), así que un evento que estuviera
 * en las dos listas (no debería pasar: `separarMisEventos` ya las deja
 * disjuntas) no se cuenta ni se comparte dos veces.
 *
 * Exportada para el test (`tests/favoritos/mis-eventos.test.ts`): no hay
 * `window` en Node puro, así que no se puede probar clickeando el botón de
 * "Compartir agenda" (mismo límite que documenta
 * `tests/core/favoritos-whatsapp-applink.test.ts` sobre
 * `window.location.origin`); se prueba esta función directamente, que es la
 * que arma la lista de la que sale el mensaje.
 */
export function unirSinRepetir(a: DisplayEvent[], b: DisplayEvent[]): DisplayEvent[] {
  const vistos = new Set<string>()
  const resultado: DisplayEvent[] = []
  for (const item of [...a, ...b]) {
    if (vistos.has(item.id)) continue
    vistos.add(item.id)
    resultado.push(item)
  }
  return resultado
}

/**
 * B3: cuál es la primera grilla que se pinta (la de arriba de todo, la que
 * tiene el LCP de la página): "Voy" si hay, si no "Plan flexible", si no el
 * primer día con eventos. Devuelve `"voy"`, `"flexibles"`, `"dia:<fecha>"` o
 * `null` si no hay tarjetas. Exportada para el test.
 */
export function primeraGrilla(
  voy: DisplayEvent[],
  flexibles: DisplayEvent[],
  porDia: GrupoPorDia[],
): string | null {
  if (voy.length > 0) return "voy"
  if (flexibles.length > 0) return "flexibles"
  const dia = porDia.find((grupo) => grupo.items.length > 0)
  return dia ? `dia:${dia.dia}` : null
}

// Formatea fechas locales como "Viernes 10 de Julio" para los encabezados de la agenda
function formatHeaderDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    const dateObj = new Date(year, month - 1, day)
    
    const weekday = dateObj.toLocaleDateString("es-AR", { weekday: "long" })
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
    
    const dayNum = dateObj.getDate()
    const monthName = dateObj.toLocaleDateString("es-AR", { month: "long" })
    
    return `${capitalizedWeekday} ${dayNum} de ${monthName}`
  } catch {
    return dateStr
  }
}

export function FavoritosList({ voy, flexibles, porDia }: FavoritosListProps) {
  const [selectedMovie, setSelectedMovie] = useState<DisplayEvent | null>(null)
  const { openDonationModal } = useDonation()

  const hayVoy = voy.length > 0
  const hayGuardados = flexibles.length > 0 || porDia.length > 0

  // B3: solo las dos primeras tarjetas de la primera grilla (una fila en
  // celular, que tiene 2 columnas) cargan sin lazy, y la primera con
  // prioridad alta. El resto queda como siempre.
  const grillaInicial = primeraGrilla(voy, flexibles, porDia)
  const cargaEn = (grilla: string, indice: number): CargaImagen =>
    grilla === grillaInicial ? cargaPorIndice(indice) : "diferida"

  // El total y la lista plana (para compartir) se derivan del resultado ya
  // armado por `armarFavoritos` + `separarMisEventos`: ni el orden ni el
  // agrupado se recalculan acá. En el flujo normal "Voy" y "Guardados" son
  // disjuntos (`separarMisEventos` ya sacó los eventos con Voy de
  // `flexibles`/`porDia`), pero `unirSinRepetir` deduplica por `id` igual,
  // por las dudas, para que el total y el mensaje de WhatsApp nunca cuenten
  // dos veces el mismo evento.
  const { totalFavoritos, initialFavorites } = useMemo(() => {
    const datedItems = porDia.flatMap(grupo => grupo.items)
    const guardados = [...datedItems, ...flexibles]
    const todos = unirSinRepetir(voy, guardados)
    return {
      totalFavoritos: todos.length,
      initialFavorites: todos,
    }
  }, [voy, flexibles, porDia])

  // Lógica para compilar y compartir la agenda por WhatsApp con enlaces a cada evento
  const handleShareWhatsApp = () => {
    const datedEvents = initialFavorites.filter(item => !item.isCinemaMovie && !item.isInstagramFlyer)
    const movies = initialFavorites.filter(item => item.isCinemaMovie)
    const flyers = initialFavorites.filter(item => item.isInstagramFlyer)

    let message = "¡Che! Este es mi plan para el finde en Salta:\n\n"

    if (datedEvents.length > 0) {
      message += "📅 *Eventos:*\n"
      datedEvents.forEach(item => {
        const [, m, d] = item.date.split('-')
        const url = `${window.location.origin}/evento/${item.id}`
        message += `- *${item.title}* (${d}/${m} en ${item.venue})\n  🔗 ${url}\n`
      })
      message += "\n"
    }

    if (movies.length > 0) {
      message += "🎬 *Cine:*\n"
      movies.forEach(item => {
        const url = `${window.location.origin}/cines`
        message += `- *${item.title}*\n  🔗 ${url}\n`
      })
      message += "\n"
    }

    if (flyers.length > 0) {
      message += "🍻 *Boliches / Salidas:*\n"
      flyers.forEach(item => {
        const url = `${window.location.origin}/flyer/${item.flyerId}`
        message += `- *${item.title}* (en ${item.venue})\n  🔗 ${url}\n`
      })
      message += "\n"
    }

    message += "Organizá tu salida en quepintasalta.com.ar 🎸"

    const encodedText = encodeURIComponent(message)
    const url = `https://api.whatsapp.com/send?text=${encodedText}`
    window.open(url, "_blank")
    
    // Mostramos el modal de donación luego de compartir
    setTimeout(() => {
      openDonationModal("¡Gracias por compartir tu agenda! ¿Nos invitás un cafecito para fondear el desarrollo de la App móvil oficial?")
    }, 800)
  }

  if (totalFavoritos === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Mis eventos</h1>
          <p className="mt-2 text-muted-foreground">
            Los eventos que marcaste con ✓ Voy o ♥ Guardaste para ver después
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/10 backdrop-blur-xs">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted/40">
            <Heart className="size-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Todavía no tenés eventos
          </h2>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground px-4">
            Explorá la cartelera de eventos, peñas, boliches o cines y tocá el corazón para guardarlos, o marcá ✓ Voy para contarle a los demás.
          </p>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
            <Link href="/">Explorar eventos</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Encabezado y botón viral */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-850 pb-6">
        <div>
          <Button variant="ghost" asChild className="mb-2 px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
            <Link href="/">
              <ArrowLeft className="mr-1.5 size-4" />
              Volver al inicio
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Mis eventos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tenés {totalFavoritos} {totalFavoritos === 1 ? 'evento' : 'eventos'}
          </p>
        </div>

        <Button
          onClick={handleShareWhatsApp}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl shadow-md transition-all self-start sm:self-auto cursor-pointer"
        >
          <MessageCircle className="size-5 fill-white/10" />
          Compartir agenda por WhatsApp
        </Button>
      </div>

      {/* 1. Voy (✓, social): primero, en el orden que ya viene de core (sin reordenar). */}
      {hayVoy && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              Voy ({voy.length})
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {voy.map((event, index) => (
              <EventCard
                key={event.id}
                event={event}
                isFavorite={true}
                onOpenMovie={setSelectedMovie}
                origin="favoritos"
                className="w-full sm:w-full max-w-[200px] mx-auto"
                carga={cargaEn("voy", index)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 2. Guardados (♥, privado): Plan flexible / Sin fecha definida + agenda cronológica. */}
      {hayGuardados && (
        <div className="space-y-8">
          <div className="flex items-center gap-2">
            <Heart className="size-5 text-red-500 fill-red-500/10" />
            <h2 className="text-lg font-bold text-foreground tracking-tight">Guardados</h2>
          </div>

          {flexibles.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px bg-zinc-800 flex-1" />
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">
                  Plan flexible / Sin fecha definida ({flexibles.length})
                </h3>
                <div className="h-px bg-zinc-800 flex-1" />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {flexibles.map((event, index) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isFavorite={true}
                    onOpenMovie={setSelectedMovie}
                    origin="favoritos"
                    className="w-full sm:w-full max-w-[200px] mx-auto"
                    carga={cargaEn("flexibles", index)}
                  />
                ))}
              </div>
            </div>
          )}

          {porDia.map(({ dia, items }) => {
            return (
              <div key={dia} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px bg-primary/20 flex-1" />
                  <h3 className="text-xs font-extrabold text-primary uppercase tracking-widest px-2 bg-primary/5 py-1 rounded-md border border-primary/10">
                    {formatHeaderDate(dia)} ({items.length})
                  </h3>
                  <div className="h-px bg-primary/20 flex-1" />
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {items.map((event, index) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      isFavorite={true}
                      onOpenMovie={setSelectedMovie}
                      origin="favoritos"
                      className="w-full sm:w-full max-w-[200px] mx-auto"
                      carga={cargaEn(`dia:${dia}`, index)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal para visualizar los horarios de las películas de cine */}
      {selectedMovie && (
        <MovieModal 
          movie={selectedMovie} 
          isFavorite={true}
          onClose={() => setSelectedMovie(null)} 
        />
      )}
    </div>
  )
}
