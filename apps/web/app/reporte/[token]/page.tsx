import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { formatSaltaDayKey } from "@/lib/date-format"
import {
  comparacionConMeta,
  costoPorClic,
  textoCostoPorClic,
  validarMetricasReporte,
  type MetricasReporte,
} from "@qps/core/publicidad/reporte"
import { formatearPesos } from "@qps/core/publicidad/precios"

/**
 * Reporte compartible de una campaña (R58): `/reporte/<token>`.
 *
 * El token (32 hex) es la única credencial: va en la URL, así que la página no
 * tiene ningún link saliente (no se filtra por `Referer`), no se indexa y no
 * está en el sitemap. Se lee con la service key SOLO ese reporte, y solo se
 * muestran cantidades y el nombre del evento. Un token inválido y uno
 * inexistente dan el mismo 404.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Reporte de tu campaña | Qué Pinta Salta",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

const TOKEN_VALIDO = /^[0-9a-f]{32}$/

const ETIQUETA_TIPO: Record<string, string> = {
  destacado: "Destacado en la portada",
  push: "Push patrocinado",
}

interface FilaReporte {
  tipo: unknown
  desde: unknown
  hasta: unknown
  metricas: unknown
  precio_ars: unknown
  event: { title?: unknown } | Array<{ title?: unknown }> | null
}

function fecha(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const t = new Date(valor)
  if (Number.isNaN(t.getTime())) return null
  const [a, m, d] = formatSaltaDayKey(t).split("-").map(Number)
  return `${d}/${m}/${a}`
}

function numero(n: number): string {
  return n.toLocaleString("es-AR")
}

function Cifra({
  valor,
  titulo,
  nota,
  estimado = false,
}: {
  valor: string
  titulo: string
  nota?: string
  estimado?: boolean
}) {
  return (
    <div
      className={`rounded-2xl ${estimado ? "border border-dashed" : "border"} border-border bg-card p-5 text-card-foreground shadow-sm`}
    >
      <p className="text-4xl font-extrabold tracking-tight text-foreground">{valor}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{titulo}</p>
      {nota && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{nota}</p>}
    </div>
  )
}

function SinDatos() {
  return (
    <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
      El reporte todavía no tiene datos
    </p>
  )
}

export default async function ReportePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // Antes de crear cualquier cliente: un token mal formado nunca llega a la base.
  if (typeof token !== "string" || !TOKEN_VALIDO.test(token)) notFound()

  const { data, error } = await createAdminClient()
    .from("ad_campaign_reports")
    .select("tipo, desde, hasta, metricas, precio_ars, event:events(title)")
    .eq("token", token)
    .maybeSingle()
  if (error) throw new Error(`reporte: error de lectura (${error.code ?? "desconocido"})`)
  if (!data) notFound()

  const fila = data as unknown as FilaReporte
  const evento = Array.isArray(fila.event) ? fila.event[0] : fila.event
  const titulo = typeof evento?.title === "string" && evento.title.trim() ? evento.title : "Tu evento"
  const tipo = typeof fila.tipo === "string" ? (ETIQUETA_TIPO[fila.tipo] ?? "Campaña") : "Campaña"
  const desde = fecha(fila.desde)
  const hasta = fecha(fila.hasta)

  const validadas = validarMetricasReporte(fila.metricas)
  const metricas: MetricasReporte | null =
    validadas && validadas.vistas !== undefined && validadas.clics !== undefined ? validadas : null

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 bg-background px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{tipo}</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{titulo}</h1>
        {desde && hasta && (
          <p className="text-sm text-muted-foreground">
            Del {desde} al {hasta} (hora de Salta)
          </p>
        )}
      </header>

      {metricas ? <Metricas metricas={metricas} precioArs={fila.precio_ars} esPush={fila.tipo === "push"} /> : <SinDatos />}

      <p className="text-xs text-muted-foreground">Qué Pinta Salta</p>
    </main>
  )
}

function Metricas({
  metricas,
  precioArs,
  esPush,
}: {
  metricas: MetricasReporte
  precioArs: unknown
  esPush: boolean
}) {
  const vistas = metricas.vistas ?? 0
  const clics = metricas.clics ?? 0
  const precio = typeof precioArs === "number" && Number.isFinite(precioArs) ? precioArs : null
  const textoCpc = textoCostoPorClic(precio, clics)
  const hayClics = clics > 0
  const comparacion = hayClics ? comparacionConMeta(costoPorClic(precio, clics)) : null

  return (
    <>
      <section className="grid gap-4" aria-label="Resultados">
        <Cifra valor={numero(vistas)} titulo="Vistas de la ficha del evento" />
        <Cifra valor={numero(clics)} titulo="Clics a entradas" />
        {esPush && metricas.destinatarios !== undefined && (
          <Cifra valor={numero(metricas.destinatarios)} titulo="Personas a las que llegó el aviso" />
        )}
        {metricas.alcanceEstimado !== undefined && (
          <Cifra
            valor={numero(metricas.alcanceEstimado)}
            titulo="Alcance estimado del sitio"
            nota="Es una estimación: se calcula con la audiencia mensual del sitio y los días de tu campaña. No se midió en tu evento."
            estimado
          />
        )}
      </section>

      {textoCpc && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="Costo por clic">
          <p className={hayClics ? "text-2xl font-extrabold text-foreground" : "text-base text-muted-foreground"}>
            {textoCpc}
          </p>
          {hayClics && precio !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Es el precio de lista de la campaña ({formatearPesos(precio)}) dividido por los clics, sin descuentos.
            </p>
          )}
          {comparacion && (
            <p className="mt-3 text-sm leading-relaxed text-foreground">
              Como referencia: {comparacion.texto}
              {comparacion.masBarato ? " Salió más barato que la referencia." : ""} No es una comparación directa: un
              clic a entradas desde la ficha no es lo mismo que un clic en un anuncio de Meta.
            </p>
          )}
        </section>
      )}
    </>
  )
}
