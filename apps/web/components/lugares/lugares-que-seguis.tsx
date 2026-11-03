import Link from "next/link"
import { MapPin } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { contarProximosPorLugar } from "@qps/core/lugares/seguidos"

/**
 * Q5-6 · «Lugares que seguís» en Mis eventos (/favoritos): cada lugar con
 * cuántos eventos próximos tiene y el link a su ficha. Lo que se sigue se
 * cambia desde la ficha del lugar, la del evento o Perfil › Lo que seguís.
 * Si algo falla, no se dibuja (la página sigue con los guardados).
 */
type LugarSeguidoConEventos = { id: string; name: string; slug: string | null; proximos: number }

/** Los datos, aparte de la vista: `null` si algo falló (no se dibuja la sección). */
async function leerLugaresQueSeguis(userId: string): Promise<LugarSeguidoConEventos[] | null> {
  try {
    const supabase = await createClient()
    const { data: seguidos, error } = await supabase
      .from("user_followed_venues")
      .select("venue:venues(id, name, slug)")
      .eq("user_id", userId)
    if (error) {
      console.error("[lugares-que-seguis] no se pudieron leer los lugares", error.code ?? "sin-codigo")
      return null
    }
    const lugares = ((seguidos ?? []) as unknown as { venue: { id: string; name: string; slug: string | null } | null }[])
      .map((f) => f.venue)
      .filter((v): v is { id: string; name: string; slug: string | null } => v !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
    if (lugares.length === 0) return []
    const { data: eventos } = await supabase
      .from("events")
      .select("venue_id")
      .eq("status", "PUBLISHED")
      .in("venue_id", lugares.map((l) => l.id))
      .gte("start_date", new Date().toISOString())
      .limit(1000)
    const conteo = contarProximosPorLugar(eventos ?? [])
    return lugares.map((l) => ({ ...l, proximos: conteo.get(l.id) ?? 0 }))
  } catch {
    return null
  }
}

export async function LugaresQueSeguis({ userId }: { userId: string }) {
  const lugares = await leerLugaresQueSeguis(userId)
  if (lugares === null) return null
  return (
    <section aria-labelledby="titulo-lugares-que-seguis" className="mt-10">
      <h2 id="titulo-lugares-que-seguis" className="text-xl font-bold text-foreground">
        Lugares que seguís
      </h2>
      {lugares.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Todavía no seguís ningún lugar. Tocá «Seguir» en la ficha de un lugar o de un evento y te avisamos cuando anuncie algo nuevo.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {lugares.map((lugar) => (
            <li key={lugar.id}>
              <Link
                href={`/lugar/${lugar.slug ?? lugar.id}`}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{lugar.name}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {lugar.proximos === 0 ? "Sin eventos próximos" : lugar.proximos === 1 ? "1 evento próximo" : `${lugar.proximos} eventos próximos`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
