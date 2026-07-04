import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { formatEventDateShort, formatEventTime } from "@/lib/date-format"
import { ChangePasswordForm } from "@/components/change-password-form"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, MapPin, Clock, Plus, User, AlertCircle, FileText, ArrowRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export const revalidate = 0 // Evitar caché estática para esta página privada

export default async function PerfilPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login?next=/perfil")
  }

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
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Mi Perfil</h1>
              <p className="text-sm font-medium text-muted-foreground">{user.email}</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2 md:justify-start">
                <Badge variant="outline" className="bg-background/80 py-1 font-semibold">
                  Colaborador local
                </Badge>
                <Badge variant="secondary" className="font-semibold">
                  {events?.length || 0} {events?.length === 1 ? "evento subido" : "eventos subidos"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid principal de contenidos */}
      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-3">
          
          {/* Columna de eventos creados (2/3 de ancho) */}
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight">Mis Eventos Colaborados</h2>
                <p className="text-sm text-muted-foreground">
                  Listado de los eventos que has subido a la plataforma y su estado de revisión.
                </p>
              </div>
              <Button asChild size="sm" className="hidden sm:inline-flex shadow-sm">
                <Link href="/nuevo-evento">
                  <Plus className="mr-2 size-4" />
                  Agregar Nuevo
                </Link>
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>Ocurrió un error al cargar tu historial. Inténtalo más tarde.</span>
              </div>
            )}

            {!events || events.length === 0 ? (
              <Card className="flex flex-col items-center justify-center border-dashed p-10 text-center bg-card/40 backdrop-blur-sm shadow-sm transition-all hover:bg-card/50">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                  <FileText className="size-7" />
                </div>
                <h3 className="text-lg font-bold">Aún no has colaborado con eventos</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground mb-6">
                  ¡Sé parte activa de la comunidad! Comparte peñas, ferias, talleres o boliches que ocurran en Salta.
                </p>
                <Button asChild className="shadow-md">
                  <Link href="/nuevo-evento">
                    <Plus className="mr-2 size-4" />
                    Subir mi primer evento
                  </Link>
                </Button>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                {events.map((event) => {
                  const isDraft = event.status === "DRAFT"
                  const isPublished = event.status === "PUBLISHED"
                  const isCancelled = event.status === "CANCELLED"
                  
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
                            {isDraft && (
                              <Badge className="bg-amber-500/90 text-white font-semibold shadow border-0 hover:bg-amber-500">
                                Pendiente de revisión
                              </Badge>
                            )}
                            {isPublished && (
                              <Badge className="bg-emerald-600/90 text-white font-semibold shadow border-0 hover:bg-emerald-600">
                                Aprobado y publicado
                              </Badge>
                            )}
                            {isCancelled && (
                              <Badge className="bg-rose-500/90 text-white font-semibold shadow border-0 hover:bg-rose-500">
                                Rechazado / Cancelado
                              </Badge>
                            )}
                            {event.status === "PAST" && (
                              <Badge className="bg-slate-500/90 text-white font-semibold shadow border-0 hover:bg-slate-500">
                                Finalizado
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Contenido de la Card */}
                        <div className="p-4 space-y-3">
                          <h3 className="font-bold text-lg leading-snug line-clamp-1 text-foreground">
                            {event.title}
                          </h3>
                          
                          <div className="space-y-1.5 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Calendar className="size-4 shrink-0 text-primary" />
                              <span>{formatEventDateShort(event.start_date)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="size-4 shrink-0 text-primary" />
                              <span>{formatEventTime(event.start_date)} hs</span>
                            </div>
                             {(event.venue as any)?.name && (
                               <div className="flex items-center gap-2">
                                 <MapPin className="size-4 shrink-0 text-primary" />
                                 <span className="line-clamp-1">{(event.venue as any).name}</span>
                               </div>
                             )}
                          </div>
                        </div>
                      </div>

                      {/* Footer de la Card */}
                      <div className="p-4 pt-0 border-t border-border/20 mt-2 flex justify-end">
                        {isPublished ? (
                          <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary/80 gap-1 font-semibold">
                            <Link href={`/evento/${event.id}`}>
                              Ver publicado
                              <ArrowRight className="size-3.5" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic flex items-center py-1">
                            {isDraft ? "Sometido a revisión el " + new Date(event.created_at).toLocaleDateString() : "No publicado"}
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
            <ChangePasswordForm />
          </div>

        </div>
      </main>
    </div>
  )
}
