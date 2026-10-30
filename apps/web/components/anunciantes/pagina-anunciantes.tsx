import { Sparkles, Eye, Radio, Calendar, MessageCircle, Mail, CheckCircle2, Info } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { createAdminClient } from "@/lib/supabase/server"
import {
  getAdvertiserMetrics,
  formatPublicCount,
  formatRadarSubscribers,
  type AdvertiserMetrics,
} from "@/lib/anunciantes/metricas"
import { cargarTarifarioVigente, type TarifarioVigente } from "@/lib/anunciantes/precios"
import { formatSaltaDayKey } from "@/lib/date-format"
import { whatsappUrl } from "@/lib/contacto"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import {
  avisoEnIngles,
  conteoPublicoEn,
  pieEnIngles,
  precioFundadorEn,
  precioListaEn,
  suscriptosRadarEn,
  usdAproxEn,
  vigenciaEnIngles,
} from "@/lib/i18n/anunciantes"
import { CONTACTO_EMAIL, mailtoContacto } from "@qps/core/contacto"
import {
  PIE_TARIFARIO,
  TARIFARIO,
  VIGENCIA_TARIFARIO,
  textoPrecioFundador,
  textoPrecioLista,
  textoUsdAprox,
} from "@qps/core/publicidad/precios"

/**
 * El cuerpo de `/anunciantes` y `/en/anunciantes` (compartido; cada página
 * pone su metadata y su `revalidate = 3600` literal).
 *
 * Es 100% estático desde el punto de vista de Next: ningún componente
 * cliente, ninguna API dinámica (`cookies()`, `headers()`, sesión de
 * usuario) en todo el árbol. Lo único "vivo" son las tres métricas, que se
 * leen una vez por build/revalidación con `createAdminClient()` (service
 * role, sin cookies) y quedan cacheadas como el resto de la página durante
 * una hora. Un visitante nunca dispara una consulta a Supabase: la ve
 * siempre desde la caché de Next (ISR), igual que /sitemap.xml.
 *
 * Se llama como función desde `app/anunciantes/page.tsx` y
 * `app/en/anunciantes/page.tsx` (no como elemento JSX).
 */

const SIN_METRICAS: AdvertiserMetrics = {
  eventsLast30: null,
  viewsLast30: null,
  radarSubscribers: null,
  truncated: false,
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

/** Precios aprobados vigentes hoy (día de Salta); si falla algo, el tarifario de respaldo. */
async function loadTarifario(): Promise<TarifarioVigente> {
  try {
    return await cargarTarifarioVigente(createAdminClient(), formatSaltaDayKey(new Date()))
  } catch (error) {
    console.error("[anunciantes] Error cargando los precios vigentes:", error instanceof Error ? error.name : "desconocido")
    return {
      productos: [...TARIFARIO],
      vigencia: VIGENCIA_TARIFARIO,
      pie: PIE_TARIFARIO,
      aviso: null,
    }
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

export async function PaginaAnunciantes({ idioma }: { idioma: Idioma }) {
  const metrics = await loadMetrics()
  const tarifario = await loadTarifario()
  const t = textosDe(idioma).anunciantes
  const enIngles = idioma === "en"

  const eventosLabel = enIngles ? conteoPublicoEn(metrics.eventsLast30) : formatPublicCount(metrics.eventsLast30)
  const vistasLabel =
    metrics.truncated && metrics.viewsLast30 != null
      ? t.masDe(metrics.viewsLast30.toLocaleString(enIngles ? "en-US" : "es-AR"))
      : enIngles
        ? conteoPublicoEn(metrics.viewsLast30)
        : formatPublicCount(metrics.viewsLast30)
  const radarLabel = enIngles ? suscriptosRadarEn(metrics.radarSubscribers) : formatRadarSubscribers(metrics.radarSubscribers)

  const whatsappHref = whatsappUrl(t.mensajeWhatsapp)
  const mailtoHref = mailtoContacto(t.asuntoMail)

  // Textos que vienen del tarifario (en castellano): en inglés se traducen si
  // tienen un formato conocido; si no, quedan tal cual y marcados con lang="es".
  const vigenciaEn = enIngles ? vigenciaEnIngles(tarifario.vigencia) : null
  const pieEn = enIngles ? pieEnIngles(tarifario.pie) : null
  const avisoEn = enIngles && tarifario.aviso ? avisoEnIngles(tarifario.aviso) : null
  const vigencia = vigenciaEn ?? tarifario.vigencia
  const langVigencia = enIngles && vigenciaEn === null ? "es" : undefined
  const pie = pieEn ?? tarifario.pie
  const langPie = enIngles && pieEn === null ? "es" : undefined
  const aviso = avisoEn ?? tarifario.aviso
  const langAviso = enIngles && avisoEn === null ? "es" : undefined

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />

      <main className="container mx-auto max-w-4xl px-4 py-12">
        <div className="mb-10 flex flex-col items-center space-y-3 text-center">
          <div className="mb-1 flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Sparkles className="size-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.titulo}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t.bajada}
          </p>
        </div>

        <section className="mb-12 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          <p>{t.parrafo1}</p>
          <p>{t.parrafo2}</p>
          <p>{t.parrafo3}</p>
        </section>

        <section className="mb-12 space-y-4">
          <h2 className="text-xl font-bold text-foreground">{t.numerosTitulo}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              icon={Calendar}
              valor={eventosLabel}
              descripcion={t.eventosDescripcion}
              letraChica={t.eventosNota}
            />
            <MetricCard
              icon={Eye}
              valor={vistasLabel}
              descripcion={t.vistasDescripcion}
              letraChica={t.vistasNota}
            />
            <MetricCard
              icon={Radio}
              valor={radarLabel}
              descripcion={t.radarDescripcion}
              letraChica={t.radarNota}
            />
          </div>
        </section>

        <section className="mb-12 space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">{t.preciosTitulo}</h2>
            <p className="text-sm text-muted-foreground">
              {t.vigentesAntes}
              {langVigencia ? <span lang={langVigencia}>{vigencia}</span> : vigencia}
              {t.vigentesDespues}
            </p>
          </div>
          {aviso && (
            <p
              role="note"
              className="flex items-start gap-2 rounded-xl border-2 border-primary bg-card p-4 text-sm font-medium text-foreground"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <strong className="font-bold">{t.avisoEtiqueta}</strong> <span lang={langAviso}>{aviso}</span>
              </span>
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tarifario.productos.map((producto) => {
              // En inglés, el nombre y lo que incluye salen del diccionario por
              // id; si el id no está, queda el del tarifario (castellano).
              const traducido = enIngles ? t.productos[producto.id] : undefined
              const langProducto = enIngles && !traducido ? "es" : undefined
              const nombre = traducido?.nombre ?? producto.nombre
              const queIncluye = traducido?.queIncluye ?? producto.queIncluye
              const precioLista = enIngles ? precioListaEn(producto.precio, t) : textoPrecioLista(producto.precio)
              const precioFundador = enIngles ? precioFundadorEn(producto.precio, t) : textoPrecioFundador(producto.precio)
              const usd = enIngles ? usdAproxEn(producto.precio) : textoUsdAprox(producto.precio)
              return (
                <div
                  key={producto.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm ${
                    producto.destacado ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <h3 lang={langProducto} className="text-lg font-bold text-foreground">{nombre}</h3>
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span lang={langProducto}>{queIncluye}</span>
                  </p>
                  <div className="mt-auto space-y-1 pt-2">
                    <p className="text-xl font-extrabold text-foreground">{precioLista}</p>
                    {producto.precio.tipo !== "gratis" && (
                      <p className="text-sm font-medium text-primary">
                        {t.precioFundador} {precioFundador}
                      </p>
                    )}
                    {usd && <p className="text-xs text-muted-foreground">{t.aprox} {usd}</p>}
                  </div>
                </div>
              )
            })}
          </div>
          <p lang={langPie} className="text-xs leading-relaxed text-muted-foreground">{pie}</p>
        </section>

        <section className="mb-12 space-y-4">
          <h2 className="text-xl font-bold text-foreground">{t.comoFunciona}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <p className="text-2xl font-extrabold text-primary">1</p>
              <p className="text-sm text-foreground">{t.paso1}</p>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <p className="text-2xl font-extrabold text-primary">2</p>
              <p className="text-sm text-foreground">{t.paso2}</p>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <p className="text-2xl font-extrabold text-primary">3</p>
              <p className="text-sm text-foreground">{t.paso3}</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-bold text-foreground">{t.teInteresa}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t.teInteresaTexto}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-all hover:scale-[1.02] hover:bg-primary/90"
            >
              <MessageCircle className="size-4" />
              {t.hablarWhatsapp}
            </a>
            <a
              href={mailtoHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-6 text-sm font-bold text-foreground transition-all hover:scale-[1.02] hover:bg-muted"
            >
              <Mail className="size-4" />
              {t.escribirMail}
            </a>
          </div>
          <p className="text-xs text-muted-foreground">{CONTACTO_EMAIL}</p>
        </section>
      </main>

      <MobileNav />
    </div>
  )
}
