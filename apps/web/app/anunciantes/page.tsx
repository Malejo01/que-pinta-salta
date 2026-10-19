import type { Metadata } from "next"
import { Sparkles, Eye, Radio, Calendar, MessageCircle, Mail, CheckCircle2 } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { createAdminClient } from "@/lib/supabase/server"
import {
  getAdvertiserMetrics,
  formatPublicCount,
  formatRadarSubscribers,
  precioVisible,
  type AdvertiserMetrics,
} from "@/lib/anunciantes/metricas"
import { ANUNCIANTES } from "@/lib/config/anunciantes"
import { whatsappUrl } from "@/lib/contacto"
import { CONTACTO_EMAIL, mailtoContacto } from "@qps/core/contacto"

/**
 * Página 100% estática desde el punto de vista de Next: ningún componente
 * cliente, ninguna API dinámica (`cookies()`, `headers()`, sesión de
 * usuario) en todo el árbol. Lo único "vivo" son las tres métricas, que se
 * leen una vez por build/revalidación con `createAdminClient()` (service
 * role, sin cookies) y quedan cacheadas como el resto de la página durante
 * una hora. Un visitante nunca dispara una consulta a Supabase: la ve
 * siempre desde la caché de Next (ISR), igual que /sitemap.xml.
 */
export const revalidate = 3600

const SIN_METRICAS: AdvertiserMetrics = {
  eventsLast30: null,
  viewsLast30: null,
  radarSubscribers: null,
  truncated: false,
}

export const metadata: Metadata = {
  title: "Publicitá tu evento | Qué Pinta Salta",
  description:
    "Llegá al público que ya está buscando salidas en Salta Capital: evento destacado en la portada, presencia en el Radar y reporte de vistas y clics.",
  alternates: { canonical: "/anunciantes" },
  // Mientras ANUNCIANTES.publicada sea false (precios sin completar) la
  // página no se indexa ni entra al sitemap (ver app/sitemap.ts).
  ...(ANUNCIANTES.publicada ? {} : { robots: { index: false, follow: false } }),
}

async function loadMetrics(): Promise<AdvertiserMetrics> {
  try {
    const client = createAdminClient()
    return await getAdvertiserMetrics(client, new Date())
  } catch (error) {
    console.error("[anunciantes] Error creando el cliente de Supabase:", error)
    return SIN_METRICAS
  }
}

function MetricCard({
  icon: Icon,
  valor,
  descripcion,
  letraChica,
}: {
  icon: typeof Eye
  valor: string
  descripcion: string
  letraChica: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" />
      </div>
      <p className="text-3xl font-extrabold tracking-tight text-foreground">{valor}</p>
      <p className="text-sm font-medium text-foreground">{descripcion}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{letraChica}</p>
    </div>
  )
}

export default async function AnunciantesPage() {
  const metrics = await loadMetrics()

  const eventosLabel = formatPublicCount(metrics.eventsLast30)
  const vistasLabel =
    metrics.truncated && metrics.viewsLast30 != null
      ? `más de ${metrics.viewsLast30.toLocaleString("es-AR")}`
      : formatPublicCount(metrics.viewsLast30)
  const radarLabel = formatRadarSubscribers(metrics.radarSubscribers)

  const whatsappHref = whatsappUrl("Hola! Me interesa anunciar en Que Pinta Salta.")
  const mailtoHref = mailtoContacto("Quiero destacar mi evento")

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />

      <main className="container mx-auto max-w-4xl px-4 py-12">
        <div className="mb-10 flex flex-col items-center space-y-3 text-center">
          <div className="mb-1 flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Sparkles className="size-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Publicitá tu evento</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Una agenda pensada para quien ya decidió salir y está buscando dónde: peñas, boliches, teatro, recitales,
            ferias y cine de Salta Capital, todo en un solo lugar.
          </p>
        </div>

        <section className="mb-12 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          <p>
            Qué Pinta Salta es la agenda donde se cargan y se buscan los planes de la ciudad: lo que hacen las
            productoras, los boliches, los teatros y los organismos culturales, además de lo que suben directamente
            los usuarios y organizadores.
          </p>
          <p>
            Para un anunciante, eso significa aparecer donde la gente ya está decidiendo qué hacer ese fin de semana,
            en vez de interrumpir con un anuncio genérico. Hoy el sitio ofrece tres formas concretas de sumar tu
            evento o tu marca, todas ya construidas y en funcionamiento.
          </p>
          <p>
            Más abajo, los números reales del sitio (actualizados cada una hora) y los paquetes disponibles.
          </p>
        </section>

        <section className="mb-12 space-y-4">
          <h2 className="text-xl font-bold text-foreground">El sitio en números</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              icon={Calendar}
              valor={eventosLabel}
              descripcion="Eventos publicados en los últimos 30 días"
              letraChica="Eventos que se cargaron en los últimos 30 días y hoy están publicados. El sitio no guarda la fecha exacta de publicación, solo la de carga, así que puede incluir eventos editados después."
            />
            <MetricCard
              icon={Eye}
              valor={vistasLabel}
              descripcion="Vistas de ficha en los últimos 30 días"
              letraChica="Vistas de fichas de evento en los últimos 30 días (hasta ayer). Son eventos, no personas: abrir la misma ficha varias veces suma varias vistas."
            />
            <MetricCard
              icon={Radio}
              valor={radarLabel}
              descripcion="Personas suscriptas al Radar"
              letraChica="Personas suscriptas al Radar semanal, quincenal o mensual, redondeado hacia abajo a la decena para no sobreestimar el alcance real."
            />
          </div>
        </section>

        <section className="mb-12 space-y-4">
          <h2 className="text-xl font-bold text-foreground">Paquetes</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {ANUNCIANTES.paquetes.map((paquete) => (
              <div
                key={paquete.id}
                className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm ${
                  paquete.destacado
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <h3 className="text-lg font-bold text-foreground">{paquete.nombre}</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {paquete.queIncluye.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-auto pt-2 text-xl font-extrabold text-foreground">{precioVisible(paquete)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 space-y-4">
          <h2 className="text-xl font-bold text-foreground">Cómo funciona</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <p className="text-2xl font-extrabold text-primary">1</p>
              <p className="text-sm text-foreground">Nos escribís, nos contás tu evento y elegís el paquete y la fecha hasta la que querés destacarlo.</p>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <p className="text-2xl font-extrabold text-primary">2</p>
              <p className="text-sm text-foreground">Pagás por transferencia o Mercado Pago, como prefieras.</p>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <p className="text-2xl font-extrabold text-primary">3</p>
              <p className="text-sm text-foreground">
                Lo destacamos hasta la fecha que elegiste. Llegado ese día, vence solo: no tenés que avisarnos ni
                sacarlo vos.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-bold text-foreground">¿Te interesa?</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Contanos tu caso por WhatsApp o por mail y vemos qué paquete se ajusta mejor a tu evento o tu marca.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-all hover:scale-[1.02] hover:bg-primary/90"
            >
              <MessageCircle className="size-4" />
              Hablar por WhatsApp
            </a>
            <a
              href={mailtoHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-6 text-sm font-bold text-foreground transition-all hover:scale-[1.02] hover:bg-muted"
            >
              <Mail className="size-4" />
              Escribinos por mail
            </a>
          </div>
          <p className="text-xs text-muted-foreground">{CONTACTO_EMAIL}</p>
        </section>
      </main>

      <MobileNav />
    </div>
  )
}
