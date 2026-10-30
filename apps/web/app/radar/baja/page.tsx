import Link from "next/link"
import type { Metadata } from "next"
import { Navbar } from "@/components/navbar"
import { verifyUnsubscribe } from "@/lib/radar/baja"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  // B2: sin la marca, que la agrega la plantilla del layout.
  title: "Baja del Radar Salteño",
  robots: { index: false },
  // El token va en la URL: que no se filtre por el Referer a otros sitios.
  referrer: "no-referrer",
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-primary underline-offset-4 hover:underline"

export default async function RadarBajaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const listo = first(params.listo) === "1"
  const u = first(params.u)
  const t = first(params.t)

  // El GET nunca escribe: solo verifica el token para decidir qué mostrar.
  const tokenValido = !listo && u !== "" && t !== "" && verifyUnsubscribe(u, t)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="contenido" tabIndex={-1} className="container mx-auto max-w-md px-4 py-16 focus:outline-none">
        <div className="space-y-5 rounded-2xl border border-border bg-card p-6 text-center text-card-foreground shadow-sm">
          {listo ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight">Listo, te diste de baja del Radar Salteño.</h1>
              <Link href="/radar" className={linkClass}>
                Volver a activarlo
              </Link>
            </>
          ) : tokenValido ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight">¿Querés dejar de recibir el Radar?</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Vas a dejar de recibir el mail semanal. Podés volver a activarlo cuando quieras desde /radar.
              </p>
              <form method="post" action="/api/radar/baja" className="pt-1">
                <input type="hidden" name="u" value={u} />
                <input type="hidden" name="t" value={t} />
                <input type="hidden" name="from" value="page" />
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Darme de baja
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">Este link no es válido</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Podés administrar tu Radar desde{" "}
                <Link href="/radar" className="font-semibold text-primary underline underline-offset-4">
                  /radar
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
