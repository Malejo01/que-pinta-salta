import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { formatEventTime, formatSaltaClock } from "@/lib/date-format"
import { ChangePasswordForm } from "@/components/change-password-form"
import { tipoDeCuenta } from "@qps/core/auth/cuenta"
import { LoQueSeguis } from "./lo-que-seguis"
import { obtenerLoQueSeguis } from "@/lib/actions/radar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Calendar, MapPin, Clock, Plus, User, AlertCircle, FileText, ArrowRight, Trash2 } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { LOCALE_INTL } from "@/lib/i18n/idiomas"
import { fechaCorta, hora } from "@/lib/i18n/fechas"
import { hrefLangDestino, rutaEn } from "@/lib/i18n/rutas"

/**
 * Q6-2: la página de `/perfil` y `/en/perfil` (compartida; cada `page.tsx`
 * pone lo suyo). Es privada: sin sesión redirige al ingreso en el mismo
 * idioma, y vuelve acá. Se llama como función, igual que `PaginaRadar`.
 * Lo que viene de la base (títulos de eventos, lugares, nombres de
 * categorías seguidas) queda como está, con `lang="es-AR"` en inglés.
 */
export async function PaginaPerfil({ idioma }: { idioma: Idioma }) {
  const t = textosDe(idioma).perfil
  const langContenido = idioma === "en" ? "es-AR" : undefined
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`${rutaEn(idioma, "/auth/login")}?next=${rutaEn(idioma, "/perfil")}`)
  }

  // "Lo que seguís" (R47, QPS-197): `null` sin sesión (ya descartado arriba),
  // así que acá solo puede venir el objeto con las tres listas. Si vuelve
  // `null` de todas formas (no debería pasar), no se dibuja la sección.
  const loQueSeguis = await obtenerLoQueSeguis()

  // Obtener los eventos creados por el usuario
  const { data: events, error } = await supabase
    .from("events")
    .select(`
      id,
      title,
      slug,
      start_date,
      image_url,
      status,
      created_at,
      venue:venues(name)
    `)
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error al obtener eventos del usuario:", error)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Banner superior de perfil */}
      <div className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-start md:gap-6 md:text-left">
            <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 border border-primary/20 shadow-inner">
              <User className="size-10 text-primary animate-pulse" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{t.titulo}</h1>
              <p className="text-sm font-medium text-muted-foreground">{user.email}</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2 md:justify-start">
                <Badge variant="secondary" className="font-semibold">
                  {t.eventosSubidos(events?.length || 0)}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid principal de contenidos */}
      <main id="contenido" tabIndex={-1} className="container mx-auto px-4 py-8 md:py-12 focus:outline-none">
        <div className="grid gap-8 lg:grid-cols-3">
          
          {/* Columna de eventos creados (2/3 de ancho) */}
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight">{t.misEventos}</h2>
                <p className="text-sm text-muted-foreground">
                  {t.misEventosBajada}
                </p>
              </div>
              <Button asChild size="sm" className="hidden sm:inline-flex shadow-sm">
                <Link href={rutaEn(idioma, "/nuevo-evento")}>
                  <Plus className="mr-2 size-4" />
                  {t.agregarNuevo}
                </Link>
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{t.errorHistorial}</span>
              </div>
            )}

            {!events || events.length === 0 ? (
              <Card className="flex flex-col items-center justify-center border-dashed p-10 text-center bg-card/40 backdrop-blur-sm shadow-sm transition-all hover:bg-card/50">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                  <FileText className="size-7" />
                </div>
                <h3 className="text-lg font-bold">{t.vacioTitulo}</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground mb-6">
                  {t.vacioTexto}
                </p>
                <Button asChild className="shadow-md">
                  <Link href={rutaEn(idioma, "/nuevo-evento")}>
                    <Plus className="mr-2 size-4" />
                    {t.subirPrimero}
                  </Link>
                </Button>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                {events.map((event) => {
                  const isPending = event.status === "PENDING"
                  const isDraft = event.status === "DRAFT"
                  const isPublished = event.status === "PUBLISHED"
                  const isCancelled = event.status === "CANCELLED"
                  // Supabase tipa este join como array (`{ name }[]`) pero la fila
                  // real trae un solo venue (relación a uno): se afirma la forma
                  // real en vez de usar `any` como antes.
                  const venue = event.venue as unknown as { name: string } | null

                  return (
                    <Card key={event.id} className="overflow-hidden border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                      <div>
                        {/* Flyer del evento o banner minimalista */}
                        <div className="relative aspect-video w-full bg-muted/30">
                          {event.image_url ? (
                            <Image
                              src={event.image_url}
                              alt={event.title}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/20 text-primary">
                              <span className="text-sm font-bold tracking-wider opacity-60">QUE PINTA SALTA</span>
                            </div>
                          )}
                          
                          {/* Badge de Estado flotante */}
                          <div className="absolute left-3 top-3">
                            {isPending && (
                              <Badge className="bg-amber-500/90 text-white font-semibold shadow border-0 hover:bg-amber-500">
                                {t.estadoPendiente}
                              </Badge>
                            )}
                            {isDraft && (
                              <Badge className="bg-slate-500/90 text-white font-semibold shadow border-0 hover:bg-slate-500">
                                {t.estadoBorrador}
                              </Badge>
                            )}
                            {isPublished && (
                              <Badge className="bg-emerald-600/90 text-white font-semibold shadow border-0 hover:bg-emerald-600">
                                {t.estadoPublicado}
                              </Badge>
                            )}
                            {isCancelled && (
                              <Badge className="bg-rose-500/90 text-white font-semibold shadow border-0 hover:bg-rose-500">
                                {t.estadoCancelado}
                              </Badge>
                            )}
                            {event.status === "PAST" && (
                              <Badge className="bg-slate-500/90 text-white font-semibold shadow border-0 hover:bg-slate-500">
                                {t.estadoFinalizado}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Contenido de la Card */}
                        <div className="p-4 space-y-3">
                          <h3 lang={langContenido} className="font-bold text-lg leading-snug line-clamp-1 text-foreground">
                            {event.title}
                          </h3>
                          
                          <div className="space-y-1.5 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Calendar className="size-4 shrink-0 text-primary" />
                              <span>{fechaCorta(idioma, event.start_date)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="size-4 shrink-0 text-primary" />
                              <span>{t.hora(idioma === "es" ? formatEventTime(event.start_date) : hora(idioma, formatSaltaClock(event.start_date)))}</span>
                            </div>
                             {venue?.name && (
                               <div className="flex items-center gap-2">
                                 <MapPin className="size-4 shrink-0 text-primary" />
                                 <span lang={langContenido} className="line-clamp-1">{venue.name}</span>
                               </div>
                             )}
                          </div>
                        </div>
                      </div>

                      {/* Footer de la Card */}
                      <div className="p-4 pt-0 border-t border-border/20 mt-2 flex justify-end">
                        {isPublished ? (
                          <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary/80 gap-1 font-semibold">
                            <Link href={rutaEn(idioma, `/evento/${event.id}`)}>
                              {t.verPublicado}
                              <ArrowRight className="size-3.5" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic flex items-center py-1">
                            {isPending
                              ? t.sometidoARevision(
                                  // En castellano, como siempre (locale del servidor); en inglés, en-US y en hora de Salta.
                                  idioma === "es"
                                    ? new Date(event.created_at).toLocaleDateString()
                                    : new Date(event.created_at).toLocaleDateString(LOCALE_INTL[idioma], { timeZone: "America/Argentina/Salta" }),
                                )
                              : isDraft ? t.guardadoBorrador : t.noPublicado}
                          </span>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Columna de cambio de contraseña (1/3 de ancho) */}
          <div className="space-y-6 lg:col-span-1">
            {loQueSeguis && (
              <LoQueSeguis
                idioma={idioma}
                lugares={loQueSeguis.lugares}
                cuentas={loQueSeguis.cuentas}
                categorias={loQueSeguis.categorias}
              />
            )}

            <ChangePasswordForm modo={tipoDeCuenta(user)} idioma={idioma} />

            <Button
              asChild
              variant="ghost"
              size="sm"
              // Q6-2: con la letra grande (o la nota «in Spanish») el texto puede ocupar dos líneas.
              className="h-auto min-h-8 w-full justify-start whitespace-normal py-1.5 text-left text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {/* Q6-2: la página de eliminar la cuenta queda en castellano; en inglés, el link lo avisa. */}
              <Link href="/perfil/eliminar-cuenta" hrefLang={hrefLangDestino(idioma, "/perfil/eliminar-cuenta")}>
                <Trash2 className="mr-2 size-4" />
                {t.eliminarCuenta}
                {idioma === "en" && <span className="ml-1 text-xs">{t.enCastellano}</span>}
              </Link>
            </Button>
          </div>

        </div>
      </main>
    </div>
  )
}
